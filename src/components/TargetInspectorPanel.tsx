import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Clock,
  Download,
  Droplets,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Radar,
  Radio,
  Satellite,
  ShieldAlert,
  ShieldCheck,
  Waves,
  X,
} from 'lucide-react';
import { evaluateForensicCaseAtTime } from '../data/forensicCasesRepository';
import {
  computeCoastalImpactAssessment,
  computeSarConfidenceAssessment,
} from '../services/surveillanceForensicsService';
import {
  AsfSarScene,
  ForensicCaseRecord,
  HudMode,
  Incident,
  InspectorTab,
  LiveForensicSnapshot,
  QueuedSarTask,
  Sgp4InterceptAssessment,
  Vessel,
  WeatherState,
} from '../types/telemetry';

interface TargetInspectorPanelProps {
  hudMode: HudMode;
  activeForensicCase?: ForensicCaseRecord;
  forensicTimeOffsetHours?: number;
  incident: Incident;
  vessel: Vessel;
  weather: WeatherState;
  asfScenes: AsfSarScene[];
  selectedAsfSceneId: string | null;
  inspectTargetMode: 'vessel' | 'sar_footprint';
  liveSnapshot: LiveForensicSnapshot;
  queuedSarTasks: QueuedSarTask[];
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  onSelectAsfScene: (sceneId: string) => void;
  onSimulateBlackout: (vessel: Vessel) => void;
  onAdvanceBlackout: (vesselId: string, extraSeconds: number) => void;
  onClearBlackout: (vesselId: string) => void;
  onQueueSarTask: (intercept: Sgp4InterceptAssessment, vessel: Vessel) => void;
  onTriggerLiveOilSpill: (anchor: {
    id: string;
    label: string;
    anchorType: 'vessel' | 'sar_footprint';
    lat: number;
    lon: number;
  }) => void;
  onClearLiveOilSpill: () => void;
  isSimActive?: boolean;
  onToggleOptionalSim?: () => void;
  onOpenDossier: () => void;
  onClose?: () => void;
}

export const TargetInspectorPanel: React.FC<TargetInspectorPanelProps> = ({
  hudMode,
  activeForensicCase,
  forensicTimeOffsetHours = 0,
  incident,
  vessel,
  weather,
  asfScenes,
  selectedAsfSceneId,
  inspectTargetMode,
  liveSnapshot,
  queuedSarTasks,
  activeTab,
  onChangeTab,
  onSelectAsfScene,
  onSimulateBlackout,
  onAdvanceBlackout,
  onClearBlackout,
  onQueueSarTask,
  onTriggerLiveOilSpill,
  onClearLiveOilSpill,
  isSimActive = false,
  onToggleOptionalSim,
  onOpenDossier,
  onClose,
}) => {
  const [showCfarMask, setShowCfarMask] = useState(true);
  const [showAzimuthVector, setShowAzimuthVector] = useState(true);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const quicklookSectionRef = useRef<HTMLElement | null>(null);

  const activeForensicTemporal = activeForensicCase
    ? evaluateForensicCaseAtTime(activeForensicCase, forensicTimeOffsetHours)
    : null;

  const selectedAsfScene =
    (selectedAsfSceneId ? asfScenes.find((s) => s.id === selectedAsfSceneId) : undefined) ??
    asfScenes.find((s) => Boolean(s.browseImageUrl)) ??
    asfScenes[0];

  const quicklookSrc = selectedAsfScene?.browseImageUrl ?? null;
  const quicklookError = Boolean(quicklookSrc && errorSrc === quicklookSrc);
  const quicklookLoading = Boolean(
    quicklookSrc && loadedSrc !== quicklookSrc && errorSrc !== quicklookSrc
  );

  useEffect(() => {
    const img = imgRef.current;
    if (quicklookSrc && img && img.complete && img.naturalWidth > 0) {
      setLoadedSrc(quicklookSrc);
    }
  }, [quicklookSrc, activeTab]);

  useEffect(() => {
    if (activeTab === 'sar_lab' && selectedAsfSceneId && quicklookSectionRef.current) {
      quicklookSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTab, selectedAsfSceneId]);

  const sar = incident.sarMetrics;
  const drift = incident.driftAttribution;
  const isSurveillance = hudMode === 'surveillance';
  const darkEnv = liveSnapshot.darkEnvelope;
  const sgp4Intercept = liveSnapshot.sgp4Intercept;
  const oilSim = liveSnapshot.oilSimulation;
  const cableRisk = liveSnapshot.cableRisk;
  const liveLiability = liveSnapshot.financialLiability;

  const activeAzimuthShiftM = isSurveillance
    ? liveSnapshot.dopplerPhysics.azimuthShiftM
    : sar.azimuthDisplacementM;
  const activeDerivedSpeedKts = isSurveillance
    ? liveSnapshot.dopplerPhysics.sarDerivedSpeedKts
    : sar.calculatedTrueSpeedKts;
  const activeVvDb = isSurveillance
    ? liveSnapshot.dopplerPhysics.vvBackscatterDb
    : sar.vvBackscatterDb;
  const activeIncidenceDeg = isSurveillance
    ? liveSnapshot.dopplerPhysics.incidenceAngleDeg
    : sar.incidenceAngleDeg;

  const svgShiftPx = Math.min(82, Math.max(18, Math.round((activeAzimuthShiftM / 650) * 78)));
  const cableProximityPct = Math.max(
    4,
    Math.min(100, Math.round((1 - Math.min(vessel.nearestCableDistanceKm, 25) / 25) * 100))
  );

  // Use live Open-Meteo wind-driven SAR Observability Probability
  const liveObservabilityPct = weather.sarObservabilityPct;
  const isWindWindowOptimal = weather.windSpeedMs >= 3 && weather.windSpeedMs <= 10;

  const activeTaskForVessel = queuedSarTasks.find((t) => t.targetVesselId === vessel.id);

  const activeSarConfidence =
    !isSurveillance && activeForensicCase
      ? computeSarConfidenceAssessment(activeForensicCase.metoceanAtEvent.windSpeedKts, {
          hasAnomaly: true,
          isConfirmedDark: activeForensicCase.primaryVessel.aisGapHours >= 0.5,
          aisGapMinutes: activeForensicCase.primaryVessel.aisGapHours * 60,
          hasSlick: activeForensicCase.spill.areaKm2 > 0,
          windDirectionDeg: activeForensicCase.metoceanAtEvent.windDirectionDeg,
        })
      : liveSnapshot.sarConfidence;

  const isFlaggedDarkTarget =
    Boolean(darkEnv?.isConfirmedDark) ||
    vessel.status === 'dark' ||
    vessel.status === 'spoofed' ||
    Boolean(liveSnapshot.cableProximityAlert);
  const isRoutineCompliant = isSurveillance && !isFlaggedDarkTarget && !oilSim && !isSimActive;
  const isHypotheticalSimOnly = isSurveillance && (Boolean(oilSim) || isSimActive) && !isFlaggedDarkTarget;

  const activeCoastalImpact =
    !isSurveillance && activeForensicCase && activeForensicTemporal
      ? computeCoastalImpactAssessment({
          lat: activeForensicTemporal.lat,
          lon: activeForensicTemporal.lon,
          windSpeedKts: activeForensicCase.metoceanAtEvent.windSpeedKts,
          windDirectionDeg: activeForensicCase.metoceanAtEvent.windDirectionDeg,
          currentSpeedKts: activeForensicCase.metoceanAtEvent.currentSpeedKts,
          currentDirectionDeg: activeForensicCase.metoceanAtEvent.currentDirectionDeg,
          slickWidthKm: activeForensicCase.spill.maxWidthKm,
          slickAreaKm2: activeForensicCase.spill.areaKm2,
          driftBearingDeg: activeForensicCase.spill.slickBearingDeg,
          driftSpeedKts: activeForensicCase.spill.driftSpeedKts,
          coastlineImpactEtaOverrideHours: activeForensicCase.impactAssessment.coastlineImpactEtaHours,
        })
      : liveSnapshot.coastalImpact;

  return (
    <aside
      aria-label="Target Physics, Attribution and Cost Inspector"
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      className="fixed top-[4.5rem] right-[4.25rem] bottom-[6.75rem] z-[900] w-[22.5rem] hud-glass rounded-md flex flex-col overflow-hidden"
      style={{
        overscrollBehavior: 'contain',
      }}
    >
      {/* Target Header */}
      <div className="shrink-0 px-3.5 py-3 border-b border-[#22D3EE]/20 bg-[#060D14]">
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
          <span className="truncate">
            {vessel.isLiveAis ? 'LIVE AIS' : incident.caseCode} · MMSI {vessel.mmsi}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`font-semibold ${
                darkEnv?.isConfirmedDark
                  ? 'text-red-400 animate-pulse'
                  : vessel.isLiveAis
                    ? 'text-emerald-400'
                    : !isSurveillance
                      ? 'text-[#F59E0B]'
                      : vessel.status === 'dark'
                        ? 'text-red-400'
                        : vessel.status === 'spoofed'
                          ? 'text-[#F59E0B]'
                          : 'text-[#22D3EE]'
              }`}
            >
              {darkEnv?.isConfirmedDark
                ? darkEnv.isSimulated
                  ? 'DARK (>30m · SIM)'
                  : 'DARK (>30m)'
                : darkEnv && darkEnv.gapMinutes >= 0.5
                  ? `GAP (${Math.round(darkEnv.gapMinutes)}m)`
                  : liveSnapshot.cableProximityAlert
                    ? 'CABLE THREAT'
                    : vessel.isLiveAis
                      ? 'LIVE AIS'
                      : !isSurveillance && activeForensicCase
                        ? activeForensicCase.classificationLabel.toUpperCase()
                        : vessel.status === 'dark'
                          ? 'DARK TARGET'
                          : vessel.status === 'spoofed'
                            ? 'GNSS SPOOFED'
                            : 'AIS VERIFIED'}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector panel"
                className="p-0.5 rounded border border-slate-700 hover:border-[#22D3EE]/60 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <h2 className="text-sm font-semibold text-slate-100 mt-1 truncate">
          {isSurveillance && inspectTargetMode === 'sar_footprint' && selectedAsfScene
            ? selectedAsfScene.sceneName
            : vessel.name}
        </h2>
        <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
          {vessel.vesselType} · {vessel.lengthM}m x {vessel.beamM}m · Flag {vessel.flag}
        </p>
      </div>

      {/* 3-Tab Switcher */}
      <div className="shrink-0 grid grid-cols-3 border-b border-cyan-500/20 bg-[#040812]/60 p-1 gap-1">
        <button
          type="button"
          onClick={() => onChangeTab('behavior')}
          className={`py-1.5 px-1.5 text-[10px] font-mono font-medium rounded-xs transition-colors whitespace-nowrap truncate ${
            activeTab === 'behavior'
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/45'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          BEHAVIOR &amp; SPOOF
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('sar_lab')}
          className={`py-1.5 px-1.5 text-[10px] font-mono font-medium rounded-xs transition-colors whitespace-nowrap truncate ${
            activeTab === 'sar_lab'
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/45'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          SAR &amp; AZIMUTH LAB
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('drift_cost')}
          className={`py-1.5 px-1.5 text-[10px] font-mono font-medium rounded-xs transition-colors whitespace-nowrap truncate ${
            activeTab === 'drift_cost'
              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/45'
              : 'text-slate-400 hover:text-slate-200 border border-transparent'
          }`}
        >
          DRIFT &amp; COST
        </button>
      </div>

      {/* Scrollable Tab Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain hud-scroll p-3.5 space-y-3.5">
        {activeTab === 'behavior' && (
          <>
            {/* Show SAR Confidence only for >30m dark anomalies, active simulations, or Forensic Case Lab */}
            {!isRoutineCompliant ? (
              <div
                title={activeSarConfidence.explanation}
                className={`px-2.5 py-1.5 rounded border text-[9.5px] font-mono font-bold flex items-center justify-between gap-1.5 ${
                  activeSarConfidence.tone === 'cyan'
                    ? 'bg-[#22D3EE]/12 border-[#22D3EE]/50 text-[#22D3EE]'
                    : 'bg-[#F59E0B]/14 border-[#F59E0B]/60 text-[#F59E0B]'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {activeSarConfidence.tone === 'cyan' ? (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {isHypotheticalSimOnly
                      ? `SIMULATION // ${activeSarConfidence.badgeText}`
                      : activeSarConfidence.badgeText}
                  </span>
                </span>
                <span className="text-[9px] text-slate-300 shrink-0 tabular-nums">
                  {activeSarConfidence.windSpeedKts} kt
                </span>
              </div>
            ) : (
              <div className="px-2.5 py-1.5 rounded border border-emerald-500/35 bg-[#101C28]/80 text-[9.5px] font-mono font-semibold text-emerald-300 flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5 truncate">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="truncate">AIS STATUS: ROUTINE // COMPLIANT</span>
                </span>
                {onToggleOptionalSim ? (
                  <button
                    type="button"
                    onClick={onToggleOptionalSim}
                    className="px-1.5 py-0.5 rounded bg-[#060D14] border border-[#22D3EE]/50 text-[#22D3EE] hover:bg-[#22D3EE]/15 text-[9px] font-bold shrink-0 cursor-pointer transition-colors"
                  >
                    OPTIONAL SIM
                  </button>
                ) : (
                  <span className="text-[9px] text-slate-400 shrink-0">NO ANOMALY</span>
                )}
              </div>
            )}
            {/* Vessel Kinematics Grid */}
            <section className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="uppercase tracking-wider">Vessel Kinematics</span>
                <span>IMO {vessel.imo}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#050c1a]/80 border border-slate-700/60 rounded p-2">
                  <div className="text-[10px] font-mono text-slate-400">
                    {vessel.isLiveAis ? 'AIS SOG' : 'TRUE SOG'}
                  </div>
                  <div className="text-sm font-mono font-semibold text-cyan-300 mt-0.5">
                    {(vessel.isLiveAis ? vessel.sogKts : sar.calculatedTrueSpeedKts).toFixed(1)}{' '}
                    <span className="text-[10px] text-slate-400">KTS</span>
                  </div>
                </div>
                <div className="bg-[#050c1a]/80 border border-slate-700/60 rounded p-2">
                  <div className="text-[10px] font-mono text-slate-400">COG / HDG</div>
                  <div className="text-sm font-mono font-semibold text-slate-100 mt-0.5">
                    {vessel.cogDeg}° / {vessel.headingDeg}°
                  </div>
                </div>
                <div className="bg-[#050c1a]/80 border border-slate-700/60 rounded p-2">
                  <div className="text-[10px] font-mono text-slate-400">DRAFT</div>
                  <div className="text-sm font-mono font-semibold text-slate-100 mt-0.5">
                    {vessel.draftM.toFixed(1)}{' '}
                    <span className="text-[10px] text-slate-400">M</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Live AIS Dark-Gap Watchdog & 30-Minute Rule Control */}
            {isSurveillance && (
              <section
                className={`rounded p-3 space-y-2.5 border ${
                  darkEnv?.isConfirmedDark
                    ? 'bg-rose-950/35 border-rose-500/60'
                    : darkEnv && darkEnv.gapMinutes >= 0.5
                      ? 'bg-emerald-950/25 border-emerald-500/45'
                      : 'bg-[#050c1a]/85 border-cyan-500/30'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                    <Radio
                      className={`w-3.5 h-3.5 ${
                        darkEnv?.isConfirmedDark ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                      }`}
                    />
                    <span>AIS 30m Blackout Watchdog</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded-xs text-[9.5px] font-bold border ${
                      darkEnv?.isConfirmedDark
                        ? 'bg-rose-500/20 border-rose-400/55 text-rose-200'
                        : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                    }`}
                  >
                    {darkEnv?.isConfirmedDark
                      ? `DARK ANOMALY · ${Math.round(darkEnv.gapMinutes)}m (>30m)`
                      : darkEnv && darkEnv.gapMinutes >= 0.5
                        ? `GREEN GAP · ${Math.round(darkEnv.gapMinutes)}m (<30m)`
                        : 'COMPLIANT (<30m RULE)'}
                  </span>
                </div>

                {darkEnv && (darkEnv.isSimulated || darkEnv.gapMinutes >= 0.5) ? (
                  <>
                    {/* 30-Minute Threshold Progress Gauge */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[9.5px] font-mono">
                        <span className="text-slate-400">30m ESCALATION THRESHOLD</span>
                        <span
                          className={
                            darkEnv.isConfirmedDark ? 'text-rose-300 font-bold' : 'text-emerald-300 font-semibold'
                          }
                        >
                          {darkEnv.gapMinutes.toFixed(1)}m / 30.0m
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-xs overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            darkEnv.isConfirmedDark ? 'bg-[#FF2A5F]' : 'bg-[#34D399]'
                          }`}
                          style={{ width: `${Math.min(100, (darkEnv.gapMinutes / 30) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                      <div
                        className={`bg-[#040812]/90 rounded p-1.5 border ${
                          darkEnv.isConfirmedDark ? 'border-rose-500/30' : 'border-emerald-500/30'
                        }`}
                      >
                        <div className="text-[9px] text-slate-400">V_MAX EVADE</div>
                        <div
                          className={`font-semibold ${
                            darkEnv.isConfirmedDark ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                        >
                          {darkEnv.maxSpeedKts} kts
                        </div>
                      </div>
                      <div
                        className={`bg-[#040812]/90 rounded p-1.5 border ${
                          darkEnv.isConfirmedDark ? 'border-rose-500/30' : 'border-emerald-500/30'
                        }`}
                      >
                        <div className="text-[9px] text-slate-400">EST. R_MAX</div>
                        <div className="text-amber-300 font-semibold">
                          {darkEnv.reachabilityRadiusKm.toFixed(1)} km
                        </div>
                      </div>
                      <div
                        className={`bg-[#040812]/90 rounded p-1.5 border ${
                          darkEnv.isConfirmedDark ? 'border-rose-500/30' : 'border-emerald-500/30'
                        }`}
                      >
                        <div className="text-[9px] text-slate-400">DISK Ø</div>
                        <div className="text-cyan-300 font-semibold">
                          {darkEnv.reachabilityDiameterKm.toFixed(1)} km
                        </div>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono text-slate-300 leading-relaxed">
                      LKP {darkEnv.lkpLat.toFixed(3)}°N, {darkEnv.lkpLon.toFixed(3)}°E ·{' '}
                      {darkEnv.isConfirmedDark
                        ? 'Confirmed dark vessel candidate (>30m blackout); reachability envelope escalated.'
                        : 'Routine handoff under 30m; vessel remains green with predictive movement envelope active.'}
                    </div>

                    {darkEnv.isConfirmedDark && darkEnv.intersectingCables.length > 0 && (
                      <div className="bg-rose-500/20 border border-rose-400/65 rounded p-2 text-[10.5px] font-mono text-rose-100 space-y-0.5">
                        <div className="font-bold flex items-center gap-1.5 text-rose-300">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>SUBSEA INFRASTRUCTURE THREAT WARNING</span>
                        </div>
                        <div className="text-[10px] text-rose-100">
                          360° reachability disk intersects{' '}
                          <strong>
                            {darkEnv.intersectingCables.map((c) => c.cableName).join(', ')}
                          </strong>{' '}
                          ({darkEnv.intersectingCables[0].capacityTbps} Tbps · Anchor-Drag Risk{' '}
                          {darkEnv.intersectingCables[0].anchorDragRiskScore}/100).
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onAdvanceBlackout(vessel.id, 600)}
                        className="px-2 py-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/45 text-emerald-200 text-[10px] font-mono font-semibold transition-colors whitespace-nowrap"
                      >
                        +10m GAP
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdvanceBlackout(vessel.id, 900)}
                        className="px-2 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/45 text-amber-200 text-[10px] font-mono font-semibold transition-colors whitespace-nowrap"
                      >
                        +15m STEP
                      </button>
                      <button
                        type="button"
                        onClick={() => onAdvanceBlackout(vessel.id, 3600)}
                        className="px-2 py-1.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/45 text-rose-200 text-[10px] font-mono font-semibold transition-colors whitespace-nowrap"
                      >
                        +1h EVADE
                      </button>
                      {darkEnv.isSimulated && (
                        <button
                          type="button"
                          onClick={() => onClearBlackout(vessel.id)}
                          className="flex-1 py-1.5 px-2.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[10px] font-mono font-semibold transition-colors whitespace-nowrap"
                        >
                          RESTORE AIS
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSimulateBlackout(vessel)}
                    className="w-full py-2 px-3 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/55 text-amber-100 text-[10.5px] font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                    <span>SIMULATE AIS BLACKOUT (START 16M)</span>
                  </button>
                )}
              </section>
            )}

            {/* Autonomous SGP4 Next-Pass Intercept & Swath Capture Probability */}
            {isSurveillance && sgp4Intercept && (
              <section className="bg-[#050c1a]/85 border border-cyan-500/30 rounded p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-100 font-semibold flex items-center gap-1.5">
                    <Satellite className="w-3.5 h-3.5 text-cyan-400" />
                    <span>SGP4 Intercept &amp; Capture Prob</span>
                  </span>
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>T-{sgp4Intercept.countdownFormatted}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                  <div className="bg-[#040812]/90 border border-slate-800 rounded p-2">
                    <div className="text-[9.5px] text-slate-400">NEXT OVERPASS</div>
                    <div className="text-cyan-300 font-semibold mt-0.5 truncate">
                      {sgp4Intercept.satelliteName} ({sgp4Intercept.bandLabel})
                    </div>
                    <div className="text-[9.5px] text-slate-400">
                      {sgp4Intercept.orbitDirection} · {sgp4Intercept.swathWidthKm}km Swath
                    </div>
                  </div>
                  <div className="bg-[#040812]/90 border border-slate-800 rounded p-2">
                    <div className="text-[9.5px] text-slate-400">SWATH CAPTURE PROB</div>
                    <div className="text-emerald-400 font-bold text-sm mt-0.5">
                      {sgp4Intercept.captureProbabilityPct.toFixed(1)}%
                    </div>
                    <div className="text-[9.5px] text-slate-400">
                      Disk Ø {sgp4Intercept.evasiveDiskDiameterKm}km vs {sgp4Intercept.swathWidthKm}km
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-400">
                  AOS: <span className="text-slate-200">{sgp4Intercept.interceptUtc.slice(0, 19).replace('T', ' ')}Z</span> ·
                  Approach <span className="text-cyan-300">{sgp4Intercept.closestApproachKm} km</span>
                </div>

                {activeTaskForVessel ? (
                  <div className="px-2.5 py-2 rounded bg-emerald-500/15 border border-emerald-400/50 text-emerald-200 text-[10px] font-mono flex items-center justify-between">
                    <span>TASKED // {activeTaskForVessel.taskId}</span>
                    <span className="font-bold text-emerald-300">{activeTaskForVessel.status}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onQueueSarTask(sgp4Intercept, vessel)}
                    className="w-full py-2 px-3 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/55 text-cyan-100 text-[10.5px] font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Satellite className="w-3.5 h-3.5" />
                    <span>QUEUE SAR ACQUISITION TASK</span>
                  </button>
                )}
              </section>
            )}

            {/* Coverage-Aware AIS Gap Verification OR Real-Time Live AIS Status */}
            <section className="bg-[#050c1a]/80 border border-cyan-500/25 rounded p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    {vessel.isLiveAis
                      ? 'Real-Time AIS Transponder'
                      : 'Coverage-Aware AIS Verification'}
                  </span>
                </span>
                <span
                  className={`text-[10px] font-mono ${
                    darkEnv?.isConfirmedDark ? 'text-rose-400 font-semibold' : 'text-emerald-400'
                  }`}
                >
                  {darkEnv?.isConfirmedDark
                    ? 'DARK ANOMALY (>30m)'
                    : darkEnv && darkEnv.gapMinutes >= 0.5
                      ? 'ROUTINE GAP (<30m)'
                      : vessel.isLiveAis
                        ? 'LIVE STREAM'
                        : 'VERIFIED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {vessel.isLiveAis ? (
                  <>
                    Live terrestrial/coastal AIS PositionReport at{' '}
                    <span className="font-mono text-cyan-300 font-semibold">
                      {vessel.lat.toFixed(4)}°N, {vessel.lon.toFixed(4)}°E
                    </span>
                    .{' '}
                    {vessel.destination ? (
                      <>
                        Reported destination:{' '}
                        <span className="font-mono text-emerald-300 font-semibold">
                          {vessel.destination}
                        </span>
                        .{' '}
                      </>
                    ) : null}
                    {vessel.navStatus ? `Status: ${vessel.navStatus}.` : ''}
                  </>
                ) : vessel.aisGapHours > 0 ? (
                  <>
                    Target transponder silent for{' '}
                    <span className="font-mono text-rose-300 font-semibold">
                      {vessel.aisGapHours.toFixed(1)}h
                    </span>{' '}
                    while{' '}
                    <span className="font-mono text-cyan-300 font-semibold">
                      {vessel.coverageNeighborsCount} neighboring vessels
                    </span>{' '}
                    within 25 nm reported continuous AIS. Blind-zone false positive ruled out.
                  </>
                ) : (
                  <>
                    AIS stream active, but spatial ring geometry fails kinematic constraints across{' '}
                    <span className="font-mono text-[#F59E0B] font-semibold">
                      {incident.spoofingRingCenter?.affectedCount ?? 14} co-located targets
                    </span>{' '}
                    while {vessel.coverageNeighborsCount} adjacent vessels maintain nominal tracks.
                  </>
                )}
              </p>
              <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-700/50">
                Last AIS Frame: {vessel.aisLastSeenUtc}
              </div>
            </section>

            {/* Subsea Cable Distance & Anchor-Drag Risk Meter */}
            <section
              className={`rounded p-3 space-y-2 border ${
                liveSnapshot.cableProximityAlert
                  ? 'bg-rose-950/30 border-rose-500/60'
                  : 'bg-[#050c1a]/80 border-slate-700/60'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Anchor className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    {liveSnapshot.cableProximityAlert ? 'SUBSEA CABLE THREAT' : 'Subsea Cable Risk'}
                  </span>
                </span>
                <span
                  className={`font-semibold ${
                    cableRisk.distanceKm <= 3 || cableRisk.intersectsEnvelope || liveSnapshot.cableProximityAlert
                      ? 'text-rose-400'
                      : 'text-cyan-300'
                  }`}
                >
                  {cableRisk.distanceKm.toFixed(2)} km · Risk {cableRisk.anchorDragRiskScore}/100
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-xs overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    cableRisk.distanceKm <= 3 || cableRisk.intersectsEnvelope || liveSnapshot.cableProximityAlert
                      ? 'bg-rose-500'
                      : 'bg-cyan-400'
                  }`}
                  style={{ width: `${cableProximityPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span>Trunk: {cableRisk.cableName} ({cableRisk.capacityTbps} Tbps)</span>
                <span className={liveSnapshot.cableProximityAlert ? 'text-rose-300 font-semibold' : ''}>
                  {liveSnapshot.cableProximityAlert
                    ? liveSnapshot.cableProximityAlert.reason === 'PROXIMITY_UNDER_3KM'
                      ? '< 3.0 KM PROXIMITY ALERT'
                      : liveSnapshot.cableProximityAlert.reason === 'SUSPICIOUS_SLOWDOWN'
                        ? 'SUSPICIOUS SLOWDOWN OVER CABLE'
                        : 'DARK ENVELOPE INTERSECT'
                    : cableRisk.distanceKm <= 5
                      ? 'INSIDE 5KM ZONE'
                      : 'OUTSIDE 5KM BUFFER'}
                </span>
              </div>
            </section>

            {/* Historical Metocean & Kp Check (Forensic) OR Live NASA DONKI + NOAA Space Weather Check */}
            {!isSurveillance && activeForensicCase ? (
              <section className="bg-[#060D14]/85 border border-[#22D3EE]/30 rounded p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#22D3EE]" />
                    <span>Historical Metocean &amp; Kp Archive</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-xs bg-[#22D3EE]/15 border border-[#22D3EE]/40 text-[#22D3EE] text-[9.5px] font-semibold">
                    {activeForensicCase.dateStr}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-slate-400">Event Wind &amp; Current</span>
                  <span className="text-[#F59E0B] font-semibold">
                    {activeForensicCase.metoceanAtEvent.windSpeedKts} kts{' '}
                    {activeForensicCase.metoceanAtEvent.windDirectionCardinal} ·{' '}
                    {activeForensicCase.metoceanAtEvent.currentSpeedKts} kts
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {activeForensicCase.metoceanAtEvent.kpConfidenceVerdict}. Coverage checks confirm{' '}
                  {activeForensicCase.primaryVessel.coverageNeighborsCount} nearby vessels kept
                  uninterrupted AIS reception.
                </p>
              </section>
            ) : (
              <section className="bg-[#050c1a]/80 border border-emerald-500/30 rounded p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Space Weather Check</span>
                  </span>
                  <span className="px-1.5 py-0.5 rounded-xs bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[9.5px] font-semibold">
                    {weather.donkiVerified ? 'NASA DONKI: VERIFIED' : 'Kp MONITOR'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">
                    NOAA SWPC Planetary Kp ({weather.kpSource === 'NOAA_SWPC_LIVE' ? 'LIVE' : 'BASELINE'})
                  </span>
                  <span className="text-emerald-400 font-bold">
                    Kp {weather.kpIndex.toFixed(1)} · {weather.kpStatus}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {weather.kpIndex < 4
                    ? `Live geomagnetic Kp=${weather.kpIndex.toFixed(1)} (${weather.donkiStormAlertsCount} GST alerts in 30d window). Solar scintillation ruled out; AIS anomalies attributed to intentional RF/transponder manipulation.`
                    : `Elevated geomagnetic activity (Kp=${weather.kpIndex.toFixed(1)}). Cross-checking GNSS spoofing against DONKI ionospheric storm alerts (${weather.donkiStormAlertsCount}).`}
                </p>
                <div className="text-[10px] font-mono text-slate-400">
                  Open-Meteo Sea State: {weather.waveHeightM}m · Current {weather.surfaceCurrentKts} kts ({weather.surfaceCurrentDeg}°)
                </div>
              </section>
            )}

            {/* Causal Evidence Chain OR Live AIS Broadcast Metadata */}
            {vessel.isLiveAis ? (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Live AIS Static &amp; Voyage Metadata
                </h3>
                <div className="bg-[#050c1a]/70 border border-slate-800 rounded p-2.5 grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                  <div>
                    <div className="text-slate-500">CALL SIGN</div>
                    <div className="text-slate-200">{vessel.callSign || 'Awaiting StaticMsg'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">IMO / MMSI</div>
                    <div className="text-slate-200">
                      {vessel.imo} / {vessel.mmsi}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">DESTINATION</div>
                    <div className="text-emerald-300 truncate">
                      {vessel.destination || 'Awaiting StaticMsg'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">CO-VISIBLE NEIGHBORS</div>
                    <div className="text-cyan-300">{vessel.coverageNeighborsCount} active ships</div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  Unified Causal Chain
                </h3>
                <ol className="space-y-1.5">
                  {incident.causalChain.map((step, idx) => (
                    <li
                      key={idx}
                      className="text-[11px] text-slate-300 bg-[#050c1a]/60 border border-slate-800 rounded p-2 flex gap-2"
                    >
                      <span className="font-mono text-cyan-400 shrink-0">0{idx + 1}.</span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <button
              type="button"
              onClick={onOpenDossier}
              className="w-full py-2.5 px-4 rounded bg-[#22D3EE]/20 hover:bg-[#22D3EE]/30 border border-[#22D3EE]/60 text-cyan-100 font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>EXPORT INCIDENT DOSSIER</span>
            </button>
          </>
        )}

        {activeTab === 'sar_lab' && (
          <>
            {/* Historical SAR Pass Telemetry (Forensic) OR Live NASA SAR Quicklook Radar Preview */}
            {!isSurveillance && activeForensicCase ? (
              <section className="bg-[#060D14] border border-[#22D3EE]/35 rounded p-3 space-y-2 font-mono">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-100 flex items-center gap-1.5">
                    <Satellite className="w-3.5 h-3.5 text-[#22D3EE]" />
                    <span>Historical SAR Pass Frame</span>
                  </span>
                  <span className="text-[9.5px] text-[#F59E0B] font-semibold">
                    {activeForensicCase.sarPass.satellite}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px] tabular-nums">
                  <div className="bg-[#101C28] border border-slate-800 rounded p-2">
                    <div className="text-[9px] text-slate-400">PASS COORDINATES</div>
                    <div className="text-[#22D3EE] font-semibold mt-0.5">
                      {activeForensicCase.sarPass.passCoordinates.lat.toFixed(4)}°N,{' '}
                      {activeForensicCase.sarPass.passCoordinates.lon.toFixed(4)}°E
                    </div>
                  </div>
                  <div className="bg-[#101C28] border border-slate-800 rounded p-2">
                    <div className="text-[9px] text-slate-400">ACQUISITION UTC</div>
                    <div className="text-slate-100 font-semibold mt-0.5">
                      {activeForensicCase.sarPass.passTimestampUtc}
                    </div>
                  </div>
                  <div className="bg-[#101C28] border border-slate-800 rounded p-2">
                    <div className="text-[9px] text-slate-400">SENSOR &amp; POLARIZATION</div>
                    <div className="text-slate-200 mt-0.5 truncate">
                      {activeForensicCase.sarPass.sensorMode} · {activeForensicCase.sarPass.polarization}
                    </div>
                  </div>
                  <div className="bg-[#101C28] border border-slate-800 rounded p-2">
                    <div className="text-[9px] text-slate-400">DBSCAN / CFAR</div>
                    <div className="text-[#F59E0B] mt-0.5">
                      {activeForensicCase.sarPass.dbscanClusterPts} pts · &gt;
                      {activeForensicCase.sarPass.cfarThresholdDb} dB
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section
                ref={quicklookSectionRef}
                className="bg-[#040812]/90 border border-cyan-500/35 rounded p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                    <span>NASA SAR Quicklook Radar Preview</span>
                  </div>
                  {selectedAsfScene && (
                    <span className="text-[9.5px] font-mono text-cyan-300 truncate max-w-[120px]">
                      {selectedAsfScene.platform}
                    </span>
                  )}
                </div>

                <div className="relative w-full h-44 rounded border border-slate-800 bg-[#02050c] overflow-hidden flex items-center justify-center">
                  {quicklookSrc && !quicklookError ? (
                    <>
                      <img
                        ref={imgRef}
                        key={quicklookSrc}
                        src={quicklookSrc}
                        alt={`NASA ASF SAR quicklook for ${selectedAsfScene?.sceneName ?? 'SAR scene'}`}
                        onLoad={() => setLoadedSrc(quicklookSrc)}
                        onError={() => setErrorSrc(quicklookSrc)}
                        className="w-full h-full object-cover"
                      />
                      {quicklookLoading && (
                        <div className="pointer-events-none absolute top-2 right-2 px-2 py-1 rounded bg-[#02050c]/85 border border-cyan-500/40 flex items-center gap-1.5 text-[9.5px] font-mono text-cyan-300">
                          <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                          <span>LOADING...</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center p-3 text-center"
                      style={{
                        background:
                          'radial-gradient(circle at 35% 40%, rgba(0, 240, 255, 0.14), rgba(2, 5, 12, 0.96) 72%)',
                      }}
                    >
                      <Radar className="w-6 h-6 text-cyan-400/70 mb-1.5" />
                      <div className="text-[10px] font-mono text-slate-300 truncate max-w-full">
                        {selectedAsfScene?.sceneName ?? 'SENTINEL-1 MED-EAST QUICKLOOK'}
                      </div>
                      <div className="text-[9.5px] font-mono text-slate-500 mt-0.5">
                        {selectedAsfScene?.browseImageUrl
                          ? 'Quicklook unavailable · Open in NASA ASF Vertex'
                          : 'Select live ASF scene below or open NASA ASF Vertex'}
                      </div>
                    </div>
                  )}

                  {selectedAsfScene && (
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2.5 py-1.5 flex items-center justify-between text-[9.5px] font-mono">
                      <span className="text-slate-200 truncate">
                        {selectedAsfScene.sceneName}
                      </span>
                      <span className="text-cyan-300 shrink-0 ml-2">
                        {selectedAsfScene.beamMode} · {selectedAsfScene.polarization}
                      </span>
                    </div>
                  )}
                </div>

                {selectedAsfScene && (
                  <div className="bg-[#050c1a]/80 border border-slate-800 rounded px-2.5 py-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[9.5px] font-mono">
                    <div className="text-slate-400">
                      ACQ UTC:{' '}
                      <span className="text-slate-200">
                        {selectedAsfScene.startTimeUtc.slice(0, 19).replace('T', ' ')}Z
                      </span>
                    </div>
                    <div className="text-slate-400 text-right">
                      POL / PASS:{' '}
                      <span className="text-cyan-300">
                        {selectedAsfScene.polarization} · {selectedAsfScene.flightDirection}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <a
                    href={
                      selectedAsfScene
                        ? `https://search.asf.alaska.edu/#/?granule=${encodeURIComponent(selectedAsfScene.sceneName)}`
                        : 'https://search.asf.alaska.edu/'
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-1.5 px-2.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/55 text-cyan-100 text-[10px] font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>OPEN IN NASA ASF VERTEX</span>
                  </a>
                  {selectedAsfScene?.downloadUrl && (
                    <a
                      href={selectedAsfScene.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Download SAR Product"
                      className="py-1.5 px-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-cyan-200 text-[10px] font-mono flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3 h-3" />
                      <span>PRODUCT</span>
                    </a>
                  )}
                </div>
              </section>
            )}

            {/* Interactive SAR & Azimuth Doppler Diagram */}
            <section className="bg-[#040812]/90 border border-cyan-500/25 rounded p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                  <Radar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>CFAR + Azimuth Doppler Lab</span>
                </div>
                <span className="text-[10px] font-mono text-cyan-300">{sar.polarization}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowCfarMask((v) => !v)}
                  className={`px-2 py-1 text-[10px] font-mono rounded-xs border transition-colors ${
                    showCfarMask
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  CFAR + DBSCAN
                </button>
                <button
                  type="button"
                  onClick={() => setShowAzimuthVector((v) => !v)}
                  className={`px-2 py-1 text-[10px] font-mono rounded-xs border transition-colors ${
                    showAzimuthVector
                      ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  Δx Doppler Shift
                </button>
              </div>

              <div className="border border-slate-800 rounded bg-[#02050c] overflow-hidden">
                <svg
                  viewBox="0 0 320 190"
                  className="w-full h-44 block"
                  role="img"
                  aria-label="SAR Azimuth Doppler Displacement and Kelvin Wake Diagram"
                >
                  <defs>
                    <pattern id="sarGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path
                        d="M 20 0 L 0 0 0 20"
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.08)"
                        strokeWidth="0.7"
                      />
                    </pattern>
                    <radialGradient id="shipEchoGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.95" />
                      <stop offset="55%" stopColor="#00F0FF" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  <rect width="320" height="190" fill="url(#sarGrid)" />
                  <text x="8" y="14" fill="#64748b" fontSize="8.5" fontFamily="JetBrains Mono">
                    AZIMUTH (ALONG-TRACK) →
                  </text>
                  <text x="8" y="182" fill="#64748b" fontSize="8.5" fontFamily="JetBrains Mono">
                    RANGE · θ={activeIncidenceDeg}° · R={liveSnapshot.dopplerPhysics.slantRangeKm}km · CFAR &gt;{' '}
                    {sar.cfarThresholdDb} dB
                  </text>

                  {showCfarMask && (
                    <g opacity="0.45">
                      <rect
                        x="18"
                        y="26"
                        width="284"
                        height="136"
                        fill="none"
                        stroke="rgba(0, 240, 255, 0.2)"
                        strokeDasharray="3 3"
                      />
                      {[
                        [48, 44],
                        [92, 138],
                        [245, 52],
                        [278, 128],
                        [142, 39],
                        [62, 112],
                      ].map(([cx, cy], i) => (
                        <circle key={i} cx={cx} cy={cy} r="1.3" fill="#475569" />
                      ))}
                    </g>
                  )}

                  {(drift || oilSim) && (
                    <path
                      d="M 38 118 Q 85 104 128 96 Q 110 112 75 128 Z"
                      fill="rgba(255, 42, 95, 0.22)"
                      stroke="#FF2A5F"
                      strokeWidth="1"
                      strokeDasharray="3 2"
                    />
                  )}

                  <g>
                    <line
                      x1="128"
                      y1="96"
                      x2="46"
                      y2="68"
                      stroke="#38BDF8"
                      strokeWidth="1.4"
                      strokeDasharray="4 2"
                    />
                    <line
                      x1="128"
                      y1="96"
                      x2="46"
                      y2="124"
                      stroke="#38BDF8"
                      strokeWidth="1.4"
                      strokeDasharray="4 2"
                    />
                    <circle cx="128" cy="96" r="3.5" fill="#38BDF8" />
                    <text x="90" y="142" fill="#38BDF8" fontSize="8.5" fontFamily="JetBrains Mono">
                      KELVIN WAKE APEX
                    </text>
                  </g>

                  <g transform={`translate(${128 + svgShiftPx}, 96)`}>
                    <circle cx="0" cy="0" r="18" fill="url(#shipEchoGlow)" />
                    {showCfarMask && (
                      <rect
                        x="-13"
                        y="-9"
                        width="26"
                        height="18"
                        fill="none"
                        stroke="#22D3EE"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}
                    <polygon points="-9,0 -4,-4 9,-3 11,0 9,3 -4,4" fill="#F8FAFC" />
                    <text
                      x="-22"
                      y="-16"
                      fill="#22D3EE"
                      fontSize="8.5"
                      fontFamily="JetBrains Mono"
                    >
                      SAR ECHO ({activeVvDb} dB)
                    </text>
                  </g>

                  {showAzimuthVector && (
                    <g>
                      <line
                        x1="128"
                        y1="62"
                        x2={128 + svgShiftPx}
                        y2="62"
                        stroke="#F59E0B"
                        strokeWidth="1.6"
                      />
                      <line x1="128" y1="57" x2="128" y2="92" stroke="#F59E0B" strokeWidth="0.9" strokeDasharray="2 2" />
                      <line
                        x1={128 + svgShiftPx}
                        y1="57"
                        x2={128 + svgShiftPx}
                        y2="92"
                        stroke="#F59E0B"
                        strokeWidth="0.9"
                        strokeDasharray="2 2"
                      />
                      <text
                        x={128 + svgShiftPx / 2 - 22}
                        y="55"
                        fill="#FBBF24"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="JetBrains Mono"
                      >
                        Δx = {activeAzimuthShiftM}m
                      </text>
                    </g>
                  )}
                </svg>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <div className="bg-[#070f20] border border-slate-700/60 rounded p-2">
                  <div className="text-[10px] text-slate-400">DERIVED TRUE SPEED</div>
                  <div className="text-sm font-semibold text-amber-300 mt-0.5">
                    {activeDerivedSpeedKts.toFixed(1)} KTS
                  </div>
                </div>
                <div className="bg-[#070f20] border border-slate-700/60 rounded p-2">
                  <div className="text-[10px] text-slate-400">
                    {isSurveillance ? 'RADIAL V_r / WAKE' : 'VV / SLICK CONTRAST'}
                  </div>
                  <div className="text-sm font-semibold text-cyan-300 mt-0.5">
                    {isSurveillance
                      ? `${liveSnapshot.dopplerPhysics.radialVelocityMs} m/s · ${liveSnapshot.dopplerPhysics.wakeSeparationM}m`
                      : `+${sar.vvBackscatterDb.toFixed(1)} / ${sar.slickContrastDb.toFixed(1)} dB`}
                  </div>
                </div>
              </div>
            </section>

            {/* Historical Wind Window OR Live ASF Catalog */}
            {!isSurveillance && activeForensicCase ? (
              <section className="bg-[#060D14] border border-[#22D3EE]/25 rounded p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
                    <Satellite className="w-3.5 h-3.5 text-[#22D3EE]" />
                    <span>Historical SAR Observability</span>
                  </span>
                  <span className="text-[#22D3EE] font-bold">
                    {activeForensicCase.sarPass.observabilityProbabilityPct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-xs overflow-hidden">
                  <div
                    className="h-full bg-[#22D3EE] transition-all"
                    style={{
                      width: `${activeForensicCase.sarPass.observabilityProbabilityPct}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">
                    Event Wind: {activeForensicCase.metoceanAtEvent.windSpeedKts} kts{' '}
                    {activeForensicCase.metoceanAtEvent.windDirectionCardinal}
                  </span>
                  <span className="text-[#F59E0B]">ISOLATED ARCHIVE PASS</span>
                </div>
              </section>
            ) : (
              <>
                <section className="bg-[#050c1a]/80 border border-cyan-500/25 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-200 flex items-center gap-1.5 font-semibold">
                      <Satellite className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Observation Opportunity</span>
                    </span>
                    <span className="text-cyan-300 font-bold">
                      {liveObservabilityPct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-800 rounded-xs overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all"
                      style={{ width: `${liveObservabilityPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400">
                      Wind: {weather.windSpeedMs.toFixed(1)} m/s ({weather.windSpeedKts} kts)
                    </span>
                    <span className={isWindWindowOptimal ? 'text-emerald-400' : 'text-amber-300'}>
                      {isWindWindowOptimal ? 'OPTIMAL 3–10 m/s WINDOW' : 'OUTSIDE 3–10 m/s WINDOW'}
                    </span>
                  </div>

                  {sar.commercialTaskingRecommended && (
                    <div className="px-2.5 py-1.5 rounded bg-amber-500/15 border border-amber-400/40 text-[10px] font-mono text-amber-200 font-medium">
                      COMMERCIAL SAR TASKING RECOMMENDED · {sar.nextTaskingWindowUtc}
                    </div>
                  )}
                </section>

                {/* NASA EARTHDATA SAR CATALOG (Live ASF Search API) */}
                <section className="bg-[#050c1a]/80 border border-cyan-500/25 rounded p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-100 font-semibold uppercase">
                      NASA EARTHDATA SAR CATALOG
                    </span>
                    <span className="text-[10px] text-cyan-300">
                      {asfScenes.some((s) => s.isLiveData) ? 'ASF LIVE API' : 'CALIBRATED CACHE'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {asfScenes.slice(0, 8).map((scene) => {
                      const isLBand = scene.bandLabel === 'L-BAND (NISAR)';
                      const isActivePreview = selectedAsfScene?.id === scene.id;
                      return (
                        <div
                          key={scene.id}
                          onClick={() => onSelectAsfScene(scene.id)}
                          className={`rounded p-2 space-y-1 border cursor-pointer transition-colors ${
                            isActivePreview
                              ? 'bg-cyan-950/35 border-cyan-400/55'
                              : 'bg-[#040812]/90 border-slate-800 hover:border-cyan-500/35'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded-xs text-[9.5px] font-mono font-semibold border ${
                                isLBand
                                  ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                                  : 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                              }`}
                            >
                              {scene.bandLabel}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {scene.beamMode} · {scene.polarization}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-mono text-slate-200 truncate">
                              {scene.sceneName}
                            </span>
                            {scene.downloadUrl && (
                              <a
                                href={scene.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Download SAR Scene Product"
                                className="text-cyan-300 hover:text-cyan-100 shrink-0"
                              >
                                <Download className="w-3 h-3" />
                              </a>
                            )}
                          </div>

                          <div className="text-[9.5px] font-mono text-slate-400 flex items-center justify-between">
                            <span>
                              {scene.startTimeUtc.slice(0, 19).replace('T', ' ')}Z ·{' '}
                              {scene.flightDirection}
                            </span>
                            {scene.browseImageUrl && (
                              <span className="text-emerald-400">QUICKLOOK</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {activeTab === 'drift_cost' && (
          <>
            {isSurveillance ? (
              <>
                {/* Live 3-Buoy Open-Meteo Oil Drift (Anomaly or Optional Simulation Mode) */}
                <section className="bg-[#050c1a]/85 border border-cyan-500/30 rounded p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-[#22D3EE]" />
                      <span>
                        {isFlaggedDarkTarget
                          ? 'Live 3-Buoy Oil Drift & Backtrack'
                          : 'Optional Drift Simulation Mode'}
                      </span>
                    </span>
                    <span className="text-[9.5px] font-mono text-emerald-300">
                      {!isFlaggedDarkTarget
                        ? 'SIMULATION ONLY'
                        : liveSnapshot.localMetocean.isLive
                          ? 'OPEN-METEO LIVE'
                          : 'CALIBRATED BUOYS'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFlaggedDarkTarget && onToggleOptionalSim) {
                          onToggleOptionalSim();
                          return;
                        }
                        onTriggerLiveOilSpill({
                          id: `live-spill-${vessel.id}`,
                          label: vessel.name,
                          anchorType: 'vessel',
                          lat: vessel.lat,
                          lon: vessel.lon,
                        });
                      }}
                      className={`py-1.5 px-2 rounded text-[10px] font-mono font-semibold transition-colors whitespace-nowrap border ${
                        !isFlaggedDarkTarget && (isSimActive || Boolean(oilSim))
                          ? 'bg-[#101C28] hover:bg-[#101C28]/80 border-[#F59E0B]/60 text-[#F59E0B]'
                          : 'bg-[#22D3EE]/15 hover:bg-[#22D3EE]/25 border-[#22D3EE]/50 text-cyan-100'
                      }`}
                    >
                      {isFlaggedDarkTarget
                        ? 'DROP SLICK AT VESSEL'
                        : isSimActive || Boolean(oilSim)
                          ? 'STOP OPTIONAL SIM'
                          : 'SIMULATE VESSEL DRIFT'}
                    </button>
                    {selectedAsfScene && selectedAsfScene.footprintCoords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const avgLat =
                            selectedAsfScene.footprintCoords.reduce((acc, p) => acc + p.lat, 0) /
                            selectedAsfScene.footprintCoords.length;
                          const avgLon =
                            selectedAsfScene.footprintCoords.reduce((acc, p) => acc + p.lon, 0) /
                            selectedAsfScene.footprintCoords.length;
                          onTriggerLiveOilSpill({
                            id: `live-spill-${selectedAsfScene.id}`,
                            label: selectedAsfScene.sceneName.slice(0, 20),
                            anchorType: 'sar_footprint',
                            lat: avgLat,
                            lon: avgLon,
                          });
                        }}
                        className="py-1.5 px-2 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/55 text-amber-100 text-[10px] font-mono font-semibold transition-colors whitespace-nowrap"
                      >
                        {isFlaggedDarkTarget ? 'EVALUATE SAR SCENE' : 'SIMULATE SAR SCENE'}
                      </button>
                    )}
                  </div>

                  {oilSim ? (
                    <div className="space-y-2 pt-1 border-t border-slate-800 vessel-sim-reveal">
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#F59E0B] font-semibold truncate">
                          {isHypotheticalSimOnly
                            ? `HYPOTHETICAL SIM: ${oilSim.sourceLabel} (NO DETECTED SPILL)`
                            : `ACTIVE PLUME: ${oilSim.sourceLabel}`}
                        </span>
                        <button
                          type="button"
                          onClick={onClearLiveOilSpill}
                          className="text-slate-400 hover:text-slate-200 underline shrink-0 ml-2 cursor-pointer"
                        >
                          CLEAR
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                        <div className="bg-[#060D14] border border-slate-700/60 rounded p-2">
                          <div className="text-[9.5px] text-slate-400">BACKTRACK ORIGIN</div>
                          <div className="text-slate-100 font-semibold mt-0.5">
                            T-{oilSim.releaseHoursAgo}h ({oilSim.originTimeUtc.slice(11, 16)}Z)
                          </div>
                          <div className="text-[9.5px] text-slate-400">
                            {oilSim.originLat.toFixed(3)}°N, {oilSim.originLon.toFixed(3)}°E
                          </div>
                        </div>
                        <div className="bg-[#060D14] border border-slate-700/60 rounded p-2">
                          <div className="text-[9.5px] text-slate-400">
                            {isHypotheticalSimOnly ? 'SIMULATED LANDFALL ETA' : 'LANDFALL ETA'}
                          </div>
                          <div
                            className={`font-semibold mt-0.5 ${
                              oilSim.coastlineImpactEtaHours ? 'text-[#F59E0B]' : 'text-emerald-400'
                            }`}
                          >
                            {oilSim.coastlineImpactEtaHours
                              ? `+${oilSim.coastlineImpactEtaHours} HRS`
                              : 'OFFSHORE DRIFT'}
                          </div>
                          <div className="text-[9.5px] text-slate-400 truncate">
                            {oilSim.impactZoneName}
                          </div>
                        </div>
                      </div>

                      <div className="text-[10px] font-mono text-slate-300 flex items-center justify-between">
                        <span>
                          Drift: {oilSim.driftBearingDeg}° @ {oilSim.driftSpeedKts} kts
                        </span>
                        <span className="text-[#F59E0B]">
                          {oilSim.slickAreaKm2} km² ({oilSim.estimatedVolumeBarrels} bbl)
                        </span>
                      </div>

                      {isHypotheticalSimOnly && (
                        <div className="bg-[#101C28] border border-[#22D3EE]/30 rounded px-2 py-1.5 text-[9.5px] font-mono text-slate-300">
                          <span className="text-[#22D3EE] font-semibold">SAR Look-Alike Params:</span>{' '}
                          {activeSarConfidence.windSpeedKts} kt wind · {activeSarConfidence.badgeText}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-slate-400 leading-relaxed">
                      {isFlaggedDarkTarget
                        ? 'Trigger a drift evaluation above to model Lagrangian backtracking and coastline landfall.'
                        : 'Optional simulation mode: vessel is ROUTINE // COMPLIANT with no detected spill. Trigger a hypothetical drift test above if needed.'}
                    </p>
                  )}
                </section>

                {/* Real-Time Subsea Cable & USD Economic/Environmental Liability Calculator */}
                <section className="bg-[#050c1a]/85 border border-cyan-500/25 rounded p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-100 font-semibold uppercase">
                      {isRoutineCompliant ? 'Subsea Cable Exposure Baseline' : 'Live USD Liability Exposure'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-xs text-[9.5px] font-bold ${
                        liveLiability.riskTier === 'CRITICAL'
                          ? 'bg-amber-500/20 text-[#F59E0B] border border-[#F59E0B]/60'
                          : liveLiability.riskTier === 'HIGH'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-400/50'
                            : 'bg-cyan-500/15 text-[#22D3EE] border border-[#22D3EE]/40'
                      }`}
                    >
                      {liveLiability.riskTier === 'CRITICAL' || liveLiability.riskTier === 'HIGH'
                        ? `TIER: ${liveLiability.riskTier}`
                        : 'NOMINAL AIS'}
                    </span>
                  </div>

                  <div className="overflow-hidden border border-slate-800 rounded">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-slate-900/90 text-slate-400 text-[10px]">
                        <tr>
                          <th className="text-left py-1.5 px-2 font-medium">EXPOSURE COMPONENT</th>
                          <th className="text-right py-1.5 px-1.5 font-medium">MIN</th>
                          <th className="text-right py-1.5 px-1.5 font-medium text-cyan-300">
                            MEDIAN
                          </th>
                          <th className="text-right py-1.5 px-2 font-medium">MAX</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200">
                        <tr>
                          <td className="py-1.5 px-2 font-sans text-slate-300">
                            Subsea Cable Risk ({cableRisk.cableName})
                          </td>
                          <td className="py-1.5 px-1.5 text-right">
                            ${(liveLiability.cableExposureM * 0.5).toFixed(2)}M
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-cyan-300 font-semibold">
                            ${liveLiability.cableExposureM.toFixed(2)}M
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            ${(liveLiability.cableExposureM * 2.1).toFixed(2)}M
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2 font-sans text-slate-300">
                            Shoreline &amp; Habitat Cleanup
                          </td>
                          <td className="py-1.5 px-1.5 text-right">
                            ${liveLiability.shorelineCleanup.minM.toFixed(2)}M
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-cyan-300 font-semibold">
                            $
                            {(
                              liveLiability.shorelineCleanup.medianM +
                              liveLiability.marineHabitatLoss.medianM
                            ).toFixed(2)}
                            M
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            $
                            {(
                              liveLiability.shorelineCleanup.maxM +
                              liveLiability.marineHabitatLoss.maxM
                            ).toFixed(2)}
                            M
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 px-2 font-sans text-slate-300">
                            Suez / Port Disruption
                          </td>
                          <td className="py-1.5 px-1.5 text-right">
                            ${liveLiability.portSuezDisruption.minM.toFixed(2)}M
                          </td>
                          <td className="py-1.5 px-1.5 text-right text-cyan-300 font-semibold">
                            ${liveLiability.portSuezDisruption.medianM.toFixed(2)}M
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            ${liveLiability.portSuezDisruption.maxM.toFixed(2)}M
                          </td>
                        </tr>
                        <tr className="bg-slate-900/70 font-semibold">
                          <td className="py-2 px-2 font-sans text-slate-100">Total Live Claim</td>
                          <td className="py-2 px-1.5 text-right text-slate-300">
                            ${liveLiability.totalEstimatedLiability.minM.toFixed(2)}M
                          </td>
                          <td className="py-2 px-1.5 text-right text-rose-400">
                            ${liveLiability.totalEstimatedLiability.medianM.toFixed(2)}M
                          </td>
                          <td className="py-2 px-2 text-right text-slate-300">
                            ${liveLiability.totalEstimatedLiability.maxM.toFixed(2)}M
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : drift ? (
              <>
                <section className="bg-[#060D14] border border-[#F59E0B]/40 rounded p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-300 uppercase">
                      Bayesian Attribution P(Vessel | Slick)
                    </span>
                    <span className="text-lg font-mono font-bold text-[#F59E0B] tabular-nums">
                      {drift.bayesianScorePct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
                    <div className="bg-[#101C28] border border-slate-700/60 rounded p-2">
                      <div className="text-[10px] text-slate-400">SLICK FOOTPRINT</div>
                      <div className="text-slate-100 font-semibold mt-0.5">
                        {drift.slickAreaKm2.toFixed(2)} km² ({drift.estimatedVolumeBarrels} bbl)
                      </div>
                      {activeForensicCase && (
                        <div className="text-[9.5px] text-[#22D3EE] mt-0.5">
                          {activeForensicCase.spill.lengthKm} x{' '}
                          {activeForensicCase.spill.maxWidthKm} km ·{' '}
                          {activeForensicCase.spill.oilType}
                        </div>
                      )}
                    </div>
                    <div className="bg-[#101C28] border border-slate-700/60 rounded p-2">
                      <div className="text-[10px] text-slate-400">LANDFALL ETA</div>
                      <div
                        className={`font-semibold mt-0.5 ${
                          drift.coastlineImpactEtaHours ? 'text-[#F59E0B]' : 'text-emerald-400'
                        }`}
                      >
                        {drift.coastlineImpactEtaHours
                          ? `+${drift.coastlineImpactEtaHours.toFixed(1)} HOURS`
                          : 'NO LANDFALL'}
                      </div>
                      <div className="text-[9.5px] text-slate-400 truncate">
                        {drift.impactZoneName}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 flex items-start gap-1.5 pt-1 border-t border-slate-800">
                    <Waves className="w-3.5 h-3.5 text-[#22D3EE] shrink-0 mt-0.5" />
                    <span>
                      Impact Corridor:{' '}
                      <strong className="text-slate-100">{drift.impactZoneName}</strong> · Archive
                      Wind{' '}
                      <span className="font-mono text-[#22D3EE]">
                        {activeForensicCase
                          ? `${activeForensicCase.metoceanAtEvent.windSpeedKts} kts ${activeForensicCase.metoceanAtEvent.windDirectionCardinal}`
                          : `${weather.windSpeedKts} kts ${weather.windDirectionCardinal}`}
                      </span>{' '}
                      + Current{' '}
                      <span className="font-mono">
                        {activeForensicCase
                          ? activeForensicCase.metoceanAtEvent.currentSpeedKts
                          : weather.surfaceCurrentKts}{' '}
                        kts
                      </span>
                    </span>
                  </div>
                </section>

                <section className="bg-[#050c1a]/80 border border-cyan-500/25 rounded p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-100 font-semibold uppercase">
                      Monte Carlo Liability Model
                    </span>
                    <span className="text-slate-400">
                      N = {drift.costModel.iterations.toLocaleString()}
                    </span>
                  </div>

                  <div className="overflow-hidden border border-slate-800 rounded">
                    <table className="w-full text-[11px] font-mono">
                      <thead className="bg-slate-900/90 text-slate-400 text-[10px]">
                        <tr>
                          <th className="text-left py-1.5 px-2 font-medium">IMPACT CATEGORY</th>
                          <th className="text-right py-1.5 px-1.5 font-medium">MIN</th>
                          <th className="text-right py-1.5 px-1.5 font-medium text-cyan-300">
                            MEDIAN
                          </th>
                          <th className="text-right py-1.5 px-2 font-medium">MAX</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200">
                        <tr>
                          <td className="py-2 px-2 font-sans text-slate-300">Shoreline Cleanup</td>
                          <td className="py-2 px-1.5 text-right">
                            ${drift.costModel.shorelineCleanup.minM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-1.5 text-right text-cyan-300 font-semibold">
                            ${drift.costModel.shorelineCleanup.medianM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-2 text-right">
                            ${drift.costModel.shorelineCleanup.maxM.toFixed(1)}M
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-2 font-sans text-slate-300">
                            Suez / Port Disruption
                          </td>
                          <td className="py-2 px-1.5 text-right">
                            ${drift.costModel.portSuezDisruption.minM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-1.5 text-right text-cyan-300 font-semibold">
                            ${drift.costModel.portSuezDisruption.medianM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-2 text-right">
                            ${drift.costModel.portSuezDisruption.maxM.toFixed(1)}M
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 px-2 font-sans text-slate-300">
                            Marine Habitat Loss
                          </td>
                          <td className="py-2 px-1.5 text-right">
                            ${drift.costModel.marineHabitatLoss.minM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-1.5 text-right text-cyan-300 font-semibold">
                            ${drift.costModel.marineHabitatLoss.medianM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-2 text-right">
                            ${drift.costModel.marineHabitatLoss.maxM.toFixed(1)}M
                          </td>
                        </tr>
                        <tr className="bg-slate-900/70 font-semibold">
                          <td className="py-2 px-2 font-sans text-slate-100">Total Exposure</td>
                          <td className="py-2 px-1.5 text-right text-slate-300">
                            ${drift.costModel.totalEstimatedLiability.minM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-1.5 text-right text-[#F59E0B]">
                            ${drift.costModel.totalEstimatedLiability.medianM.toFixed(1)}M
                          </td>
                          <td className="py-2 px-2 text-right text-slate-300">
                            ${drift.costModel.totalEstimatedLiability.maxM.toFixed(1)}M
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : (
              <section className="bg-[#050c1a]/80 border border-slate-700/60 rounded p-3.5 space-y-2">
                <div className="text-xs font-semibold text-slate-100">
                  No Hydrocarbon Plume Associated
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {incident.caseCode} is classified under{' '}
                  <span className="font-mono text-cyan-300">
                    {incident.category === 'subsea_cables'
                      ? 'SUBSEA INFRASTRUCTURE PROTECTION'
                      : 'GNSS / AIS ELECTRONIC WARFARE'}
                  </span>
                  . Zero surface oil damping signature detected in current SAR frame; infrastructure
                  &amp; navigational disruption dossier remains active.
                </p>
              </section>
            )}

            {!isRoutineCompliant && activeCoastalImpact.approachesOrIntersects && (
              <section className="bg-[#060D14] border border-[#F59E0B]/45 rounded p-3 space-y-2 font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#F59E0B] font-bold uppercase">
                    Coastal Impact &amp; Shoreline Risk
                  </span>
                  <span className="text-[10px] text-[#22D3EE]">+24H CONE</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] tabular-nums">
                  <div className="bg-[#101C28] border border-slate-800 rounded p-2">
                    <div className="text-[9px] text-slate-400">NEAREST COASTAL SECTOR</div>
                    <div className="text-slate-100 font-semibold mt-0.5 leading-snug">
                      {activeCoastalImpact.nearestSectorName}
                    </div>
                  </div>
                  <div className="bg-[#101C28] border border-slate-800 rounded p-2">
                    <div className="text-[9px] text-slate-400">ESTIMATED LANDFALL ETA</div>
                    <div className="text-[#F59E0B] font-bold mt-0.5">
                      {activeCoastalImpact.estimatedLandfallEtaHours !== null
                        ? `+${activeCoastalImpact.estimatedLandfallEtaHours} HOURS`
                        : 'SHORE APPROACH'}
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {activeCoastalImpact.distanceToCoastKm} km @{' '}
                      {activeCoastalImpact.windDriftSpeedKts} kt (~3% wind)
                    </div>
                  </div>
                </div>
                <div className="bg-[#101C28] border border-[#22D3EE]/35 rounded px-2.5 py-1.5 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">RESPONSE REQUIREMENT</span>
                  <span className="text-[#22D3EE] font-bold">
                    {activeCoastalImpact.responseRequirementLabel}
                  </span>
                </div>
              </section>
            )}

            <button
              type="button"
              onClick={onOpenDossier}
              className="w-full py-2.5 px-4 rounded bg-[#22D3EE]/20 hover:bg-[#22D3EE]/30 border border-[#22D3EE]/60 text-cyan-100 font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>EXPORT INCIDENT DOSSIER</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
