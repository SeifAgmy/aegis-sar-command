import React, { useEffect } from 'react';
import { ArrowRight, Compass, Radar, Radio, Waves } from 'lucide-react';

interface MissionBriefingModalProps {
  onEnter: () => void;
}

const BRIEFING_HIGHLIGHTS = [
  {
    id: 'sar',
    title: 'All-Weather SAR:',
    description: 'C-band radar detection via Bragg wave dampening.',
    icon: Radar,
    accent: 'cyan' as const,
  },
  {
    id: 'ais',
    title: 'AIS Correlation:',
    description: 'Cross-referencing transponder blackouts with satellite overpass timestamps.',
    icon: Radio,
    accent: 'amber' as const,
  },
  {
    id: 'drift',
    title: 'Hydrodynamic Drift:',
    description: 'Forecasting slick advection using real-time Open-Meteo wind vectors.',
    icon: Waves,
    accent: 'cyan' as const,
  },
];

export const MissionBriefingModal: React.FC<MissionBriefingModalProps> = ({ onEnter }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEnter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEnter]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-briefing-title"
      className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-[#060D14]/85 backdrop-blur-md"
    >
      <div className="w-full max-w-3xl rounded-md bg-[#060D14] border border-[#22D3EE]/35 shadow-[0_24px_64px_rgba(2,6,14,0.95)] overflow-hidden">
        {/* Top Calibration Strip */}
        <div className="px-6 py-3 bg-[#101C28] border-b border-slate-700/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-mono font-semibold tracking-wider text-[#F59E0B]">
            <Compass className="w-4 h-4 text-[#22D3EE] shrink-0" />
            <span>2026 NASA SPACE APPS CHALLENGE // DANCING WITH THE SARS</span>
          </div>
          <span className="hidden sm:inline text-[10px] font-mono text-slate-400 tracking-wider tabular-nums">
            SECTOR: 31.2°N 29.8°E - 32.4°E
          </span>
        </div>

        {/* Main Briefing Body */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-3">
            <h1
              id="mission-briefing-title"
              className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight text-slate-50 leading-snug text-balance"
            >
              Med-SAR Coastal Defense: Eastern Mediterranean Intelligence Platform
            </h1>
            <p className="text-sm sm:text-[15px] text-slate-300 leading-relaxed max-w-2xl">
              Fusing Synthetic Aperture Radar (SAR) backscatter, live AIS transponder streams, and
              historical wind drift modeling to detect illegal oil discharges and dark vessels off
              the Egyptian coast.
            </p>
          </div>

          {/* 3 Quick Operational Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {BRIEFING_HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              const isAmber = item.accent === 'amber';
              return (
                <div
                  key={item.id}
                  className="bg-[#101C28] border border-slate-700/60 rounded-md p-4 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center border ${
                        isAmber
                          ? 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#F59E0B]'
                          : 'bg-[#22D3EE]/10 border-[#22D3EE]/40 text-[#22D3EE]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <h2
                      className={`text-xs font-mono font-bold tracking-wide ${
                        isAmber ? 'text-[#F59E0B]' : 'text-[#22D3EE]'
                      }`}
                    >
                      {item.title}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>

          {/* Footer Action Row */}
          <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
              <span className="text-[#22D3EE]">LIVE STREAM</span>
              <span aria-hidden="true">/</span>
              <span className="text-[#F59E0B]">5 VERIFIED HISTORICAL INCIDENTS</span>
            </div>

            <button
              type="button"
              onClick={onEnter}
              autoFocus
              className="px-5 py-2.5 rounded bg-[#22D3EE] hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060D14] text-[#060D14] font-mono text-xs font-bold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
            >
              <span>ENTER ORBITAL COMMAND</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
