'use client';

import { useMemo } from 'react';
import { useLiveStats } from '@/hooks/useLiveStats';
import { formatPoints } from '@/lib/format';
import StatCard from '@/components/ui/StatCard';
import type { RosterPlayer } from './RosterList';

interface Props {
  roster:           RosterPlayer[];
  seasonBasePoints: number;   // fantasy_teams.total_points (completed prior weeks only)
}

/**
 * "Total Points" stat tile that includes live/current-week points in the total.
 * Replaces the static server-rendered tile so the season total stays current.
 */
export default function LiveTotalPointsTile({ roster, seasonBasePoints }: Props) {
  const playerIds = useMemo(
    () => roster.map(p => p.external_player_id).filter(Boolean) as string[],
    [roster],
  );
  const liveStats = useLiveStats(playerIds);

  // Bench points never count toward the score (only starters do — see
  // api/admin/scores and api/admin/finalize-games, which apply the same
  // roster_slot != 'BENCH' filter when computing the official total_points).
  const weekTotal = useMemo(() => {
    return roster
      .filter(p => p.roster_slot !== 'BENCH')
      .reduce((sum, p) => {
        const live = p.external_player_id ? liveStats.get(p.external_player_id) : undefined;
        const pts  = live
          ? Number(live.totals.fantasyPointsTotal)
          : Number(p.last_week_points ?? 0);
        return sum + pts;
      }, 0);
  }, [roster, liveStats]);

  const total   = Number(seasonBasePoints) + weekTotal;
  const anyLive = roster.some(p => p.roster_slot !== 'BENCH' && p.external_player_id && liveStats.has(p.external_player_id));

  return (
    <StatCard
      label="Total points"
      value={formatPoints(total)}
      sub={anyLive ? 'Season total · updating live' : 'Season total'}
      tone={anyLive ? 'accent' : 'default'}
    />
  );
}
