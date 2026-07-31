'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/format';
import SectionHeader from '@/components/ui/SectionHeader';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';

interface League {
  id: number; name: string; season_year: number;
  salary_cap: number; member_count: number;
}

export default function DiscoverLeagues({ leagues }: { leagues: League[] }) {
  const [joined, setJoined]   = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<number | null>(null);

  async function handleJoin(leagueId: number) {
    setLoading(leagueId);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/join`, { method: 'POST' });
      if (res.ok) setJoined((prev) => new Set(prev).add(leagueId));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="h-full rounded-card border border-line bg-surface p-5">
      <SectionHeader title="Discover leagues" />

      {leagues.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="globe" size={18} />}
          title="No public leagues are open right now."
        />
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {leagues.map((league) => {
            const hasJoined = joined.has(league.id);
            const isLoading = loading === league.id;

            return (
              <div
                key={league.id}
                className="rounded-control border border-line bg-surface-sunken p-3 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:bg-surface"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-ink">{league.name}</p>
                    <p className="mt-0.5 text-label text-ink-3">
                      Cap <span className="font-mono tabular-nums">{formatPrice(league.salary_cap)}</span>
                      {' · '}
                      <span className="font-mono tabular-nums">{league.season_year}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleJoin(league.id)}
                    disabled={hasJoined || isLoading}
                    // A disabled control states its condition.
                    title={hasJoined ? `You're already in ${league.name}` : isLoading ? 'Joining…' : undefined}
                    className={[
                      'h-8 shrink-0 rounded-control px-3 text-label',
                      'transition-colors duration-150 ease-out-quart',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                      hasJoined || isLoading
                        ? 'cursor-not-allowed bg-surface-sunken text-ink-3'
                        : 'cursor-pointer bg-emerald-press text-surface hover:bg-emerald-hover active:bg-emerald-press',
                    ].join(' ')}
                  >
                    {isLoading ? 'Joining' : hasJoined ? 'Joined' : 'Join'}
                  </button>
                </div>
                <p className="mt-2.5 font-mono tabular-nums text-eyebrow text-ink-3">
                  {league.member_count} {league.member_count === 1 ? 'member' : 'members'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
