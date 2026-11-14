import React from 'react';
import { Download, FileText, Printer, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import {
  computeCoastalImpactAssessment,
  computeSarConfidenceAssessment,
} from '../services/surveillanceForensicsService';
import {
  ForensicCaseRecord,
  HudMode,
  Incident,
  LiveForensicSnapshot,
  QueuedSarTask,
  Vessel,
  WeatherState,
} from '../types/telemetry';

interface ViolationDossierModalProps {
  hudMode: HudMode;
  activeForensicCase?: ForensicCaseRecord;
  incident: Incident;
  vessel: Vessel;
  weather: WeatherState;
  liveSnapshot: LiveForensicSnapshot;
  queuedSarTasks: QueuedSarTask[];
  onClose: () => void;
}

export const ViolationDossierModal: React.FC<ViolationDossierModalProps> = ({
  hudMode,
  activeForensicCase,
  incident,
  vessel,
  weather,
  liveSnapshot,
  queuedSarTasks,
  onClose,
}) => {
  const sar = incident.sarMetrics;
  const drift = incident.driftAttribution;
  const isSurveillance = hudMode === 'surveillance';

  const activeCaseId = isSurveillance
    ? `LIVE-${vessel.mmsi}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
    : activeForensicCase?.caseCode ?? incident.caseCode;

  const activeUtcTimestamp = isSurveillance
    ? new Date().toISOString().slice(0, 19) + 'Z'
    : activeForensicCase?.timestampUtc ?? sar.acquisitionTimeUtc;

  const blackoutDurationText = isSurveillance
    ? liveSnapshot.darkEnvelope
      ? `${liveSnapshot.darkEnvelope.gapMinutes.toFixed(1)} min (${
          liveSnapshot.darkEnvelope.isConfirmedDark ? 'CONFIRMED DARK >30M' : 'ROUTINE GAP'
        })`
      : vessel.aisGapHours > 0
        ? `${vessel.aisGapHours.toFixed(2)} hours`
        : '0.0 min (Continuous Live AIS)'
    : `${(activeForensicCase?.primaryVessel.aisGapHours ?? vessel.aisGapHours).toFixed(2)} hours`;

  const activeSarConfidence = isSurveillance
    ? liveSnapshot.sarConfidence
    : computeSarConfidenceAssessment(
        activeForensicCase?.metoceanAtEvent.windSpeedKts ?? weather.windSpeedKts,
        {
          hasAnomaly: true,
          isConfirmedDark: (activeForensicCase?.primaryVessel.aisGapHours ?? vessel.aisGapHours) >= 0.5,
          aisGapMinutes:
            (activeForensicCase?.primaryVessel.aisGapHours ?? vessel.aisGapHours) * 60,
          hasSlick: (activeForensicCase?.spill.areaKm2 ?? drift?.slickAreaKm2 ?? 0) > 0,
          windDirectionDeg:
            activeForensicCase?.metoceanAtEvent.windDirectionDeg ?? weather.windDirectionDeg,
        }
      );

  const activeCoastalImpact = isSurveillance
    ? liveSnapshot.coastalImpact
    : computeCoastalImpactAssessment({
        lat: activeForensicCase?.stopCoordinates.lat ?? vessel.lat,
        lon: activeForensicCase?.stopCoordinates.lon ?? vessel.lon,
        windSpeedKts: activeForensicCase?.metoceanAtEvent.windSpeedKts ?? weather.windSpeedKts,
        windDirectionDeg:
          activeForensicCase?.metoceanAtEvent.windDirectionDeg ?? weather.windDirectionDeg,
        currentSpeedKts:
          activeForensicCase?.metoceanAtEvent.currentSpeedKts ?? weather.surfaceCurrentKts,
        currentDirectionDeg:
          activeForensicCase?.metoceanAtEvent.currentDirectionDeg ?? weather.surfaceCurrentDeg,
        slickWidthKm: activeForensicCase?.spill.maxWidthKm,
        slickAreaKm2: activeForensicCase?.spill.areaKm2 ?? drift?.slickAreaKm2 ?? 12,
        driftBearingDeg: activeForensicCase?.spill.slickBearingDeg ?? drift?.driftBearingDeg,
        driftSpeedKts: activeForensicCase?.spill.driftSpeedKts ?? drift?.driftSpeedKts,
        coastlineImpactEtaOverrideHours:
          activeForensicCase?.impactAssessment.coastlineImpactEtaHours ??
          drift?.coastlineImpactEtaHours,
      });

  const passCoordsLabel = isSurveillance
    ? `${liveSnapshot.lat.toFixed(4)}°N, ${liveSnapshot.lon.toFixed(4)}°E`
    : activeForensicCase
      ? `${activeForensicCase.sarPass.passCoordinates.lat.toFixed(4)}°N, ${activeForensicCase.sarPass.passCoordinates.lon.toFixed(4)}°E`
      : `${sar.wakeApexLat.toFixed(4)}°N, ${sar.wakeApexLon.toFixed(4)}°E`;

  const passSatelliteLabel = isSurveillance
    ? liveSnapshot.sgp4Intercept
      ? `${liveSnapshot.sgp4Intercept.satelliteName} (${liveSnapshot.sgp4Intercept.bandLabel})`
      : liveSnapshot.dopplerPhysics.satelliteName
    : activeForensicCase?.sarPass.satellite ?? sar.satellite;

  const windVectorLabel = isSurveillance
    ? `${liveSnapshot.localMetocean.windSpeedKts} kts ${liveSnapshot.localMetocean.windDirectionCardinal} (${liveSnapshot.localMetocean.windDirectionDeg}°)`
    : activeForensicCase
      ? `${activeForensicCase.metoceanAtEvent.windSpeedKts} kts ${activeForensicCase.metoceanAtEvent.windDirectionCardinal} (${activeForensicCase.metoceanAtEvent.windDirectionDeg}°)`
      : `${weather.windSpeedKts} kts ${weather.windDirectionCardinal} (${weather.windDirectionDeg}°)`;

  const chainOfCustodySummary = isSurveillance
    ? `AIS transponder telemetry for ${vessel.name} (MMSI ${vessel.mmsi}, IMO ${vessel.imo}) at LKP ${
        liveSnapshot.darkEnvelope
          ? `${liveSnapshot.darkEnvelope.lkpLat.toFixed(4)}°N, ${liveSnapshot.darkEnvelope.lkpLon.toFixed(4)}°E`
          : `${liveSnapshot.lat.toFixed(4)}°N, ${liveSnapshot.lon.toFixed(4)}°E`
      } shows blackout duration of ${blackoutDurationText} while ${vessel.coverageNeighborsCount} adjacent vessels maintained continuous coastal VHF reception, excluding blind-zone loss. ${passSatelliteLabel} orbital verification records azimuth Doppler shift dx=${liveSnapshot.dopplerPhysics.azimuthShiftM.toFixed(
        1
      )} m (derived SOG ${liveSnapshot.dopplerPhysics.sarDerivedSpeedKts.toFixed(
        1
      )} kts) spatially correlated to the ${liveSnapshot.oilSimulation ? `${liveSnapshot.oilSimulation.slickAreaKm2} km2` : 'monitored'} surface backscatter slick (${activeSarConfidence.badgeText}).`
    : `AIS broadcast for ${vessel.name} (MMSI ${vessel.mmsi}, IMO ${vessel.imo}) ceased at ${
        activeForensicCase?.blackoutTimestampUtc ?? vessel.aisLastSeenUtc
      } for ${blackoutDurationText} while ${vessel.coverageNeighborsCount} co-visible vessels remained online under Kp ${weather.kpIndex.toFixed(
        1
      )} (${weather.kpStatus}). ${passSatelliteLabel} overpass at ${
        activeForensicCase?.sarPass.passTimestampUtc ?? sar.acquisitionTimeUtc
      } (${passCoordsLabel}) imaged a ${
        activeForensicCase?.spill.areaKm2 ?? drift?.slickAreaKm2 ?? 0
      } km2 slick aligned with azimuth displacement dx=${sar.azimuthDisplacementM} m and Bayesian attribution P(V|S)=${(
        activeForensicCase?.impactAssessment.bayesianScorePct ??
        drift?.bayesianScorePct ??
        90
      ).toFixed(1)}% (${activeSarConfidence.badgeText}).`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadJson = () => {
    const payload = {
      generatedAtUtc: new Date().toISOString(),
      platform: 'AEGIS-SAR // MED-EAST ORBITAL COMMAND',
      reportTitle: 'OFFICIAL FORENSIC INCIDENT BRIEF',
      mode: isSurveillance ? 'COASTAL_SURVEILLANCE_LIVE' : 'FORENSIC_CASE_LAB',
      caseId: activeCaseId,
      utcTimestamp: activeUtcTimestamp,
      suspectVessel: {
        name: vessel.name,
        mmsi: vessel.mmsi,
        imo: vessel.imo,
        flag: vessel.flag,
        vesselType: vessel.vesselType,
        aisBlackoutDuration: blackoutDurationText,
      },
      orbitalSensorVerification: {
        satellite: passSatelliteLabel,
        passCoordinates: passCoordsLabel,
        sarConfidence: activeSarConfidence,
      },
      hydrodynamicAndCoastalImpact: {
        windVector: windVectorLabel,
        coastalImpactAssessment: activeCoastalImpact,
      },
      chainOfCustodySummary,
      ...(isSurveillance
        ? {
            targetVessel: vessel,
            liveForensicSnapshot: liveSnapshot,
            queuedSarTasks,
            environmentalContext: weather,
          }
        : {
            forensicCase: activeForensicCase ?? null,
            incident,
            vessel,
            environmentalContext: weather,
          }),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeSlug = activeCaseId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    a.download = `${safeSlug}-incident-dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTxt = () => {
    const liabilityMedian = isSurveillance
      ? liveSnapshot.financialLiability.totalEstimatedLiability.medianM.toFixed(2)
      : (drift?.costModel.totalEstimatedLiability.medianM ?? 0).toFixed(2);
    const lines = [
      '========================================================================',
      'AEGIS-SAR // MED-EAST ORBITAL COMMAND',
      'OFFICIAL FORENSIC INCIDENT BRIEF',
      '========================================================================',
      `CASE ID              : ${activeCaseId}`,
      `UTC TIMESTAMP        : ${activeUtcTimestamp}`,
      `OPERATING MODE       : ${isSurveillance ? 'COASTAL SURVEILLANCE (LIVE)' : 'FORENSIC CASE LAB'}`,
      '',
      '1. SUSPECT VESSEL IDENTIFICATION & AIS BLACKOUT',
      `   Vessel Name       : ${vessel.name} (${vessel.flag} | ${vessel.vesselType})`,
      `   MMSI / IMO        : ${vessel.mmsi} / ${vessel.imo}`,
      `   AIS Blackout Dur. : ${blackoutDurationText}`,
      `   Coverage Check    : ${vessel.coverageNeighborsCount} co-visible vessels active`,
      '',
      '2. ORBITAL SENSOR VERIFICATION & SAR LOOK-ALIKE FILTER',
      `   Sensor / Pass     : ${passSatelliteLabel}`,
      `   Pass Coordinates  : ${passCoordsLabel}`,
      `   SAR Confidence    : ${activeSarConfidence.badgeText}`,
      `   Radar Assessment  : ${activeSarConfidence.explanation}`,
      '',
      '3. HYDRODYNAMIC WIND VECTOR & COASTAL IMPACT ASSESSMENT',
      `   Wind Vector       : ${windVectorLabel}`,
      `   Wind Drift Rate   : ${activeCoastalImpact.windDriftSpeedKts} kts (~3% leeway) @ ${activeCoastalImpact.driftBearingDeg} deg T`,
      `   Nearest Sector    : ${activeCoastalImpact.nearestSectorName} (${activeCoastalImpact.sectorSensitivity})`,
      `   Estimated ETA     : ${
        activeCoastalImpact.estimatedLandfallEtaHours !== null
          ? `+${activeCoastalImpact.estimatedLandfallEtaHours} hours (${activeCoastalImpact.distanceToCoastKm} km offshore)`
          : `Offshore (${activeCoastalImpact.distanceToCoastKm} km offshore)`
      }`,
      `   Response Req.     : ${activeCoastalImpact.responseRequirementLabel}`,
      '',
      '4. CHAIN-OF-CUSTODY SPATIAL CORRELATION SUMMARY',
      `   ${chainOfCustodySummary}`,
      '',
      '5. LIABILITY ESTIMATE SUMMARY',
      `   Median Claim Est. : $${liabilityMedian}M USD`,
      '========================================================================',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeSlug = activeCaseId.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    a.download = `${safeSlug}-forensic-brief.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isSurveillance) {
    const {
      dopplerPhysics,
      localMetocean,
      cableRisk,
      financialLiability,
      darkEnvelope,
      sgp4Intercept,
      oilSimulation,
    } = liveSnapshot;

    const isConfirmedDarkOrCable =
      Boolean(darkEnvelope?.isConfirmedDark) ||
      vessel.status === 'dark' ||
      vessel.status === 'spoofed' ||
      Boolean(liveSnapshot.cableProximityAlert);
    const isRoutineCompliant = !isConfirmedDarkOrCable && !oilSimulation;
    const isHypotheticalSimOnly = Boolean(oilSimulation) && !isConfirmedDarkOrCable;

    const matchingTasks = queuedSarTasks.filter(
      (t) => t.targetVesselId === vessel.id || t.mmsi === vessel.mmsi
    );
    const displayedTasks = matchingTasks.length > 0 ? matchingTasks : queuedSarTasks;

    const riskBadgeClass =
      financialLiability.riskTier === 'CRITICAL' || financialLiability.riskTier === 'HIGH'
        ? 'border-[#F59E0B]/70 bg-[#F59E0B]/15 text-[#F59E0B]'
        : 'border-[#22D3EE]/60 bg-[#22D3EE]/15 text-[#22D3EE]';

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dossier-title"
        className="fixed inset-0 z-[1300] bg-[#060D14]/85 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <div
          id="violation-dossier-printable"
          onWheel={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[85vh] overflow-y-auto overscroll-contain hud-scroll bg-[#060D14] border border-[#22D3EE]/45 rounded-md shadow-2xl text-slate-100"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-[#22D3EE]/25 bg-[#101C28]/70 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-[#22D3EE] uppercase tracking-wider font-bold">
                  OFFICIAL FORENSIC INCIDENT BRIEF // {activeCaseId}
                </span>
                {(financialLiability.riskTier === 'CRITICAL' ||
                  financialLiability.riskTier === 'HIGH') ? (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border ${riskBadgeClass}`}
                  >
                    {financialLiability.riskTier} ANOMALY
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border border-[#22D3EE]/50 bg-[#22D3EE]/12 text-[#22D3EE]">
                    NOMINAL AIS STREAM
                  </span>
                )}
              </div>
              <h2 id="dossier-title" className="text-lg font-bold text-slate-100 mt-1">
                {liveSnapshot.targetLabel}
              </h2>
              <p className="text-xs font-mono text-slate-400 mt-1">
                UTC {activeUtcTimestamp} · {liveSnapshot.targetSubtitle} ·{' '}
                {liveSnapshot.lat.toFixed(4)}°N, {liveSnapshot.lon.toFixed(4)}°E
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Violation Dossier"
              className="no-print p-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-[#22D3EE]/50 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 text-xs">
            {/* Top 4 Telemetry Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
                <div className="text-[10px] text-slate-400">VESSEL / MMSI</div>
                <div className="text-slate-100 font-semibold mt-0.5 truncate">{vessel.name}</div>
                <div className="text-[10px] text-[#22D3EE]">
                  MMSI {vessel.mmsi} · IMO {vessel.imo}
                </div>
              </div>
              <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
                <div className="text-[10px] text-slate-400">AIS BLACKOUT DURATION</div>
                <div className="text-[#F59E0B] font-semibold mt-0.5 truncate">
                  {blackoutDurationText}
                </div>
                <div className="text-[10px] text-slate-400">
                  {vessel.coverageNeighborsCount} neighbors verified
                </div>
              </div>
              <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
                <div className="text-[10px] text-slate-400">WIND VECTOR &amp; Kp</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {localMetocean.windSpeedKts.toFixed(1)} kts {localMetocean.windDirectionCardinal}
                </div>
                <div className="text-[10px] text-[#22D3EE]">
                  Cur {localMetocean.currentSpeedKts.toFixed(2)} kts · Kp {weather.kpIndex.toFixed(1)}
                </div>
              </div>
              <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
                <div className="text-[10px] text-slate-400">SUBSEA CABLE RISK</div>
                <div
                  className={`font-semibold mt-0.5 truncate ${
                    cableRisk.anchorDragRiskScore >= 70 ? 'text-[#F59E0B]' : 'text-[#22D3EE]'
                  }`}
                >
                  {cableRisk.anchorDragRiskScore}/100 ({cableRisk.cableName})
                </div>
                <div className="text-[10px] text-slate-400">
                  Sep {cableRisk.distanceKm.toFixed(2)} km · {cableRisk.capacityTbps} Tbps
                </div>
              </div>
            </div>

            {/* Section 1 & 2: Orbital Sensor Verification + Coastal Impact (Dark >30m / Anomaly / Simulation ONLY) */}
            {!isRoutineCompliant ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
                    1. Orbital Sensor Verification &amp; SAR Look-Alike Filter
                    {isHypotheticalSimOnly ? ' (Optional Simulation Mode)' : ''}
                  </h3>
                  <div className="rounded border border-[#22D3EE]/35 bg-[#101C28]/75 p-3 font-mono text-[11px] space-y-2">
                    <div
                      className={`px-2.5 py-1.5 rounded border font-bold flex items-center justify-between gap-2 ${
                        activeSarConfidence.tone === 'cyan'
                          ? 'bg-[#22D3EE]/12 border-[#22D3EE]/50 text-[#22D3EE]'
                          : 'bg-[#F59E0B]/15 border-[#F59E0B]/60 text-[#F59E0B]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {activeSarConfidence.tone === 'cyan' ? (
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{activeSarConfidence.badgeText}</span>
                      </span>
                      <span className="text-[10px] text-slate-300">
                        Wind: {activeSarConfidence.windSpeedKts} kts
                      </span>
                    </div>
                    <p className="font-sans text-[11.5px] text-slate-300 leading-relaxed">
                      {activeSarConfidence.explanation}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-slate-300 pt-1 border-t border-slate-800">
                      <div>
                        Sensor: <strong className="text-slate-100">{passSatelliteLabel}</strong>
                      </div>
                      <div>
                        Pass Coord: <strong className="text-[#22D3EE]">{passCoordsLabel}</strong>
                      </div>
                      <div>
                        Doppler dx: <strong className="text-[#F59E0B]">{dopplerPhysics.azimuthShiftM.toFixed(1)} m</strong> ({dopplerPhysics.sarDerivedSpeedKts.toFixed(1)} kts)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
                    2. Hydrodynamic Wind Vector &amp; Coastal Impact ETA Assessment
                    {isHypotheticalSimOnly ? ' (Optional Simulation Mode)' : ''}
                  </h3>
                  <div className="rounded border border-[#F59E0B]/45 bg-[#101C28]/75 p-3 font-mono text-[11px] space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10.5px]">
                      <div className="bg-[#060D14] border border-slate-800 rounded p-2">
                        <div className="text-[9px] text-slate-400">NEAREST COASTAL SECTOR</div>
                        <div className="text-slate-100 font-semibold mt-0.5">
                          {activeCoastalImpact.nearestSectorName}
                        </div>
                        <div className="text-[9px] text-[#F59E0B]">
                          {activeCoastalImpact.sectorSensitivity}
                        </div>
                      </div>
                      <div className="bg-[#060D14] border border-slate-800 rounded p-2">
                        <div className="text-[9px] text-slate-400">ESTIMATED LANDFALL ETA</div>
                        <div className="text-[#F59E0B] font-bold mt-0.5">
                          {activeCoastalImpact.estimatedLandfallEtaHours !== null
                            ? `+${activeCoastalImpact.estimatedLandfallEtaHours} HOURS`
                            : 'OFFSHORE (>72H)'}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {activeCoastalImpact.distanceToCoastKm} km offshore · {activeCoastalImpact.windDriftSpeedKts} kt (~3% wind)
                        </div>
                      </div>
                      <div className="bg-[#060D14] border border-slate-800 rounded p-2">
                        <div className="text-[9px] text-slate-400">RESPONSE REQUIREMENT</div>
                        <div className="text-[#22D3EE] font-bold mt-0.5">
                          {activeCoastalImpact.responseRequirementLabel}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          Wind {windVectorLabel}
                        </div>
                      </div>
                    </div>
                    {oilSimulation && (
                      <div className="text-[10px] text-slate-300 flex flex-wrap justify-between gap-2 pt-1 border-t border-slate-800">
                        <span>
                          Origin T-{oilSimulation.releaseHoursAgo}h: {oilSimulation.originLat.toFixed(4)}°N,{' '}
                          {oilSimulation.originLon.toFixed(4)}°E
                        </span>
                        <span className="text-[#F59E0B]">
                          {oilSimulation.slickAreaKm2.toFixed(2)} km2 (~
                          {oilSimulation.estimatedVolumeBarrels.toLocaleString()} bbl)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded border border-[#22D3EE]/30 bg-[#101C28]/70 p-3 font-mono text-[11px] space-y-1">
                <div className="text-[#22D3EE] font-bold">AIS STATUS: ROUTINE // COMPLIANT</div>
                <p className="font-sans text-[11.5px] text-slate-300 leading-relaxed">
                  Target is maintaining continuous AIS telemetry with no &gt;30m blackout or detected hydrocarbon slick. Navigation track and subsea cable separation remain under routine monitoring.
                </p>
              </div>
            )}

            {/* Section 3: Chain-of-Custody Spatial Correlation Summary */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
                3. Chain-of-Custody Spatial Correlation Summary
              </h3>
              <div className="rounded border border-[#22D3EE]/30 bg-[#101C28]/60 p-3 space-y-2">
                <p className="text-slate-200 leading-relaxed">{chainOfCustodySummary}</p>
                {darkEnvelope && (
                  <div className="text-[10px] font-mono text-[#F59E0B] border-t border-slate-800 pt-1.5">
                    360-Deg Evasive Disk Rmax = {darkEnvelope.reachabilityRadiusKm.toFixed(2)} km (Diameter{' '}
                    {darkEnvelope.reachabilityDiameterKm.toFixed(1)} km) · Nearest Cable:{' '}
                    {darkEnvelope.nearestCable.cableName} ({darkEnvelope.nearestCable.distanceKm.toFixed(2)} km)
                  </div>
                )}
                {sgp4Intercept && (
                  <div className="text-[10px] font-mono text-[#22D3EE]">
                    Next SGP4 Intercept: {sgp4Intercept.satelliteName} in T-
                    {sgp4Intercept.countdownFormatted} (Capture Prob{' '}
                    {sgp4Intercept.captureProbabilityPct.toFixed(1)}%)
                    {displayedTasks.length > 0
                      ? ` · Queued Orders: ${displayedTasks.length}`
                      : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Live USD Economic & Environmental Liability */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
                  4. USD Economic, Cable &amp; Environmental Liability Model
                </h3>
                <span className="font-mono text-[#F59E0B] font-semibold">
                  Cable Exposure: ${financialLiability.cableExposureM.toFixed(2)}M
                </span>
              </div>

              <table className="w-full font-mono border border-slate-800">
                <thead className="bg-[#101C28] text-slate-400 text-[10px]">
                  <tr>
                    <th className="text-left py-2 px-3">LIABILITY COMPONENT</th>
                    <th className="text-right py-2 px-3">MIN ($M)</th>
                    <th className="text-right py-2 px-3">MEDIAN ($M)</th>
                    <th className="text-right py-2 px-3">MAX ($M)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  <tr>
                    <td className="py-2 px-3 font-sans">Shoreline Cleanup &amp; Skimming</td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.shorelineCleanup.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#22D3EE] font-semibold">
                      ${financialLiability.shorelineCleanup.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.shorelineCleanup.maxM.toFixed(2)}M
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans">
                      Subsea Cable / Port &amp; Suez Approach Disruption
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.portSuezDisruption.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#22D3EE] font-semibold">
                      ${financialLiability.portSuezDisruption.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.portSuezDisruption.maxM.toFixed(2)}M
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans">Marine &amp; Coastal Habitat Loss</td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.marineHabitatLoss.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#22D3EE] font-semibold">
                      ${financialLiability.marineHabitatLoss.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.marineHabitatLoss.maxM.toFixed(2)}M
                    </td>
                  </tr>
                  <tr className="bg-[#101C28] font-bold">
                    <td className="py-2 px-3 font-sans text-slate-100">
                      Total Live Claim Range ({financialLiability.iterations.toLocaleString()} runs)
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.totalEstimatedLiability.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#F59E0B]">
                      ${financialLiability.totalEstimatedLiability.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${financialLiability.totalEstimatedLiability.maxM.toFixed(2)}M
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="no-print px-6 py-4 border-t border-[#22D3EE]/20 flex flex-wrap items-center justify-end gap-2.5 bg-[#060D14]">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="px-3.5 py-2 text-xs font-mono rounded border border-slate-600 text-slate-200 hover:border-[#22D3EE]/60 hover:text-[#22D3EE] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>DOWNLOAD JSON</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="px-3.5 py-2 text-xs font-mono rounded border border-[#F59E0B]/55 bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 text-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>DOWNLOAD TXT REPORT</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 text-xs font-mono font-semibold rounded bg-[#22D3EE]/20 hover:bg-[#22D3EE]/30 border border-[#22D3EE]/60 text-cyan-100 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PRINT BRIEF</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dossier-title"
      className="fixed inset-0 z-[1300] bg-[#060D14]/85 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="violation-dossier-printable"
        onWheel={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto overscroll-contain hud-scroll bg-[#060D14] border border-[#22D3EE]/45 rounded-md shadow-2xl text-slate-100"
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#22D3EE]/25 bg-[#101C28]/70 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono text-[#22D3EE] uppercase tracking-wider font-bold">
              OFFICIAL FORENSIC INCIDENT BRIEF // {activeCaseId}
            </div>
            <h2 id="dossier-title" className="text-lg font-bold text-slate-100 mt-1">
              {incident.caseCode}: {incident.title}
            </h2>
            <p className="text-xs font-mono text-slate-400 mt-1">
              UTC Timestamp: {activeUtcTimestamp} · Threat Score: {incident.threatScore}/100 ·
              Sector: Eastern Mediterranean (Egypt EEZ)
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Violation Dossier"
            className="no-print p-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-100 hover:border-[#22D3EE]/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs">
          {/* Vessel & Telemetry Metadata */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
              <div className="text-[10px] text-slate-400">VESSEL / MMSI</div>
              <div className="text-slate-100 font-semibold mt-0.5 truncate">{vessel.name}</div>
              <div className="text-[10px] text-[#22D3EE]">
                MMSI {vessel.mmsi} · IMO {vessel.imo}
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
              <div className="text-[10px] text-slate-400">AIS BLACKOUT DURATION</div>
              <div className="text-[#F59E0B] font-semibold mt-0.5">{blackoutDurationText}</div>
              <div className="text-[10px] text-slate-400">
                {vessel.coverageNeighborsCount} neighbors online
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
              <div className="text-[10px] text-slate-400">SPILL &amp; AZIMUTH</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                {activeForensicCase
                  ? `${activeForensicCase.spill.areaKm2} km2 (${activeForensicCase.spill.estimatedVolumeBarrels} bbl)`
                  : `${sar.calculatedTrueSpeedKts.toFixed(1)} kts`}
              </div>
              <div className="text-[10px] text-[#F59E0B]">
                {activeForensicCase
                  ? `${activeForensicCase.spill.lengthKm}x${activeForensicCase.spill.maxWidthKm} km · dx=${sar.azimuthDisplacementM}m`
                  : `Azimuth Shift ${sar.azimuthDisplacementM}m`}
              </div>
            </div>
            <div className="border border-slate-800 rounded p-2.5 bg-[#101C28]/80">
              <div className="text-[10px] text-slate-400">WIND VECTOR &amp; Kp</div>
              <div className="text-slate-100 font-semibold mt-0.5">
                {weather.windSpeedKts} kts {weather.windDirectionCardinal}
              </div>
              <div className="text-[10px] text-[#22D3EE]">
                Kp {weather.kpIndex.toFixed(1)} ({weather.kpStatus})
              </div>
            </div>
          </div>

          {/* 1. Orbital Sensor Verification & SAR Confidence Score */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
              1. Orbital Sensor Verification &amp; SAR Look-Alike Filter
            </h3>
            <div className="rounded border border-[#22D3EE]/35 bg-[#101C28]/75 p-3 font-mono text-[11px] space-y-2">
              <div
                className={`px-2.5 py-1.5 rounded border font-bold flex items-center justify-between gap-2 ${
                  activeSarConfidence.tone === 'cyan'
                    ? 'bg-[#22D3EE]/12 border-[#22D3EE]/50 text-[#22D3EE]'
                    : 'bg-[#F59E0B]/15 border-[#F59E0B]/60 text-[#F59E0B]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {activeSarConfidence.tone === 'cyan' ? (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{activeSarConfidence.badgeText}</span>
                </span>
                <span className="text-[10px] text-slate-300">
                  Wind: {activeSarConfidence.windSpeedKts} kts
                </span>
              </div>
              <p className="font-sans text-[11.5px] text-slate-300 leading-relaxed">
                {activeSarConfidence.explanation}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-slate-300 pt-1 border-t border-slate-800">
                <div>
                  Sensor: <strong className="text-slate-100">{passSatelliteLabel}</strong>
                </div>
                <div>
                  Pass Coord: <strong className="text-[#22D3EE]">{passCoordsLabel}</strong>
                </div>
                <div>
                  Mode: <strong className="text-[#F59E0B]">{sar.sensorMode} ({sar.polarization})</strong>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Hydrodynamic Wind Vector & Coastal Impact ETA Assessment */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
              2. Hydrodynamic Wind Vector &amp; Coastal Impact ETA Assessment
            </h3>
            <div className="rounded border border-[#F59E0B]/45 bg-[#101C28]/75 p-3 font-mono text-[11px] grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-[#060D14] border border-slate-800 rounded p-2">
                <div className="text-[9px] text-slate-400">NEAREST COASTAL SECTOR</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {activeCoastalImpact.nearestSectorName}
                </div>
                <div className="text-[9px] text-[#F59E0B]">{activeCoastalImpact.sectorSensitivity}</div>
              </div>
              <div className="bg-[#060D14] border border-slate-800 rounded p-2">
                <div className="text-[9px] text-slate-400">ESTIMATED LANDFALL ETA</div>
                <div className="text-[#F59E0B] font-bold mt-0.5">
                  {activeCoastalImpact.estimatedLandfallEtaHours !== null
                    ? `+${activeCoastalImpact.estimatedLandfallEtaHours} HOURS`
                    : 'OFFSHORE DRIFT'}
                </div>
                <div className="text-[9px] text-slate-400">
                  {activeCoastalImpact.distanceToCoastKm} km @ {activeCoastalImpact.windDriftSpeedKts} kt leeway
                </div>
              </div>
              <div className="bg-[#060D14] border border-slate-800 rounded p-2">
                <div className="text-[9px] text-slate-400">RESPONSE REQUIREMENT</div>
                <div className="text-[#22D3EE] font-bold mt-0.5">
                  {activeCoastalImpact.responseRequirementLabel}
                </div>
                <div className="text-[9px] text-slate-400">Wind {windVectorLabel}</div>
              </div>
            </div>
          </div>

          {/* 3. Chain-of-Custody Summary & Attribution Steps */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
              3. Chain-of-Custody Spatial Correlation Summary
            </h3>
            <div className="rounded border border-[#22D3EE]/30 bg-[#101C28]/60 p-3 space-y-2">
              <p className="text-slate-200 leading-relaxed">{chainOfCustodySummary}</p>
              <ul className="space-y-1.5 pt-1 border-t border-slate-800">
                {incident.causalChain.map((item, idx) => (
                  <li key={idx} className="flex gap-2 text-slate-300">
                    <span className="font-mono text-[#22D3EE]">[{idx + 1}]</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Monte Carlo Financial & Environmental Exposure */}
          {drift && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-[#22D3EE]">
                  4. Bayesian Attribution &amp; Monte Carlo Liability Assessment
                </h3>
                <span className="font-mono text-[#F59E0B] font-semibold">
                  P(Vessel | Slick) = {drift.bayesianScorePct.toFixed(1)}%
                </span>
              </div>

              <table className="w-full font-mono border border-slate-800">
                <thead className="bg-[#101C28] text-slate-400 text-[10px]">
                  <tr>
                    <th className="text-left py-2 px-3">LIABILITY COMPONENT</th>
                    <th className="text-right py-2 px-3">MIN ($M)</th>
                    <th className="text-right py-2 px-3">MEDIAN ($M)</th>
                    <th className="text-right py-2 px-3">MAX ($M)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  <tr>
                    <td className="py-2 px-3 font-sans">Shoreline Cleanup &amp; Skimming</td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.shorelineCleanup.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#22D3EE] font-semibold">
                      ${drift.costModel.shorelineCleanup.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.shorelineCleanup.maxM.toFixed(2)}M
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans">Port &amp; Suez Canal Approach Disruption</td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.portSuezDisruption.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#22D3EE] font-semibold">
                      ${drift.costModel.portSuezDisruption.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.portSuezDisruption.maxM.toFixed(2)}M
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans">Marine &amp; Coastal Habitat Loss</td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.marineHabitatLoss.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#22D3EE] font-semibold">
                      ${drift.costModel.marineHabitatLoss.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.marineHabitatLoss.maxM.toFixed(2)}M
                    </td>
                  </tr>
                  <tr className="bg-[#101C28] font-bold">
                    <td className="py-2 px-3 font-sans text-slate-100">
                      Total Estimated Claim Range ({drift.costModel.iterations.toLocaleString()} runs)
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.totalEstimatedLiability.minM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right text-[#F59E0B]">
                      ${drift.costModel.totalEstimatedLiability.medianM.toFixed(2)}M
                    </td>
                    <td className="py-2 px-3 text-right">
                      ${drift.costModel.totalEstimatedLiability.maxM.toFixed(2)}M
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="no-print px-6 py-4 border-t border-[#22D3EE]/20 flex flex-wrap items-center justify-end gap-2.5 bg-[#060D14]">
          <button
            type="button"
            onClick={handleDownloadJson}
            className="px-3.5 py-2 text-xs font-mono rounded border border-slate-600 text-slate-200 hover:border-[#22D3EE]/60 hover:text-[#22D3EE] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>DOWNLOAD JSON</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadTxt}
            className="px-3.5 py-2 text-xs font-mono rounded border border-[#F59E0B]/55 bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 text-amber-100 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>DOWNLOAD TXT REPORT</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-mono font-semibold rounded bg-[#22D3EE]/20 hover:bg-[#22D3EE]/30 border border-[#22D3EE]/60 text-cyan-100 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PRINT BRIEF</span>
          </button>
        </div>
      </div>
    </div>
  );
};

