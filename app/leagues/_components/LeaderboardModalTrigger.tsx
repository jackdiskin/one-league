'use client';

import { useState } from 'react';
import { formatPoints } from '@/lib/format';

export interface StandingRow {
  rank: number;
  team_name: string;
  user_name: string;
  total_points: number;
  user_id: string;
}

function medalFor(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardModalTrigger({ standings, myRank, userId }: {
  standings: StandingRow[];
  myRank: number | null;
  userId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full w-full text-left cursor-pointer transition-all hover:ring-slate-300 hover:shadow-md"
        style={{ border: 'none' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs">🏆</span>
          <h3 className="font-semibold text-slate-900">Global Rank</h3>
        </div>

        {myRank ? (
          <>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a', lineHeight: 1 }}>
              {myRank}
            </div>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              of {standings.length} manager{standings.length === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Not ranked yet</p>
        )}

        <div style={{
          marginTop: 14, fontSize: 11.5, fontWeight: 700, color: '#059669',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          View full standings
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(7,10,22,0.65)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🏆</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Global Rank</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  width: 26, height: 26, borderRadius: 8, border: 'none',
                  background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Standings list */}
            <div style={{ overflowY: 'auto', padding: '10px 12px' }}>
              {standings.map(row => {
                const isMe = row.user_id === userId;
                const medal = medalFor(row.rank);
                return (
                  <div
                    key={row.user_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 12, marginBottom: 4,
                      background: isMe ? '#f0fdf4' : 'transparent',
                      border: isMe ? '1.5px solid #6ee7b7' : '1.5px solid transparent',
                    }}
                  >
                    <span style={{ width: 26, textAlign: 'center', flexShrink: 0, fontSize: medal ? 16 : 13, fontWeight: 800, color: isMe ? '#059669' : '#94a3b8' }}>
                      {medal ?? row.rank}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: isMe ? 800 : 700,
                          color: isMe ? '#065f46' : '#0f172a',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {row.team_name}
                        </span>
                        {isMe && (
                          <span style={{
                            fontSize: 8.5, fontWeight: 800, color: '#059669', background: '#d1fae5',
                            borderRadius: 20, padding: '1px 6px', letterSpacing: '0.04em',
                          }}>
                            YOU
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.user_name}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 800, color: isMe ? '#059669' : '#0f172a',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>
                      {formatPoints(row.total_points)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
