'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/format';

interface League {
  id: number; name: string; season_year: number;
  salary_cap: number; member_count: number; max_members: number;
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
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <h3 className="font-semibold text-slate-900 mb-4">Discover Leagues</h3>

      {leagues.length === 0 ? (
        <p className="text-sm text-slate-500">No public leagues available.</p>
      ) : (
        <div className="space-y-2">
          {leagues.map((league) => {
            const isFull    = league.member_count >= league.max_members;
            const hasJoined = joined.has(league.id);
            const isLoading = loading === league.id;
            const fillPct   = Math.round((league.member_count / league.max_members) * 100);

            return (
              <div key={league.id}
                className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-3 transition-all hover:bg-white hover:ring-slate-200 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{league.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cap {formatPrice(league.salary_cap)} · {league.season_year}
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoin(league.id)}
                    disabled={isFull || hasJoined || isLoading}
                    className="shrink-0 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold
                               text-white hover:bg-slate-700 disabled:opacity-40
                               disabled:cursor-not-allowed transition-opacity"
                  >
                    {isLoading ? '…' : hasJoined ? 'Joined ✓' : isFull ? 'Full' : 'Join'}
                  </button>
                </div>
                {/* Member fill bar */}
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-slate-900 transition-all"
                      style={{ width: `${fillPct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">
                    {league.member_count}/{league.max_members}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
