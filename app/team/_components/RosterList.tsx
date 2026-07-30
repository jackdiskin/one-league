'use client';

import Image from 'next/image';
import { useState, useTransition, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPoints, formatPlayerName } from '@/lib/format';
import { useLiveStats, getLivePoints, type LiveStatDelta } from '@/hooks/useLiveStats';
import TeamLogo from '@/components/TeamLogo';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import MatchupBadge from '@/components/MatchupBadge';
import type { Matchup } from '@/lib/schedule';

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
  projected_points: number | null;
  season_points: number | null;
  position_rank: number | null;
  external_player_id: string | null;
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

// Single neutral accent used for all selection/eligibility highlighting on
// this screen — never varies by position, per the standing no-color-coded-
// positions rule.
const ACCENT_RING  = '#059669';
const ACCENT_LIGHT = '#f0fdf4';
const ACCENT_BAR   = '#059669';

const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];

// Named starter slots, in display order. WR1/WR2/WR3 are fixed WR/TE slots;
// FLEX1 is the true FLEX slot — RB, WR, or TE — everyone else is fixed to
// their own position. badgeLabel is the short gray pill shown inline on the
// player's own row (no group headers on this screen). Rendered by exact
// slot name (not position category) so a RB sitting in FLEX1 shows up in
// the right place instead of overflowing the Running Backs group.
const STARTER_SLOTS = [
  { slot: 'QB1',   eligiblePositions: ['QB'],            badgeLabel: 'QB'    },
  { slot: 'RB1',   eligiblePositions: ['RB'],            badgeLabel: 'RB'    },
  { slot: 'RB2',   eligiblePositions: ['RB'],            badgeLabel: 'RB'    },
  { slot: 'WR1',   eligiblePositions: ['WR', 'TE'],       badgeLabel: 'WR/TE' },
  { slot: 'WR2',   eligiblePositions: ['WR', 'TE'],       badgeLabel: 'WR/TE' },
  { slot: 'WR3',   eligiblePositions: ['WR', 'TE'],       badgeLabel: 'WR/TE' },
  { slot: 'FLEX1', eligiblePositions: ['RB', 'WR', 'TE'], badgeLabel: 'FLEX'  },
] as const;

// Gray pill badge — matches PosBadge in app/market/page.tsx. Never
// color-coded by position; shows the slot's badge label for starters
// (QB / RB / WR/TE / FLEX) or the raw position for bench players.
function rowBadgeLabel(p: RosterPlayer): string {
  return STARTER_SLOTS.find(s => s.slot === p.roster_slot)?.badgeLabel ?? p.position;
}

function PosBadge({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: '#64748b', background: '#f1f5f9',
      borderRadius: 20, padding: '1px 5px', flexShrink: 0,
    }}>{label}</span>
  );
}

function eligiblePositionsForSlot(slot: string): readonly string[] {
  return STARTER_SLOTS.find(s => s.slot === slot)?.eligiblePositions ?? [];
}

// Extracted so PlayerRow (defined outside RosterList) can call it without closures.
// Two players can swap whenever each is eligible for the other's current slot —
// bench accepts anyone, so this still covers ordinary bench<->starter swaps, but
// it also allows direct starter<->starter swaps (e.g. a WR sitting in WR1 and
// whoever's in the FLEX slot), so any eligible player can move into FLEX
// regardless of whether they're currently starting elsewhere or on the bench.
function isEligibleForSwap(p: RosterPlayer, selected: RosterPlayer | null): boolean {
  if (!selected) return false;
  if (p.id === selected.id) return false;
  if (p.roster_slot === 'BENCH' && selected.roster_slot === 'BENCH') return false;
  const pAcceptsSelected = p.roster_slot === 'BENCH' || eligiblePositionsForSlot(p.roster_slot).includes(selected.position);
  const selectedAcceptsP = selected.roster_slot === 'BENCH' || eligiblePositionsForSlot(selected.roster_slot).includes(p.position);
  return pAcceptsSelected && selectedAcceptsP;
}

interface PlayerRowProps {
  p: RosterPlayer;
  selected: RosterPlayer | null;
  swapping: Set<number>;
  liveData: import('@/hooks/useLiveStats').LivePlayerStats | undefined;
  onPlayerClick: (p: RosterPlayer) => void;
  onProfileClick: (p: RosterPlayer) => void;
  matchups: Record<string, Matchup>;
}

function Avatar({ player, size = 40 }: { player: RosterPlayer; size?: number }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0, marginRight: 12 }}>
      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt={player.full_name}
          width={size} height={size} unoptimized
          style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: 8, background: '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.35, fontWeight: 700, color: '#64748b',
        }}>
          {player.full_name[0]}
        </div>
      )}
    </div>
  );
}

const PlayerRow = memo(function PlayerRow({
  p, selected, swapping, liveData, onPlayerClick, onProfileClick, matchups,
}: PlayerRowProps) {
  const isSelected = selected?.id === p.id;
  const eligible   = isEligibleForSwap(p, selected);
  const isSwapping = swapping.has(p.id);
  const isBench    = p.roster_slot === 'BENCH';
  const isLive     = liveData != null;
  const livePoints = liveData?.totals.fantasyPointsTotal ?? null;
  // While a swap is in progress, dim/gray out anyone who isn't a valid target
  // (wrong position group) so it's obvious at a glance who can be subbed in.
  const dimmed     = selected != null && !isSelected && !eligible;

  return (
    <div
      onClick={() => {
        if (isSwapping) return;
        // While a swap is pending, clicking any row (selected, eligible, or
        // not) completes/cancels/reselects via the same logic as the Move
        // button — clicking a profile mid-swap would be a dead end.
        if (selected) { onPlayerClick(p); return; }
        onProfileClick(p);
      }}
      style={{
        display: 'flex', alignItems: 'center',
        padding: '9px 20px',
        cursor: isSwapping ? 'default' : 'pointer',
        position: 'relative',
        background: isSelected
          ? ACCENT_LIGHT
          : isLive
            ? 'linear-gradient(135deg, rgba(5,150,105,0.04) 0%, rgba(255,255,255,0) 60%)'
            : 'transparent',
        outline: isSelected
          ? `1.5px solid ${ACCENT_RING}`
          : eligible
            ? `1.5px dashed ${ACCENT_RING}`
            : 'none',
        outlineOffset: '-2px',
        borderRadius: (isSelected || eligible) ? 10 : 0,
        transition: 'background 0.15s, opacity 0.15s, filter 0.15s',
        opacity: isSwapping ? 0.6 : dimmed ? 0.4 : 1,
        filter: dimmed ? 'grayscale(1)' : 'none',
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
          width: 4, height: '60%', minHeight: 18, borderRadius: 4, background: ACCENT_BAR, opacity: 0.8,
        }} />
      )}

      <Avatar player={p} />

      {/* Name / position / live chips */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatPlayerName(p.full_name)}
          </span>
          <PosBadge label={rowBadgeLabel(p)} />
          <TeamLogo code={p.team_code} size={12} />
          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{p.team_code}</span>
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
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MatchupBadge matchup={matchups[p.team_code]} />
          {isBench && <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 600 }}>· BENCH</span>}
        </div>
        {isLive && liveData && <LiveStatChips totals={liveData.totals} />}
      </div>

      {/* Data columns */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 68, textAlign: 'right' }}>
          {isLive && livePoints != null ? (
            <span style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>{formatPoints(livePoints)}</span>
          ) : p.last_week_points != null ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{formatPoints(p.last_week_points)}</span>
          ) : (
            <span style={{ fontSize: 12, color: '#e2e8f0' }}>—</span>
          )}
        </div>
        <div style={{ width: 56, textAlign: 'right', fontSize: 12, color: '#64748b' }}>
          {p.projected_points != null ? formatPoints(p.projected_points) : '—'}
        </div>
        <div style={{ width: 56, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#64748b' }}>
          {p.position_rank != null ? `${p.position_rank}` : '—'}
        </div>
        <div style={{ width: 72, textAlign: 'right', fontSize: 12, color: '#64748b' }}>
          {p.season_points != null ? formatPoints(p.season_points) : '—'}
        </div>
      </div>

      {/* Move (select for starter/bench swap) — 64px */}
      <div style={{ width: 64, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <button
          onClick={e => { e.stopPropagation(); if (!isSwapping) onPlayerClick(p); }}
          disabled={isSwapping}
          style={{
            padding: '5px 10px', borderRadius: 8,
            border: isSelected ? `1px solid ${ACCENT_RING}` : '1px solid #e2e8f0',
            background: isSelected ? ACCENT_LIGHT : '#fff',
            color: isSelected ? ACCENT_RING : '#475569',
            fontSize: 11, fontWeight: 700,
            cursor: isSwapping ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          Move
        </button>
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

export default function RosterList({ roster, teamId, matchups, season }: {
  roster: RosterPlayer[];
  teamId: number;
  matchups: Record<string, Matchup>;
  season: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected]     = useState<RosterPlayer | null>(null);
  const [swapping, setSwapping]     = useState<Set<number>>(new Set());
  const [profileId, setProfileId]   = useState<number | null>(null);

  // Live stats via WebSocket — subscribe to all players on roster by SportsDataIO PlayerID
  const playerIds = useMemo(
    () => roster.map(p => p.external_player_id).filter(Boolean) as string[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster.map(p => p.external_player_id).join(',')],
  );
  const liveStats = useLiveStats(playerIds);

  const handlePlayerClick = useCallback((p: RosterPlayer) => {
    if (swapping.has(p.id)) return;
    setPickerSlot(null);
    setSelected(prev => {
      if (!prev) return p;
      if (prev.id === p.id) return null;
      if (isEligibleForSwap(p, prev)) { executeSwap(prev, p); return null; }
      return p;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swapping]);

  // Keyed off the named starter slots (not just "!== BENCH") so a stray or
  // legacy roster_slot value (e.g. an old K1 from before Kickers were
  // dropped from the format) can never miscount as a starter — it falls
  // through to bench instead, keeping starters+bench always equal to the
  // roster total.
  const starterSlotNames = new Set<string>(STARTER_SLOTS.map(s => s.slot));
  const starters = roster.filter(p => starterSlotNames.has(p.roster_slot));
  const bench    = roster.filter(p => !starterSlotNames.has(p.roster_slot));

  // Total bench capacity = roster size minus the fixed number of named starter
  // slots, so the "empty bench slot" placeholder only shows up when the bench
  // genuinely has room (not just whenever the roster happens to be short a
  // starter, which used to show a phantom empty slot even at a full 4/4 bench).
  const MAX_BENCH = 11 - STARTER_SLOTS.length;

  const isSelectionActive = selected !== null;

  // Which slot is currently showing its "pick a bench player" dropdown
  // (only relevant when nothing is pre-selected — see EmptySlotRow).
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);

  // Eligible targets for a regular swap (two real players) — reuses the
  // same slot-aware rule as PlayerRow's isEligibleForSwap.
  const isEligible = useCallback((p: RosterPlayer) => isEligibleForSwap(p, selected), [selected]);

  // Empty starter slot is eligible when a bench player of matching group is selected
  function isEmptyStarterEligible(slot: string): boolean {
    if (!selected) return false;
    if (selected.roster_slot !== 'BENCH') return false;
    return eligiblePositionsForSlot(slot).includes(selected.position);
  }

  // Empty bench slot is eligible when any starter is selected
  function isEmptyBenchEligible(): boolean {
    if (!selected) return false;
    return selected.roster_slot !== 'BENCH';
  }

  async function executeSwap(playerA: RosterPlayer, playerB: RosterPlayer) {
    setSwapping(new Set([playerA.id, playerB.id]));
    setSelected(null);
    setPickerSlot(null);

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
    setPickerSlot(null);
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
  // Two ways to fill an empty starter slot: (1) a bench player is already
  // selected and this slot accepts their position — click fills it directly;
  // (2) nothing is selected — click the "+" to open a picker of every
  // eligible bench player and choose one, no pre-selection needed.
  function EmptySlotRow({
    label, eligible, onMove,
    pickable, pickerOpen, onTogglePicker, onPick,
  }: {
    targetSlot: string; label: string;
    eligible: boolean; onMove: () => void;
    pickable: RosterPlayer[]; pickerOpen: boolean;
    onTogglePicker: () => void; onPick: (p: RosterPlayer) => void;
  }) {
    const canPick = !isSelectionActive && pickable.length > 0;
    const active  = eligible || canPick;
    const ringColor  = ACCENT_RING;
    const lightColor = ACCENT_LIGHT;

    function handleClick() {
      if (eligible) { onMove(); return; }
      if (canPick) onTogglePicker();
    }

    return (
      <div>
        <div
          onClick={handleClick}
          style={{
            display: 'flex', alignItems: 'center',
            padding: '9px 20px',
            cursor: active ? 'pointer' : 'default',
            background: eligible ? lightColor : pickerOpen ? '#f8fafc' : 'transparent',
            outline: eligible ? `1.5px dashed ${ringColor}` : pickerOpen ? `1.5px solid ${ringColor}` : 'none',
            outlineOffset: '-2px',
            borderRadius: (eligible || pickerOpen) ? 10 : 0,
            transition: 'all 0.2s',
            position: 'relative',
          }}
          onMouseEnter={e => { if (active) (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { if (active) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          {eligible && (
            <div style={{
              position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
              width: 4, height: '60%', minHeight: 18, borderRadius: 4, background: ringColor, opacity: 0.8,
            }} />
          )}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0, marginRight: 12,
            border: `2px dashed ${active ? ringColor : '#e2e8f0'}`,
            background: eligible ? lightColor : '#f8fafc',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active ? ringColor : '#cbd5e1'} strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: active ? ringColor : '#cbd5e1', fontStyle: 'italic' }}>
              {eligible ? 'Move here' : canPick ? 'Tap to add a player' : 'Empty slot'}
            </div>
            <div style={{ fontSize: 10, color: active ? ringColor : '#e2e8f0', opacity: 0.8 }}>{label}</div>
          </div>
          {active && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: ringColor,
              background: lightColor, border: `1px solid ${ringColor}`,
              borderRadius: 20, padding: '2px 8px', opacity: 0.9,
            }}>
              {eligible ? '↑ Start' : pickerOpen ? '✕ Close' : '+ Add'}
            </div>
          )}
        </div>

        {pickerOpen && canPick && (
          <div style={{ padding: '4px 20px 10px', background: '#fafafa' }}>
            {pickable.map(p => (
              <div
                key={p.id}
                onClick={() => onPick(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 9, cursor: 'pointer',
                  background: '#fff', border: '1px solid #e2e8f0', marginTop: 5,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = ringColor; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'; }}
              >
                <Avatar player={p} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {formatPlayerName(p.full_name)}
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{p.position} · {p.team_code}</div>
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: ringColor,
                  background: lightColor, border: `1px solid ${ringColor}`,
                  borderRadius: 20, padding: '2px 8px', flexShrink: 0,
                }}>
                  Start
                </div>
              </div>
            ))}
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
        {/* Column labels — widths mirror PlayerRow data columns exactly. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span style={{ width: 68, textAlign: 'right' }}>Live / Wk</span>
          <span style={{ width: 56, textAlign: 'right' }}>Proj</span>
          <span style={{ width: 56, textAlign: 'right' }}>Pos Rk</span>
          <span style={{ width: 72, textAlign: 'right' }}>Season</span>
          <span style={{ width: 64, flexShrink: 0 }} />
        </div>
      </div>

      {/* Swap banner */}
      {selected && (
        <div style={{
          padding: '10px 20px',
          background: ACCENT_LIGHT,
          borderBottom: `2px solid ${ACCENT_RING}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: ACCENT_RING,
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
              {selected.roster_slot === 'BENCH' ? 'Starting' : 'Moving'} {formatPlayerName(selected.full_name)}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {selected.roster_slot === 'BENCH'
                ? '— select an open starter slot or player to swap with'
                : '— select an eligible player to swap with, or move to bench'}
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
          padding: '9px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #f1f5f9',
          fontSize: 13, fontWeight: 800, color: '#475569',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Starters
        </div>

        {STARTER_SLOTS.map(slotDef => {
          const occupant = starters.find(p => p.roster_slot === slotDef.slot);
          if (occupant) {
            return (
              <PlayerRow
                key={occupant.id} p={occupant}
                selected={selected} swapping={swapping}
                liveData={liveStats.get(occupant.external_player_id ?? '') ?? undefined}
                onPlayerClick={handlePlayerClick}
                onProfileClick={p => setProfileId(p.id)}
                matchups={matchups}
              />
            );
          }
          const eligible = isEmptyStarterEligible(slotDef.slot);
          const pickable = bench.filter(p => (slotDef.eligiblePositions as readonly string[]).includes(p.position) && !swapping.has(p.id));
          return (
            <EmptySlotRow
              key={slotDef.slot}
              targetSlot={slotDef.slot}
              label={slotDef.badgeLabel}
              eligible={eligible}
              onMove={() => selected && executeMove(selected, slotDef.slot)}
              pickable={pickable}
              pickerOpen={pickerSlot === slotDef.slot}
              onTogglePicker={() => setPickerSlot(prev => (prev === slotDef.slot ? null : slotDef.slot))}
              onPick={p => executeMove(p, slotDef.slot)}
            />
          );
        })}
      </div>

      {/* Bench section — always shown so starters can be moved down */}
      <>
        <div style={{
          height: 6,
          background: 'linear-gradient(90deg, #0f172a 0%, #334155 50%, #0f172a 100%)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }} />
        <div style={{
          padding: '9px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #f1f5f9',
          fontSize: 13, fontWeight: 800, color: '#64748b',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          Bench
          <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>· {bench.length} players</span>
          {isSelectionActive && (
            <span style={{
              marginLeft: 'auto', fontSize: 10,
              color: ACCENT_RING,
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

        {POS_ORDER.flatMap(pos => bench.filter(p => p.position === pos)).map(p => (
          <PlayerRow
            key={p.id} p={p}
            selected={selected} swapping={swapping}
            liveData={liveStats.get(p.external_player_id ?? '') ?? undefined}
            onPlayerClick={handlePlayerClick}
            onProfileClick={p => setProfileId(p.id)}
            matchups={matchups}
          />
        ))}

        {/* Empty bench slot — only shown when the bench actually has room */}
        {bench.length < MAX_BENCH && (
          <EmptyBenchSlotRow
            eligible={isEmptyBenchEligible()}
            onMove={() => selected && executeMove(selected, 'BENCH')}
          />
        )}
      </>

      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
