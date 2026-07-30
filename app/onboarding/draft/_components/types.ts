// Shared types, roster rules and position styling for the draft tree.
// Extracted verbatim from DraftBoard.tsx — no behavioural change.

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
// Mirrors the quota enforced server-side in app/api/onboarding/draft/route.ts.
// Changing these here without changing it there breaks drafting.
export const CAP         = 100_000_000;
export const QUOTA       = { QB: 2, RB: 4, FLEX: 5 }; // FLEX = WR+TE combined
export const TOTAL_SLOTS = 11;
// Starting lineup is QB1, RB1, RB2, WR1, WR2, WR3, FLEX1 — matches
// STARTER_SLOTS in app/team/_components/RosterList.tsx and the slot assignment
// in app/api/onboarding/draft/route.ts. The rest of the squad is bench.
export const STARTERS    = 7;

export const POS_COLORS: Record<string, { bg: string; text: string; bar: string; light: string }> = {
  QB: { bg: '#eff6ff', text: '#2563eb', bar: '#2563eb', light: 'rgba(37,99,235,0.14)' },
  RB: { bg: '#ecfdf5', text: '#059669', bar: '#059669', light: 'rgba(5,150,105,0.14)' },
  WR: { bg: '#fff7ed', text: '#ea580c', bar: '#ea580c', light: 'rgba(234,88,12,0.14)' },
  TE: { bg: '#faf5ff', text: '#9333ea', bar: '#9333ea', light: 'rgba(147,51,234,0.14)' },
};

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
