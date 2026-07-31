// Position identity — the one sanctioned exception to emerald-only chrome.
//
// Position colour encodes something real, so it is allowed to sit alongside the
// emerald system. It comes from here and nowhere else: this previously existed
// three times (draft types, TransferBoard, CapBreakdown) with three different
// shapes *and* three different palettes, so the same position was a different
// colour depending on which page you were looking at.

export interface PositionColor {
  /** Tinted background for chips and rows. */
  bg: string;
  /** Text/foreground on a light surface. */
  text: string;
  /** Solid fill for bars, dots and badges. */
  bar: string;
  /** Translucent wash for large areas. */
  light: string;
}

export const POS_COLORS: Record<string, PositionColor> = {
  QB: { bg: '#EFF6FF', text: '#2563EB', bar: '#2563EB', light: 'rgba(37,99,235,0.14)' },
  RB: { bg: '#ECFDF5', text: '#059669', bar: '#059669', light: 'rgba(5,150,105,0.14)' },
  WR: { bg: '#FFF7ED', text: '#EA580C', bar: '#EA580C', light: 'rgba(234,88,12,0.14)' },
  TE: { bg: '#FAF5FF', text: '#9333EA', bar: '#9333EA', light: 'rgba(147,51,234,0.14)' },
};

/** Neutral fallback for an unknown position. Matches --color-ink-3. */
export const POS_FALLBACK: PositionColor = {
  bg: '#FAFAF9', text: '#71717A', bar: '#71717A', light: 'rgba(113,113,122,0.14)',
};

export function positionColor(position: string): PositionColor {
  return POS_COLORS[position] ?? POS_FALLBACK;
}

/** Plural long-form names, for breakdowns and group headers. */
export const POSITION_LABELS: Record<string, string> = {
  QB: 'Quarterbacks',
  RB: 'Running backs',
  WR: 'Wide receivers',
  TE: 'Tight ends',
};

export function positionLabel(position: string): string {
  return POSITION_LABELS[position] ?? position;
}
