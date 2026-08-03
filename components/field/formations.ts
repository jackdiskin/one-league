// Where each starter stands on the field.
//
// Moved out of MyTeamSummary so the field folder owns "how a formation is laid
// out" and pages only supply players.
//
// ⚠️ Coordinate space changed when the field became an SVG. The old field used
// y 0–100 with 0 = far/top; this uses `u` 0–1 with 0 = near/bottom (see
// fieldGeometry). Values below are re-tuned against the new geometry, not
// mechanically converted — the old ones were tuned against fixed pixel bands
// (CROWD_H/PITCH_H/BENCH_H) that no longer exist.

import { STARTER_SLOTS, slotBadgeLabel } from './slots';
import type { FieldPlayer, PlacedSlot } from './types';

// Depth bands, near (0) → far (1).
const LOS      = 0.60; // line of scrimmage — receivers set here
const QB_DEPTH = 0.27; // quarterback in shotgun
const BACKS    = 0.19; // running backs — just behind and below the QB
const DEEP     = 0.06; // flex RB, deepest point of the backfield diamond

/**
 * Lay out the starting lineup in a shotgun look. Players are found by named
 * `roster_slot` rather than position, so substituting updates the formation and
 * a RB sitting in FLEX1 renders in the backfield instead of out wide.
 */
export function lineupFormation(starters: FieldPlayer[]): PlacedSlot[] {
  const bySlot = (slot: string) => starters.find(p => p.roster_slot === slot) ?? null;

  const wr1  = bySlot('WR1');
  const wr2  = bySlot('WR2');
  const wr3  = bySlot('WR3');
  const flex = bySlot('FLEX1');
  const qb1  = bySlot('QB1');
  const rb1  = bySlot('RB1');
  const rb2  = bySlot('RB2');

  const label = (slot: string, p: FieldPlayer | null) =>
    slotBadgeLabel(slot, p?.position ?? '') ||
    STARTER_SLOTS.find(s => s.slot === slot)?.badgeLabel ||
    '';

  // A flex RB drops into the backfield behind the QB, completing a diamond
  // with RB1/RB2. A flex WR or TE instead joins the front row for four
  // receivers, evenly spaced, instead of the three-point spread used when
  // FLEX is a back.
  const flexIsRB = flex?.position === 'RB';
  const flexInFrontRow = flex != null && !flexIsRB;

  return [
    // Front row — receivers on the line of scrimmage. Four evenly-spaced
    // points (8/36/64/92) when FLEX joins them, otherwise the original
    // three (8/50/92).
    { player: wr1,  slot: 'WR1',   label: label('WR1', wr1),   nx: 8, u: LOS },
    { player: wr3,  slot: 'WR3',   label: label('WR3', wr3),   nx: flexInFrontRow ? 64 : 50, u: LOS },
    { player: wr2,  slot: 'WR2',   label: label('WR2', wr2),   nx: 92, u: LOS },

    // Flex — position-dependent
    {
      player: flex, slot: 'FLEX1', label: label('FLEX1', flex),
      nx: flexInFrontRow ? 36 : 50,
      u:  flexInFrontRow ? LOS : DEEP,
    },

    // Backfield — RB1/RB2 sit just below and to either side of the QB.
    { player: rb1,  slot: 'RB1',   label: label('RB1', rb1),   nx: 24, u: BACKS },
    { player: rb2,  slot: 'RB2',   label: label('RB2', rb2),   nx: 76, u: BACKS },
    { player: qb1,  slot: 'QB1',   label: label('QB1', qb1),   nx: 50, u: QB_DEPTH },
  ];
}
