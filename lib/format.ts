// Schedule/kickoff times are naive ET wall-clock values with no timezone
// attached (see lib/schedule.ts). Parsing them into components directly
// avoids `new Date(...)` reinterpreting them in the runtime/viewer's
// timezone. Lives here (not lib/schedule.ts) so client components can use
// it without pulling the mysql2 driver into the browser bundle.
export function parseNaiveDateTime(raw: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) };
}

// Generational suffixes — kept attached to the surname, not treated as it
// (e.g. "Brian Thomas Jr." -> "B. Thomas Jr.", never "B. Jr.").
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** "Bijan Robinson" -> "B. Robinson". Falls back to the name as-is if there's no space. */
export function formatPlayerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const last = parts[parts.length - 1];
  const hasSuffix = parts.length >= 3 && NAME_SUFFIXES.has(last.toLowerCase().replace(/\.$/, ''));
  const surname = hasSuffix ? parts.slice(-2).join(' ') : last;
  return `${parts[0][0]}. ${surname}`;
}

// Always millions, always one decimal (nearest tenth of a million) — never
// thousands, no exceptions, per standing pricing-display rule.
export function formatPrice(dollars: number): string {
  const millions = Number(dollars) / 1_000_000;
  const sign = millions < 0 ? '-' : '';
  return `${sign}$${Math.abs(millions).toFixed(1)}M`;
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

const MAX_PLAYOFF_WEEK = Math.max(...Object.keys(PLAYOFF_WEEKS).map(Number));

/**
 * Returns the season status label shown in the nav header.
 * After the Super Bowl has been played (currentWeek >= MAX_PLAYOFF_WEEK),
 * advances the season by one and shows "Pre-Season" until new season data arrives.
 * e.g. season=2025, week=22 → "Season 2026 · Pre-Season"
 *      season=2025, week=10 → "Season 2025 · Week 10"
 */
export function formatSeasonStatus(season: number, currentWeek: number): string {
  if (currentWeek >= MAX_PLAYOFF_WEEK) {
    return `Season ${season} · Post-Season`;
  }
  return `Season ${season} · ${formatWeekLong(currentWeek)}`;
}
