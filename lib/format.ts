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

const PLAYOFF_WEEKS: Record<number, string> = {
  19: 'Wildcard',
  20: 'Divisional',
  21: 'Conference',
  22: 'Super Bowl',
};

/** Returns "Wk 5" for regular season weeks, or "Wildcard" / "Divisional" / etc. for playoffs. */
export function formatWeek(week: number): string {
  return PLAYOFF_WEEKS[week] ?? `Wk ${week}`;
}

/** Same as formatWeek but with the full "Week" prefix for regular season, e.g. "Week 5" or "Wildcard". */
export function formatWeekLong(week: number): string {
  return PLAYOFF_WEEKS[week] ?? `Week ${week}`;
}
