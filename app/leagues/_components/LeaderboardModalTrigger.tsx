'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { formatPoints } from '@/lib/format';

export interface StandingRow {
  rank: number;
  team_name: string;
  user_name: string;
  total_points: number;
  user_id: string;
}

// Top three are marked with an emerald rank chip rather than medal emoji.
function isPodium(rank: number): boolean {
  return rank <= 3;
}

/**
 * Pre-season everyone sits on 0 points, so RANK() returns 1 for the whole
 * table and every row would light up as a podium finish. A podium marker only
 * means something once the standings actually separate.
 */
function hasOrdering(standings: StandingRow[]): boolean {
  return standings.length > 1 && standings[0].rank !== standings[standings.length - 1].rank;
}

export default function LeaderboardModalTrigger({ standings, myRank, userId }: {
  standings: StandingRow[];
  myRank: number | null;
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const ranked = hasOrdering(standings);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'h-full w-full rounded-card border border-line bg-surface p-5 text-left',
          'transition-colors duration-150 ease-out-quart hover:border-line-strong',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
        ].join(' ')}
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-emerald-tint text-emerald">
            <Icon name="trophy" size={13} />
          </span>
          <h3 className="text-label text-ink">Global rank</h3>
        </div>

        {myRank ? (
          <>
            <p className="font-mono tabular-nums text-display text-ink">{myRank}</p>
            <p className="mt-1 text-label text-ink-3">
              of {standings.length} manager{standings.length === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          <p className="text-label text-ink-3">Not ranked yet</p>
        )}

        {/* Styled as a link, but the whole card is the control — see the button wrapper. */}
        <span className="mt-4 flex items-center gap-1 text-label text-emerald underline underline-offset-2">
          View full standings
          <Icon name="arrowRight" size={12} />
        </span>
      </button>

      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="Global standings"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
        >
          <div className="motion-safe:animate-modal-in flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-card border border-line bg-surface shadow-xl">

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                <Icon name="trophy" size={16} className="text-emerald" />
                <h2 className="text-section text-ink">Global rank</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close standings"
                className="flex h-7 w-7 items-center justify-center rounded-control text-ink-3 transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto p-3">
              {standings.map(row => {
                const isMe = row.user_id === userId;
                const podium = ranked && isPodium(row.rank);
                return (
                  <div
                    key={row.user_id}
                    className={[
                      'flex items-center gap-3 rounded-slot px-3 py-2.5',
                      isMe ? 'bg-emerald-tint ring-1 ring-emerald-line' : '',
                    ].join(' ')}
                  >
                    <span className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-pill',
                      'font-mono tabular-nums text-label',
                      podium ? 'bg-emerald text-surface' : isMe ? 'text-emerald' : 'text-ink-3',
                    ].join(' ')}>
                      {row.rank}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={['truncate text-label', isMe ? 'text-emerald' : 'text-ink'].join(' ')}>
                          {row.team_name}
                        </span>
                        {isMe && (
                          <span className="shrink-0 rounded-pill bg-emerald px-1.5 py-0.5 text-eyebrow uppercase text-surface">
                            You
                          </span>
                        )}
                      </div>
                      <p className="truncate text-eyebrow text-ink-3">{row.user_name}</p>
                    </div>

                    <span className={[
                      'shrink-0 font-mono tabular-nums text-label',
                      isMe ? 'text-emerald' : 'text-ink',
                    ].join(' ')}>
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
