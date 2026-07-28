'use client';

import { useEffect, useRef, useState } from 'react';
import { formatPoints, formatPrice } from '@/lib/format';

// Mirror of StandingRow from the page — passed in as initialStandings
export interface StandingRow {
  rank:            number;
  fantasy_team_id: number;
  team_name:       string;
  user_name:       string;
  user_id:         string;
  total_points:    number;
  budget_remaining:number;
  roster_value:    number;
  last_week_points:number;
  trade_count:     number;
}

interface LiveTeamScore {
  teamId:   number;
  teamName: string;
  weekPts:  number;
  hasLive:  boolean;
}

interface LiveResponse {
  week:           number;
  season:         number;
  isAnythingLive: boolean;
  teams:          LiveTeamScore[];
}

interface Props {
  leagueId:        number;
  currentWeek:     number;
  initialStandings:StandingRow[];
  userId:          string;
  leaderPoints:    number;
}

const POLL_MS = 12_000;

export default function LiveStandings({
  leagueId, currentWeek, initialStandings, userId, leaderPoints,
}: Props) {
  const [liveScores,      setLiveScores]      = useState<Map<number, LiveTeamScore>>(new Map());
  const [isAnythingLive,  setIsAnythingLive]  = useState(false);
  const [displayWeek,     setDisplayWeek]     = useState(currentWeek);
  const [lastUpdated,     setLastUpdated]     = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLive() {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/live-week-scores`, { cache: 'no-store' });
      if (!res.ok) return;
      const data: LiveResponse = await res.json();
      const map = new Map<number, LiveTeamScore>();
      for (const t of data.teams) map.set(t.teamId, t);
      setLiveScores(map);
      setIsAnythingLive(data.isAnythingLive);
      setDisplayWeek(data.week);
      setLastUpdated(new Date());
    } catch {
      // keep showing stale data
    }
  }

  useEffect(() => {
    fetchLive();
    timerRef.current = setInterval(fetchLive, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  // Merge: season standings + live current-week scores, re-rank by combined total
  const merged = initialStandings.map(s => {
    const live         = liveScores.get(s.fantasy_team_id);
    const weekPts      = live?.weekPts ?? Number(s.last_week_points);
    const hasLive      = live?.hasLive ?? false;
    const combinedPts  = Number(s.total_points) + weekPts;
    return { ...s, weekPts, hasLive, combinedPts };
  });

  // Re-sort and re-rank by combined total while we have live data
  const rows = [...merged]
    .sort((a, b) => b.combinedPts - a.combinedPts || b.roster_value - a.roster_value)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const liveLeaderPts = rows[0]?.combinedPts ?? leaderPoints;
  const anyWeekScore  = rows.some(r => r.weekPts > 0);

  return (
    <div style={{
      borderRadius: 16, background: '#fff',
      border: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '13px 18px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Standings
          </h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
            Season totals · sorted by points
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isAnythingLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9, fontWeight: 800, color: '#fff',
              background: '#ef4444', borderRadius: 20, padding: '3px 10px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
              Live
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f8fafc',
            border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px',
          }}>
            {initialStandings.length} teams
          </span>
        </div>
      </div>

      {/* Column headers */}
      <div style={{ overflowX: 'auto' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '44px 1fr 80px 92px 84px 52px',
        padding: '7px 18px', background: '#fafafa', borderBottom: '1px solid #f1f5f9',
        fontSize: 9, fontWeight: 700, color: '#cbd5e1',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        minWidth: 520,
      }}>
        <span>#</span>
        <span>Team</span>
        <span style={{ textAlign: 'right' }}>Points</span>
        <span style={{ textAlign: 'right' }}>
          {anyWeekScore ? `Wk ${displayWeek}` : 'This Wk'}
          {isAnythingLive && (
            <span style={{ color: '#ef4444', marginLeft: 3 }}>●</span>
          )}
        </span>
        <span style={{ textAlign: 'right' }}>Value</span>
        <span style={{ textAlign: 'right' }}>Moves</span>
      </div>

      {rows.length === 0 && (
        <div style={{ padding: 18, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          No teams in this league yet.
        </div>
      )}

      {rows.map((row, i) => {
        const isMe  = row.user_id === userId;
        const gap   = liveLeaderPts > 0
          ? ((liveLeaderPts - row.combinedPts) / liveLeaderPts) * 100
          : 0;
        const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;

        return (
          <div key={row.fantasy_team_id} style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 80px 92px 84px 52px',
            alignItems: 'center', padding: '10px 18px',
            borderBottom: i < rows.length - 1 ? '1px solid #f8fafc' : 'none',
            background: isMe
              ? 'linear-gradient(90deg,rgba(16,185,129,0.06),rgba(240,253,250,0.3))'
              : 'transparent',
            minWidth: 520,
          }}>
            {/* Rank */}
            <div>
              {medal
                ? <span style={{ fontSize: 16 }}>{medal}</span>
                : (
                  <div style={{
                    width: 26, height: 26, borderRadius: 8,
                    background: isMe ? '#f0fdf4' : '#f8fafc',
                    border: `1px solid ${isMe ? '#bbf7d0' : '#e2e8f0'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800,
                    color: isMe ? '#059669' : '#94a3b8',
                  }}>
                    {row.rank}
                  </div>
                )
              }
            </div>

            {/* Team + progress bar */}
            <div style={{ paddingRight: 16, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: '#0f172a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {row.team_name}
                </span>
                {isMe && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: '#059669', background: '#d1fae5',
                    borderRadius: 20, padding: '1px 6px',
                    textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
                  }}>
                    You
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 5 }}>{row.user_name}</div>
              <div style={{ height: 3, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${Math.max(6, 100 - gap)}%`,
                  background: isMe
                    ? 'linear-gradient(90deg,#10b981,#059669)'
                    : 'linear-gradient(90deg,#94a3b8,#cbd5e1)',
                }} />
              </div>
            </div>

            {/* Season total (including current week) */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                {formatPoints(row.combinedPts)}
              </div>
              {row.weekPts > 0 && (
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 1 }}>
                  {formatPoints(row.total_points)} + {formatPoints(row.weekPts)}
                </div>
              )}
            </div>

            {/* Current week — live or finalized */}
            <div style={{
              textAlign: 'right',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
            }}>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: row.hasLive ? '#ef4444' : row.weekPts > 0 ? '#10b981' : '#94a3b8',
              }}>
                {row.weekPts > 0 ? formatPoints(row.weekPts) : '—'}
              </span>
              {row.hasLive && (
                <span style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  live
                </span>
              )}
            </div>

            {/* Roster value */}
            <div style={{ textAlign: 'right', fontSize: 11, color: '#475569' }}>
              {formatPrice(row.roster_value)}
            </div>

            {/* Moves */}
            <div style={{
              textAlign: 'right', fontSize: 12, fontWeight: 700,
              color: row.trade_count > 0 ? '#f59e0b' : '#cbd5e1',
            }}>
              {row.trade_count > 0 ? row.trade_count : '—'}
            </div>
          </div>
        );
      })}
      </div>

      {lastUpdated && (
        <div style={{
          padding: '6px 18px', borderTop: '1px solid #f8fafc',
          fontSize: 9, color: '#cbd5e1', textAlign: 'right',
        }}>
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      )}
    </div>
  );
}
