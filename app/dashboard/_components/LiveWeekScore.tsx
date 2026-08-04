'use client';

import { useMemo, useState } from 'react';
import { useLiveStats, getLiveStatLine } from '@/hooks/useLiveStats';
import LiveScorePopup from './LiveScorePopup';
import type { RosterPlayer } from '@/app/team/_components/RosterList';

export interface LiveGameState {
  event_id:        string;
  game_state:       string; // 'pre' | 'in' | 'post'
  game_clock:       string | null;
  period_num:       number | null;
  home_team_abbr:   string;
  away_team_abbr:   string;
  home_score:       number;
  away_score:       number;
}

interface Props {
  roster:          RosterPlayer[];
  currentWeek:     number;
  projectedPoints: number;
  gameStates:      LiveGameState[];
}

function periodLabel(n: number | null): string {
  if (n == null) return '';
  if (n >= 5) return 'OT';
  return `Q${n}`;
}

/** "NE 14 - 7 SEA" plus a separate clock line — null once a player's team
 *  isn't in any of this week's tracked games yet (bye, or data not in). */
function gameLineFor(teamCode: string, byTeam: Map<string, LiveGameState>): { score: string; clock: string } | null {
  const g = byTeam.get(teamCode);
  if (!g) return null;
  const score = `${g.away_team_abbr} ${g.away_score} - ${g.home_score} ${g.home_team_abbr}`;
  if (g.game_state === 'post') return { score, clock: 'Final' };
  if (g.game_state === 'in')   return { score, clock: [periodLabel(g.period_num), g.game_clock].filter(Boolean).join(' ') || 'In progress' };
  return { score, clock: 'Not started' };
}

/**
 * Compact clickable bar showing the running current-week fantasy total for
 * this team — click it to open the full live breakdown (LiveScorePopup).
 *
 * Per-player point priority:
 *   1. Live WebSocket data (game in progress) → always most current
 *   2. last_week_points from DB (game finished and written to player_weekly_scores)
 *   3. 0 (bye / game not started yet)
 *
 * Season total (base + this week) is shown in the LiveTotalPointsTile stat card.
 */
export default function LiveWeekScore({ roster, currentWeek, projectedPoints, gameStates }: Props) {
  const [open, setOpen] = useState(false);

  const playerIds = useMemo(
    () => roster.map(p => p.external_player_id).filter(Boolean) as string[],
    [roster],
  );

  const liveStats = useLiveStats(playerIds);

  const gameStateByTeam = useMemo(() => {
    const m = new Map<string, LiveGameState>();
    for (const g of gameStates) {
      m.set(g.home_team_abbr, g);
      m.set(g.away_team_abbr, g);
    }
    return m;
  }, [gameStates]);

  const players = useMemo(() => {
    return roster.map(p => {
      const live   = p.external_player_id ? liveStats.get(p.external_player_id) : undefined;
      const isLive = !!live;
      const pts    = live ? Number(live.totals.fantasyPointsTotal) : Number(p.last_week_points ?? 0);
      const statLine = p.external_player_id ? getLiveStatLine(liveStats, p.external_player_id) : '';
      const gameLine = gameLineFor(p.team_code, gameStateByTeam);
      return { ...p, pts, isLive, statLine, gameLine };
    });
  }, [roster, liveStats, gameStateByTeam]);

  const weekTotal = players.reduce((s, p) => s + p.pts, 0);
  const anyLive   = players.some(p => p.isLive);
  const anyScore  = players.some(p => p.pts > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full overflow-hidden rounded-card bg-ink text-left transition-opacity duration-150 ease-out-quart hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
      >
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
            {anyLive ? 'Tap for live breakdown' : anyScore ? 'Week final · tap for breakdown' : 'Awaiting kickoff'}
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
      </button>

      {open && (
        <LiveScorePopup
          currentWeek={currentWeek}
          total={weekTotal}
          projectedPoints={projectedPoints}
          anyLive={anyLive}
          players={players}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
