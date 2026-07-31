'use client';

// Lightweight player preview, opened from any player row in the app. Upsells
// to the full /players/[id] page.
//
// Shared by the draft board, transfers board, roster list, live field and
// ClickablePlayerRow — five surfaces, so keep it neutral and don't grow it into
// a page.

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPrice, formatPoints, formatWeek, parseNaiveDateTime, formatPlayerName } from '@/lib/format';
import TeamLogo from './TeamLogo';
import type { Matchup } from '@/lib/schedule';

interface Profile {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  price_delta: number;
  last_week_points: number | null;
  season_points: number;
  weeks_played: number;
  season: number;
  next_matchups: Matchup[];
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// See lib/format.ts parseNaiveDateTime — avoids `new Date(...)` reinterpreting
// the naive ET kickoff time in the wrong timezone.
function formatGameDate(raw: string): string {
  const dt = parseNaiveDateTime(raw);
  if (!dt) return '';
  return `${MONTH_ABBR[dt.month - 1]} ${dt.day}`;
}

/** A stat tile. `muted` marks a placeholder so it reads as absent, not zero. */
function Stat({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-control border border-line bg-surface-sunken px-3 py-2.5">
      <p className="text-eyebrow uppercase text-ink-3">{label}</p>
      <p className={[
        'mt-0.5 font-mono tabular-nums text-body',
        muted ? 'text-ink-3' : 'text-ink',
      ].join(' ')}>
        {value}
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col items-center">
      <div className="h-24 w-24 animate-pulse rounded-pill bg-line" />
      <div className="mt-3 h-6 w-40 animate-pulse rounded-control bg-line" />
      <div className="mt-2 h-4 w-24 animate-pulse rounded-pill bg-line" />
      <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-control bg-line" />
        ))}
      </div>
      <div className="mt-4 h-10 w-full animate-pulse rounded-control bg-line" />
    </div>
  );
}

export default function PlayerProfileModal({
  playerId,
  season,
  onClose,
}: {
  playerId: number;
  season?: number;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear the previous player's data during render rather than in an effect,
  // so the modal never paints one frame showing the wrong player.
  const requestKey = `${playerId}:${season ?? ''}`;
  const [prevKey, setPrevKey] = useState(requestKey);
  if (requestKey !== prevKey) {
    setPrevKey(requestKey);
    setProfile(null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    const qs = season ? `?season=${season}` : '';
    fetch(`/api/players/${playerId}${qs}`)
      .then(async res => {
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? 'Failed to load player');
        }
        return res.json();
      })
      .then(json => { if (!cancelled) setProfile(json.data); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load player'); });
    return () => { cancelled = true; };
  }, [playerId, season]);

  // Escape closes, matching every other dismissible surface in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seasonSuffix = season ? `?season=${season}` : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={profile ? `${profile.full_name} profile` : 'Player profile'}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
    >
      <div className="motion-safe:animate-modal-in w-full max-w-sm overflow-hidden rounded-card border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-end border-b border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface text-ink-3 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 pt-4">
          {error && (
            <p className="py-8 text-center text-body text-down">{error}</p>
          )}

          {!profile && !error && <Skeleton />}

          {profile && (
            <>
              <div className="flex flex-col items-center text-center">
                {profile.headshot_url ? (
                  <Image
                    src={profile.headshot_url} alt="" width={96} height={96} unoptimized
                    className="h-24 w-24 object-contain"
                  />
                ) : (
                  <span className="flex h-24 w-24 items-center justify-center rounded-pill bg-emerald-tint text-display text-emerald">
                    {profile.full_name.charAt(0)}
                  </span>
                )}

                <h2 className="mt-3 text-section text-ink">
                  {formatPlayerName(profile.full_name)}
                </h2>

                <p className="mt-1.5 flex items-center gap-2 text-label text-ink-3">
                  <span className="rounded-pill bg-surface-sunken px-2 py-0.5">{profile.position}</span>
                  <TeamLogo code={profile.team_code} size={14} />
                  <span>{profile.team_code}</span>
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Stat label="Price" value={formatPrice(profile.current_price)} />
                <Stat
                  label="Week change"
                  value={profile.price_delta === 0
                    ? 'No change'
                    : `${profile.price_delta > 0 ? '+' : ''}${formatPrice(profile.price_delta)}`}
                  muted={profile.price_delta === 0}
                />
                <Stat
                  label="Last week"
                  value={profile.last_week_points != null ? formatPoints(profile.last_week_points) : 'Not played'}
                  muted={profile.last_week_points == null}
                />
                <Stat label="Season points" value={formatPoints(profile.season_points)} />
              </div>

              {profile.next_matchups.length > 0 && (
                <div className="mt-4">
                  <p className="text-eyebrow uppercase text-ink-3">
                    Next {profile.next_matchups.length} matchups
                  </p>
                  <ul className="mt-1.5 overflow-hidden rounded-control border border-line">
                    {profile.next_matchups.map((m, i) => (
                      <li
                        key={i}
                        className={[
                          'flex items-center justify-between bg-surface-sunken px-3 py-2',
                          i < profile.next_matchups.length - 1 ? 'border-b border-line' : '',
                        ].join(' ')}
                      >
                        <span className="font-mono tabular-nums text-label text-ink-2">{formatWeek(m.week)}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-label text-ink-3">{m.isHome ? 'vs' : '@'}</span>
                          <TeamLogo code={m.opponent} size={14} />
                          <span className="text-label text-ink">{m.opponent}</span>
                        </span>
                        <span className="text-label text-ink-3">{formatGameDate(m.gameDate)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link
                href={`/players/${profile.id}${seasonSuffix}`}
                className="mt-5 flex h-10 items-center justify-center gap-1.5 rounded-control bg-emerald-press text-body font-medium text-surface transition-colors duration-150 ease-out-quart hover:bg-emerald-hover active:bg-emerald-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
              >
                View full profile
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
