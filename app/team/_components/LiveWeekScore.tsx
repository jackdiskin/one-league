'use client';

import { useMemo } from 'react';
import { useLiveStats } from '@/hooks/useLiveStats';
import type { RosterPlayer } from './RosterList';

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
    <div style={{
      borderRadius: 20,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #064e3b 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      overflow: 'hidden',
    }}>
      {/* Top band */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            Week {currentWeek}
          </span>
          {anyLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 9, fontWeight: 800, color: '#fff',
              background: '#ef4444', borderRadius: 20, padding: '2px 8px',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: '#fff',
                display: 'inline-block',
                animation: 'pulse 1s infinite',
              }} />
              Live
            </span>
          )}
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
          {anyLive ? 'Updating in real time' : anyScore ? 'Week finalized' : 'Awaiting kickoff'}
        </span>
      </div>

      {/* Score hero — current week only */}
      <div style={{ padding: '18px 20px 16px', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <span style={{
          fontSize: 52, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
          color: anyLive ? '#34d399' : anyScore ? '#e2e8f0' : 'rgba(255,255,255,0.2)',
          transition: 'color 0.4s',
        }}>
          {weekTotal.toFixed(1)}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 6 }}>
          pts this week
        </span>
      </div>

      {/* Per-player breakdown */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 0,
      }}>
        {players.map((p, i) => (
          <div key={p.id} style={{
            padding: '9px 14px',
            borderRight: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {p.full_name.split(' ').pop()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b' }}>{p.position}</span>
                {p.isLive ? (
                  <span style={{ fontSize: 8, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.1em' }}>● live</span>
                ) : p.pts > 0 ? (
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#64748b' }}>✓ final</span>
                ) : (
                  <span style={{ fontSize: 8, color: '#334155' }}>—</span>
                )}
              </div>
            </div>
            <span style={{
              fontSize: 13, fontWeight: 800,
              color: p.isLive ? '#34d399' : p.pts > 0 ? 'rgba(255,255,255,0.7)' : '#334155',
              flexShrink: 0,
              transition: 'color 0.3s',
            }}>
              {p.pts > 0 ? Number(p.pts).toFixed(1) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
