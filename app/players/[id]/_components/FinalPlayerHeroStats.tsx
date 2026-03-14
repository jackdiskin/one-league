'use client';

import { formatPoints } from '@/lib/format';
import type { StatCol } from './WeeklyStatsTable';

interface Props {
  position: string;
  statCols: StatCol[];
  score: {
    fantasy_points: number;
    field_goals_made: number;
    extra_points_made: number;
    [key: string]: number;
  };
}

/**
 * Displayed on the player hero card after a game has been finalized —
 * same visual layout as LivePlayerHeroStats but with a "FINAL" badge
 * and static data from player_weekly_scores instead of a live WebSocket.
 */
export default function FinalPlayerHeroStats({ position, statCols, score }: Props) {
  const visibleCols = statCols.filter((c) => (score[c.key] ?? 0) > 0);

  return (
    <div style={{
      marginTop: 20,
      paddingTop: 18,
      borderTop: '1px solid #f1f5f9',
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap',
    }}>
      {/* FINAL badge + points */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.28)',
          fontSize: 9, fontWeight: 800, color: '#475569',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Final
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Fantasy pts
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {formatPoints(score.fantasy_points)}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

      {/* Stat grid */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {position === 'K' ? (
          <>
            {score.field_goals_made > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>FG Made</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{score.field_goals_made}</div>
              </div>
            )}
            {score.extra_points_made > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>XP</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{score.extra_points_made}</div>
              </div>
            )}
          </>
        ) : (
          visibleCols.map((c) => {
            const val = score[c.key] ?? 0;
            const isTd  = c.key.endsWith('_tds');
            const isNeg = c.key === 'interceptions_thrown' || c.key === 'fumbles_lost';
            return (
              <div key={c.key}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {c.label}
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: isTd ? '#d97706' : isNeg ? '#e11d48' : '#0f172a',
                }}>
                  {val}
                </div>
              </div>
            );
          })
        )}
        {visibleCols.length === 0 && position !== 'K' && (
          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No stats recorded</div>
        )}
      </div>
    </div>
  );
}
