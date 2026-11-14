import React from 'react';
import {
  Anchor,
  Compass,
  Droplets,
  Globe2,
  Layers,
  Pause,
  Play,
  Radar,
  RotateCcw,
  Satellite,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { evaluateForensicCaseAtTime } from '../data/forensicCasesRepository';
import { formatMinuteUtc } from '../services/historicalService';
import {
  BaseMapId,
  ForensicCaseRecord,
  HistoricalReplayState,
  HudMode,
  LayerVisibility,
} from '../types/telemetry';

interface BottomControlDeckProps {
  hudMode?: HudMode;
  activeForensicCase?: ForensicCaseRecord;
  forensicCasesCount?: number;
  baseMap: BaseMapId;
  layers: LayerVisibility;
  timeOffsetHours: number;
  isPlaying: boolean;
  hudMinimized: boolean;
  isHistoricalMode?: boolean;
  historicalDateStr?: string;
  historicalMinute?: number;
  historicalDarkMinute?: number;
  historicalPassMinute?: number;
  historicalPhase?: HistoricalReplayState['phase'];
  onChangeBaseMap: (baseMap: BaseMapId) => void;
  onToggleLayer: (layerKey: keyof LayerVisibility) => void;
  onChangeTimeOffset: (hours: number) => void;
  onChangeHistoricalMinute?: (minute: number) => void;
  onTogglePlay: () => void;
  onResetTime: () => void;
}

const BASE_MAPS: Array<{ id: BaseMapId; label: string; icon: React.ReactNode }> = [
  { id: 'satellite', label: 'SATELLITE REALITY', icon: <Globe2 className="w-3.5 h-3.5" /> },
  { id: 'dark_radar', label: 'TACTICAL DARK RADAR', icon: <Radar className="w-3.5 h-3.5" /> },
  { id: 'nautical', label: 'NAUTICAL CHART', icon: <Compass className="w-3.5 h-3.5" /> },
  { id: 'nasa_viirs', label: 'NASA VIIRS DAILY', icon: <Sparkles className="w-3.5 h-3.5" /> },
];

const LAYER_TOGGLES: Array<{
  key: keyof LayerVisibility;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: 'nauticalLanes', label: 'Nautical Lanes', icon: <Compass className="w-3 h-3" /> },
  { key: 'subseaCables', label: 'Subsea Cables', icon: <Anchor className="w-3 h-3" /> },
  { key: 'sarSwaths', label: 'SAR Swaths', icon: <Satellite className="w-3 h-3" /> },
  { key: 'sarBackscatter', label: 'SAR Backscatter', icon: <ScanLine className="w-3 h-3" /> },
  { key: 'searchCones', label: 'Search Cones', icon: <Layers className="w-3 h-3" /> },
  { key: 'oilDriftEnsemble', label: 'Oil Drift Ensemble', icon: <Droplets className="w-3 h-3" /> },
];

export const BottomControlDeck: React.FC<BottomControlDeckProps> = ({
  hudMode = 'surveillance',
  activeForensicCase,
  forensicCasesCount = 5,
  baseMap,
  layers,
  timeOffsetHours,
  isPlaying,
  isHistoricalMode = false,
  historicalDateStr,
  historicalMinute = 0,
  historicalDarkMinute,
  historicalPassMinute,
  historicalPhase,
  onChangeBaseMap,
  onToggleLayer,
  onChangeTimeOffset,
  onChangeHistoricalMinute,
  onTogglePlay,
  onResetTime,
}) => {
  const isForensic = hudMode === 'forensic' && !isHistoricalMode;
  const activeForensicTemporal =
    isForensic && activeForensicCase
      ? evaluateForensicCaseAtTime(activeForensicCase, timeOffsetHours)
      : null;

  const formattedOffset =
    Math.abs(timeOffsetHours) < 0.25
      ? 'T=0 (SAR PASS)'
      : timeOffsetHours < 0
        ? `T${timeOffsetHours.toFixed(1)}h (PAST)`
        : `T+${timeOffsetHours.toFixed(1)}h (FORECAST)`;

  const historicalPhaseLabel =
    historicalPhase === 'SAR_PASS_ILLUMINATED'
      ? 'SAR SWATH ILLUMINATED · OIL DRIFT'
      : historicalPhase === 'DARK_SEARCH_ACTIVE'
        ? 'AIS DROPOUT · CYAN SEARCH CONE'
        : 'PRE-DROPOUT · AIS TRACKING';

  const historicalPhaseColor =
    historicalPhase === 'SAR_PASS_ILLUMINATED'
      ? 'text-cyan-300'
      : historicalPhase === 'DARK_SEARCH_ACTIVE'
        ? 'text-amber-300'
        : 'text-emerald-300';

  const darkPct =
    historicalDarkMinute !== undefined
      ? Math.max(0, Math.min(100, (historicalDarkMinute / 1439) * 100))
      : null;
  const passPct =
    historicalPassMinute !== undefined
      ? Math.max(0, Math.min(100, (historicalPassMinute / 1439) * 100))
      : null;

  return (
    <footer
      aria-label="Timeline Scrubber and Map Layer Control Deck"
      className="fixed bottom-3 left-3 right-3 max-w-[calc(100vw-1.5rem)] box-border overflow-hidden z-[1050] hud-glass rounded-md px-2.5 py-2 flex flex-col gap-1.5"
    >
      {/* Row 1: Playback Controls & Full-Width Timeline Scrubber */}
      <div className="flex items-center gap-3 w-full">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            title={
              isHistoricalMode
                ? isPlaying
                  ? 'Pause 24h Historical Replay'
                  : 'Play 24h Historical Replay (15m/sec)'
                : isForensic
                  ? isPlaying
                    ? 'Pause Multi-Ship Forensic Timeline'
                    : 'Play Synchronized Multi-Ship Forensic Timeline'
                  : isPlaying
                    ? 'Pause Timeline Simulation'
                    : 'Play Timeline Simulation'
            }
            aria-label={isPlaying ? 'Pause Timeline Simulation' : 'Play Timeline Simulation'}
            className="w-7 h-7 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 flex items-center justify-center transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onResetTime}
            title={isHistoricalMode ? 'Reset to 00:00 UTC' : 'Snap to T=0 SAR Detection'}
            aria-label={isHistoricalMode ? 'Reset to 00:00 UTC' : 'Snap to T=0 SAR Detection'}
            className="w-7 h-7 rounded bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-200 flex items-center justify-center transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {isHistoricalMode ? (
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
              00:00 UTC
            </span>

            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={1439}
                step={1}
                value={historicalMinute}
                onChange={(e) => onChangeHistoricalMinute?.(parseInt(e.target.value, 10))}
                aria-label="24-Hour Historical Timeline Scrubber from 00:00 UTC to 23:59 UTC"
                className="tactical-range w-full"
              />
              {darkPct !== null && (
                <button
                  type="button"
                  onClick={() =>
                    historicalDarkMinute !== undefined &&
                    onChangeHistoricalMinute?.(historicalDarkMinute)
                  }
                  title={`Jump to AIS Dropout (${formatMinuteUtc(historicalDarkMinute!)} UTC)`}
                  style={{ left: `${darkPct}%` }}
                  className="absolute -bottom-1.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#F59E0B] cursor-pointer"
                />
              )}
              {passPct !== null && (
                <button
                  type="button"
                  onClick={() =>
                    historicalPassMinute !== undefined &&
                    onChangeHistoricalMinute?.(historicalPassMinute)
                  }
                  title={`Jump to NASA ASF SAR Pass (${formatMinuteUtc(historicalPassMinute!)} UTC)`}
                  style={{ left: `${passPct}%` }}
                  className="absolute -bottom-1.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00F0FF] cursor-pointer"
                />
              )}
            </div>

            <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
              23:59 UTC
            </span>

            <div className="hidden md:flex items-center gap-2 border-l border-cyan-500/20 pl-3 text-[10px] font-mono shrink-0">
              <span className={`font-semibold tabular-nums ${historicalPhaseColor}`}>
                {historicalDateStr ? `${historicalDateStr} ` : ''}
                {formatMinuteUtc(historicalMinute)}Z
              </span>
              <span className="text-slate-600">·</span>
              <span className={`font-semibold ${historicalPhaseColor}`}>
                {historicalPhaseLabel}
              </span>
              {historicalDarkMinute !== undefined && (
                <button
                  type="button"
                  onClick={() => onChangeHistoricalMinute?.(historicalDarkMinute)}
                  className="ml-1 px-1.5 py-0.5 rounded-xs border border-amber-400/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
                >
                  DROP {formatMinuteUtc(historicalDarkMinute)}Z
                </button>
              )}
              {historicalPassMinute !== undefined && (
                <button
                  type="button"
                  onClick={() => onChangeHistoricalMinute?.(historicalPassMinute)}
                  className="px-1.5 py-0.5 rounded-xs border border-cyan-400/35 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                >
                  PASS {formatMinuteUtc(historicalPassMinute)}Z
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <span className="text-[10px] font-mono text-[#22D3EE] shrink-0 tabular-nums whitespace-nowrap">
              {isForensic ? '-48h HINDCAST' : '-48h HINDCAST'}
            </span>
            <div className="relative flex-1 flex items-center min-w-[140px]">
              <input
                type="range"
                min={-48}
                max={24}
                step={0.25}
                value={timeOffsetHours}
                onChange={(e) => onChangeTimeOffset(parseFloat(e.target.value))}
                aria-label="Time-Machine Scrubber from -48 hours to +24 hours"
                className="tactical-range w-full"
              />
              {isForensic && (
                <button
                  type="button"
                  onClick={() => onChangeTimeOffset(0)}
                  title="Jump to T=0 SAR Pass (All Stop Coordinates)"
                  style={{ left: '66.6667%' }}
                  className="absolute -bottom-1.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#22D3EE] shadow-[0_0_6px_#22D3EE] cursor-pointer"
                />
              )}
              {isForensic && activeForensicTemporal && (
                <button
                  type="button"
                  onClick={() => onChangeTimeOffset(activeForensicTemporal.blackoutOffsetHours)}
                  title={`Jump to ${activeForensicCase?.caseCode} AIS Blackout (${activeForensicTemporal.blackoutOffsetHours.toFixed(1)}h)`}
                  style={{
                    left: `${Math.max(
                      0,
                      Math.min(100, ((activeForensicTemporal.blackoutOffsetHours + 48) / 72) * 100)
                    )}%`,
                  }}
                  className="absolute -bottom-1.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#F59E0B] shadow-[0_0_6px_#F59E0B] cursor-pointer"
                />
              )}
            </div>
            <span className="text-[10px] font-mono text-[#F59E0B] shrink-0 tabular-nums whitespace-nowrap">
              +24h FORECAST
            </span>

            {isForensic && activeForensicTemporal && activeForensicCase ? (
              <div className="hidden md:flex items-center gap-2 border-l border-[#22D3EE]/25 pl-2.5 text-[10px] font-mono shrink-0 tabular-nums">
                <span className="text-[#22D3EE] font-semibold whitespace-nowrap">
                  {activeForensicTemporal.simulatedDateStr} {activeForensicTemporal.simulatedClockUtc}
                </span>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-200 whitespace-nowrap">
                  {activeForensicTemporal.incidentDayElapsedLabel}
                </span>
                <span className="text-slate-600 hidden xl:inline" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-semibold whitespace-nowrap hidden xl:inline ${
                    Math.abs(timeOffsetHours) < 0.25
                      ? 'text-[#22D3EE]'
                      : timeOffsetHours < 0
                        ? 'text-slate-200'
                        : 'text-[#F59E0B]'
                  }`}
                >
                  {formattedOffset}
                </span>
                <span className="text-slate-600 hidden 2xl:inline" aria-hidden="true">
                  ·
                </span>
                <span className="text-[#F59E0B] font-semibold whitespace-nowrap hidden 2xl:inline">
                  {forensicCasesCount} SHIPS SYNCED
                </span>

                <div className="hidden lg:flex items-center gap-1 ml-1">
                  <button
                    type="button"
                    onClick={() => onChangeTimeOffset(-48)}
                    className="px-1.5 py-0.5 rounded-xs border border-[#22D3EE]/35 bg-[#101C28] text-[#22D3EE] hover:bg-[#22D3EE]/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    -48h
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTimeOffset(activeForensicTemporal.blackoutOffsetHours)}
                    className="px-1.5 py-0.5 rounded-xs border border-[#F59E0B]/40 bg-[#101C28] text-[#F59E0B] hover:bg-[#F59E0B]/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    CUTOFF
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTimeOffset(0)}
                    className="px-1.5 py-0.5 rounded-xs border border-[#22D3EE]/50 bg-[#22D3EE]/15 text-[#22D3EE] hover:bg-[#22D3EE]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    T=0 PASS
                  </button>
                </div>
              </div>
            ) : (
              <span
                className={`hidden sm:inline border-l border-[#22D3EE]/20 pl-3 text-[10px] font-mono font-semibold shrink-0 tabular-nums ${
                  Math.abs(timeOffsetHours) < 0.25
                    ? 'text-[#22D3EE]'
                    : timeOffsetHours < 0
                      ? 'text-slate-200'
                      : 'text-[#F59E0B]'
                }`}
              >
                {formattedOffset}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Base Maps (Left) & Overlay Toggles (Right) */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-cyan-500/15 w-full">
        {/* Left: 4 Switchable Real-World Base Maps */}
        <div className="flex flex-wrap items-center gap-0.5 bg-[#040812]/85 border border-cyan-500/20 rounded p-0.5 min-w-0">
          {BASE_MAPS.map((bm) => {
            const active = baseMap === bm.id;
            return (
              <button
                key={bm.id}
                type="button"
                onClick={() => onChangeBaseMap(bm.id)}
                className={`px-1.5 xl:px-2 py-1 text-[9.5px] xl:text-[10px] font-mono font-medium rounded-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-500/25 text-cyan-100 border border-cyan-400/50'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {bm.icon}
                <span>{bm.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Tactical Overlay Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {LAYER_TOGGLES.map((lt) => {
            const active = layers[lt.key];
            return (
              <button
                key={lt.key}
                type="button"
                onClick={() => onToggleLayer(lt.key)}
                className={`px-1.5 xl:px-2 py-1 text-[9.5px] xl:text-[10px] font-mono font-medium rounded-xs border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                    : 'bg-slate-900/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lt.icon}
                <span>{lt.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
};

