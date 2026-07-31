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

/** Neutral badge text for a player, by their slot; falls back to raw position. */
export function slotBadgeLabel(rosterSlot: string, position: string): string {
  return STARTER_SLOTS.find(s => s.slot === rosterSlot)?.badgeLabel ?? position;
}

export function isBench(rosterSlot: string): boolean {
  return rosterSlot === BENCH_SLOT;
}

/**
 * Whether two rostered players may trade places. One must be a starter and the
 * other on the bench, and the bench player must be eligible for the starter's
 * slot. Mirrors the validation in /api/roster/swap.
 */
export function isEligibleSwap(
  a: { id: number; position: string; roster_slot: string },
  b: { id: number; position: string; roster_slot: string },
): boolean {
  if (a.id === b.id) return false;
  const aBench = isBench(a.roster_slot);
  const bBench = isBench(b.roster_slot);
  if (aBench === bBench) return false; // one starter, one bench
  const starter = aBench ? b : a;
  const benched = aBench ? a : b;
  const eligible = eligiblePositionsForSlot(starter.roster_slot);
  return (eligible.length ? eligible : [starter.position]).includes(benched.position);
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
  if (selBench === tgtBench) {
    return selBench
      ? 'Both players are on your bench'
      : 'Both players are already starting';
  }
  const starter = selBench ? target : selected;
  const benched = selBench ? selected : target;
  const eligible = eligiblePositionsForSlot(starter.roster_slot);
  if (eligible.length && !eligible.includes(benched.position)) {
    return `${slotBadgeLabel(starter.roster_slot, starter.position)} takes ${eligible.join(' or ')}`;
  }
  return null;
}
