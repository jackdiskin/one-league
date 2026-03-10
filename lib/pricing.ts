// lib/pricing.ts
// Core pricing functions for the fantasy football market

export const PRICE_IMPACT_RATE = 0.005;       // 0.5% price movement per transaction
export const BID_ASK_SPREAD   = 0.03;        // seller receives 97% of current market price
export const PRICE_FLOOR      = 500_000;     // $500K minimum
export const PRICE_CEIL       = 55_000_000;  // $55M maximum

// Position average fantasy points — used as fallback when no projection exists
export const POSITION_AVG_PTS: Record<string, number> = {
  QB: 20, RB: 12, WR: 11, TE: 8, K: 8, DEF: 10,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampPrice(n: number): number {
  return clamp(n, PRICE_FLOOR, PRICE_CEIL);
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Price after a buy — moves up by PRICE_IMPACT_RATE */
export function applyBuyImpact(currentPrice: number): number {
  return clampPrice(round2(currentPrice * (1 + PRICE_IMPACT_RATE)));
}

/** Price after a sell — moves down by PRICE_IMPACT_RATE */
export function applySellImpact(currentPrice: number): number {
  return clampPrice(round2(currentPrice * (1 - PRICE_IMPACT_RATE)));
}

/** Amount the seller actually receives — current price minus the bid-ask spread */
export function sellProceeds(currentPrice: number): number {
  return round2(currentPrice * (1 - BID_ASK_SPREAD));
}

/**
 * Compute the new weekly base price at the start of a new week.
 *
 * Factors applied to prev_closing_price:
 *  - Performance:  actual pts vs expected pts            (weight 0.30, capped ±15%)
 *                  Falls back to position average when no projection exists.
 *                  A player who beats their projection always gets a bump,
 *                  even if their raw score is below the position average.
 *  - Momentum:     recent 3-week avg vs prior 3-week avg (weight 0.10, capped ±5%)
 *  - Demand:       net order flow from closing week       (weight 0.10, capped ±3%)
 */
export function computeWeeklyBasePrice(params: {
  prevClosingPrice: number;
  position: string;
  lastWeekPoints: number | null;
  /** Player-specific projected points for last week. Falls back to position average if null. */
  expectedPoints: number | null;
  recentPoints: number[]; // ordered newest-first, NOT including lastWeekPoints
  netOrderFlow: number;
}): number {
  const { prevClosingPrice, position, lastWeekPoints, expectedPoints, recentPoints, netOrderFlow } = params;

  // Use player-specific projection; fall back to position average
  const baseline = expectedPoints ?? POSITION_AVG_PTS[position] ?? 12;

  // Performance factor: actual vs expected (not vs position average)
  const perfFactor =
    lastWeekPoints != null && baseline > 0
      ? clamp(1 + 0.3 * (lastWeekPoints - baseline) / baseline, 0.85, 1.15)
      : 1.0;

  // Momentum factor — needs at least 4 data points to split recent vs older
  let momentumFactor = 1.0;
  const recent = recentPoints.slice(0, 3);
  const older = recentPoints.slice(3, 6);
  if (recent.length >= 2 && older.length >= 2) {
    const recentAvg = mean(recent);
    const olderAvg = mean(older);
    if (olderAvg > 0) {
      momentumFactor = clamp(1 + 0.1 * (recentAvg - olderAvg) / olderAvg, 0.95, 1.05);
    }
  }

  // Demand factor
  const LIQUIDITY = 100;
  const demandFactor = clamp(1 + 0.1 * (netOrderFlow / LIQUIDITY), 0.97, 1.03);

  return clampPrice(round2(prevClosingPrice * perfFactor * momentumFactor * demandFactor));
}
