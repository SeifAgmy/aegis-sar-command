import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Compass,
  Crosshair,
  FileText,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { computeSarConfidenceAssessment } from '../services/surveillanceForensicsService';
import { DarkVesselAlert, WeatherState } from '../types/telemetry';

interface TacticalNotificationFeedProps {
  alerts: DarkVesselAlert[];
  weather?: WeatherState;
  drawerOpen: boolean;
  latestToastAlert: DarkVesselAlert | null;
  onCloseDrawer: () => void;
  onOpenDrawer: () => void;
  onDismissToast: (alertId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onAcknowledgeAll: () => void;
  onClearResolved: () => void;
  onLocateAlertVessel: (alert: DarkVesselAlert) => void;
  onExportAlertDossier?: (alert: DarkVesselAlert) => void;
}

type AlertFilter = 'all' | 'active' | 'unread';

export const TacticalNotificationFeed: React.FC<TacticalNotificationFeedProps> = ({
  alerts,
  weather,
  drawerOpen,
  latestToastAlert,
  onCloseDrawer,
  onOpenDrawer,
  onDismissToast,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onClearResolved,
  onLocateAlertVessel,
  onExportAlertDossier,
}) => {
  const [filter, setFilter] = useState<AlertFilter>('all');

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (filter === 'active') return a.active;
      if (filter === 'unread') return !a.acknowledged;
      return true;
    });
  }, [alerts, filter]);

  const activeCount = alerts.filter((a) => a.active).length;
  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  const resolveSarConfidence = (alert: DarkVesselAlert) =>
    alert.sarConfidence ??
    computeSarConfidenceAssessment(alert.localWindSpeedKts ?? weather?.windSpeedKts ?? 11, {
      hasAnomaly: true,
      isConfirmedDark: true,
      aisGapMinutes: alert.blackoutDurationMinutes,
      windDirectionDeg: weather?.windDirectionDeg,
    });

  const toastSarConfidence = latestToastAlert ? resolveSarConfidence(latestToastAlert) : null;

  return (
    <>
      {/* Live Auto-Dispatch Alert Ticker Toast when a vessel crosses > 30 minutes */}
      {latestToastAlert && !drawerOpen && toastSarConfidence && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed top-[4.5rem] left-1/2 -translate-x-1/2 z-[1060] w-[28.5rem] max-w-[92vw] rounded-md bg-[#060D14]/95 border border-[#F59E0B]/75 shadow-[0_14px_38px_rgba(245,158,11,0.2)] backdrop-blur-md p-3 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded bg-[#F59E0B]/15 border border-[#F59E0B]/60 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B]" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-mono font-bold tracking-wider text-[#F59E0B] uppercase">
                  AIS BLACKOUT THRESHOLD EXCEEDED (&gt;30M)
                </div>
                <div className="text-xs font-semibold text-slate-100 truncate">
                  {latestToastAlert.vesselName}{' '}
                  <span className="font-mono text-[10.5px] text-slate-400">
                    MMSI {latestToastAlert.mmsi}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismissToast(latestToastAlert.id)}
              aria-label="Dismiss alert toast"
              className="p-1 rounded text-slate-400 hover:text-slate-100 shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div
            className={`px-2 py-1 rounded border text-[9.5px] font-mono font-bold flex items-center gap-1.5 ${
              toastSarConfidence.tone === 'cyan'
                ? 'bg-[#22D3EE]/12 border-[#22D3EE]/50 text-[#22D3EE]'
                : 'bg-[#F59E0B]/14 border-[#F59E0B]/60 text-[#F59E0B]'
            }`}
          >
            {toastSarConfidence.tone === 'cyan' ? (
              <ShieldCheck className="w-3 h-3 shrink-0" />
            ) : (
              <ShieldAlert className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">{toastSarConfidence.badgeText}</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-[#101C28]/85 border border-slate-800 rounded p-2">
            <div>
              <div className="text-[8.5px] text-slate-400">BLACKOUT</div>
              <div className="text-[#F59E0B] font-bold tabular-nums">
                {latestToastAlert.blackoutDurationFormatted}
              </div>
            </div>
            <div>
              <div className="text-[8.5px] text-slate-400">LKP COORDS</div>
              <div className="text-[#22D3EE] font-semibold tabular-nums truncate">
                {latestToastAlert.lkpLat.toFixed(3)}°N, {latestToastAlert.lkpLon.toFixed(3)}°E
              </div>
            </div>
            <div>
              <div className="text-[8.5px] text-slate-400">EST. R_MAX</div>
              <div className="text-[#F59E0B] font-bold tabular-nums">
                {latestToastAlert.reachabilityRadiusKm.toFixed(1)} km
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
            <span className="text-slate-400 truncate">
              Triggered: {latestToastAlert.triggeredAtUtc.slice(0, 19).replace('T', ' ')}Z
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenDrawer}
                className="px-2 py-1 rounded border border-slate-700 text-slate-200 hover:border-[#22D3EE]/60 hover:text-[#22D3EE] transition-colors cursor-pointer"
              >
                LOG ({alerts.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  onLocateAlertVessel(latestToastAlert);
                  onDismissToast(latestToastAlert.id);
                }}
                className="px-2.5 py-1 rounded bg-[#22D3EE]/18 hover:bg-[#22D3EE]/28 border border-[#22D3EE]/65 text-cyan-100 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Crosshair className="w-3 h-3" />
                <span>LOCATE</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tactical Notification Feed Drawer */}
      {drawerOpen && (
        <aside
          role="dialog"
          aria-label="Tactical Dark Vessel Notification Feed"
          className="fixed top-[4.5rem] right-3 z-[1200] w-[26.5rem] max-w-[94vw] max-h-[calc(100vh-11.5rem)] hud-popover rounded-md flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#22D3EE]/20 bg-[#060D14]/95 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
                <h2 className="text-xs font-mono font-semibold text-slate-100 uppercase tracking-wider truncate">
                  Tactical Anomaly Alert Log
                </h2>
              </div>
              <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                30-Minute AIS Blackout Rule · {activeCount} active · {unreadCount} unread
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close Tactical Alert Log"
              className="p-1 rounded text-slate-400 hover:text-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter & Bulk Actions Bar */}
          <div className="px-3 py-2 border-b border-[#22D3EE]/15 bg-[#101C28]/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'all', label: `ALL (${alerts.length})` },
                  { id: 'active', label: `ACTIVE (${activeCount})` },
                  { id: 'unread', label: `UNREAD (${unreadCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`px-2 py-1 text-[9.5px] font-mono font-semibold rounded-xs border transition-colors cursor-pointer ${
                    filter === tab.id
                      ? 'bg-[#22D3EE]/20 border-[#22D3EE]/60 text-cyan-100'
                      : 'bg-[#060D14]/70 border-slate-700/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onAcknowledgeAll}
                  title="Mark all alerts acknowledged"
                  className="px-2 py-1 text-[9.5px] font-mono rounded-xs border border-slate-700 text-slate-300 hover:border-[#22D3EE]/50 hover:text-[#22D3EE] flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>ACK ALL</span>
                </button>
              )}
              {alerts.some((a) => !a.active) && (
                <button
                  type="button"
                  onClick={onClearResolved}
                  title="Clear resolved alerts"
                  className="p-1 text-slate-400 hover:text-[#F59E0B] rounded border border-slate-700/70 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Alert Entries */}
          <div className="flex-1 overflow-y-auto hud-scroll p-3 space-y-2.5 bg-[#060D14]/90">
            {filteredAlerts.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2 bg-[#101C28]/45 border border-slate-800 rounded-md">
                <Radar className="w-6 h-6 text-[#22D3EE] mx-auto" />
                <div className="text-xs font-mono font-semibold text-slate-200 uppercase">
                  No &gt;30m Dark Vessel Escalations
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Vessels with active AIS or short-term gaps under 30 minutes remain compliant with
                  predictive tracking envelopes. Any vessel silent past 30 minutes dispatches an
                  anomaly alert here automatically.
                </p>
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const sarConf = resolveSarConfidence(alert);
                return (
                  <article
                    key={alert.id}
                    className={`rounded-md p-3 border space-y-2 transition-colors ${
                      alert.active
                        ? alert.acknowledged
                          ? 'bg-[#101C28]/90 border-[#F59E0B]/45'
                          : 'bg-[#101C28] border-[#F59E0B]/75 shadow-[inset_0_0_14px_rgba(245,158,11,0.12)]'
                        : 'bg-[#101C28]/55 border-slate-700/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[9.5px] font-mono">
                      <span
                        className={`px-1.5 py-0.5 rounded-xs font-bold border ${
                          alert.active
                            ? 'bg-[#F59E0B]/15 border-[#F59E0B]/60 text-[#F59E0B]'
                            : 'bg-[#22D3EE]/15 border-[#22D3EE]/45 text-[#22D3EE]'
                        }`}
                      >
                        {alert.active ? 'FLAGGED DARK (>30M)' : 'AIS SIGNAL RESTORED'}
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {alert.triggeredAtUtc.slice(0, 19).replace('T', ' ')}Z
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[13px] font-semibold text-slate-100 truncate">
                        {alert.vesselName}
                      </h3>
                      <span className="text-[10.5px] font-mono text-[#22D3EE] shrink-0">
                        MMSI {alert.mmsi}
                      </span>
                    </div>

                    {/* SAR Look-Alike False-Positive Confidence Badge */}
                    <div
                      title={sarConf.explanation}
                      className={`px-2 py-1 rounded border text-[9.5px] font-mono font-bold flex items-center justify-between gap-1.5 ${
                        sarConf.tone === 'cyan'
                          ? 'bg-[#22D3EE]/12 border-[#22D3EE]/45 text-[#22D3EE]'
                          : 'bg-[#F59E0B]/14 border-[#F59E0B]/55 text-[#F59E0B]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        {sarConf.tone === 'cyan' ? (
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                        ) : (
                          <ShieldAlert className="w-3 h-3 shrink-0" />
                        )}
                        <span className="truncate">{sarConf.badgeText}</span>
                      </span>
                      <span className="text-[9px] text-slate-300 shrink-0 tabular-nums">
                        {sarConf.windSpeedKts} kt
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-[#060D14]/90 border border-slate-800 rounded p-2">
                      <div>
                        <div className="text-[8.5px] text-slate-400">BLACKOUT DUR.</div>
                        <div className="text-[#F59E0B] font-bold tabular-nums">
                          {alert.blackoutDurationFormatted}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8.5px] text-slate-400">LKP COORDS</div>
                        <div className="text-slate-100 font-semibold tabular-nums truncate">
                          {alert.lkpLat.toFixed(3)}°, {alert.lkpLon.toFixed(3)}°
                        </div>
                      </div>
                      <div>
                        <div className="text-[8.5px] text-slate-400">MAX R_MAX</div>
                        <div className="text-[#F59E0B] font-bold tabular-nums">
                          {alert.reachabilityRadiusKm.toFixed(1)} km
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1 text-[10px] font-mono">
                      <span className="text-slate-400 flex items-center gap-1 truncate">
                        <Compass className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>
                          V_max {alert.maxSpeedKts} kts · {alert.flag} ·{' '}
                          {alert.isSimulated ? 'SIM' : 'LIVE'}
                        </span>
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!alert.acknowledged && (
                          <button
                            type="button"
                            onClick={() => onAcknowledgeAlert(alert.id)}
                            className="px-2 py-1 rounded border border-slate-600 text-slate-200 hover:border-[#22D3EE]/60 hover:text-[#22D3EE] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>ACK</span>
                          </button>
                        )}
                        {onExportAlertDossier && (
                          <button
                            type="button"
                            onClick={() => onExportAlertDossier(alert)}
                            className="px-2 py-1 rounded border border-[#F59E0B]/55 bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 text-amber-100 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            <span>DOSSIER</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onLocateAlertVessel(alert)}
                          className="px-2.5 py-1 rounded bg-[#22D3EE]/15 hover:bg-[#22D3EE]/25 border border-[#22D3EE]/55 text-cyan-100 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Crosshair className="w-3 h-3" />
                          <span>LOCATE</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>
      )}
    </>
  );
};

