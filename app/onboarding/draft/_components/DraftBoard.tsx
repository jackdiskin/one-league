'use client';

import Image from 'next/image';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice } from '@/lib/format';

export interface DraftPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
}

export interface PublicLeague {
  id: number;
  name: string;
  season_year: number;
  salary_cap: number;
  max_members: number;
  member_count: number;
}

// ─── Quotas ───────────────────────────────────────────────────────────────────
const CAP          = 200_000_000;
const QUOTA        = { QB: 2, RB: 3, FLEX: 5, K: 1 }; // FLEX = WR+TE combined
const TOTAL_SLOTS  = 11;

const POS_COLORS: Record<string, { bg: string; text: string; bar: string; light: string }> = {
  QB: { bg: '#eff6ff', text: '#3b82f6', bar: '#3b82f6', light: 'rgba(59,130,246,0.12)' },
  RB: { bg: '#f0fdf4', text: '#10b981', bar: '#10b981', light: 'rgba(16,185,129,0.12)' },
  WR: { bg: '#fffbeb', text: '#f59e0b', bar: '#f59e0b', light: 'rgba(245,158,11,0.12)' },
  TE: { bg: '#faf5ff', text: '#a855f7', bar: '#a855f7', light: 'rgba(168,85,247,0.12)' },
  K:  { bg: '#f8fafc', text: '#64748b', bar: '#94a3b8', light: 'rgba(100,116,139,0.12)' },
};

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];

// ─── Formation slot definitions ───────────────────────────────────────────────
// y is from top of field area (%), x is from left (%)
const FORMATION_SLOTS = [
  { id: 'K1',     posGroup: 'K',    label: 'K',     x: 50, y: 10 },
  { id: 'FLEX1',  posGroup: 'FLEX', label: 'WR/TE', x: 10, y: 30 },
  { id: 'FLEX2',  posGroup: 'FLEX', label: 'WR/TE', x: 27, y: 30 },
  { id: 'FLEX3',  posGroup: 'FLEX', label: 'WR/TE', x: 50, y: 30 },
  { id: 'FLEX4',  posGroup: 'FLEX', label: 'WR/TE', x: 73, y: 30 },
  { id: 'FLEX5',  posGroup: 'FLEX', label: 'WR/TE', x: 90, y: 30 },
  { id: 'RB1',    posGroup: 'RB',   label: 'RB',    x: 28, y: 55 },
  { id: 'RB2',    posGroup: 'RB',   label: 'RB',    x: 50, y: 55 },
  { id: 'RB3',    posGroup: 'RB',   label: 'RB',    x: 72, y: 55 },
  { id: 'QB1',    posGroup: 'QB',   label: 'QB',    x: 38, y: 76 },
  { id: 'QB2',    posGroup: 'QB',   label: 'QB',    x: 62, y: 76 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function posGroup(pos: string): string {
  if (pos === 'WR' || pos === 'TE') return 'FLEX';
  return pos;
}

function slotColor(group: string): typeof POS_COLORS[string] {
  if (group === 'FLEX') return POS_COLORS.WR;
  return POS_COLORS[group] ?? POS_COLORS.K;
}

// ─── Player Avatar ─────────────────────────────────────────────────────────────
function PlayerAvatar({ player, size = 48 }: { player: DraftPlayer; size?: number }) {
  const col = POS_COLORS[player.position] ?? POS_COLORS.K;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt={player.full_name}
          width={size} height={size} unoptimized
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', display: 'block' }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: '#334155', border: '2px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.35, fontWeight: 800, color: '#fff',
        }}>
          {player.full_name[0]}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: Math.round(size * 0.38), height: Math.round(size * 0.38),
        borderRadius: '50%', background: col.bar,
        border: '1.5px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.16), fontWeight: 900, color: '#fff',
      }}>
        {player.position[0]}
      </div>
    </div>
  );
}

// ─── Field slot: filled ────────────────────────────────────────────────────────
function FilledSlot({ player, onRemove }: { player: DraftPlayer; onRemove: () => void }) {
  const col = POS_COLORS[player.position] ?? POS_COLORS.K;
  const lastName = player.full_name.split(' ').slice(1).join(' ') || player.full_name;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        animation: 'slot-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        cursor: 'pointer',
      }}
      onClick={onRemove}
      title={`Remove ${player.full_name}`}
    >
      <div style={{
        background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(6px)',
        borderRadius: 20, padding: '2px 8px',
        fontSize: 10, fontWeight: 700, color: '#fff',
        border: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap',
      }}>
        {formatPrice(Number(player.current_price))}
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          {player.headshot_url ? (
            <Image
              src={player.headshot_url} alt={player.full_name}
              width={52} height={52} unoptimized
              style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid #fff', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', display: 'block' }}
            />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: '#334155',
              border: '2.5px solid #fff', boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#fff',
            }}>
              {player.full_name[0]}
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 18, height: 18, borderRadius: '50%',
            background: col.bar, border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 900, color: '#fff',
          }}>
            {player.position}
          </div>
        </div>
        {/* Remove X overlay on hover */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'rgba(244,63,94,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.95)', borderRadius: 8,
        padding: '3px 8px', textAlign: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)', minWidth: 52, maxWidth: 80,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastName}
        </div>
        <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{player.team_code}</div>
      </div>
    </div>
  );
}

// ─── Field slot: empty ─────────────────────────────────────────────────────────
function EmptySlot({ label, group }: { label: string; group: string }) {
  const col = slotColor(group);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      opacity: 0.55,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%',
        border: `2px dashed ${col.bar}`,
        background: col.light,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: col.bar, letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.15)', borderRadius: 6,
        padding: '2px 8px', textAlign: 'center', minWidth: 48,
      }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Empty</div>
      </div>
    </div>
  );
}

// ─── Welcome / how-it-works modal ─────────────────────────────────────────────
const WELCOME_STEPS = [
  {
    icon: '🏈',
    eyebrow: 'Welcome to',
    title: 'OneLeague',
    subtitle: 'The fantasy football league where the market never sleeps.',
    body: 'OneLeague combines classic fantasy football with a live trading market. Draft a squad, set your lineup each week, actively buy and sell players like stocks, and compete globally.',
    accent: '#34d399',
  },
  {
    icon: '📋',
    eyebrow: 'Step 1',
    title: 'Draft Your Squad',
    subtitle: '11 players. $200M cap. One shot.',
    body: null,
    bullets: [
      { icon: '🔵', label: '2 Quarterbacks', sub: 'Your franchise signal-callers' },
      { icon: '🟢', label: '3 Running Backs', sub: 'Ground game and receiving threats' },
      { icon: '🟡', label: '5 Wide Receivers / Tight Ends', sub: 'Any mix — all count as flex spots' },
      { icon: '⚪', label: '1 Kicker', sub: 'Every point counts at the margins' },
    ],
    accent: '#60a5fa',
  },
  {
    icon: '📈',
    eyebrow: 'Step 2',
    title: 'Trade the Market',
    subtitle: 'Prices move in real time — buy low, sell high.',
    body: 'Every buy pushes a player\'s price up; every sell pushes it down. Weekly prices also reset based on performance vs. projections and momentum. Your market cap starts at $200M, but grows or shrinks with your P&L.',
    callout: {
      label: 'P&L Example',
      text: 'Buy a player for $5M → sell for $8M → your cap grows by $3M. Lose on a trade and your cap shrinks.',
    },
    accent: '#fbbf24',
  },
  {
    icon: '🏆',
    eyebrow: 'Step 3',
    title: 'Compete & Win',
    subtitle: 'Weekly lineups. Season-long standings.',
    body: 'Each week, set your starting lineup from your active roster. Your starters earn fantasy points based on real NFL performance. Compete in private leagues with friends or go head-to-head in global public leagues.',
    bullets: [
      { icon: '📅', label: 'Weekly lineup decisions', sub: 'Start your best 7 each week' },
      { icon: '🌐', label: 'Global public leagues', sub: 'Compete against the world' },
      { icon: '🔒', label: 'Private leagues', sub: 'Invite friends with a code' },
    ],
    accent: '#a78bfa',
  },
] as const;

function WelcomeModal({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = WELCOME_STEPS[step];
  const isLast = step === WELCOME_STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(5,8,20,0.92)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
        animation: 'modal-in 0.4s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        {/* Hero banner */}
        <div style={{
          padding: '32px 32px 28px',
          background: `linear-gradient(135deg, #070a16 0%, #0d1f3c 60%, #0f2a1e 100%)`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle grid pattern */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />

          {/* Glow orb */}
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 160, height: 160, borderRadius: '50%',
            background: s.accent, opacity: 0.12, filter: 'blur(40px)',
            transition: 'background 0.4s',
          }} />

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 40, marginBottom: 10, lineHeight: 1 }}>{s.icon}</div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: s.accent, marginBottom: 6,
              transition: 'color 0.3s',
            }}>
              {s.eyebrow}
            </div>
            <h2 style={{
              fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em',
              color: '#fff', margin: '0 0 6px',
            }}>
              {s.title}
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>
              {s.subtitle}
            </p>
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
            {WELCOME_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 3, borderRadius: 99, transition: 'all 0.3s',
                  background: i === step ? s.accent : 'rgba(255,255,255,0.15)',
                  width: i === step ? 24 : 8,
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ background: '#fff', padding: '24px 32px 28px' }}>
          {s.body && (
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: '0 0 16px' }}>
              {s.body}
            </p>
          )}

          {'bullets' in s && s.bullets && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.bullets.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 10, background: '#f8fafc',
                  border: '1px solid #f1f5f9',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{b.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {'callout' in s && s.callout && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 12,
              background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
              border: '1px solid #fde68a',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                {s.callout.label}
              </div>
              <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                {s.callout.text}
              </div>
            </div>
          )}

          {/* CTA row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                style={{
                  padding: '9px 16px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#fff',
                  fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer',
                }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => isLast ? onClose() : setStep(s => s + 1)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12, border: 'none',
                background: `linear-gradient(135deg, ${s.accent} 0%, ${s.accent}cc 100%)`,
                fontSize: 14, fontWeight: 800, color: '#fff', cursor: 'pointer',
                boxShadow: `0 4px 16px ${s.accent}44`,
                transition: 'all 0.2s',
              }}
            >
              {isLast
                ? `Let's Draft, ${userName.split(' ')[0]} →`
                : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── League joining modal ──────────────────────────────────────────────────────
function LeagueModal({
  publicLeagues,
  teamName,
  playerIds,
  season,
  onClose,
}: {
  publicLeagues: PublicLeague[];
  teamName: string;
  playerIds: number[];
  season: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'public' | 'code'>('public');
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState(teamName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = name.trim().length >= 2 && (selectedLeague !== null || inviteCode.trim().length >= 4);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: name.trim(),
          player_ids: playerIds,
          league_id: tab === 'public' ? selectedLeague : undefined,
          invite_code: tab === 'code' ? inviteCode.trim() : undefined,
          season_year: season,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Something went wrong'); return; }
      router.push('/dashboard');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(7,10,22,0.88)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 520,
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
        animation: 'modal-in 0.35s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
            Step 2 of 2
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: 0 }}>
            Join a League
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
            Compete against other managers to win the season.
          </p>
        </div>

        <div style={{ padding: '20px 28px 24px' }}>
          {/* Team name */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Team Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. The Dream Team"
              maxLength={40}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10,
                border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 600,
                color: '#0f172a', background: '#f8fafc', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
            {(['public', 'code'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelectedLeague(null); setInviteCode(''); setError(''); }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#0f172a' : '#94a3b8',
                  boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {t === 'public' ? '🌐 Public Leagues' : '🔒 Invite Code'}
              </button>
            ))}
          </div>

          {/* Public leagues list */}
          {tab === 'public' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {publicLeagues.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
                  No public leagues available right now.
                </div>
              )}
              {publicLeagues.map(league => {
                const full = league.member_count >= league.max_members;
                const pct  = Math.round((league.member_count / league.max_members) * 100);
                const active = selectedLeague === league.id;
                return (
                  <div
                    key={league.id}
                    onClick={() => !full && setSelectedLeague(active ? null : league.id)}
                    style={{
                      padding: '10px 14px', borderRadius: 12, cursor: full ? 'default' : 'pointer',
                      border: `1.5px solid ${active ? '#059669' : '#e2e8f0'}`,
                      background: active ? '#f0fdf4' : full ? '#fafafa' : '#fff',
                      opacity: full ? 0.5 : 1, transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: active ? '#059669' : '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'background 0.15s',
                    }}>
                      {active
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <div style={{ flex: 1, height: 3, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#059669', borderRadius: 99, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
                          {league.member_count}/{league.max_members}
                        </span>
                      </div>
                    </div>
                    {full && <span style={{ fontSize: 10, fontWeight: 700, color: '#f43f5e' }}>FULL</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Invite code input */}
          {tab === 'code' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                Invite Code
              </label>
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. ALPHA-2025"
                maxLength={20}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 700,
                  color: '#0f172a', background: '#f8fafc', outline: 'none',
                  boxSizing: 'border-box', letterSpacing: '0.08em',
                }}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                Ask your league commissioner for your invite code.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                border: '1.5px solid #e2e8f0', background: '#fff',
                fontSize: 13, fontWeight: 700, color: '#64748b',
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 12, border: 'none',
                background: canSubmit && !submitting
                  ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                  : '#e2e8f0',
                fontSize: 13, fontWeight: 800, color: canSubmit && !submitting ? '#fff' : '#94a3b8',
                cursor: canSubmit && !submitting ? 'pointer' : 'default',
                transition: 'all 0.15s', boxShadow: canSubmit && !submitting ? '0 4px 14px rgba(16,185,129,0.35)' : 'none',
              }}
            >
              {submitting ? 'Creating your squad...' : '🏈 Start Playing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DraftBoard({
  players,
  publicLeagues,
  userName,
  season,
}: {
  players: DraftPlayer[];
  publicLeagues: PublicLeague[];
  userName: string;
  season: number;
}) {
  const [selected, setSelected]     = useState<DraftPlayer[]>([]);
  const [pos, setPos]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [showModal, setShowModal]   = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [justAdded, setJustAdded]   = useState<number | null>(null);
  const PAGE_SIZE = 20;

  // ── Derived quota counts ──────────────────────────────────────────────────
  const qbCount   = selected.filter(p => p.position === 'QB').length;
  const rbCount   = selected.filter(p => p.position === 'RB').length;
  const flexCount = selected.filter(p => p.position === 'WR' || p.position === 'TE').length;
  const kCount    = selected.filter(p => p.position === 'K').length;
  const totalCost = selected.reduce((s, p) => s + Number(p.current_price), 0);
  const capLeft   = CAP - totalCost;
  const isComplete = qbCount === QUOTA.QB && rbCount === QUOTA.RB && flexCount === QUOTA.FLEX && kCount === QUOTA.K;

  function canAdd(player: DraftPlayer): boolean {
    if (selected.find(p => p.id === player.id)) return false;
    const pg = posGroup(player.position);
    if (pg === 'QB'   && qbCount   >= QUOTA.QB)   return false;
    if (pg === 'RB'   && rbCount   >= QUOTA.RB)   return false;
    if (pg === 'FLEX' && flexCount >= QUOTA.FLEX)  return false;
    if (pg === 'K'    && kCount    >= QUOTA.K)     return false;
    if (totalCost + Number(player.current_price) > CAP) return false;
    return true;
  }

  function addPlayer(player: DraftPlayer) {
    if (!canAdd(player)) return;
    setSelected(prev => [...prev, player]);
    setJustAdded(player.id);
    setTimeout(() => setJustAdded(null), 600);
  }

  function removePlayer(playerId: number) {
    setSelected(prev => prev.filter(p => p.id !== playerId));
  }

  // ── Assign players to formation slots ────────────────────────────────────
  const filledSlots = useMemo(() => {
    const qbs  = selected.filter(p => p.position === 'QB');
    const rbs  = selected.filter(p => p.position === 'RB');
    const flex = selected.filter(p => p.position === 'WR' || p.position === 'TE');
    const ks   = selected.filter(p => p.position === 'K');
    const map: Record<string, DraftPlayer> = {};
    qbs.forEach((p, i)  => { map[`QB${i + 1}`]   = p; });
    rbs.forEach((p, i)  => { map[`RB${i + 1}`]   = p; });
    flex.forEach((p, i) => { map[`FLEX${i + 1}`] = p; });
    ks.forEach((p, i)   => { map[`K${i + 1}`]    = p; });
    return map;
  }, [selected]);

  // ── Filtered & paginated list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter(p => pos === 'ALL' || p.position === pos)
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q));
  }, [players, pos, search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [pos, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Quota badge helper ────────────────────────────────────────────────────
  function QuotaBadge({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
    const done = current === max;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 20,
        background: done ? 'rgba(16,185,129,0.15)' : current > 0 ? `rgba(255,255,255,0.08)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${done ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}`,
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: done ? '#34d399' : color, letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: done ? '#34d399' : '#fff' }}>{current}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>/ {max}</span>
        {done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes slot-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes modal-in {
          0%   { transform: translateY(20px) scale(0.97); opacity: 0; }
          100% { transform: translateY(0)    scale(1);    opacity: 1; }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
      `}</style>

      {/* ── LEFT PANEL ────────────────────────────────────────────────────────── */}
      <div style={{
        width: '20%', minWidth: 260, maxWidth: 320,
        display: 'flex', flexDirection: 'column',
        background: '#fff', borderRight: '1px solid #e2e8f0',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {/* Panel header */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
              Draft Mode · {season}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Pick Your Squad
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              {selected.length}/{TOTAL_SLOTS} selected
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height: '100%', borderRadius: 99, transition: 'width 0.3s ease',
              width: `${(selected.length / TOTAL_SLOTS) * 100}%`,
              background: isComplete
                ? 'linear-gradient(90deg, #059669, #10b981)'
                : 'linear-gradient(90deg, #3b82f6, #10b981)',
            }} />
          </div>

          {/* Position filter tabs */}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
            {POSITIONS.map(p => {
              const col = POS_COLORS[p];
              const active = pos === p;
              return (
                <button
                  key={p}
                  onClick={() => setPos(p)}
                  style={{
                    padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700,
                    background: active ? (col?.bg ?? '#f0fdf4') : '#f8fafc',
                    color: active ? (col?.text ?? '#059669') : '#94a3b8',
                    transition: 'all 0.15s',
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              style={{
                width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                fontSize: 12, borderRadius: 20, border: '1px solid #e2e8f0',
                background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Player rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {paginated.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              No players found
            </div>
          )}
          {paginated.map(player => {
            const col      = POS_COLORS[player.position] ?? POS_COLORS.K;
            const isAdded  = !!selected.find(p => p.id === player.id);
            const addable  = !isAdded && canAdd(player);
            const justPop  = justAdded === player.id;

            return (
              <div
                key={player.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px',
                  borderBottom: '1px solid #f8fafc',
                  opacity: !isAdded && !addable && selected.length > 0 ? 0.45 : 1,
                  transition: 'all 0.15s',
                  background: isAdded ? col.bg : 'transparent',
                }}
                onMouseEnter={e => { if (!isAdded) (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                onMouseLeave={e => { if (!isAdded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Avatar */}
                <div style={{ flexShrink: 0 }}>
                  {player.headshot_url ? (
                    <Image
                      src={player.headshot_url} alt={player.full_name}
                      width={32} height={32} unoptimized
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: `1.5px solid ${col.bar}`, display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#64748b',
                    }}>
                      {player.full_name[0]}
                    </div>
                  )}
                </div>

                {/* Name / meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {player.full_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: col.text, background: col.bg, borderRadius: 20, padding: '1px 5px' }}>{player.position}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{player.team_code}</span>
                  </div>
                </div>

                {/* Price */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', flexShrink: 0, marginRight: 4 }}>
                  {formatPrice(Number(player.current_price))}
                </div>

                {/* Add / Added button */}
                <button
                  onClick={() => isAdded ? removePlayer(player.id) : addPlayer(player)}
                  disabled={!isAdded && !addable}
                  style={{
                    width: 26, height: 26, borderRadius: 8, border: 'none', cursor: isAdded || addable ? 'pointer' : 'default',
                    background: isAdded ? '#fef2f2' : addable ? col.bg : '#f8fafc',
                    color: isAdded ? '#f43f5e' : addable ? col.text : '#cbd5e1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                    animation: justPop ? 'pulse-ring 0.5s ease' : 'none',
                  }}
                >
                  {isAdded ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div style={{
            padding: '8px 14px', borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fafafa',
          }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{
                  width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0',
                  background: safePage === 1 ? '#f8fafc' : '#fff',
                  color: safePage === 1 ? '#cbd5e1' : '#475569',
                  cursor: safePage === 1 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                }}
              >‹</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{
                  width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0',
                  background: safePage === totalPages ? '#f8fafc' : '#fff',
                  color: safePage === totalPages ? '#cbd5e1' : '#475569',
                  cursor: safePage === totalPages ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                }}
              >›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Cap & quota strip */}
        <div style={{
          padding: '10px 20px', flexShrink: 0,
          background: 'rgba(7,10,22,0.95)', borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 16,
          flexWrap: 'wrap',
        }}>
          {/* Welcome */}
          <div style={{ marginRight: 4 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              Welcome, {userName.split(' ')[0]}
            </div>
            <div style={{
              fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #fff 0%, #34d399 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Build Your Team
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

          {/* Cap remaining */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cap Left</div>
            <div style={{
              fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em',
              color: capLeft < 20_000_000 ? '#f87171' : capLeft < 60_000_000 ? '#fbbf24' : '#34d399',
            }}>
              {formatPrice(capLeft)}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

          {/* Quota badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <QuotaBadge label="QB"    current={qbCount}   max={QUOTA.QB}   color="#60a5fa" />
            <QuotaBadge label="RB"    current={rbCount}   max={QUOTA.RB}   color="#34d399" />
            <QuotaBadge label="WR/TE" current={flexCount} max={QUOTA.FLEX} color="#fbbf24" />
            <QuotaBadge label="K"     current={kCount}    max={QUOTA.K}    color="#a78bfa" />
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Finalize button */}
          <button
            onClick={() => isComplete && setShowModal(true)}
            disabled={!isComplete}
            style={{
              padding: '9px 22px', borderRadius: 12, border: 'none',
              background: isComplete
                ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                : 'rgba(255,255,255,0.07)',
              color: isComplete ? '#fff' : 'rgba(255,255,255,0.25)',
              fontSize: 13, fontWeight: 800, cursor: isComplete ? 'pointer' : 'default',
              transition: 'all 0.2s',
              boxShadow: isComplete ? '0 4px 16px rgba(16,185,129,0.4)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {isComplete ? '✓ Finalize Squad →' : `${TOTAL_SLOTS - selected.length} selections left`}
          </button>
        </div>

        {/* Football field */}
        <div style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          background: `repeating-linear-gradient(180deg, #1a7a32 0px, #1a7a32 48px, #1e8838 48px, #1e8838 96px)`,
        }}>
          {/* Opponent end zone (top) */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '7%',
            background: 'rgba(0,0,0,0.2)', borderBottom: '2px solid rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.4em', textTransform: 'uppercase' }}>
              END ZONE
            </div>
          </div>

          {/* Own end zone (bottom) */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '7%',
            background: 'rgba(0,0,0,0.2)', borderTop: '2px solid rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.4em', textTransform: 'uppercase' }}>
              END ZONE
            </div>
          </div>

          {/* Sidelines */}
          <div style={{ position: 'absolute', top: '7%', bottom: '7%', left: 28, width: 2, background: 'rgba(255,255,255,0.55)' }} />
          <div style={{ position: 'absolute', top: '7%', bottom: '7%', right: 28, width: 2, background: 'rgba(255,255,255,0.55)' }} />

          {/* Yard lines */}
          {[20, 35, 50, 65, 80].map(pct => (
            <div key={pct} style={{
              position: 'absolute', left: 28, right: 28, top: `${7 + (86 * pct / 100)}%`,
              height: 1, background: 'rgba(255,255,255,0.18)',
            }} />
          ))}

          {/* Hash marks */}
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: `${8 + i * (84 / 16)}%`,
              left: 0, right: 0,
              display: 'flex', justifyContent: 'space-between', padding: '0 90px',
            }}>
              <div style={{ width: 12, height: 1, background: 'rgba(255,255,255,0.22)' }} />
              <div style={{ width: 12, height: 1, background: 'rgba(255,255,255,0.22)' }} />
            </div>
          ))}

          {/* Formation slots */}
          {FORMATION_SLOTS.map(slot => {
            const player = filledSlots[slot.id];
            return (
              <div
                key={slot.id}
                style={{
                  position: 'absolute',
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                }}
              >
                {player
                  ? <FilledSlot player={player} onRemove={() => removePlayer(player.id)} />
                  : <EmptySlot label={slot.label} group={slot.posGroup} />
                }
              </div>
            );
          })}

          {/* Center tip */}
          {selected.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
                borderRadius: 16, padding: '12px 20px', textAlign: 'center',
                border: '1px solid rgba(255,255,255,0.1)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🏈</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Select players from the left</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>They'll appear in formation here</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── LEAGUE MODAL ──────────────────────────────────────────────────────── */}
      {showModal && (
        <LeagueModal
          publicLeagues={publicLeagues}
          teamName={`${userName.split(' ')[0]}'s Squad`}
          playerIds={selected.map(p => p.id)}
          season={season}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── WELCOME MODAL ─────────────────────────────────────────────────────── */}
      {showWelcome && (
        <WelcomeModal
          userName={userName}
          onClose={() => setShowWelcome(false)}
        />
      )}
    </div>
  );
}
