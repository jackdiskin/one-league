'use client';

import { useMemo } from 'react';
import { useLiveStats } from '@/hooks/useLiveStats';
import { formatPlayerName } from '@/lib/format';
import type { RosterPlayer } from '@/app/team/_components/RosterList';

interface Props {
  roster:      RosterPlayer[];
  currentWeek: number;
}

/**
 * Displays the running current-week fantasy total for this team.
 *
 * Per-player priority:
 *   1. Live WebSocket data (game in progress) → always most current
 *   2. last_week_points from DB (game finished and written to player_weekly_scores)
 *   3. 0 (bye / game not started yet)
 *
 * Season total (base + this week) is shown in the LiveTotalPointsTile stat card.
 */
export default function LiveWeekScore({ roster, currentWeek }: Props) {
  const playerIds = useMemo(
    () => roster.map(p => p.external_player_id).filter(Boolean) as string[],
    [roster],
  );

  const liveStats = useLiveStats(playerIds);

  const players = useMemo(() => {
    return roster.map(p => {
      const live     = p.external_player_id ? liveStats.get(p.external_player_id) : undefined;
      const isLive   = !!live;
      const pts      = live
        ? Number(live.totals.fantasyPointsTotal)
        : Number((p.last_week_points ?? 0));
      return { ...p, pts, isLive };
    });
  }, [roster, liveStats]);

  const weekTotal = players.reduce((s, p) => s + p.pts, 0);
  const anyLive   = players.some(p => p.isLive);
  const anyScore = players.some(p => p.pts > 0);

  return (
    <div className="overflow-hidden rounded-card bg-ink">
      {/* Top band */}
      <div className="flex items-center justify-between gap-3 border-b border-turf-chalk/10 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-eyebrow uppercase text-emerald">Week {currentWeek}</span>
          {anyLive && (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-emerald px-2 py-0.5">
              <span
                aria-hidden="true"
                className="motion-safe:animate-live-dot inline-block h-1.5 w-1.5 rounded-pill bg-surface"
              />
              <span className="text-eyebrow uppercase text-surface">Live</span>
            </span>
          )}
        </div>
        <span className="text-label text-turf-chalk/50">
          {anyLive ? 'Updating in real time' : anyScore ? 'Week final' : 'Awaiting kickoff'}
        </span>
      </div>

      {/* Score hero */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 px-5 pb-4 pt-4">
        <span className={[
          'font-mono tabular-nums text-display transition-colors duration-300',
          anyLive ? 'text-emerald' : anyScore ? 'text-turf-chalk' : 'text-turf-chalk/60',
        ].join(' ')}>
          {weekTotal.toFixed(1)}
        </span>
        <span className="text-label text-turf-chalk/60">points this week</span>
      </div>

      {/* Per-player breakdown */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] border-t border-turf-chalk/10">
        {players.map(p => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 border-b border-r border-turf-chalk/5 px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-label text-turf-chalk/85">
                {formatPlayerName(p.full_name)}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-eyebrow text-turf-chalk/45">
                <span>{p.position}</span>
                {p.isLive ? (
                  <span className="uppercase text-emerald">Live</span>
                ) : p.pts > 0 ? (
                  <span className="uppercase">Final</span>
                ) : (
                  <span className="uppercase">Not started</span>
                )}
              </p>
            </div>
            <span className={[
              'shrink-0 font-mono tabular-nums text-body transition-colors duration-300',
              p.isLive ? 'text-emerald' : p.pts > 0 ? 'text-turf-chalk/80' : 'text-turf-chalk/40',
            ].join(' ')}>
              {p.pts > 0 ? Number(p.pts).toFixed(1) : '0.0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
