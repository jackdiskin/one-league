// Shared types and roster rules for the draft tree.

import { POS_COLORS } from '@/components/positions';
import { CAP, QUOTA, TOTAL_SLOTS, STARTERS } from '@/components/rosterRules';

export interface DraftPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  season_points: number;
  last_year_points: number;
  ownership_pct: number;
  trades_in: number;
  trades_out: number;
  price_pct_change: number;
  projected_next_week: number;
}

// ─── Quotas ───────────────────────────────────────────────────────────────────
// Squad composition is an app-wide game rule — see components/rosterRules.ts.
export { CAP, QUOTA, TOTAL_SLOTS, STARTERS };

// Position identity is app-wide — see components/positions.ts.
export { POS_COLORS };

export const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];

// WR and TE share one quota group, so both map to FLEX.
export function posGroup(pos: string): string {
  if (pos === 'WR' || pos === 'TE') return 'FLEX';
  return pos;
}

export function slotColor(group: string): typeof POS_COLORS[string] {
  if (group === 'FLEX') return POS_COLORS.WR;
  return POS_COLORS[group] ?? POS_COLORS.QB;
}
