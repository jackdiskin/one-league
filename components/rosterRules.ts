// Squad composition rules.
//
// These are game rules, not draft-screen constants — the draft board, the
// transfers board, the player page and the market buy route all enforce the
// same numbers. They were previously duplicated across four files, so a rule
// change had to be made in four places to stay correct.
//
// ⚠️ Mirrored server-side in app/api/onboarding/draft/route.ts and
// app/api/market/buy/route.ts. Changing these without changing those breaks
// drafting and buying.

export const CAP = 100_000_000;

/** FLEX = WR + TE combined. */
export const QUOTA = { QB: 2, RB: 4, FLEX: 5 } as const;

export type QuotaGroup = keyof typeof QUOTA;

/** Quota lookup for a group name that isn't statically known. */
export function quotaFor(group: string): number {
  return QUOTA[group as QuotaGroup] ?? 0;
}

export const TOTAL_SLOTS = QUOTA.QB + QUOTA.RB + QUOTA.FLEX;

/**
 * Starting lineup size — QB1, RB1, RB2, WR1, WR2, WR3, FLEX1.
 * Kept in step with STARTER_SLOTS in components/field/slots.ts.
 */
export const STARTERS = 7;

/** Squad size minus the starting lineup. */
export const BENCH_SLOTS = TOTAL_SLOTS - STARTERS;
