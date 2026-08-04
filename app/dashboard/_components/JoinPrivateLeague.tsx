'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import SectionHeader from '@/components/ui/SectionHeader';

type SearchLeague = { id: number; name: string; is_public: number; member_count: number };

const INPUT = [
  'h-9 w-full rounded-control border border-line bg-surface px-3',
  'text-label text-ink placeholder:text-ink-3',
  'transition-colors duration-150 ease-out-quart hover:border-line-strong',
  'focus-visible:outline-none focus-visible:border-emerald focus-visible:ring-2 focus-visible:ring-emerald',
].join(' ');

/** Compact "search by name, then join" panel — the same flow as the full
 * Leagues page's join form, sized to sit under Standings on the dashboard. */
export default function JoinPrivateLeague() {
  const router = useRouter();
  const [searchName, setSearchName]       = useState('');
  const [searching, setSearching]         = useState(false);
  const [searchResults, setSearchResults] = useState<SearchLeague[]>([]);
  const [hasSearched, setHasSearched]     = useState(false);
  const [joinSelected, setJoinSelected]   = useState<SearchLeague | null>(null);
  const [joinPassword, setJoinPassword]   = useState('');
  const [joining, setJoining]             = useState(false);
  const [joinError, setJoinError]         = useState('');

  useEffect(() => {
    const q = searchName.trim();
    if (q.length < 2) { setSearchResults([]); setHasSearched(false); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/leagues/search?name=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then(j => { setSearchResults(j.data ?? []); setHasSearched(true); })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchName]);

  function selectLeague(league: SearchLeague) {
    setJoinSelected(league);
    setJoinPassword('');
    setJoinError('');
  }

  const joinNeedsPassword = joinSelected != null && !joinSelected.is_public;
  const canJoin = joinSelected != null && (!joinNeedsPassword || joinPassword.trim().length > 0);

  async function handleJoin() {
    if (!joinSelected || !canJoin || joining) return;
    setJoining(true); setJoinError('');
    try {
      const res = await fetch('/api/leagues/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: joinSelected.id,
          password: joinNeedsPassword ? joinPassword.trim() : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setJoinError(json.error ?? 'Failed to join league'); return; }
      setSearchName('');
      setJoinSelected(null);
      setJoinPassword('');
      router.refresh();
    } catch { setJoinError('Network error — please try again.'); }
    finally { setJoining(false); }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
      <SectionHeader title="Join a private league" sub="Search by name, then enter the password if it's private." />

      <input
        className={INPUT}
        value={searchName}
        onChange={e => { setSearchName(e.target.value); setJoinSelected(null); setJoinError(''); }}
        placeholder="Start typing a league name"
        aria-label="League name"
      />

      {!joinSelected && searchName.trim().length >= 2 && (
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {searching && <p className="py-2 text-center text-label text-ink-3">Searching…</p>}
          {!searching && hasSearched && searchResults.length === 0 && (
            <p className="py-2 text-center text-label text-ink-3">No league found with that name.</p>
          )}
          {!searching && searchResults.map(league => (
            <button
              key={league.id}
              type="button"
              onClick={() => selectLeague(league)}
              className="flex items-center gap-2 rounded-slot border border-line bg-surface-sunken px-2.5 py-2 text-left transition-colors duration-150 ease-out-quart hover:border-emerald-line hover:bg-emerald-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
            >
              <Icon name={league.is_public ? 'globe' : 'lock'} size={13} className="shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label text-ink">{league.name}</span>
                <span className="block text-eyebrow text-ink-3">
                  <span className="font-mono tabular-nums">{league.member_count}</span>{' '}
                  member{league.member_count === 1 ? '' : 's'} · {league.is_public ? 'Public' : 'Private'}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {joinSelected && (
        <div className="flex flex-col gap-2.5 rounded-card border border-emerald-line bg-emerald-tint p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-label text-ink">{joinSelected.name}</span>
            <button
              type="button"
              onClick={() => { setJoinSelected(null); setJoinPassword(''); setJoinError(''); }}
              className="shrink-0 rounded-control text-label text-emerald underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
            >
              Change
            </button>
          </div>
          {joinNeedsPassword && (
            <input
              className={INPUT}
              type="password"
              autoComplete="off"
              autoFocus
              value={joinPassword}
              onChange={e => { setJoinPassword(e.target.value); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="Enter password"
              aria-label="Password"
            />
          )}
        </div>
      )}

      {joinError && <p role="alert" className="text-label text-down">{joinError}</p>}

      <button
        type="button"
        onClick={handleJoin}
        disabled={!canJoin || joining}
        className={[
          'h-9 w-full rounded-control text-label transition-colors duration-150 ease-out-quart',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
          !canJoin || joining
            ? 'cursor-not-allowed bg-surface-sunken text-ink-3'
            : 'bg-emerald text-surface hover:bg-emerald-hover active:bg-emerald-press',
        ].join(' ')}
      >
        {joining ? 'Joining…' : !joinSelected ? 'Pick a league first' : joinNeedsPassword && !joinPassword.trim() ? 'Enter the password' : 'Join league'}
      </button>
    </div>
  );
}
