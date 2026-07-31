'use client';

// Search + filters. Every control is h-9 so the rows line up exactly.

import { useEffect, useRef } from 'react';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';
import { PRICE_PRESETS, SORT_OPTIONS, type SortKey } from './sorting';
import { POSITIONS } from './types';

export default function FilterBar({
  search, setSearch,
  pos, setPos,
  sortBy, setSortBy,
  teamFilter, setTeamFilter,
  maxPrice, setMaxPrice,
  affordableOnly, setAffordableOnly,
  teams,
  resultCount,
}: {
  search: string; setSearch: (v: string) => void;
  pos: string; setPos: (v: string) => void;
  sortBy: SortKey; setSortBy: (v: SortKey) => void;
  teamFilter: string; setTeamFilter: (v: string) => void;
  maxPrice: number | null; setMaxPrice: (v: number | null) => void;
  affordableOnly: boolean; setAffordableOnly: (v: boolean) => void;
  teams: string[];
  resultCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl-K focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
      {/* Position tabs */}
      <div className="flex flex-wrap gap-1">
        {POSITIONS.map(p => {
          const active = pos === p || (pos === 'FLEX' && (p === 'WR' || p === 'TE'));
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPos(p)}
              aria-pressed={active}
              className={[
                'rounded-pill px-3 py-1 text-label transition-colors duration-150 ease-out-quart',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                active
                  ? 'bg-emerald text-surface'
                  : 'bg-surface-sunken text-ink-2 hover:bg-emerald-tint hover:text-emerald',
              ].join(' ')}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className={[
            'h-9 w-full rounded-control border border-line bg-surface pl-9 pr-16',
            'text-label text-ink placeholder:text-ink-3',
            'transition-colors duration-150 ease-out-quart hover:border-line-strong',
            'focus-visible:outline-none focus-visible:border-emerald focus-visible:ring-2 focus-visible:ring-emerald',
          ].join(' ')}
        />
        {search ? (
          <button
            type="button"
            onClick={() => { setSearch(''); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-pill text-ink-3 transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-control border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-eyebrow text-ink-3">
            ⌘K
          </kbd>
        )}
      </div>

      {/* Sort + team */}
      <div className="flex gap-2">
        <Select
          ariaLabel="Sort players"
          value={sortBy}
          onValueChange={v => setSortBy(v as SortKey)}
          options={SORT_OPTIONS.map(o => ({ value: o.key, label: o.label }))}
          className="min-w-0 flex-1"
        />
        <Select
          ariaLabel="Filter by team"
          value={teamFilter}
          onValueChange={setTeamFilter}
          options={[{ value: 'ALL', label: 'All teams' }, ...teams.map(t => ({ value: t, label: t }))]}
          className="w-28 shrink-0"
        />
      </div>

      {/* Max price */}
      <Select
        ariaLabel="Maximum price"
        value={maxPrice == null ? 'any' : String(maxPrice)}
        onValueChange={v => setMaxPrice(v === 'any' ? null : Number(v))}
        options={PRICE_PRESETS.map(p => ({
          value: p.value == null ? 'any' : String(p.value),
          label: p.value == null ? 'Any price' : p.label,
        }))}
        className="w-full"
      />

      <Checkbox
        checked={affordableOnly}
        onCheckedChange={setAffordableOnly}
        label="Only show players I can afford"
      />

      <p className="font-mono tabular-nums text-eyebrow text-ink-3">
        {resultCount.toLocaleString()} {resultCount === 1 ? 'player' : 'players'}
      </p>
    </div>
  );
}
