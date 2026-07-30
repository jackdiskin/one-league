// Sort and price-filter options for the player list.
// Extracted verbatim from DraftBoard.tsx — no behavioural change.

import type { DraftPlayer } from './types';

// $0.5M increments from $18M down to $1M, e.g. "$17.5M", "$17M", ...
export const PRICE_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Any Price', value: null },
  ...Array.from({ length: 28 }, (_, i) => {
    const m = 18 - i * 0.5;
    return { label: `$${m}M`, value: Math.round(m * 1_000_000) };
  }),
];

export const SORT_OPTIONS = [
  { key: 'price_desc',         label: 'Price: High to Low' },
  { key: 'price_asc',          label: 'Price: Low to High' },
  { key: 'season_points',      label: 'Total Points This Year' },
  { key: 'last_year_points',   label: 'Points Last Year' },
  { key: 'ownership_pct',      label: '% Selected' },
  { key: 'trades_in',          label: 'Trades In' },
  { key: 'trades_out',         label: 'Trades Out' },
  { key: 'rising',             label: 'Highest Rising' },
  { key: 'falling',            label: 'Highest Falling' },
  { key: 'projected_next_week', label: 'Projected Points Next Week' },
] as const;

export type SortKey = typeof SORT_OPTIONS[number]['key'];

export function sortPlayers(list: DraftPlayer[], key: SortKey): DraftPlayer[] {
  const sorted = [...list];
  switch (key) {
    case 'price_desc':          return sorted.sort((a, b) => Number(b.current_price) - Number(a.current_price));
    case 'price_asc':           return sorted.sort((a, b) => Number(a.current_price) - Number(b.current_price));
    case 'season_points':       return sorted.sort((a, b) => b.season_points - a.season_points);
    case 'last_year_points':    return sorted.sort((a, b) => b.last_year_points - a.last_year_points);
    case 'ownership_pct':       return sorted.sort((a, b) => b.ownership_pct - a.ownership_pct);
    case 'trades_in':           return sorted.sort((a, b) => b.trades_in - a.trades_in);
    case 'trades_out':          return sorted.sort((a, b) => b.trades_out - a.trades_out);
    case 'rising':              return sorted.sort((a, b) => b.price_pct_change - a.price_pct_change);
    case 'falling':             return sorted.sort((a, b) => a.price_pct_change - b.price_pct_change);
    case 'projected_next_week': return sorted.sort((a, b) => b.projected_next_week - a.projected_next_week);
    default:                    return sorted;
  }
}
