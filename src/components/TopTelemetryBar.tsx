import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  EyeOff,
  History,
  Loader2,
  Microscope,
  Radio,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AisConnectionStatus } from '../services/aisStreamService';
import { SCENARIO_OPTIONS } from '../services/historicalService';
import {
  HistoricalReplayState,
  HistoricalTimelinePayload,
  HudMode,
  LiveFeedDiagnostic,
  SatelliteGroundState,
  ScenarioId,
  WeatherState,
} from '../types/telemetry';

interface TopTelemetryBarProps {
  activeScenarioId: ScenarioId;
  historicalLoading: boolean;
  historicalReplay: HistoricalReplayState | null;
  historicalPayload: HistoricalTimelinePayload | null;
  activeAisCount: number;
  liveAisCount: number;
  aisStatus: AisConnectionStatus;
  aisError?: string;
  weather: WeatherState;
  nextSatellitePass: SatelliteGroundState | undefined;
  feedDiagnostics: LiveFeedDiagnostic[];
  hudMode: HudMode;
  forensicCasesCount?: number;
  hudMinimized: boolean;
  alertsCount: number;
  unreadAlertsCount: number;
  alertsOpen: boolean;
  onSelectScenario: (scenarioId: ScenarioId) => void;
  onResyncFeeds: () => void;
  onReconnectAisRelay: () => void;
  onToggleAlertsDrawer: () => void;
  onChangeMode: (mode: HudMode) => void;
  onToggleMinimize: () => void;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export const TopTelemetryBar: React.FC<TopTelemetryBarProps> = ({
  activeScenarioId,
  historicalLoading,
  historicalReplay,
  historicalPayload,
  activeAisCount,
  liveAisCount,
  aisStatus,
  aisError,
  weather,
  nextSatellitePass,
  feedDiagnostics,
  hudMode,
  forensicCasesCount = 5,
  hudMinimized,
  alertsCount,
  unreadAlertsCount,
  alertsOpen,
  onSelectScenario,
  onResyncFeeds,
  onReconnectAisRelay,
  onToggleAlertsDrawer,
  onChangeMode,
  onToggleMinimize,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const scenarioTriggerRef = useRef<HTMLDivElement | null>(null);
  const scenarioMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!scenarioMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = scenarioTriggerRef.current?.contains(target);
      const inMenu = scenarioMenuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        setScenarioMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setScenarioMenuOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [scenarioMenuOpen]);

  const utcStr = now.toISOString().slice(11, 19);
  const onlineFeedsCount = feedDiagnostics.filter((d) => d.status === '200 OK').length;
  const totalFeedsCount = feedDiagnostics.length || 7;
  const isHistorical = activeScenarioId !== 'live';
  const isForensicStandalone = hudMode === 'forensic' && !isHistorical;
  const activeScenarioOption =
    SCENARIO_OPTIONS.find((opt) => opt.id === activeScenarioId) ?? SCENARIO_OPTIONS[0];
  const isHistoricalSuspectDark = Boolean(historicalReplay?.suspectDarkCone);

  const handleMinimizeToggle = () => {
    setScenarioMenuOpen(false);
    setDiagnosticsOpen(false);
    onToggleMinimize();
  };

  return (
    <>
      {hudMinimized && (
        <button
          type="button"
          onClick={handleMinimizeToggle}
          aria-label="Restore Command Bar"
          className="fixed top-3 right-3 z-[1150] h-9 px-3.5 rounded-md bg-[#060D14]/95 hover:bg-[#101C28] border border-[#22D3EE]/50 hover:border-[#22D3EE] text-[#22D3EE] hover:text-cyan-200 font-mono text-[11px] font-semibold tracking-wider flex items-center gap-2 shadow-[0_10px_28px_rgba(2,6,18,0.85)] backdrop-blur-md transition-all duration-150 cursor-pointer"
        >
          <span>+ RESTORE COMMAND BAR</span>
        </button>
      )}

      <header
        aria-hidden={hudMinimized}
        className={`fixed top-3 left-3 right-3 max-w-[calc(100vw-1.5rem)] box-border overflow-hidden z-[1100] h-12 hud-glass rounded-md px-2.5 flex items-center justify-between gap-2 transition-all duration-200 ease-out ${
          hudMinimized
            ? 'opacity-0 -translate-y-4 pointer-events-none'
            : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Zone 1: Top-Left Scenario Selector Trigger & UTC Clock */}
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[230px] xl:max-w-[290px]">
          <div ref={scenarioTriggerRef} className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setScenarioMenuOpen((v) => !v);
                setDiagnosticsOpen(false);
              }}
              aria-haspopup="listbox"
              aria-expanded={scenarioMenuOpen}
              className={`w-full h-8 px-2 rounded border flex items-center gap-1.5 transition-colors min-w-0 ${
                scenarioMenuOpen
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-100'
                  : isHistorical
                    ? 'bg-amber-500/10 border-amber-400/45 text-slate-100 hover:border-cyan-400/50'
                    : 'bg-[#040812]/85 border-cyan-500/30 text-slate-100 hover:border-cyan-400/50'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-xs shrink-0 ${
                  isHistorical || isForensicStandalone
                    ? 'bg-[#F59E0B] shadow-[0_0_8px_#F59E0B]'
                    : 'bg-[#22D3EE] shadow-[0_0_8px_#22D3EE]'
                }`}
              />
              <span className="text-[10.5px] font-mono font-semibold tracking-wide whitespace-nowrap truncate flex-1 text-left">
                {isHistorical
                  ? `REPLAY · ${activeScenarioOption.shortLabel}`
                  : isForensicStandalone
                    ? 'AEGIS-SAR · FORENSIC LAB'
                    : 'AEGIS-SAR · LIVE'}
              </span>
              {historicalLoading ? (
                <Loader2 className="w-3.5 h-3.5 text-[#22D3EE] animate-spin shrink-0" />
              ) : (
                <ChevronDown
                  className={`w-3.5 h-3.5 text-[#22D3EE] shrink-0 transition-transform duration-150 ${
                    scenarioMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              )}
            </button>
          </div>

          <span className="hidden 2xl:inline text-[10px] font-mono text-[#22D3EE] border-l border-[#22D3EE]/25 pl-2 whitespace-nowrap shrink-0 tabular-nums">
            {isHistorical && historicalReplay
              ? historicalReplay.clockUtc
              : isForensicStandalone
                ? 'HISTORICAL ARCHIVE'
                : `${utcStr} UTC`}
          </span>
        </div>

        {/* Zone 2: Calibrated Live / Historical Telemetry Readouts OR Decoupled Forensic Archive Summary */}
        {isForensicStandalone ? (
          <div className="hidden lg:flex items-center gap-2.5 text-[9.5px] xl:text-[10px] font-mono whitespace-nowrap min-w-0 shrink">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400">ARCHIVE:</span>
              <span className="text-[#22D3EE] font-semibold tabular-nums">
                {forensicCasesCount} ISOLATED
              </span>
            </div>

            <span className="h-3.5 w-px bg-[#22D3EE]/20 shrink-0" aria-hidden="true" />

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400">TELEMETRY:</span>
              <span className="text-[#F59E0B] font-semibold">DECOUPLED</span>
            </div>

            <span className="h-3.5 w-px bg-[#22D3EE]/20 shrink-0" aria-hidden="true" />

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400">SPAN:</span>
              <span className="text-slate-100 font-semibold tabular-nums">2004 - 2021</span>
            </div>

            <span className="h-3.5 w-px bg-[#22D3EE]/20 shrink-0" aria-hidden="true" />

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400">SENSORS:</span>
              <span className="text-[#22D3EE] font-semibold">SENTINEL-1A / ENVISAT</span>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-2 xl:gap-2.5 text-[9.5px] xl:text-[10px] font-mono whitespace-nowrap min-w-0 shrink">
            <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-400">AIS:</span>
            <span className="text-cyan-300 font-semibold tabular-nums">{activeAisCount}</span>
            {isHistorical ? (
              <span
                className={`px-1 py-0.5 rounded-xs border text-[9px] font-semibold ${
                  isHistoricalSuspectDark
                    ? 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                    : 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                }`}
              >
                {isHistoricalSuspectDark ? 'DARK' : 'HIST'}
              </span>
            ) : (
              <button
                type="button"
                title={aisError || 'Toggle diagnostics or reconnect server AIS stream'}
                onClick={() => {
                  if (aisStatus === 'connected' || aisStatus === 'connecting') {
                    setDiagnosticsOpen((v) => !v);
                    setScenarioMenuOpen(false);
                  } else {
                    onReconnectAisRelay();
                  }
                }}
                className={`px-1 py-0.5 rounded-xs border text-[9px] font-semibold transition-colors ${
                  aisStatus === 'connected'
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                    : aisStatus === 'connecting'
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                      : aisStatus === 'error'
                        ? 'bg-rose-500/15 border-rose-400/40 text-rose-300 hover:bg-rose-500/25'
                        : 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                }`}
              >
                {aisStatus === 'connected'
                  ? `LIVE(${liveAisCount})`
                  : aisStatus === 'connecting'
                    ? 'SYNC'
                    : aisStatus === 'error'
                      ? 'ERR'
                      : 'RETRY'}
              </button>
            )}
          </div>

          <span className="h-3.5 w-px bg-cyan-500/20 shrink-0" aria-hidden="true" />

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-slate-400">WIND:</span>
            <span className="text-slate-100 font-semibold tabular-nums">
              {historicalReplay
                ? `${historicalReplay.currentWeather.windSpeedKts}KT ${historicalReplay.currentWeather.windDirectionCardinal}`
                : `${weather.windSpeedKts}KT ${weather.windDirectionCardinal}`}
            </span>
          </div>

          <span className="h-3.5 w-px bg-cyan-500/20 shrink-0" aria-hidden="true" />

          {isHistorical && historicalPayload ? (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400">SWATH:</span>
              <span
                className={`font-semibold ${
                  historicalPayload.asfStatus === '200 OK'
                    ? 'text-emerald-300'
                    : 'text-amber-300'
                }`}
              >
                {historicalPayload.primarySatelliteName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-400">Kp:</span>
              <span
                className={`font-semibold tabular-nums ${
                  weather.kpStatus === 'STORM'
                    ? 'text-rose-400'
                    : weather.kpStatus === 'MODERATE'
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                }`}
              >
                {weather.kpIndex.toFixed(1)}
              </span>
              {weather.donkiVerified && (
                <span
                  title="NASA DONKI Space Weather Verified"
                  className="hidden 2xl:inline-flex items-center gap-0.5 text-emerald-300"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>DONKI</span>
                </span>
              )}
            </div>
          )}

          <span className="h-3.5 w-px bg-cyan-500/20 shrink-0" aria-hidden="true" />

          <div className="flex items-center gap-1 shrink-0">
            {isHistorical && historicalReplay ? (
              historicalReplay.sarSwathIlluminated ? (
                <>
                  <span className="text-slate-400">SAR:</span>
                  <span className="text-cyan-300 font-semibold">ACTIVE</span>
                </>
              ) : (
                <>
                  <span className="text-slate-400">SAR:</span>
                  <span className="text-amber-300 font-semibold tabular-nums">
                    {formatCountdown(historicalReplay.sarPassCountdownSeconds)}
                  </span>
                </>
              )
            ) : (
              <>
                <span className="text-slate-400">SAR:</span>
                <span className="text-amber-300 font-semibold tabular-nums">
                  {formatCountdown(nextSatellitePass?.nextPassSeconds ?? 4 * 3600 + 18 * 60)}
                </span>
              </>
            )}
          </div>
          </div>
        )}

        {/* Zone 3: Feeds Diagnostics, Operational Mode, Alerts & Minimize */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isForensicStandalone && (
            <button
              type="button"
              onClick={() => {
                setDiagnosticsOpen((v) => !v);
                setScenarioMenuOpen(false);
              }}
              className={`h-8 px-1.5 xl:px-2 text-[9.5px] xl:text-[10px] font-mono font-semibold rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                diagnosticsOpen
                  ? 'bg-[#22D3EE]/25 border-[#22D3EE]/60 text-cyan-100'
                  : onlineFeedsCount >= 6
                    ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/25'
                    : 'bg-[#F59E0B]/15 border-[#F59E0B]/45 text-amber-200 hover:bg-[#F59E0B]/25'
              }`}
            >
              <Activity className="w-3 h-3 shrink-0" />
              <span className="hidden 2xl:inline">
                LIVE FEEDS: {onlineFeedsCount}/{totalFeedsCount}
              </span>
              <span className="2xl:hidden">
                {onlineFeedsCount}/{totalFeedsCount}
              </span>
            </button>
          )}

          <div
            role="group"
            aria-label="Operational Mode"
            className="h-8 flex items-center bg-[#040812]/85 border border-cyan-500/20 rounded p-0.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeMode('surveillance')}
              className={`h-full px-1.5 xl:px-2 text-[9.5px] xl:text-[10px] font-medium rounded-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                hudMode === 'surveillance'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Radio className="w-3 h-3 shrink-0" />
              <span className="hidden xl:inline">Coastal Surveillance</span>
              <span className="xl:hidden">Surveillance</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMode('forensic')}
              className={`h-full px-1.5 xl:px-2 text-[9.5px] xl:text-[10px] font-medium rounded-xs flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                hudMode === 'forensic'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Microscope className="w-3 h-3 shrink-0" />
              <span className="hidden xl:inline">Forensic Case Lab</span>
              <span className="xl:hidden">Forensic</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setDiagnosticsOpen(false);
              setScenarioMenuOpen(false);
              onToggleAlertsDrawer();
            }}
            title="Open Tactical >30m Dark Vessel Notification Log"
            className={`h-8 px-1.5 xl:px-2 text-[9.5px] xl:text-[10px] font-mono font-semibold rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              alertsOpen
                ? 'bg-[#22D3EE]/25 border-[#22D3EE]/60 text-cyan-100'
                : unreadAlertsCount > 0
                  ? 'bg-red-500/20 border-red-500/70 text-red-200 hover:bg-red-500/30'
                  : alertsCount > 0
                    ? 'bg-[#F59E0B]/15 border-[#F59E0B]/50 text-amber-200 hover:bg-[#F59E0B]/25'
                    : 'bg-[#101C28]/80 border-slate-700/70 text-slate-300 hover:border-[#22D3EE]/40 hover:text-[#22D3EE]'
            }`}
          >
            <Bell className="w-3 h-3 shrink-0" />
            <span className="hidden xl:inline">ALERTS</span>
            <span
              className={`px-1 rounded-xs text-[9px] font-bold tabular-nums ${
                unreadAlertsCount > 0
                  ? 'bg-red-500 text-white'
                  : alertsCount > 0
                    ? 'bg-[#F59E0B]/25 text-[#F59E0B]'
                    : 'bg-slate-800 text-slate-400'
              }`}
            >
              {unreadAlertsCount > 0 ? unreadAlertsCount : alertsCount}
            </span>
          </button>

          <button
            type="button"
            onClick={handleMinimizeToggle}
            className="h-8 px-1.5 xl:px-2 text-[9.5px] xl:text-[10px] font-mono font-medium rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 bg-slate-900/70 border-slate-700/70 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200 cursor-pointer"
          >
            <EyeOff className="w-3 h-3 shrink-0" />
            <span>MINIMIZE</span>
          </button>
        </div>
      </header>

      {/* Scenario Selector Floating Popover (rendered outside header so header overflow-hidden never clips it) */}
      {scenarioMenuOpen && (
        <div
          ref={scenarioMenuRef}
          role="listbox"
          aria-label="Operational Scenario Selector"
          className="fixed top-[4.25rem] left-3 z-[1200] w-[29rem] max-w-[92vw] max-h-[calc(100vh-6rem)] overflow-y-auto hud-scroll hud-popover rounded-md p-2 space-y-1"
        >
          <div className="px-2.5 py-1.5 border-b border-cyan-500/20 flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span className="text-cyan-300 font-semibold tracking-wider">
              ORBITAL SCENARIO &amp; HISTORICAL ARCHIVE
            </span>
            <span>NASA ASF + OPEN-METEO</span>
          </div>

          {SCENARIO_OPTIONS.map((opt) => {
            const isSelected = opt.id === activeScenarioId;
            const isLiveOpt = opt.id === 'live';
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelectScenario(opt.id);
                  setScenarioMenuOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 rounded-xs border transition-colors flex items-start justify-between gap-2 ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-100'
                    : 'bg-[#040812]/80 border-transparent hover:border-cyan-500/30 hover:bg-cyan-500/10 text-slate-200'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {isLiveOpt ? (
                    <Radio className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <History className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-semibold truncate">
                      {opt.label}
                    </div>
                    {opt.coordsLabel ? (
                      <div className="text-[9.5px] font-mono text-slate-400 mt-0.5">
                        {opt.coordsLabel} · 24h SAR + Archive Weather Replay
                      </div>
                    ) : (
                      <div className="text-[9.5px] font-mono text-emerald-300/90 mt-0.5">
                        Live AISStream WebSocket + NORAD SGP4 + NASA ASF
                      </div>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-cyan-300 shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Transparent Live Feeds Diagnostic Drawer */}
      {diagnosticsOpen && (
        <div
          role="dialog"
          aria-label="Live Feeds Diagnostic Drawer"
          className="fixed top-[4.5rem] right-3 z-[1200] w-[28rem] max-w-[94vw] hud-popover rounded-md p-4 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
            <div>
              <h2 className="text-xs font-mono font-semibold text-slate-100 uppercase">
                Live Data Feeds Diagnostics ({onlineFeedsCount}/{totalFeedsCount} Online)
              </h2>
              <p className="text-[10.5px] text-slate-400 mt-0.5">
                Real-time HTTP verification &amp; graceful fallback telemetry
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onResyncFeeds}
                title="Re-sync all live feeds"
                className="px-2 py-1 text-[10px] font-mono rounded border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/20 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>SYNC</span>
              </button>
              <button
                type="button"
                onClick={() => setDiagnosticsOpen(false)}
                aria-label="Close Diagnostics Drawer"
                className="p-1 rounded text-slate-400 hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto hud-scroll pr-1">
            {feedDiagnostics.map((feed) => {
              const isOk = feed.status === '200 OK';
              return (
                <div
                  key={feed.id}
                  className="bg-[#040812]/85 border border-slate-800 rounded p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold text-slate-100">
                      {feed.label}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-xs text-[9.5px] font-mono font-bold border ${
                        isOk
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                      }`}
                    >
                      {feed.status}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    {feed.endpoint}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono pt-1 border-t border-slate-800/80">
                    <span className="text-cyan-200 truncate">{feed.rawSummary}</span>
                    <span className="text-slate-500 shrink-0">
                      {feed.lastSyncUtc.slice(11, 19)}Z
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </>
  );
};
