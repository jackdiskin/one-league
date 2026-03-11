export function formatPrice(dollars: number): string {
  if (dollars >= 1_000_000)  return `$${Number((dollars / 1_000_000)).toFixed(1)}M`;
  if (dollars >= 1_000)      return `$${Number((dollars / 1_000)).toFixed(0)}K`;
  if (dollars <= -1_000_000) return `-$${Math.abs(dollars / 1_000_000).toFixed(0)}M`;
  if (dollars < 0)           return `-$${Math.abs(dollars / 1000).toFixed(0)}K`;
  return `$${Number(dollars).toFixed(0)}`;
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${Number(pct).toFixed(1)}%`;
}

export function formatPoints(pts: number): string {
  return Number(pts).toFixed(1);
}
