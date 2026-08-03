'use client';

import Image from 'next/image';
import { useState, useTransition, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPoints, formatPlayerName } from '@/lib/format';
import { useLiveStats, getLivePoints, type LiveStatDelta } from '@/hooks/useLiveStats';
import TeamLogo from '@/components/TeamLogo';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import { STARTER_SLOTS, eligiblePositionsForSlot, slotBadgeLabel, isEligibleSwap } from '@/components/field/slots';
import PositionChip from '@/components/ui/PositionChip';
import SectionHeader from '@/components/ui/SectionHeader';
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
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((chip, i) => {
        const flash = flashes[chip.flashKey];
        return (
          <span
            key={i}
            className="relative inline-flex items-baseline gap-1 rounded-control border px-1.5 py-0.5"
            // Per-stat colour is a data key, like position colour — not decoration.
            style={{ borderColor: chip.border, background: chip.bg, color: chip.color }}
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
            <span className="relative font-mono tabular-nums text-label">
              {chip.value}
            </span>
            <span className="relative text-eyebrow uppercase opacity-65">
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
const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];

// Named starter slots, in display order. WR1/WR2/WR3 are fixed WR/TE slots;
// FLEX1 is the true FLEX slot — RB, WR, or TE — everyone else is fixed to
// their own position. badgeLabel is the short gray pill shown inline on the
// player's own row (no group headers on this screen). Rendered by exact
// slot name (not position category) so a RB sitting in FLEX1 shows up in
// the right place instead of overflowing the Running Backs group.
// Canonical definitions now live in components/field/slots.ts — imported above.

// Gray pill badge — matches PosBadge in app/market/page.tsx. Never
// color-coded by position; shows the slot's badge label for starters
// (QB / RB / WR/TE / FLEX) or the raw position for bench players.
function rowBadgeLabel(p: RosterPlayer): string {
  return slotBadgeLabel(p.roster_slot, p.position);
}

function PosBadge({ label }: { label: string }) {
  return <PositionChip label={label} />;
}

// Null-safe wrapper around the canonical rule in components/field/slots.ts —
// that's the single source of truth for slot eligibility (see its docstring
// for why this must never be redefined locally again).
function isEligibleForSwap(p: RosterPlayer, selected: RosterPlayer | null): boolean {
  return selected != null && isEligibleSwap(p, selected);
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
    <div className="relative mr-3 shrink-0">
      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt="" width={size} height={size} unoptimized
          className="block object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-pill bg-emerald-tint text-emerald"
          style={{ width: size, height: size }}
        >
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
      role="button"
      tabIndex={isSwapping ? -1 : 0}
      onClick={() => {
        if (isSwapping) return;
        // While a swap is pending, clicking any row (selected, eligible, or
        // not) completes/cancels/reselects via the same logic as the Move
        // button — clicking a profile mid-swap would be a dead end.
        if (selected) { onPlayerClick(p); return; }
        onProfileClick(p);
      }}
      onKeyDown={e => {
        if (isSwapping) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (selected) onPlayerClick(p); else onProfileClick(p);
      }}
      className={[
        'relative flex items-center px-5 py-2.5',
        'transition-colors duration-150 ease-out-quart',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald',
        isSwapping ? 'cursor-default' : 'cursor-pointer',
        isSelected
          ? 'bg-emerald-tint ring-2 ring-inset ring-emerald'
          : eligible
            ? 'bg-emerald-tint/50 ring-1 ring-inset ring-emerald-line'
            : isLive
              ? 'bg-emerald-tint/40'
              : 'hover:bg-surface-sunken',
        isSwapping ? 'opacity-60' : dimmed ? 'opacity-40' : '',
      ].join(' ')}
    >
      {/* Live left-rail accent */}
      {isLive && !isSelected && (
        <div aria-hidden="true" className="absolute left-1 top-1/2 h-[70%] min-h-6 w-[3px] -translate-y-1/2 rounded-pill bg-emerald" />
      )}
      {/* Selected left-rail accent */}
      {isSelected && (
        <div aria-hidden="true" className="absolute left-1 top-1/2 h-[60%] min-h-[18px] w-1 -translate-y-1/2 rounded-pill bg-emerald" />
      )}

      <Avatar player={p} />

      {/* Name / position / live chips — name only shrinks (never grows), so
          the position badge and team logo sit right against it instead of
          being pushed to the far edge of the row; it still ellipsizes first
          under real pressure since it's the only shrinkable item here. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-nowrap items-center gap-1.5">
          <span className="min-w-0 truncate text-body font-medium text-ink">
            {formatPlayerName(p.full_name)}
          </span>
          <PosBadge label={rowBadgeLabel(p)} />
          <TeamLogo code={p.team_code} size={12} />
          <span className="shrink-0 text-label text-ink-3">{p.team_code}</span>
          {isLive && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-emerald-line bg-emerald-tint px-1.5 py-0.5 text-eyebrow uppercase text-emerald">
              <span aria-hidden="true" className="motion-safe:animate-live-dot h-1 w-1 shrink-0 rounded-pill bg-emerald" />
              Live
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-label text-ink-3">
          <MatchupBadge matchup={matchups[p.team_code]} />
          {isBench && <span className="text-eyebrow uppercase text-ink-3">· Bench</span>}
        </div>
        {isLive && liveData && <LiveStatChips totals={liveData.totals} />}
      </div>

      {/* Data columns — Live/Last wk and Pos rk hide first as the row
          narrows; Proj (and the name/team/position to its left) never do. */}
      <div className="flex shrink-0 items-center font-mono tabular-nums">
        <div className="hidden w-[68px] text-right @lg:block">
          {isLive && livePoints != null ? (
            <span className="text-body text-emerald">{formatPoints(livePoints)}</span>
          ) : p.last_week_points != null ? (
            <span className="text-label text-ink">{formatPoints(p.last_week_points)}</span>
          ) : (
            <span className="text-label text-ink-3">0.0</span>
          )}
        </div>
        <div className="hidden w-14 text-right text-label text-ink-2 @2xl:block">
          {p.position_rank != null ? `${p.position_rank}` : '--'}
        </div>
        <div className="w-14 text-right text-label text-ink-2">
          {p.projected_points != null ? formatPoints(p.projected_points) : '0.0'}
        </div>
      </div>

      {/* Move (select for starter/bench swap) — wide enough that the
          button's own content (icon + "Move" + padding) never overflows
          into the Proj column to its left. */}
      <div className="flex w-20 shrink-0 items-center justify-end">
        <button
          type="button"
          onClick={e => { e.stopPropagation(); if (!isSwapping) onPlayerClick(p); }}
          disabled={isSwapping}
          aria-pressed={isSelected}
          title={isSelected ? `Cancel moving ${p.full_name}` : `Move ${p.full_name}`}
          className={[
            'flex h-8 items-center gap-1 rounded-control border px-2.5 text-label',
            'transition-colors duration-150 ease-out-quart',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
            isSwapping
              ? 'cursor-not-allowed border-line bg-surface-sunken text-ink-3'
              : isSelected
                ? 'cursor-pointer border-emerald bg-emerald-tint text-emerald'
                : 'cursor-pointer border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
          ].join(' ')}
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
        <div className="absolute inset-0 flex items-center justify-center rounded-slot bg-surface/70 text-label text-ink-2">
          Swapping
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

  // Column header says what state the column is actually in, rather than
  // always claiming "Live / Wk".
  const anyLive = roster.some(p => p.external_player_id && liveStats.has(p.external_player_id));

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

    function handleClick() {
      if (eligible) { onMove(); return; }
      if (canPick) onTogglePicker();
    }

    return (
      <div>
        <div
          role={active ? 'button' : undefined}
          tabIndex={active ? 0 : -1}
          onClick={handleClick}
          onKeyDown={e => {
            if (!active) return;
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            handleClick();
          }}
          className={[
            'relative flex items-center px-5 py-2.5 transition-colors duration-150 ease-out-quart',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald',
            active ? 'cursor-pointer' : 'cursor-default',
            eligible
              ? 'bg-emerald-tint/50 ring-1 ring-inset ring-emerald-line'
              : pickerOpen
                ? 'bg-surface-sunken ring-2 ring-inset ring-emerald'
                : active ? 'hover:bg-surface-sunken' : '',
          ].join(' ')}
        >
          {eligible && (
            <div aria-hidden="true" className="absolute left-1 top-1/2 h-[60%] min-h-[18px] w-1 -translate-y-1/2 rounded-pill bg-emerald" />
          )}
          <div className={[
            'mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-dashed',
            active ? 'border-emerald bg-emerald-tint text-emerald' : 'border-line-strong bg-surface-sunken text-ink-3',
          ].join(' ')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="flex-1">
            <p className={['text-label', active ? 'text-emerald' : 'text-ink-3'].join(' ')}>
              {eligible ? 'Move here' : canPick ? 'Add a player' : 'Empty slot'}
            </p>
            <p className={['text-eyebrow uppercase', active ? 'text-emerald' : 'text-ink-3'].join(' ')}>{label}</p>
          </div>
          {active && (
            <span className="rounded-pill border border-emerald bg-emerald-tint px-2 py-0.5 text-label text-emerald">
              {eligible ? 'Start' : pickerOpen ? 'Close' : 'Add'}
            </span>
          )}
        </div>

        {pickerOpen && canPick && (
          <div className="bg-surface-sunken px-5 pb-2.5 pt-1">
            {pickable.map(p => (
              <div
                key={p.id}
                onClick={() => onPick(p)}
                className="mt-1.5 flex cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface px-2.5 py-1.5 transition-colors duration-150 ease-out-quart hover:border-emerald"
              >
                <Avatar player={p} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label text-ink">
                    {formatPlayerName(p.full_name)}
                  </p>
                  <p className="text-eyebrow text-ink-3">{p.position} · {p.team_code}</p>
                </div>
                <span className="shrink-0 rounded-pill border border-emerald bg-emerald-tint px-2 py-0.5 text-label text-emerald">
                  Start
                </span>
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
        role={eligible ? 'button' : undefined}
        tabIndex={eligible ? 0 : -1}
        onClick={eligible ? onMove : undefined}
        onKeyDown={e => {
          if (!eligible) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          onMove();
        }}
        className={[
          'relative flex items-center px-5 py-2.5 transition-colors duration-150 ease-out-quart',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald',
          eligible
            ? 'cursor-pointer bg-surface-sunken ring-1 ring-inset ring-line-strong hover:bg-surface'
            : 'cursor-default opacity-45',
        ].join(' ')}
      >
        {eligible && (
          <div aria-hidden="true" className="absolute left-1 top-1/2 h-[60%] min-h-[18px] w-1 -translate-y-1/2 rounded-pill bg-ink-3" />
        )}
        <div className={[
          'mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-dashed bg-surface-sunken',
          eligible ? 'border-ink-3 text-ink-3' : 'border-line text-ink-3',
        ].join(' ')}>
          {eligible ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="17 13 12 18 7 13" /><line x1="12" y1="18" x2="12" y2="6" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </div>
        <div className="flex-1">
          <p className={['text-label', eligible ? 'text-ink-2' : 'text-ink-3'].join(' ')}>
            {eligible ? 'Move to bench' : 'Empty bench slot'}
          </p>
          <p className="text-eyebrow uppercase text-ink-3">Bench</p>
        </div>
        {eligible && (
          <span className="rounded-pill border border-line-strong bg-surface-sunken px-2 py-0.5 text-label text-ink-2">
            Bench
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="@container relative overflow-hidden rounded-card border border-line bg-surface">
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
      <div className="px-5 pb-3 pt-4">
        <SectionHeader
          title="Full roster"
          sub={`${roster.length} active · ${starters.length} starting · ${bench.length} on the bench`}
        />
      </div>

      {/* Column labels — sticky, and widths mirror PlayerRow's data columns
          exactly. Live/Last wk and Pos rk are the first things to drop as the
          row narrows; Player and Proj never do. Container queries, not
          viewport breakpoints — this panel sits in a fluid grid column whose
          rendered width doesn't track the viewport once the two-column
          layout kicks in. */}
      <div className="sticky top-0 z-10 flex items-center justify-end border-y border-line bg-surface-sunken px-5 py-2 text-eyebrow uppercase text-ink-3">
        <span className="mr-auto">Player</span>
        <span className="hidden w-[68px] text-right @lg:block">{anyLive ? 'Live' : 'Last wk'}</span>
        <span className="hidden w-14 text-right @2xl:block">Pos rk</span>
        <span className="w-14 text-right">Proj</span>
        <span className="w-20 shrink-0" />
      </div>

      {/* Swap banner */}
      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald bg-emerald-tint px-5 py-2.5">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-pill bg-emerald" />
            <span className="text-label text-ink">
              {selected.roster_slot === 'BENCH' ? 'Starting' : 'Moving'} {formatPlayerName(selected.full_name)}
            </span>
            <span className="text-label text-ink-2">
              {selected.roster_slot === 'BENCH'
                ? '— pick an open starter slot or a player to swap with'
                : '— pick an eligible player to swap with, or move to the bench'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="h-8 rounded-control border border-line bg-surface px-3 text-label text-ink-2 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Starters */}
      <div>
        <div className="border-b border-line px-5 py-2.5">
          <p className="text-eyebrow uppercase text-ink-3">Starting lineup</p>
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
        {/* Section identity comes from the label and a hairline rule, not a
            slab of colour — this used to be a 6px near-black gradient bar. */}
        <div className="flex items-center gap-2 border-y border-line px-5 py-2.5">
          <p className="text-eyebrow uppercase text-ink-3">Bench</p>
          <span className="font-mono tabular-nums text-eyebrow text-ink-3">
            · {bench.length} players
          </span>
          {isSelectionActive && (
            <span className="ml-auto text-label text-emerald">
              {isEmptyBenchEligible()
                ? 'Move to bench'
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
