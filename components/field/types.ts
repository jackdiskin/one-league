// Shared field types.
//
// Deliberately generic — the field renders both a draft squad and a live
// lineup, so it must not depend on draft quotas or lineup-only fields.

export interface FieldPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  current_price: number;
  headshot_url: string | null;
  external_player_id: string | null;
  roster_slot: string;
  projected_points?: number | null;
}

/** A player placed at a point on the field, or an empty slot at that point. */
export interface PlacedSlot {
  player: FieldPlayer | null;
  /** Slot name (QB1, FLEX1, …) — empty string for unnamed draft slots. */
  slot: string;
  /** Label shown when the slot is empty. */
  label: string;
  /** Across-field, 0 = left sideline, 100 = right sideline. */
  nx: number;
  /** Depth, 0 = near/bottom, 1 = far/top. */
  u: number;
}
