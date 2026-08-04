'use client';

// Full live-scoring breakdown for the team — opened by tapping the black
// score bar (LiveWeekScore). Dark throughout: this is live/market-state
// data, same ruling that keeps the bar itself dark (see ProjectedPointsPanel).

import Image from 'next/image';
import { formatPlayerName, formatPoints, formatWeekLong } from '@/lib/format';
import TeamLogo from '@/components/TeamLogo';
import type { RosterPlayer } from '@/app/team/_components/RosterList';

export interface LiveScorePlayer extends RosterPlayer {
  pts:      number;
  isLive:   boolean;
  statLine: string;
  gameLine: { score: string; clock: string } | null;
}

export default function LiveScorePopup({
  currentWeek, total, projectedPoints, anyLive, players, onClose,
}: {
  currentWeek:     number;
  total:           number;
  projectedPoints: number;
  anyLive:         boolean;
  players:         LiveScorePlayer[];
  onClose:         () => void;
}) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`${formatWeekLong(currentWeek)} live scoring`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6 backdrop-blur-sm"
    >
      <div className="motion-safe:animate-modal-in flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-card border border-turf-chalk/10 bg-ink shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-turf-chalk/10 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-eyebrow uppercase text-emerald">{formatWeekLong(currentWeek)}</span>
            {anyLive && (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-emerald px-2 py-0.5">
                <span aria-hidden="true" className="motion-safe:animate-live-dot inline-block h-1.5 w-1.5 rounded-pill bg-surface" />
                <span className="text-eyebrow uppercase text-surface">Live</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-turf-chalk/50 transition-colors duration-150 ease-out-quart hover:bg-turf-chalk/10 hover:text-turf-chalk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Total, bold — projected, smaller and unbold, right below it */}
        <div className="shrink-0 px-6 pb-4 pt-4">
          <p className={[
            'font-mono tabular-nums text-display font-bold',
            anyLive ? 'text-emerald' : 'text-turf-chalk',
          ].join(' ')}>
            {formatPoints(total)}
          </p>
          <p className="mt-0.5 font-mono text-body font-normal tabular-nums text-turf-chalk/55">
            Projected {formatPoints(projectedPoints)}
          </p>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto border-t border-turf-chalk/10">
          {players.map(p => (
            <div key={p.id} className="flex items-start gap-3 border-b border-turf-chalk/5 px-6 py-3.5">
              {p.headshot_url ? (
                <Image
                  src={p.headshot_url} alt="" width={40} height={40} unoptimized
                  className="h-10 w-10 shrink-0 object-contain"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-turf-chalk/10 text-label text-turf-chalk/70">
                  {p.full_name.charAt(0)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-label font-medium text-turf-chalk">
                    {formatPlayerName(p.full_name)}
                  </p>
                  <span className={[
                    'shrink-0 font-mono tabular-nums text-label',
                    p.isLive ? 'text-emerald' : p.pts > 0 ? 'text-turf-chalk/85' : 'text-turf-chalk/40',
                  ].join(' ')}>
                    {formatPoints(p.pts)}
                  </span>
                </div>

                <div className="mt-0.5 flex items-center gap-1.5 text-eyebrow text-turf-chalk/45">
                  <span>{p.position}</span>
                  <span>·</span>
                  <TeamLogo code={p.team_code} size={12} />
                  <span>{p.team_code}</span>
                  {p.isLive && <span className="uppercase text-emerald">· Live</span>}
                </div>

                {p.statLine && (
                  <p className="mt-1 text-eyebrow text-turf-chalk/60">{p.statLine}</p>
                )}

                {p.gameLine && (
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-eyebrow tracking-normal tabular-nums text-turf-chalk/40">
                    <span>{p.gameLine.score}</span>
                    <span>·</span>
                    <span>{p.gameLine.clock}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
