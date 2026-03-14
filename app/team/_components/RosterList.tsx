'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useTransition, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPoints, formatWeekLong } from '@/lib/format';
import { BID_ASK_SPREAD, PRICE_IMPACT_RATE } from '@/lib/pricing';
import { useLiveStats, getLivePoints, type LiveStatDelta } from '@/hooks/useLiveStats';

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
  espn_athlete_id: string | null;
}

// ---------------------------------------------------------------------------
// Live stat chips — Bloomberg-style data pills with delta-flash animations
// ---------------------------------------------------------------------------
type ChipFlash = { id: number; delta: number; isTd: boolean; isNeg: boolean };

function LiveStatChips({ totals }: { totals: LiveStatDelta }) {
  const prevRef = useRef<LiveStatDelta | null>(null);
  const [flashes, setFlashes] = useState<Record<string, ChipFlash>>({});

  // Runs after every render; only triggers setFlashes when totals actually changed
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { ...totals };
    if (!prev) return;

    const updates: Array<{ key: string; delta: number; isTd: boolean; isNeg: boolean }> = [];
    const chk = (key: string, curr: number, p: number, isTd = false, isNeg = false) => {
      const diff = curr - p;
      if (diff > 0) updates.push({ key, delta: diff, isTd, isNeg });
    };

    chk('passing',   totals.passingYards,     prev.passingYards);
    chk('passingTd', totals.passingTds,       prev.passingTds,       true);
    chk('rushing',   totals.rushingYards,     prev.rushingYards);
    chk('rushingTd', totals.rushingTds,       prev.rushingTds,       true);
    chk('rec',       totals.receivingYards,   prev.receivingYards);
    chk('recTd',     totals.receivingTds,     prev.receivingTds,     true);
    chk('int',       totals.interceptions,    prev.interceptions,    false, true);
    chk('fl',        totals.fumblesLost,      prev.fumblesLost,      false, true);
    chk('twopt',     totals.twoPtConversions, prev.twoPtConversions, true);
    const fgCurr = (totals.fg0_39 ?? 0) + (totals.fg40_49 ?? 0) + (totals.fg50Plus ?? 0);
    const fgPrev = (prev.fg0_39   ?? 0) + (prev.fg40_49   ?? 0) + (prev.fg50Plus   ?? 0);
    chk('fg', fgCurr, fgPrev, true);
    chk('xp', totals.xpMade, prev.xpMade);

    if (!updates.length) return;
    setFlashes(cur => {
      const next = { ...cur };
      for (const u of updates) {
        next[u.key] = { id: (cur[u.key]?.id ?? 0) + 1, delta: u.delta, isTd: u.isTd, isNeg: u.isNeg };
      }
      return next;
    });
  });

  const t = totals;
  type ChipDef = {
    value: string; label: string;
    color: string; bg: string; border: string;
    flashKey: string; deltaText: (delta: number) => string;
    isTd?: boolean; isNeg?: boolean;
  };
  const chips: ChipDef[] = [];

  if (t.passingYards    > 0) chips.push({ value: String(t.passingYards),  label: 'Pass Yd', color: '#2563eb', bg: 'rgba(37,99,235,0.08)',   border: 'rgba(37,99,235,0.22)',  flashKey: 'passing',   deltaText: d => `+${d}yd` });
  if (t.passingTds      > 0) chips.push({ value: String(t.passingTds),    label: 'Pass TD', color: '#92400e', bg: 'rgba(251,191,36,0.16)',  border: 'rgba(217,119,6,0.38)',  flashKey: 'passingTd', deltaText: () => 'TD!',  isTd: true });
  if (t.rushingYards    > 0) chips.push({ value: String(t.rushingYards),  label: 'Rush Yd', color: '#059669', bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.22)',  flashKey: 'rushing',   deltaText: d => `+${d}yd` });
  if (t.rushingTds      > 0) chips.push({ value: String(t.rushingTds),    label: 'Rush TD', color: '#92400e', bg: 'rgba(251,191,36,0.16)',  border: 'rgba(217,119,6,0.38)',  flashKey: 'rushingTd', deltaText: () => 'TD!',  isTd: true });
  if (t.receptions      > 0) chips.push({ value: `${t.receptions} · ${t.receivingYards}yd`, label: 'Rec', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.22)', flashKey: 'rec', deltaText: d => `+${d}yd` });
  if (t.receivingTds    > 0) chips.push({ value: String(t.receivingTds),  label: 'Rec TD',  color: '#92400e', bg: 'rgba(251,191,36,0.16)',  border: 'rgba(217,119,6,0.38)',  flashKey: 'recTd',     deltaText: () => 'TD!',  isTd: true });
  if (t.interceptions   > 0) chips.push({ value: String(t.interceptions), label: 'INT',     color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.22)',  flashKey: 'int',       deltaText: d => `+${d}`, isNeg: true });
  if (t.fumblesLost     > 0) chips.push({ value: String(t.fumblesLost),   label: 'FL',      color: '#dc2626', bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.22)',  flashKey: 'fl',        deltaText: d => `+${d}`, isNeg: true });
  if (t.twoPtConversions > 0) chips.push({ value: String(t.twoPtConversions), label: '2PT', color: '#0369a1', bg: 'rgba(3,105,161,0.08)',  border: 'rgba(3,105,161,0.22)',  flashKey: 'twopt',     deltaText: () => '2PT!', isTd: true });

  const fgMade = (t.fg0_39 ?? 0) + (t.fg40_49 ?? 0) + (t.fg50Plus ?? 0);
  const fgAtt  = fgMade + (t.fgMissed ?? 0);
  if (fgAtt  > 0) chips.push({ value: `${fgMade}/${fgAtt}`, label: 'FG', color: '#b45309', bg: 'rgba(180,83,9,0.08)', border: 'rgba(180,83,9,0.22)', flashKey: 'fg', deltaText: () => 'FG!', isTd: true });
  if (t.xpMade > 0) chips.push({ value: String(t.xpMade),   label: 'XP', color: '#78350f', bg: 'rgba(120,53,15,0.07)', border: 'rgba(120,53,15,0.18)', flashKey: 'xp', deltaText: () => 'XP!' });

  if (!chips.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
      {chips.map((chip, i) => {
        const flash = flashes[chip.flashKey];
        return (
          <span
            key={i}
            style={{
              position: 'relative',
              display: 'inline-flex', alignItems: 'baseline', gap: 3,
              padding: '2px 6px', borderRadius: 4,
              border: `1px solid ${chip.border}`,
              background: chip.bg, color: chip.color,
            }}
          >
            {/* Glow overlay — key forces remount to restart animation on each new flash */}
            {flash && (
              <span
                key={flash.id}
                aria-hidden
                style={{
                  position: 'absolute', inset: -1, borderRadius: 4,
                  border: `1.5px solid ${chip.color}`,
                  pointerEvents: 'none',
                  animation: chip.isTd
                    ? 'chip-td-surge 0.9s ease-out forwards'
                    : chip.isNeg
                      ? 'chip-neg-flash 0.65s ease-out forwards'
                      : 'chip-yard-flash 0.65s ease-out forwards',
                }}
              />
            )}
            {/* Delta badge — floats upward and fades */}
            {flash && (
              <span
                key={`d-${flash.id}`}
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: '100%', left: '50%',
                  fontSize: chip.isTd ? 9.5 : 8.5,
                  fontWeight: 900,
                  letterSpacing: chip.isTd ? '0.03em' : '-0.01em',
                  color: chip.isTd ? '#f59e0b' : chip.isNeg ? '#ef4444' : chip.color,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  zIndex: 20,
                  fontVariantNumeric: 'tabular-nums',
                  textShadow: chip.isTd ? '0 1px 8px rgba(251,191,36,0.8)' : 'none',
                  animation: chip.isTd
                    ? 'delta-td-rise 1.5s cubic-bezier(0.16,1,0.3,1) forwards'
                    : chip.isNeg
                      ? 'delta-neg-rise 1.0s ease-out forwards'
                      : 'delta-rise 1.1s cubic-bezier(0.16,1,0.3,1) forwards',
                }}
              >
                {chip.deltaText(flash.delta)}
              </span>
            )}
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', position: 'relative' }}>
              {chip.value}
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 700, opacity: 0.65, letterSpacing: '0.04em', textTransform: 'uppercase', position: 'relative' }}>
              {chip.label}
            </span>
          </span>
        );
      })}
    </div>
  );
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

// Starter slot groups: defines expected named slots per position group
const STARTER_SLOT_GROUPS = [
  { key: 'QB',   positions: ['QB'],       maxStarters: 1, slotPrefix: 'QB', label: 'Quarterbacks', singularLabel: 'QB Starter'  },
  { key: 'RB',   positions: ['RB'],       maxStarters: 2, slotPrefix: 'RB', label: 'Running Backs', singularLabel: 'RB Starter' },
  { key: 'FLEX', positions: ['WR', 'TE'], maxStarters: 4, slotPrefix: 'WR', label: 'Receivers',     singularLabel: 'WR/TE Starter' },
  { key: 'K',    positions: ['K'],        maxStarters: 1, slotPrefix: 'K',  label: 'Kicker',        singularLabel: 'K Starter'   },
] as const;

// Extracted so PlayerRow (defined outside RosterList) can call it without closures
function isEligibleForSwap(p: RosterPlayer, selected: RosterPlayer | null): boolean {
  if (!selected) return false;
  if (p.id === selected.id) return false;
  const flex = ['WR', 'TE'];
  const sameGroup = (a: string, b: string) => (flex.includes(a) && flex.includes(b)) || a === b;
  if (!sameGroup(selected.position, p.position)) return false;
  return (selected.roster_slot === 'BENCH') !== (p.roster_slot === 'BENCH');
}

interface PlayerRowProps {
  p: RosterPlayer;
  selected: RosterPlayer | null;
  swapping: Set<number>;
  liveData: import('@/hooks/useLiveStats').LivePlayerStats | undefined;
  onPlayerClick: (p: RosterPlayer) => void;
  onSellClick: (p: RosterPlayer) => void;
}

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

// ─── Sell Modal ────────────────────────────────────────────────────────────────
function SellModal({
  player,
  teamId,
  week,
  budgetRemaining,
  onClose,
  onSuccess,
}: {
  player: RosterPlayer;
  teamId: number;
  week: number;
  budgetRemaining: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const currentPrice  = Number(player.current_price);
  const purchasePrice = Number(player.purchase_price);
  const proceeds      = Math.round(currentPrice * (1 - BID_ASK_SPREAD) * 100) / 100;
  const pnl           = proceeds - purchasePrice;
  const pnlPct        = purchasePrice > 0 ? (pnl / purchasePrice) * 100 : 0;
  const priceAfter    = Math.round(currentPrice * (1 - PRICE_IMPACT_RATE) * 100) / 100;
  const budgetAfter   = Number(budgetRemaining) + proceeds;
  const isGain        = pnl >= 0;
  const col           = POS_COLORS[player.position] ?? POS_COLORS.K;

  async function confirmSell() {
    setConfirming(true);
    setError('');
    try {
      const res = await fetch('/api/market/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: teamId, player_id: player.id, week }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Sale failed'); return; }
      onSuccess();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(7,10,22,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)', overflow: 'hidden',
        animation: 'sell-modal-in 0.25s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        <style>{`
          @keyframes sell-modal-in {
            from { transform: translateY(12px) scale(0.98); opacity: 0; }
            to   { transform: translateY(0) scale(1); opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {player.headshot_url ? (
              <Image
                src={player.headshot_url} alt={player.full_name}
                width={44} height={44} unoptimized
                style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)', display: 'block' }}
              />
            ) : (
              <div style={{
                width: 44, height: 44, borderRadius: '50%', background: '#334155',
                border: '2px solid rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: '#fff',
              }}>{player.full_name[0]}</div>
            )}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 16, height: 16, borderRadius: '50%',
              background: col.bar, border: '2px solid #0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 6, fontWeight: 900, color: '#fff',
            }}>{player.position[0]}</div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
              Sell Order
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player.full_name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: col.bar, color: '#fff', borderRadius: 20, padding: '1px 6px', fontSize: 9, fontWeight: 800 }}>{player.position}</span>
              <span>{player.team_code}</span>
              <span>· {formatWeekLong(week)}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none',
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px' }}>

          {/* Transaction summary */}
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Transaction Summary
          </div>
          <div style={{
            background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
            overflow: 'hidden', marginBottom: 12,
          }}>
            {[
              {
                label: 'Acquired at',
                value: formatPrice(purchasePrice),
                sub: formatWeekLong(player.acquired_week),
                valueColor: '#475569',
              },
              {
                label: 'Current market price',
                value: formatPrice(currentPrice),
                sub: null,
                valueColor: '#0f172a',
              },
              {
                label: `Sell proceeds`,
                value: formatPrice(proceeds),
                sub: `after ${(BID_ASK_SPREAD * 100).toFixed(0)}% spread`,
                valueColor: '#0f172a',
              },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px',
                borderBottom: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{row.label}</div>
                  {row.sub && <div style={{ fontSize: 10, color: '#94a3b8' }}>{row.sub}</div>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</div>
              </div>
            ))}

            {/* P&L row — highlighted */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: isGain ? 'rgba(16,185,129,0.07)' : 'rgba(244,63,94,0.07)',
              borderTop: `1.5px solid ${isGain ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isGain ? '#059669' : '#e11d48' }}>
                Profit / Loss
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: isGain ? '#059669' : '#e11d48' }}>
                  {isGain ? '+' : ''}{formatPrice(pnl)}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: isGain ? '#10b981' : '#f43f5e' }}>
                  {isGain ? '▲' : '▼'} {Math.abs(pnlPct).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Market impact */}
          <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Market Impact
          </div>
          <div style={{
            background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
            overflow: 'hidden', marginBottom: 16,
          }}>
            {[
              {
                label: "Player's price after sale",
                value: formatPrice(priceAfter),
                sub: `−${(PRICE_IMPACT_RATE * 100).toFixed(1)}% market impact`,
                valueColor: '#e11d48',
              },
              {
                label: 'Your budget after sale',
                value: formatPrice(budgetAfter),
                sub: `+${formatPrice(proceeds)} returned`,
                valueColor: '#059669',
              },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 14px',
                borderBottom: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{row.sub}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: row.valueColor }}>{row.value}</div>
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={confirming}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                border: '1.5px solid #e2e8f0', background: '#fff',
                fontSize: 13, fontWeight: 700, color: '#64748b',
                cursor: confirming ? 'default' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmSell}
              disabled={confirming}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 12, border: 'none',
                background: confirming ? '#fecaca' : 'linear-gradient(135deg, #e11d48, #f43f5e)',
                fontSize: 13, fontWeight: 800, color: '#fff',
                cursor: confirming ? 'default' : 'pointer',
                boxShadow: confirming ? 'none' : '0 4px 14px rgba(244,63,94,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {confirming ? 'Processing...' : `Confirm Sale · ${formatPrice(proceeds)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PlayerRow = memo(function PlayerRow({
  p, selected, swapping, liveData, onPlayerClick, onSellClick,
}: PlayerRowProps) {
  const col        = POS_COLORS[p.position] ?? POS_COLORS.K;
  const isSelected = selected?.id === p.id;
  const eligible   = isEligibleForSwap(p, selected);
  const isSwapping = swapping.has(p.id);
  const isBench    = p.roster_slot === 'BENCH';
  const isLive     = liveData != null;
  const livePoints = liveData?.totals.fantasyPointsTotal ?? null;

  const currentPrice  = Number(p.current_price);
  const purchasePrice = Number(p.purchase_price);
  const pnl           = currentPrice - purchasePrice;
  const isGain        = pnl >= 0;

  return (
    <div
      onClick={() => { if (!isSwapping) onPlayerClick(p); }}
      style={{
        display: 'flex', alignItems: 'center',
        padding: '9px 20px',
        cursor: isSwapping ? 'default' : 'pointer',
        position: 'relative',
        background: isSelected
          ? col.light
          : isLive
            ? 'linear-gradient(135deg, rgba(5,150,105,0.04) 0%, rgba(255,255,255,0) 60%)'
            : 'transparent',
        outline: isSelected
          ? `1.5px solid ${col.ring}`
          : eligible
            ? `1.5px dashed ${col.ring}`
            : 'none',
        outlineOffset: '-2px',
        borderRadius: (isSelected || eligible) ? 10 : 0,
        transition: 'background 0.15s',
        opacity: isSwapping ? 0.6 : 1,
      }}
    >
      {/* Live left-rail accent */}
      {isLive && !isSelected && (
        <div style={{
          position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
          width: 3, height: '70%', minHeight: 24, borderRadius: 4,
          background: 'linear-gradient(180deg, #10b981, #059669)',
        }} />
      )}
      {/* Selected left-rail accent */}
      {isSelected && (
        <div style={{
          position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
          width: 4, height: '60%', minHeight: 18, borderRadius: 4, background: col.bar, opacity: 0.8,
        }} />
      )}

      <Avatar player={p} col={col} />

      {/* Name / position / live chips */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.full_name}
          </span>
          {isLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
              padding: '1px 6px', borderRadius: 20,
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
              fontSize: 8.5, fontWeight: 800, color: '#059669',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: '#10b981', flexShrink: 0,
                animation: 'live-pulse 1.4s ease-in-out infinite',
              }} />
              LIVE
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span>{p.team_code}</span>
          {isBench && <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600 }}>· BENCH</span>}
        </div>
        {isLive && liveData && <LiveStatChips totals={liveData.totals} />}
      </div>

      {/* Data columns */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 72, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          {formatPrice(currentPrice)}
        </div>
        <div style={{ width: 72, textAlign: 'right', fontSize: 12, color: '#64748b' }}>
          {formatPrice(purchasePrice)}
        </div>
        <div style={{ width: 60, textAlign: 'right' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: isGain ? '#059669' : '#e11d48' }}>
            {isGain ? '+' : ''}{formatPrice(pnl)}
          </span>
        </div>
        <div style={{ width: 68, textAlign: 'right' }}>
          {isLive && livePoints != null ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>{formatPoints(livePoints)}</span>
          ) : p.last_week_points != null ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{formatPoints(p.last_week_points)}</span>
          ) : (
            <span style={{ fontSize: 12, color: '#e2e8f0' }}>—</span>
          )}
        </div>
        <div style={{ width: 72, textAlign: 'right', fontSize: 12, color: '#64748b' }}>
          {p.season_points != null ? formatPoints(p.season_points) : '—'}
        </div>
      </div>

      {/* Sell + link (80px) */}
      <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
        <button
          onClick={e => { e.stopPropagation(); onSellClick(p); }}
          disabled={isSwapping}
          style={{
            padding: '4px 8px', borderRadius: 8, border: '1px solid #fecaca',
            background: '#fff', fontSize: 10, fontWeight: 700, color: '#e11d48',
            cursor: isSwapping ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
        >
          Sell
        </button>
        <Link
          href={`/players/${p.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            width: 26, height: 26, borderRadius: 7, border: '1px solid #f1f5f9',
            background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94a3b8', flexShrink: 0, textDecoration: 'none',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </Link>
      </div>

      {/* Swap overlay */}
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
});

export default function RosterList({ roster, teamId, currentWeek, budgetRemaining }: {
  roster: RosterPlayer[];
  teamId: number;
  currentWeek: number;
  budgetRemaining: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected]     = useState<RosterPlayer | null>(null);
  const [swapping, setSwapping]     = useState<Set<number>>(new Set());
  const [sellTarget, setSellTarget] = useState<RosterPlayer | null>(null);

  // Live stats via WebSocket — subscribe to all players on roster who have an ESPN ID
  const espnIds = useMemo(
    () => roster.map(p => p.espn_athlete_id).filter(Boolean) as string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster.map(p => p.espn_athlete_id).join(',')],
  );
  const liveStats = useLiveStats(espnIds);

  const handlePlayerClick = useCallback((p: RosterPlayer) => {
    if (swapping.has(p.id)) return;
    setSelected(prev => {
      if (!prev) return p;
      if (prev.id === p.id) return null;
      if (isEligibleForSwap(p, prev)) { executeSwap(prev, p); return null; }
      return p;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapping]);

  const handleSellClick = useCallback((p: RosterPlayer) => {
    setSellTarget(p);
  }, []);

  const starters = roster.filter(p => p.roster_slot !== 'BENCH');
  const bench    = roster.filter(p => p.roster_slot === 'BENCH');

  function getEmptyStarterSlots(slotPrefix: string, maxStarters: number, groupPlayers: RosterPlayer[]): string[] {
    const emptyCount = maxStarters - groupPlayers.length;
    if (emptyCount <= 0) return [];
    const filled = new Set(groupPlayers.map(p => p.roster_slot).filter(Boolean));
    const result: string[] = [];
    for (let i = 1; result.length < emptyCount; i++) {
      const slot = `${slotPrefix}${i}`;
      if (!filled.has(slot)) result.push(slot);
    }
    return result;
  }

  const isSelectionActive = selected !== null;

  // WR and TE share flex starter slots — treat as same group for eligibility
  function sameGroup(a: string, b: string): boolean {
    const flex = ['WR', 'TE'];
    if (flex.includes(a) && flex.includes(b)) return true;
    return a === b;
  }

  // Eligible targets for a regular swap (two real players)
  function isEligible(p: RosterPlayer): boolean {
    if (!selected) return false;
    if (p.id === selected.id) return false;
    if (!sameGroup(selected.position, p.position)) return false;
    const selectedOnBench = selected.roster_slot === 'BENCH';
    const targetOnBench   = p.roster_slot === 'BENCH';
    return selectedOnBench !== targetOnBench;
  }

  // Empty starter slot is eligible when a bench player of matching group is selected
  function isEmptyStarterEligible(positions: readonly string[]): boolean {
    if (!selected) return false;
    if (selected.roster_slot !== 'BENCH') return false;
    return positions.includes(selected.position);
  }

  // Empty bench slot is eligible when any starter is selected
  function isEmptyBenchEligible(): boolean {
    if (!selected) return false;
    return selected.roster_slot !== 'BENCH';
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

  async function executeMove(player: RosterPlayer, targetSlot: string) {
    setSwapping(new Set([player.id]));
    setSelected(null);
    try {
      const res = await fetch('/api/roster/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: teamId, player_id: player.id, target_slot: targetSlot }),
      });
      if (!res.ok) throw new Error('Move failed');
      startTransition(() => router.refresh());
    } catch {
      startTransition(() => router.refresh());
    } finally {
      setSwapping(new Set());
    }
  }

  // ── Empty slot row ──────────────────────────────────────────────────────────
  function EmptySlotRow({
    targetSlot, label, barColor, ringColor, lightColor, eligible, onMove,
  }: {
    targetSlot: string; label: string;
    barColor: string; ringColor: string; lightColor: string;
    eligible: boolean; onMove: () => void;
  }) {
    return (
      <div
        onClick={eligible ? onMove : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          padding: '9px 20px',
          cursor: eligible ? 'pointer' : 'default',
          background: eligible ? lightColor : 'transparent',
          outline: eligible ? `1.5px dashed ${ringColor}` : 'none',
          outlineOffset: '-2px',
          borderRadius: eligible ? 10 : 0,
          transition: 'all 0.2s',
          position: 'relative',
        }}
        onMouseEnter={e => { if (eligible) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
        onMouseLeave={e => { if (eligible) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      >
        {eligible && (
          <div style={{
            position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
            width: 4, height: '60%', minHeight: 18, borderRadius: 4, background: ringColor, opacity: 0.8,
          }} />
        )}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, marginRight: 12,
          border: `2px dashed ${eligible ? ringColor : '#e2e8f0'}`,
          background: eligible ? lightColor : '#f8fafc',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {eligible ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ringColor} strokeWidth="2.5" strokeLinecap="round">
              <polyline points="17 11 12 6 7 11" /><line x1="12" y1="6" x2="12" y2="18" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: eligible ? ringColor : '#cbd5e1', fontStyle: 'italic' }}>
            {eligible ? `Move here` : `Empty slot`}
          </div>
          <div style={{ fontSize: 10, color: eligible ? ringColor : '#e2e8f0', opacity: 0.8 }}>{label}</div>
        </div>
        {eligible && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: ringColor,
            background: lightColor, border: `1px solid ${ringColor}`,
            borderRadius: 20, padding: '2px 8px', opacity: 0.9,
          }}>
            ↑ Start
          </div>
        )}
      </div>
    );
  }

  // ── Empty bench slot row ────────────────────────────────────────────────────
  function EmptyBenchSlotRow({ eligible, onMove }: { eligible: boolean; onMove: () => void }) {
    return (
      <div
        onClick={eligible ? onMove : undefined}
        style={{
          display: 'flex', alignItems: 'center',
          padding: '9px 20px',
          cursor: eligible ? 'pointer' : 'default',
          background: eligible ? '#f8fafc' : 'transparent',
          outline: eligible ? '1.5px dashed #cbd5e1' : 'none',
          outlineOffset: '-2px',
          borderRadius: eligible ? 10 : 0,
          transition: 'all 0.2s',
          opacity: eligible ? 1 : 0.45,
          position: 'relative',
        }}
        onMouseEnter={e => { if (eligible) (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
        onMouseLeave={e => { if (eligible) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      >
        {eligible && (
          <div style={{
            position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
            width: 4, height: '60%', minHeight: 18, borderRadius: 4, background: '#94a3b8', opacity: 0.7,
          }} />
        )}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, marginRight: 12,
          border: `2px dashed ${eligible ? '#94a3b8' : '#e2e8f0'}`,
          background: '#f8fafc',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {eligible ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="17 13 12 18 7 13" /><line x1="12" y1="18" x2="12" y2="6" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: eligible ? '#64748b' : '#cbd5e1', fontStyle: 'italic' }}>
            {eligible ? 'Move to bench' : 'Empty bench slot'}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', opacity: 0.7 }}>Bench</div>
        </div>
        {eligible && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#64748b',
            background: '#f1f5f9', border: '1px solid #cbd5e1',
            borderRadius: 20, padding: '2px 8px',
          }}>
            ↓ Bench
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 16, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', overflow: 'hidden', position: 'relative' }}>
      <style>{`
        @keyframes eligible-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
          50%       { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.8); }
        }
        /* Chip glow overlays */
        @keyframes chip-yard-flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes chip-neg-flash {
          0%   { opacity: 1; box-shadow: 0 0 6px rgba(220,38,38,0.45); }
          100% { opacity: 0; box-shadow: none; }
        }
        @keyframes chip-td-surge {
          0%   { opacity: 1; transform: scale(1.08); box-shadow: 0 0 0 3px rgba(245,158,11,0.45), 0 0 12px rgba(245,158,11,0.3); }
          50%  { opacity: 0.75; transform: scale(1.03); box-shadow: 0 0 0 5px rgba(245,158,11,0.15); }
          100% { opacity: 0; transform: scale(1); box-shadow: none; }
        }
        /* Delta badges rising upward */
        @keyframes delta-rise {
          0%   { opacity: 0; transform: translateX(-50%) translateY(3px); }
          12%  { opacity: 1; transform: translateX(-50%) translateY(-1px); }
          70%  { opacity: 0.85; transform: translateX(-50%) translateY(-13px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
        @keyframes delta-td-rise {
          0%   { opacity: 0; transform: translateX(-50%) translateY(3px) scale(0.7); }
          14%  { opacity: 1; transform: translateX(-50%) translateY(-3px) scale(1.2); }
          55%  { opacity: 1; transform: translateX(-50%) translateY(-15px) scale(1.05); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-24px) scale(0.9); }
        }
        @keyframes delta-neg-rise {
          0%   { opacity: 0; transform: translateX(-50%) translateY(3px); }
          12%  { opacity: 1; transform: translateX(-50%) translateY(-1px); }
          70%  { opacity: 0.7; transform: translateX(-50%) translateY(-11px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-17px); }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Full Roster</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{roster.length} active players · {starters.length} starters · {bench.length} bench</p>
        </div>
        {/* Column labels — widths mirror PlayerRow data columns exactly.
            The trailing 80px spacer matches the sell button (≈46px) + link icon (≈34px)
            so every label sits directly above its column. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span style={{ width: 72, textAlign: 'right' }}>Price</span>
          <span style={{ width: 72, textAlign: 'right' }}>Bought at</span>
          <span style={{ width: 60, textAlign: 'right' }}>P&amp;L</span>
          <span style={{ width: 68, textAlign: 'right' }}>Live / Wk</span>
          <span style={{ width: 72, textAlign: 'right' }}>Season</span>
          <span style={{ width: 80, flexShrink: 0 }} />
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
              {selected.roster_slot === 'BENCH' ? 'Starting' : 'Moving'} {selected.full_name}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {selected.roster_slot === 'BENCH'
                ? '— select an open starter slot or player to swap with'
                : '— select a bench player to swap with, or move to bench'}
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

        {STARTER_SLOT_GROUPS.map(group => {
          const groupPlayers = starters.filter(p => (group.positions as readonly string[]).includes(p.position));
          const emptySlots   = getEmptyStarterSlots(group.slotPrefix, group.maxStarters, groupPlayers);
          if (groupPlayers.length === 0 && emptySlots.length === 0) return null;

          // Use the first position's color; for FLEX use WR color
          const firstPos  = group.positions[0] as string;
          const col       = POS_COLORS[firstPos] ?? POS_COLORS.K;
          const eligible  = isEmptyStarterEligible(group.positions);
          const totalCount = groupPlayers.length + (eligible ? emptySlots.length : 0);

          return (
            <div key={group.key}>
              <div style={{
                padding: '6px 20px',
                borderTop: '1px solid #f1f5f9',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#fafafa',
              }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: col.bar, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {group.label}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
                  · {groupPlayers.length}/{group.maxStarters}
                </span>
                {emptySlots.length > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 20, padding: '1px 6px' }}>
                    {emptySlots.length} open
                  </span>
                )}
              </div>
              {groupPlayers.map(p => (
                <PlayerRow
                  key={p.id} p={p}
                  selected={selected} swapping={swapping}
                  liveData={liveStats.get(p.espn_athlete_id ?? '') ?? undefined}
                  onPlayerClick={handlePlayerClick}
                  onSellClick={handleSellClick}
                />
              ))}
              {emptySlots.map(slot => (
                <EmptySlotRow
                  key={slot}
                  targetSlot={slot}
                  label={group.singularLabel}
                  barColor={col.bar}
                  ringColor={col.ring}
                  lightColor={col.light}
                  eligible={eligible}
                  onMove={() => selected && executeMove(selected, slot)}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Bench section — always shown so starters can be moved down */}
      <>
        <div style={{ margin: '0 20px', borderTop: '2px dashed #e2e8f0' }} />
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
              marginLeft: 'auto', fontSize: 10,
              color: POS_COLORS[selected!.position]?.ring ?? '#94a3b8',
              fontWeight: 700,
            }}>
              {isEmptyBenchEligible()
                ? 'Move to bench →'
                : bench.filter(p => isEligible(p)).length > 0
                  ? `${bench.filter(p => isEligible(p)).length} eligible swap${bench.filter(p => isEligible(p)).length > 1 ? 's' : ''}`
                  : 'No eligible bench players'}
            </span>
          )}
        </div>

        {POS_ORDER.map(pos => {
          const players = bench.filter(p => p.position === pos);
          if (!players.length) return null;
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
              {players.map(p => (
                <PlayerRow
                  key={p.id} p={p}
                  selected={selected} swapping={swapping}
                  liveData={liveStats.get(p.espn_athlete_id ?? '') ?? undefined}
                  onPlayerClick={handlePlayerClick}
                  onSellClick={handleSellClick}
                />
              ))}
            </div>
          );
        })}

        {/* Empty bench slot — always shown so any starter can be sent down */}
        <EmptyBenchSlotRow
          eligible={isEmptyBenchEligible()}
          onMove={() => selected && executeMove(selected, 'BENCH')}
        />
      </>

      {/* Sell modal */}
      {sellTarget && (
        <SellModal
          player={sellTarget}
          teamId={teamId}
          week={currentWeek}
          budgetRemaining={budgetRemaining}
          onClose={() => setSellTarget(null)}
          onSuccess={() => {
            setSellTarget(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
