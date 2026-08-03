// Canonical starting-lineup slot definitions.
//
// Single source of truth for which positions may occupy which slot. This
// previously existed twice — as SLOT_ELIGIBLE_POSITIONS in the dashboard field
// and as STARTER_SLOTS in the roster list — with different shapes. Both fed the
// same /api/roster/swap endpoint, so a rule change had to be made in two places
// and staying in sync was luck. That is how the "WR3 isn't a real FLEX" bug got
// in. Import from here; do not redefine locally.
//
// `roster_slot` string values are persisted in MySQL and enforced server-side.
// Never rename them.

export interface StarterSlot {
  slot: string;
  /** Positions allowed in this slot. */
  eligiblePositions: readonly string[];
  /** Neutral badge text for the slot (never colour-coded by position). */
  badgeLabel: string;
}

export const STARTER_SLOTS: readonly StarterSlot[] = [
  { slot: 'QB1',   eligiblePositions: ['QB'],             badgeLabel: 'QB'    },
  { slot: 'RB1',   eligiblePositions: ['RB'],             badgeLabel: 'RB'    },
  { slot: 'RB2',   eligiblePositions: ['RB'],             badgeLabel: 'RB'    },
  { slot: 'WR1',   eligiblePositions: ['WR', 'TE'],       badgeLabel: 'WR/TE' },
  { slot: 'WR2',   eligiblePositions: ['WR', 'TE'],       badgeLabel: 'WR/TE' },
  { slot: 'WR3',   eligiblePositions: ['WR', 'TE'],       badgeLabel: 'WR/TE' },
  // The one true FLEX — accepts a running back as well as receivers.
  { slot: 'FLEX1', eligiblePositions: ['RB', 'WR', 'TE'], badgeLabel: 'FLEX'  },
] as const;

export const BENCH_SLOT = 'BENCH';

/** Starting lineup size. Bench is squad size minus this. */
export const STARTER_COUNT = STARTER_SLOTS.length;

export const STARTER_SLOT_NAMES: readonly string[] = STARTER_SLOTS.map(s => s.slot);

export function eligiblePositionsForSlot(slot: string): readonly string[] {
  return STARTER_SLOTS.find(s => s.slot === slot)?.eligiblePositions ?? [];
}

/**
 * Neutral badge text for a player, by their slot; falls back to raw position.
 *
 * WR1/WR2/WR3 accept either a WR or a TE, so their slot-level badge is the
 * combined "WR/TE" — but for an occupied slot that's less useful than just
 * saying which one the player actually is. Show the real position there;
 * the combined label still applies to the slot itself when it's empty (see
 * STARTER_SLOTS' own badgeLabel, used directly for empty-slot placeholders).
 */
export function slotBadgeLabel(rosterSlot: string, position: string): string {
  const isFlexWrSlot = rosterSlot === 'WR1' || rosterSlot === 'WR2' || rosterSlot === 'WR3';
  if (isFlexWrSlot && position) return position;
  return STARTER_SLOTS.find(s => s.slot === rosterSlot)?.badgeLabel ?? position;
}

export function isBench(rosterSlot: string): boolean {
  return rosterSlot === BENCH_SLOT;
}

/**
 * Whether two rostered players may trade places. Bench accepts anyone, so this
 * covers ordinary bench<->starter swaps, but it also allows direct
 * starter<->starter swaps (e.g. a WR sitting in WR1 and whoever's in FLEX) —
 * each player just has to be eligible for the other's current slot. Two bench
 * players never swap; bench order isn't user-orderable here. Mirrors the
 * validation in /api/roster/swap.
 */
export function isEligibleSwap(
  a: { id: number; position: string; roster_slot: string },
  b: { id: number; position: string; roster_slot: string },
): boolean {
  if (a.id === b.id) return false;
  const aBench = isBench(a.roster_slot);
  const bBench = isBench(b.roster_slot);
  if (aBench && bBench) return false;
  const aSlotAcceptsB = aBench || eligiblePositionsForSlot(a.roster_slot).includes(b.position);
  const bSlotAcceptsA = bBench || eligiblePositionsForSlot(b.roster_slot).includes(a.position);
  return aSlotAcceptsB && bSlotAcceptsA;
}

/**
 * Why a swap isn't allowed, phrased for the manager. Mirrors isEligibleSwap
 * case for case so the two can't disagree.
 */
export function swapBlockedReason(
  selected: { id: number; position: string; roster_slot: string },
  target: { id: number; position: string; roster_slot: string },
): string | null {
  if (selected.id === target.id) return null;
  const selBench = isBench(selected.roster_slot);
  const tgtBench = isBench(target.roster_slot);
  if (selBench && tgtBench) return 'Both players are on your bench';

  if (!selBench) {
    const eligible = eligiblePositionsForSlot(selected.roster_slot);
    if (eligible.length && !eligible.includes(target.position)) {
      return `${slotBadgeLabel(selected.roster_slot, selected.position)} takes ${eligible.join(' or ')}`;
    }
  }
  if (!tgtBench) {
    const eligible = eligiblePositionsForSlot(target.roster_slot);
    if (eligible.length && !eligible.includes(selected.position)) {
      return `${slotBadgeLabel(target.roster_slot, target.position)} takes ${eligible.join(' or ')}`;
    }
  }
  return null;
}
