import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Crosshair,
  FolderPlus,
  History,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  Search,
  Ship,
  Upload,
} from 'lucide-react';
import { evaluateForensicCaseAtTime } from '../data/forensicCasesRepository';
import { AisConnectionStatus } from '../services/aisStreamService';
import {
  CableProximityAlert,
  DarkEnvelopeState,
  ForensicCaseRecord,
  HudMode,
  Incident,
  IncidentFilter,
  SatelliteGroundState,
  ScenarioId,
  Vessel,
} from '../types/telemetry';

interface IncidentTriagePanelProps {
  hudMode: HudMode;
  incidents: Incident[];
  forensicCases: ForensicCaseRecord[];
  selectedForensicCaseId: string;
  forensicTimeOffsetHours?: number;
  liveVessels: Vessel[];
  darkEnvelopes?: DarkEnvelopeState[];
  cableThreatAlerts?: CableProximityAlert[];
  nextSatellitePass?: SatelliteGroundState;
  aisStatus: AisConnectionStatus;
  aisError?: string;
  activeFilter: IncidentFilter;
  selectedIncidentId: string;
  selectedVesselId: string | null;
  onChangeFilter: (filter: IncidentFilter) => void;
  onLocateIncident: (incident: Incident) => void;
  onInspectIncident: (incident: Incident) => void;
  onSelectForensicCase: (record: ForensicCaseRecord) => void;
  onLocateForensicCase: (record: ForensicCaseRecord) => void;
  onInspectForensicCase: (record: ForensicCaseRecord) => void;
  onAppendForensicCase: (rawCase: unknown) => void;
  onLaunchHistoricalReplay?: (scenarioId: Exclude<ScenarioId, 'live'>) => void;
  onSelectLiveVessel: (vessel: Vessel, flyTo: boolean) => void;
  onReconnectAis: () => void;
}

function formatShortCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const FILTER_OPTIONS: Array<{ id: IncidentFilter; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'oil_spills', label: 'OIL SPILLS' },
  { id: 'dark_spoofing', label: 'DARK & AIS' },
  { id: 'subsea_cables', label: 'SUBSEA CABLES' },
];

export const IncidentTriagePanel: React.FC<IncidentTriagePanelProps> = ({
  hudMode,
  forensicCases,
  selectedForensicCaseId,
  forensicTimeOffsetHours = 0,
  liveVessels,
  darkEnvelopes = [],
  cableThreatAlerts = [],
  nextSatellitePass,
  aisStatus,
  aisError,
  activeFilter,
  selectedVesselId,
  onChangeFilter,
  onSelectForensicCase,
  onLocateForensicCase,
  onInspectForensicCase,
  onAppendForensicCase,
  onLaunchHistoricalReplay,
  onSelectLiveVessel,
  onReconnectAis,
}) => {
  const [vesselQuery, setVesselQuery] = useState('');
  const [forensicQuery, setForensicQuery] = useState('');
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('Damietta Offshore Anomaly');
  const [draftVessel, setDraftVessel] = useState('MT DELTA SPIRIT');
  const [draftDate, setDraftDate] = useState('2022-08-14');
  const [draftLat, setDraftLat] = useState('31.68');
  const [draftLon, setDraftLon] = useState('31.54');
  const [draftArea, setDraftArea] = useState('16.2');
  const [draftClass, setDraftClass] = useState<Exclude<IncidentFilter, 'all'>>('oil_spills');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setIngestError(null);
  }, [hudMode]);

  const isForensic = hudMode === 'forensic';

  const darkMap = new Map<string, DarkEnvelopeState>();
  darkEnvelopes.forEach((d) => darkMap.set(d.vesselId, d));

  const cableAlertMap = new Map<string, CableProximityAlert>();
  cableThreatAlerts.forEach((a) => cableAlertMap.set(a.vesselId, a));

  const confirmedDarkEnvelopes = darkEnvelopes.filter((d) => d.isConfirmedDark);
  const routineGapCount = darkEnvelopes.length - confirmedDarkEnvelopes.length;

  const filteredLiveVessels = liveVessels
    .filter((v) => {
      const q = vesselQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.mmsi.toLowerCase().includes(q) ||
        v.vesselType.toLowerCase().includes(q) ||
        (v.destination ?? '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const scoreA = (darkMap.get(a.id)?.isConfirmedDark ? 2 : 0) + (cableAlertMap.has(a.id) ? 1 : 0);
      const scoreB = (darkMap.get(b.id)?.isConfirmedDark ? 2 : 0) + (cableAlertMap.has(b.id) ? 1 : 0);
      return scoreB - scoreA;
    });

  const filteredForensicCases = forensicCases
    .filter((fc) => activeFilter === 'all' || fc.classification === activeFilter)
    .filter((fc) => {
      const q = forensicQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        fc.title.toLowerCase().includes(q) ||
        fc.caseCode.toLowerCase().includes(q) ||
        fc.dateStr.toLowerCase().includes(q) ||
        fc.primaryVessel.name.toLowerCase().includes(q) ||
        fc.primaryVessel.mmsi.toLowerCase().includes(q) ||
        fc.sectorName.toLowerCase().includes(q) ||
        fc.spill.oilType.toLowerCase().includes(q)
      );
    });

  const firstDarkVessel = confirmedDarkEnvelopes[0]
    ? liveVessels.find((v) => v.id === confirmedDarkEnvelopes[0].vesselId)
    : undefined;
  const firstCableAlertVessel = cableThreatAlerts[0]
    ? liveVessels.find((v) => v.id === cableThreatAlerts[0].vesselId)
    : undefined;

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => onAppendForensicCase(item));
        } else {
          onAppendForensicCase(parsed);
        }
        setIngestError(null);
        setIngestOpen(false);
      } catch {
        setIngestError('Invalid JSON case file. Expected object or array.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateCustomCase = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(draftLat);
    const lon = parseFloat(draftLon);
    const areaKm2 = parseFloat(draftArea);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(areaKm2)) {
      setIngestError('Enter valid numeric coordinates and spill area.');
      return;
    }
    onAppendForensicCase({
      title: draftTitle.trim() || 'Ingested Med-East Anomaly',
      dateStr: draftDate,
      classification: draftClass,
      stopCoordinates: { lat, lon },
      primaryVessel: { name: draftVessel.trim() || 'MV DELTA ANOMALY' },
      spill: { areaKm2 },
    });
    setIngestError(null);
    setIngestOpen(false);
  };

  return (
    <aside
      aria-label={isForensic ? 'Forensic Case Repository' : 'Live AIS Targets and Threat Triage'}
      className="fixed top-[4.5rem] left-3 bottom-[6.75rem] z-[900] w-80 hud-glass rounded-md flex flex-col overflow-hidden bg-[#060D14]/92 border-[#22D3EE]/25"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-[#22D3EE]/20 bg-[#060D14] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold tracking-wider text-slate-100 uppercase truncate">
            {isForensic ? 'Forensic Case Repository' : 'Live AIS Maritime Feed'}
          </h2>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
            {isForensic
              ? `${forensicCases.length} isolated historical cases · Unmerged`
              : `${liveVessels.length} live AIS vessels · Med-East`}
          </p>
        </div>
        <span
          className={`text-[10.5px] font-mono font-semibold shrink-0 ${
            isForensic ? 'text-[#F59E0B]' : 'text-[#22D3EE]'
          }`}
        >
          {isForensic ? 'ARCHIVE' : 'MED-EAST'}
        </span>
      </div>

      {isForensic ? (
        <>
          {/* Standalone Decoupled Status Strip */}
          <div className="px-3 py-2 border-b border-[#22D3EE]/15 bg-[#101C28]/85 flex items-center justify-between gap-2">
            <div className="text-[10px] font-mono text-slate-300 leading-tight">
              <span className="text-[#22D3EE] font-semibold">LIVE FEEDS DETACHED</span>
              <span className="text-slate-400"> · Isolated stop-coord targets</span>
            </div>
            <button
              type="button"
              onClick={() => setIngestOpen((v) => !v)}
              className={`px-2 py-1 rounded-xs border text-[9.5px] font-mono font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                ingestOpen
                  ? 'bg-[#22D3EE]/20 border-[#22D3EE]/60 text-[#22D3EE]'
                  : 'bg-[#060D14] border-[#F59E0B]/50 text-[#F59E0B] hover:bg-[#F59E0B]/15'
              }`}
            >
              <FolderPlus className="w-3 h-3" />
              <span>INGEST CASE</span>
            </button>
          </div>

          {/* Extensible Case Ingestion Panel */}
          {ingestOpen && (
            <div className="px-3 py-2.5 border-b border-[#22D3EE]/25 bg-[#060D14] space-y-2 text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[#22D3EE] font-semibold uppercase">
                  Append Anomaly / External JSON
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2 py-1 rounded-xs border border-[#22D3EE]/45 bg-[#101C28] text-[#22D3EE] hover:bg-[#22D3EE]/15 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>JSON FILE</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleJsonUpload}
                  className="hidden"
                />
              </div>

              <form onSubmit={handleCreateCustomCase} className="space-y-1.5">
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Case title"
                  className="w-full px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-100 focus:border-[#22D3EE] focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={draftVessel}
                    onChange={(e) => setDraftVessel(e.target.value)}
                    placeholder="Vessel name"
                    className="px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-100 focus:border-[#22D3EE] focus:outline-none"
                  />
                  <input
                    type="date"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    className="px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-100 focus:border-[#22D3EE] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={draftLat}
                    onChange={(e) => setDraftLat(e.target.value)}
                    placeholder="Lat"
                    title="Stop Latitude"
                    className="px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-100 focus:border-[#22D3EE] focus:outline-none tabular-nums"
                  />
                  <input
                    type="text"
                    value={draftLon}
                    onChange={(e) => setDraftLon(e.target.value)}
                    placeholder="Lon"
                    title="Stop Longitude"
                    className="px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-100 focus:border-[#22D3EE] focus:outline-none tabular-nums"
                  />
                  <input
                    type="text"
                    value={draftArea}
                    onChange={(e) => setDraftArea(e.target.value)}
                    placeholder="km2"
                    title="Spill Area km²"
                    className="px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-100 focus:border-[#22D3EE] focus:outline-none tabular-nums"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <select
                    value={draftClass}
                    onChange={(e) =>
                      setDraftClass(e.target.value as Exclude<IncidentFilter, 'all'>)
                    }
                    className="flex-1 px-2 py-1 rounded-xs bg-[#101C28] border border-slate-700 text-slate-200 focus:border-[#22D3EE] focus:outline-none"
                  >
                    <option value="oil_spills">Oil Spill Discharge</option>
                    <option value="dark_spoofing">AIS Blackout / Dark</option>
                    <option value="subsea_cables">Subsea Cable Anomaly</option>
                  </select>
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-xs bg-[#22D3EE]/20 hover:bg-[#22D3EE]/30 border border-[#22D3EE]/60 text-[#22D3EE] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>APPEND</span>
                  </button>
                </div>
                {ingestError && <div className="text-red-400 text-[9.5px]">{ingestError}</div>}
              </form>
            </div>
          )}

          {/* Archive Search & Category Filters */}
          <div className="px-3 py-2 border-b border-[#22D3EE]/15 bg-[#060D14]/70 space-y-2">
            <div className="relative">
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={forensicQuery}
                onChange={(e) => setForensicQuery(e.target.value)}
                placeholder="Filter date, vessel, MMSI, case code..."
                className="w-full pl-7 pr-2.5 py-1.5 text-[11px] font-mono rounded bg-[#101C28] border border-slate-700/80 focus:border-[#22D3EE] focus:outline-none text-slate-100 placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {FILTER_OPTIONS.map((opt) => {
                const isActive = activeFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeFilter(opt.id)}
                    className={`px-2 py-1 text-[9.5px] font-mono font-medium rounded-xs border text-center transition-colors whitespace-nowrap shrink-0 truncate cursor-pointer ${
                      isActive
                        ? 'bg-[#22D3EE]/20 border-[#22D3EE]/55 text-[#22D3EE]'
                        : 'bg-[#101C28]/70 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simultaneous Forensic Repository List */}
          <div className="flex-1 overflow-y-auto hud-scroll p-3 space-y-2.5">
            {filteredForensicCases.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 font-mono">
                No historical cases match current filter.
              </div>
            ) : (
              filteredForensicCases.map((fc) => {
                const isSelected = fc.id === selectedForensicCaseId;
                const temporal = evaluateForensicCaseAtTime(fc, forensicTimeOffsetHours);
                return (
                  <article
                    key={fc.id}
                    onClick={() => onSelectForensicCase(fc)}
                    className={`rounded-md p-3 border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#101C28] border-[#22D3EE]/70 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]'
                        : 'bg-[#060D14]/90 border-slate-700/70 hover:border-[#F59E0B]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 min-w-0 truncate tabular-nums">
                        <span
                          className={`font-semibold ${
                            isSelected ? 'text-[#22D3EE]' : 'text-[#F59E0B]'
                          }`}
                        >
                          {fc.caseCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-200">{fc.dateStr}</span>
                        <span aria-hidden="true">·</span>
                        <span>{fc.timestampUtc.slice(11, 16)}Z</span>
                      </div>

                      <span
                        className={`px-1.5 py-0.5 rounded-xs border text-[10px] font-mono font-bold shrink-0 tabular-nums ${
                          fc.severity === 'critical'
                            ? 'border-[#F59E0B]/55 text-[#F59E0B] bg-[#F59E0B]/10'
                            : 'border-[#22D3EE]/45 text-[#22D3EE] bg-[#22D3EE]/10'
                        }`}
                        title="Forensic Threat Index"
                      >
                        {fc.threatScore}
                      </span>
                    </div>

                    <h3 className="text-[12.5px] font-semibold text-slate-100 leading-snug truncate">
                      {fc.title}
                    </h3>

                    <div className="text-[10.5px] font-mono text-slate-300 mt-0.5 truncate">
                      {fc.primaryVessel.name} · MMSI {fc.primaryVessel.mmsi}
                    </div>

                    {/* Synchronized Scrubber Position & Day Window Telemetry */}
                    <div className="mt-2 bg-[#101C28]/85 border border-[#22D3EE]/25 rounded p-2 text-[9.5px] font-mono space-y-1 tabular-nums">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[#22D3EE] font-semibold truncate">
                          {temporal.simulatedDateStr} {temporal.simulatedClockUtc}
                        </span>
                        <span
                          className={`font-semibold shrink-0 ${
                            temporal.isBlackoutActive ? 'text-[#F59E0B]' : 'text-[#22D3EE]'
                          }`}
                        >
                          {temporal.incidentDayElapsedLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1.5 text-slate-300">
                        <span>
                          {temporal.lat.toFixed(2)}°N, {temporal.lon.toFixed(2)}°E
                        </span>
                        <span>
                          {temporal.sogKts.toFixed(1)} kt · {temporal.headingDeg}°
                        </span>
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <div className="flex-1 h-1.5 bg-[#060D14] rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full transition-all duration-100 ${
                              temporal.isBlackoutActive ? 'bg-[#F59E0B]' : 'bg-[#22D3EE]'
                            }`}
                            style={{ width: `${temporal.transitProgressPct}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-400 shrink-0">
                          {temporal.transitProgressPct.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9.5px] font-mono bg-[#060D14] border border-slate-800 rounded p-2 tabular-nums">
                      <div>
                        <div className="text-slate-500">STOP COORD</div>
                        <div className="text-[#22D3EE] font-semibold">
                          {fc.stopCoordinates.lat.toFixed(2)}°N, {fc.stopCoordinates.lon.toFixed(2)}°E
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">SPILL VOLUME</div>
                        <div className="text-[#F59E0B] font-semibold">
                          {fc.spill.areaKm2} km² · {fc.spill.estimatedVolumeBarrels} bbl
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">DIMENSIONS</div>
                        <div className="text-slate-200">
                          {fc.spill.lengthKm} x {fc.spill.maxWidthKm} km
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">SAR PASS</div>
                        <div className="text-slate-200 truncate">{fc.sarPass.satellite}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-2 mt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLocateForensicCase(fc);
                        }}
                        className="px-2 py-1 text-[9.5px] font-mono font-medium rounded-xs border border-slate-600/70 text-slate-200 hover:border-[#22D3EE]/60 hover:text-[#22D3EE] flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Crosshair className="w-3 h-3" />
                        <span>LOCATE</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {fc.historicalScenarioId && onLaunchHistoricalReplay && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchHistoricalReplay(fc.historicalScenarioId!);
                            }}
                            title="Launch 24h Historical Replay"
                            className="px-2 py-1 text-[9.5px] font-mono font-medium rounded-xs border border-[#F59E0B]/45 text-[#F59E0B] hover:bg-[#F59E0B]/15 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <History className="w-3 h-3" />
                            <span>REPLAY</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInspectForensicCase(fc);
                          }}
                          className={`px-2 py-1 text-[9.5px] font-mono font-medium rounded-xs border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-[#22D3EE]/25 border-[#22D3EE]/70 text-[#22D3EE]'
                              : 'bg-[#101C28] border-[#22D3EE]/35 text-[#22D3EE] hover:bg-[#22D3EE]/15'
                          }`}
                        >
                          <Search className="w-3 h-3" />
                          <span>INSPECT</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </>
      ) : (
        <>
          {/* AUTONOMOUS WATCHDOG FEED Card (Coastal Surveillance Live Alerts ONLY) */}
          <div className="px-3 py-2 border-b border-[#22D3EE]/20 bg-[#060D14]/90 space-y-1.5">
            <div className="flex items-center justify-between text-[9.5px] font-mono">
              <span className="text-[#22D3EE] font-bold tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>AUTONOMOUS WATCHDOG FEED</span>
              </span>
              <span className="text-slate-400">30m DARK · 3km CABLE</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 font-mono">
              <button
                type="button"
                disabled={!firstDarkVessel}
                onClick={() => firstDarkVessel && onSelectLiveVessel(firstDarkVessel, true)}
                className={`text-left rounded p-1.5 border transition-colors ${
                  confirmedDarkEnvelopes.length > 0
                    ? 'bg-red-950/45 border-red-500/60 hover:border-red-400 cursor-pointer'
                    : 'bg-[#101C28]/80 border-slate-800/80 cursor-default'
                }`}
              >
                <div className="text-[8.5px] text-slate-400">DARK (&gt;30M)</div>
                <div
                  className={`text-xs font-bold mt-0.5 ${
                    confirmedDarkEnvelopes.length > 0 ? 'text-red-300' : 'text-emerald-400'
                  }`}
                >
                  {confirmedDarkEnvelopes.length} DARK
                </div>
                {routineGapCount > 0 && confirmedDarkEnvelopes.length === 0 && (
                  <div className="text-[8px] text-emerald-300/85 truncate">
                    {routineGapCount} brief &lt;30m
                  </div>
                )}
              </button>

              <button
                type="button"
                disabled={!firstCableAlertVessel}
                onClick={() =>
                  firstCableAlertVessel && onSelectLiveVessel(firstCableAlertVessel, true)
                }
                className={`text-left rounded p-1.5 border transition-colors ${
                  cableThreatAlerts.length > 0
                    ? 'bg-amber-950/40 border-[#F59E0B]/60 hover:border-[#F59E0B] cursor-pointer'
                    : 'bg-[#101C28]/80 border-slate-800/80 cursor-default'
                }`}
              >
                <div className="text-[8.5px] text-slate-400">CABLE ALERTS</div>
                <div
                  className={`text-xs font-bold mt-0.5 ${
                    cableThreatAlerts.length > 0 ? 'text-[#F59E0B]' : 'text-emerald-400'
                  }`}
                >
                  {cableThreatAlerts.length} THREATS
                </div>
              </button>

              <div className="rounded p-1.5 border bg-[#101C28]/80 border-[#22D3EE]/30">
                <div className="text-[8.5px] text-slate-400 flex items-center gap-1 truncate">
                  <Satellite className="w-2.5 h-2.5 text-[#22D3EE] shrink-0" />
                  <span className="truncate">{nextSatellitePass?.name ?? 'SAR PASS'}</span>
                </div>
                <div className="text-[11px] font-bold text-[#22D3EE] mt-0.5 tabular-nums">
                  {nextSatellitePass
                    ? `T-${formatShortCountdown(nextSatellitePass.nextPassSeconds)}`
                    : '--:--:--'}
                </div>
              </div>
            </div>
          </div>

          {/* Search filter for live AIS targets */}
          <div className="px-3 py-2 border-b border-[#22D3EE]/15 bg-[#060D14]/60 flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <input
              type="text"
              value={vesselQuery}
              onChange={(e) => setVesselQuery(e.target.value)}
              placeholder="Filter name, MMSI, type, destination..."
              className="w-full px-2.5 py-1.5 text-[11px] font-mono rounded bg-[#101C28] border border-slate-700/80 focus:border-[#22D3EE] focus:outline-none text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto hud-scroll p-3 space-y-2">
            {filteredLiveVessels.length === 0 ? (
              <div className="bg-[#101C28]/85 border border-[#22D3EE]/25 rounded-md p-3.5 space-y-2.5 text-center">
                <div className="w-8 h-8 rounded-full bg-[#22D3EE]/10 border border-[#22D3EE]/30 flex items-center justify-center mx-auto text-[#22D3EE]">
                  <Ship className="w-4 h-4" />
                </div>
                {aisStatus === 'connected' ? (
                  <>
                    <h3 className="text-xs font-mono font-semibold text-emerald-300 uppercase">
                      AISStream Connected
                    </h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Listening to real-time VHF AIS frames across Alexandria, Damietta, Port Said,
                      and Northern Suez Approach. Ships appear immediately as transponders report.
                    </p>
                  </>
                ) : aisStatus === 'connecting' ? (
                  <>
                    <h3 className="text-xs font-mono font-semibold text-[#22D3EE] uppercase">
                      Connecting to AISStream...
                    </h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Opening server-side WebSocket stream for Egyptian Eastern Mediterranean AIS
                      targets.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xs font-mono font-semibold text-[#F59E0B] uppercase">
                      {aisStatus === 'error' ? 'AISStream Connection Error' : 'AISStream Relay Offline'}
                    </h3>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {aisError
                        ? aisError
                        : 'Server AIS WebSocket stream is currently offline. Reconnect to resume live Eastern Mediterranean transponder telemetry.'}
                    </p>
                    <button
                      type="button"
                      onClick={onReconnectAis}
                      className="w-full py-2 px-3 rounded bg-[#22D3EE]/20 hover:bg-[#22D3EE]/30 border border-[#22D3EE]/50 text-[11px] font-mono font-semibold text-cyan-100 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>RECONNECT AIS STREAM</span>
                    </button>
                  </>
                )}
              </div>
            ) : (
              filteredLiveVessels.map((v) => {
                const isSelected = selectedVesselId === v.id;
                const darkEnv = darkMap.get(v.id);
                const isConfirmedDark = Boolean(darkEnv?.isConfirmedDark);
                const isRoutineGap = Boolean(
                  darkEnv && !darkEnv.isConfirmedDark && darkEnv.gapMinutes >= 0.5
                );
                const cableAlert = cableAlertMap.get(v.id);
                const isThreat = Boolean(isConfirmedDark || cableAlert);
                return (
                  <article
                    key={v.id}
                    onClick={() => onSelectLiveVessel(v, true)}
                    className={`rounded-md p-2.5 border transition-colors cursor-pointer ${
                      isThreat
                        ? isSelected
                          ? 'bg-red-950/45 border-red-400/75 shadow-[inset_0_0_18px_rgba(239,68,68,0.16)]'
                          : 'bg-red-950/25 border-red-500/45 hover:border-red-400/70'
                        : isSelected
                          ? 'bg-[#101C28] border-[#22D3EE]/65 shadow-[inset_0_0_18px_rgba(34,211,238,0.12)]'
                          : 'bg-[#060D14]/85 border-slate-700/60 hover:border-[#22D3EE]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                      <span
                        className={`font-semibold ${
                          isThreat ? 'text-red-300' : 'text-emerald-300'
                        }`}
                      >
                        MMSI {v.mmsi}
                      </span>
                      {isConfirmedDark && darkEnv ? (
                        <span className="px-1.5 py-0.5 rounded-xs bg-red-500/25 border border-red-400/60 text-red-200 text-[9px] font-bold">
                          DARK ANOMALY · {Math.round(darkEnv.gapMinutes)}m (&gt;30m)
                        </span>
                      ) : cableAlert ? (
                        <span className="px-1.5 py-0.5 rounded-xs bg-[#F59E0B]/20 border border-[#F59E0B]/60 text-[#F59E0B] text-[9px] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 text-[#F59E0B]" />
                          <span>SUBSEA CABLE THREAT</span>
                        </span>
                      ) : isRoutineGap && darkEnv ? (
                        <span className="px-1.5 py-0.5 rounded-xs bg-emerald-500/15 border border-emerald-400/45 text-emerald-300 text-[9px] font-semibold">
                          ROUTINE GAP · {Math.round(darkEnv.gapMinutes)}m (&lt;30m)
                        </span>
                      ) : (
                        <span>
                          {v.flag} · {v.aisLastSeenUtc.slice(11, 19)}Z
                        </span>
                      )}
                    </div>
                    <h3 className="text-[12.5px] font-semibold text-slate-100 mt-1 truncate">
                      {v.name}
                    </h3>
                    <div className="text-[10.5px] font-mono text-slate-300 mt-0.5 truncate">
                      {v.vesselType}
                      {v.destination ? ` · -> ${v.destination}` : ''}
                    </div>
                    {cableAlert && (
                      <div className="mt-1.5 text-[9.5px] font-mono text-[#F59E0B] truncate">
                        SUBSEA CABLE THREAT · {cableAlert.cableName} ({cableAlert.distanceKm} km)
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-700/50 text-[10px] font-mono">
                      <span className="text-[#22D3EE]">
                        {v.sogKts.toFixed(1)} kts · {v.headingDeg}°
                      </span>
                      <span className="text-slate-400">
                        {v.lat.toFixed(2)}°N, {v.lon.toFixed(2)}°E
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </aside>
  );
};
