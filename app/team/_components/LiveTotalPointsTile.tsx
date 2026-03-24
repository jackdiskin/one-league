'use client';

import { useMemo } from 'react';
import { useLiveStats } from '@/hooks/useLiveStats';
import { formatPoints } from '@/lib/format';
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
  const espnIds = useMemo(
    () => roster.map(p => p.espn_athlete_id).filter(Boolean) as string[],
    [roster],
  );
  const liveStats = useLiveStats(espnIds);

  const weekTotal = useMemo(() => {
    return roster.reduce((sum, p) => {
      const live = p.espn_athlete_id ? liveStats.get(p.espn_athlete_id) : undefined;
      const pts  = live
        ? Number(live.totals.fantasyPointsTotal)
        : Number(p.last_week_points ?? 0);
      return sum + pts;
    }, 0);
  }, [roster, liveStats]);

  const total   = Number(seasonBasePoints) + weekTotal;
  const anyLive = espnIds.some(id => liveStats.has(id));

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm" style={{ padding: '14px 16px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        Total Points
      </p>
      <p style={{
        fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1,
        color: '#0f172a',
      }}>
        {formatPoints(total)}
      </p>
      <p style={{ fontSize: 10, color: anyLive ? '#10b981' : '#94a3b8', marginTop: 4 }}>
        {anyLive ? 'season total · live' : 'season total'}
      </p>
    </div>
  );
}
