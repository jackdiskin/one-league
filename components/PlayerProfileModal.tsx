'use client';

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

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
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

  const seasonSuffix = season ? `?season=${season}` : '';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(7,10,22,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380,
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: '#f8fafc', color: '#94a3b8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '8px 24px 24px' }}>
          {error && (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {!profile && !error && (
            <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
              Loading…
            </div>
          )}

          {profile && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
                {profile.headshot_url ? (
                  <Image src={profile.headshot_url} alt={profile.full_name} width={110} height={110} unoptimized
                    style={{ width: 110, height: 110, objectFit: 'contain', display: 'block' }}
                  />
                ) : (
                  <div style={{
                    width: 110, height: 110, borderRadius: 10, background: '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36, fontWeight: 700, color: '#94a3b8',
                  }}>
                    {profile.full_name[0]}
                  </div>
                )}

                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', marginTop: 12 }}>
                  {formatPlayerName(profile.full_name)}
                </h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9',
                    borderRadius: 20, padding: '2px 8px',
                  }}>
                    {profile.position}
                  </span>
                  <TeamLogo code={profile.team_code} size={16} />
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{profile.team_code}</span>
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16,
              }}>
                {[
                  { label: 'Price', value: formatPrice(profile.current_price) },
                  {
                    label: 'Wk Δ',
                    value: profile.price_delta === 0 ? '—' : `${profile.price_delta > 0 ? '+' : ''}${formatPrice(profile.price_delta)}`,
                  },
                  { label: 'Last Week', value: profile.last_week_points != null ? formatPoints(profile.last_week_points) : '—' },
                  { label: 'Season Pts', value: formatPoints(profile.season_points) },
                ].map(s => (
                  <div key={s.label} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {profile.next_matchups.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Next {profile.next_matchups.length} Matchups
                  </div>
                  <div style={{ border: '1px solid #f1f5f9', borderRadius: 12, overflow: 'hidden' }}>
                    {profile.next_matchups.map((m, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', background: '#f8fafc',
                        borderBottom: i < profile.next_matchups.length - 1 ? '1px solid #f1f5f9' : 'none',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>{formatWeek(m.week)}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700 }}>{m.isHome ? 'vs' : '@'}</span>
                          <TeamLogo code={m.opponent} size={14} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{m.opponent}</span>
                        </div>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{formatGameDate(m.gameDate)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Link
                href={`/players/${profile.id}${seasonSuffix}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '11px 0', borderRadius: 12,
                  background: 'linear-gradient(135deg, #0f172a, #1e293b)', color: '#fff',
                  fontSize: 13, fontWeight: 700, textDecoration: 'none',
                }}
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
