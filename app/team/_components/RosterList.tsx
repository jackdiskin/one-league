'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPoints } from '@/lib/format';

export interface RosterPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  purchase_price: number;
  acquired_week: number;
  roster_slot: string;
  last_week_points: number | null;
  season_points: number | null;
}

const POS_COLORS: Record<string, { pill: string; bar: string; light: string; ring: string }> = {
  QB: { pill: 'bg-blue-100 text-blue-700',       bar: '#3b82f6', light: '#eff6ff', ring: '#3b82f6' },
  RB: { pill: 'bg-emerald-100 text-emerald-700', bar: '#10b981', light: '#f0fdf4', ring: '#10b981' },
  WR: { pill: 'bg-amber-100 text-amber-700',     bar: '#f59e0b', light: '#fffbeb', ring: '#f59e0b' },
  TE: { pill: 'bg-purple-100 text-purple-700',   bar: '#a855f7', light: '#faf5ff', ring: '#a855f7' },
  K:  { pill: 'bg-slate-100 text-slate-600',     bar: '#94a3b8', light: '#f8fafc', ring: '#94a3b8' },
};

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K'];
const POS_LABELS: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends', K: 'Kicker',
};

function Avatar({ player, size = 40, col }: { player: RosterPlayer; size?: number; col: typeof POS_COLORS[string] }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0, marginRight: 12 }}>
      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt={player.full_name}
          width={size} height={size} unoptimized
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f1f5f9', display: 'block' }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: '50%', background: '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.35, fontWeight: 700, color: '#64748b',
        }}>
          {player.full_name[0]}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: -1, right: -1,
        width: 16, height: 16, borderRadius: '50%',
        background: col.bar, border: '2px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 6, fontWeight: 900, color: '#fff',
      }}>
        {player.position[0]}
      </div>
    </div>
  );
}

export default function RosterList({ roster, teamId }: { roster: RosterPlayer[]; teamId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<RosterPlayer | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());

  const starters = roster.filter(p => p.roster_slot !== 'BENCH');
  const bench    = roster.filter(p => p.roster_slot === 'BENCH');

  const isSelectionActive = selected !== null;

  // Eligible targets: same position, opposite bench/starter status
  function isEligible(p: RosterPlayer): boolean {
    if (!selected) return false;
    if (p.id === selected.id) return false;
    if (p.position !== selected.position) return false;
    const selectedOnBench  = selected.roster_slot === 'BENCH';
    const targetOnBench    = p.roster_slot === 'BENCH';
    return selectedOnBench !== targetOnBench;
  }

  function handlePlayerClick(p: RosterPlayer) {
    if (swapping.has(p.id)) return;

    if (!selected) {
      setSelected(p);
      return;
    }

    if (selected.id === p.id) {
      setSelected(null);
      return;
    }

    if (isEligible(p)) {
      executeSwap(selected, p);
    } else {
      // Re-select if same section/position allows it
      setSelected(p);
    }
  }

  async function executeSwap(playerA: RosterPlayer, playerB: RosterPlayer) {
    setSwapping(new Set([playerA.id, playerB.id]));
    setSelected(null);

    try {
      const res = await fetch('/api/roster/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fantasy_team_id: teamId,
          player_a_id: playerA.id,
          player_b_id: playerB.id,
        }),
      });
      if (!res.ok) throw new Error('Swap failed');
      startTransition(() => router.refresh());
    } catch {
      // on error, just refresh to get correct state
      startTransition(() => router.refresh());
    } finally {
      setSwapping(new Set());
    }
  }

  function PlayerRow({ p, section }: { p: RosterPlayer; section: 'starter' | 'bench' }) {
    const col      = POS_COLORS[p.position] ?? POS_COLORS.K;
    const pnl      = Number(p.current_price) - Number(p.purchase_price);
    const pnlPct   = Number(p.purchase_price) > 0 ? (pnl / Number(p.purchase_price)) * 100 : 0;
    const isUp     = pnl >= 0;
    const isSelected  = selected?.id === p.id;
    const eligible    = isEligible(p);
    const isSwapping  = swapping.has(p.id);
    const isDimmed    = isSelectionActive && !isSelected && !eligible && !isSwapping;

    return (
      <div
        onClick={() => handlePlayerClick(p)}
        style={{
          display: 'flex', alignItems: 'center',
          padding: '10px 20px',
          cursor: isSwapping ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          opacity: isDimmed ? 0.35 : isSwapping ? 0.6 : 1,
          background: isSelected
            ? col.light
            : eligible
            ? col.light
            : 'transparent',
          outline: isSelected ? `2px solid ${col.ring}` : eligible ? `1.5px dashed ${col.ring}` : 'none',
          outlineOffset: '-2px',
          borderRadius: isSelected || eligible ? 10 : 0,
          position: 'relative',
        }}
        onMouseEnter={e => {
          if (!isSelected && !eligible && !isDimmed) {
            (e.currentTarget as HTMLElement).style.background = '#fafafa';
          }
        }}
        onMouseLeave={e => {
          if (!isSelected && !eligible) {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }
        }}
      >
        {/* Eligible badge */}
        {eligible && (
          <div style={{
            position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
            width: 4, height: '60%', minHeight: 20, borderRadius: 4,
            background: col.ring, opacity: 0.8,
          }} />
        )}

        {/* Avatar + Name */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Avatar player={p} col={col} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.full_name}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{p.team_code}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${col.pill}`}>{p.position}</span>
            </div>
          </div>
        </div>

        {/* Current price */}
        <div style={{ width: 72, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
          {formatPrice(p.current_price)}
        </div>

        {/* Purchase price */}
        <div style={{ width: 72, textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
          {formatPrice(p.purchase_price)}
        </div>

        {/* P&L */}
        <div style={{ width: 60, textAlign: 'right' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#10b981' : '#f43f5e' }}>
            {isUp ? '+' : ''}{formatPrice(Math.abs(pnl))}
          </div>
          <div style={{ fontSize: 9, color: isUp ? '#10b981' : '#f43f5e' }}>
            {isUp ? '▲' : '▼'} {Math.abs(pnlPct).toFixed(1)}%
          </div>
        </div>

        {/* Last week */}
        <div style={{ width: 68, textAlign: 'right', fontSize: 13, fontWeight: 700, color: p.last_week_points != null ? '#0f172a' : '#cbd5e1' }}>
          {p.last_week_points != null ? formatPoints(p.last_week_points) : '—'}
        </div>

        {/* Season */}
        <div style={{ width: 72, textAlign: 'right', fontSize: 12, color: '#475569' }}>
          {p.season_points != null ? formatPoints(p.season_points) : '—'}
        </div>

        {/* Player page link */}
        <Link
          href={`/players/${p.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            marginLeft: 10, flexShrink: 0, width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 6, color: '#cbd5e1', textDecoration: 'none',
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = '#64748b';
            (e.currentTarget as HTMLElement).style.background = '#f1f5f9';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = '#cbd5e1';
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
          title={`View ${p.full_name}'s profile`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </Link>

        {/* Swap indicator */}
        {isSwapping && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            background: 'rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#64748b',
          }}>
            Swapping...
          </div>
        )}
      </div>
    );
  }

  const startersByPos = POS_ORDER.reduce((acc, pos) => {
    acc[pos] = starters.filter(p => p.position === pos);
    return acc;
  }, {} as Record<string, RosterPlayer[]>);

  const benchByPos = POS_ORDER.reduce((acc, pos) => {
    acc[pos] = bench.filter(p => p.position === pos);
    return acc;
  }, {} as Record<string, RosterPlayer[]>);

  return (
    <div style={{ borderRadius: 16, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes eligible-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
          50%       { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Full Roster</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{roster.length} active players · {starters.length} starters · {bench.length} bench</p>
        </div>
        {/* Column labels */}
        <div style={{ display: 'flex', gap: 0, fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span style={{ width: 72, textAlign: 'right' }}>Price</span>
          <span style={{ width: 72, textAlign: 'right' }}>Bought at</span>
          <span style={{ width: 60, textAlign: 'right' }}>P&amp;L</span>
          <span style={{ width: 68, textAlign: 'right' }}>Last Wk</span>
          <span style={{ width: 72, textAlign: 'right' }}>Season</span>
        </div>
      </div>

      {/* Swap banner */}
      {selected && (
        <div style={{
          padding: '10px 20px',
          background: POS_COLORS[selected.position]?.light ?? '#f8fafc',
          borderBottom: `2px solid ${POS_COLORS[selected.position]?.ring ?? '#94a3b8'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: POS_COLORS[selected.position]?.ring ?? '#94a3b8',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              Swapping {selected.full_name}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              — select a {selected.position} to swap with
            </span>
          </div>
          <button
            onClick={() => setSelected(null)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              border: '1px solid #e2e8f0', background: '#fff', color: '#64748b',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Starters */}
      <div>
        <div style={{
          padding: '7px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #f1f5f9',
          fontSize: 10, fontWeight: 800, color: '#475569',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Starters
        </div>

        {POS_ORDER.map(pos => {
          const players = startersByPos[pos];
          if (!players?.length) return null;
          const col = POS_COLORS[pos] ?? POS_COLORS.K;
          return (
            <div key={pos}>
              <div style={{
                padding: '6px 20px',
                borderTop: '1px solid #f1f5f9',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fafafa',
              }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: col.bar, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {POS_LABELS[pos]}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>· {players.length}</span>
              </div>
              {players.map(p => <PlayerRow key={p.id} p={p} section="starter" />)}
            </div>
          );
        })}
      </div>

      {/* Bench divider */}
      {bench.length > 0 && (
        <>
          <div style={{
            margin: '0 20px',
            borderTop: '2px dashed #e2e8f0',
          }} />
          <div style={{
            padding: '7px 20px',
            background: '#f8fafc',
            borderBottom: '1px solid #f1f5f9',
            fontSize: 10, fontWeight: 800, color: '#94a3b8',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            Bench
            <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>· {bench.length} players</span>
            {isSelectionActive && (
              <span style={{
                marginLeft: 'auto', fontSize: 10, color: POS_COLORS[selected!.position]?.ring ?? '#94a3b8',
                fontWeight: 700,
              }}>
                {bench.filter(p => isEligible(p)).length > 0
                  ? `${bench.filter(p => isEligible(p)).length} eligible swap${bench.filter(p => isEligible(p)).length > 1 ? 's' : ''}`
                  : 'No eligible bench players'}
              </span>
            )}
          </div>

          {POS_ORDER.map(pos => {
            const players = benchByPos[pos];
            if (!players?.length) return null;
            const col = POS_COLORS[pos] ?? POS_COLORS.K;
            return (
              <div key={pos}>
                <div style={{
                  padding: '6px 20px',
                  borderTop: '1px solid #f1f5f9',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: '#fafafa',
                }}>
                  <div style={{ width: 3, height: 12, borderRadius: 2, background: col.bar, flexShrink: 0, opacity: 0.5 }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {POS_LABELS[pos]}
                  </span>
                  <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>· {players.length}</span>
                </div>
                {players.map(p => <PlayerRow key={p.id} p={p} section="bench" />)}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
