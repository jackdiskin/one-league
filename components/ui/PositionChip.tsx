import { positionColor } from '@/components/positions';

/**
 * Position or slot badge.
 *
 * ⚠️ Neutral by default, and that is deliberate. The app's standing convention
 * is that position *badges* are gray — the identical gray pill was duplicated
 * in `market/page.tsx` and `RosterList.tsx`, and the old live field carried a
 * comment saying badges are "never color-coded by position". Position *colour*
 * is for bars, dots and rules (see CapBreakdown's by-position breakdown), where
 * it distinguishes quantities rather than decorating a label.
 *
 * Pass `tone="position"` only when the chip itself is the colour key for
 * something nearby.
 */
export default function PositionChip({
  label,
  tone = 'neutral',
}: {
  /** Position (`WR`) or slot label (`WR/TE`, `FLEX`). */
  label: string;
  tone?: 'neutral' | 'position';
}) {
  if (tone === 'position') {
    const col = positionColor(label);
    return (
      <span
        className="shrink-0 rounded-pill px-1.5 py-0.5 text-eyebrow"
        style={{ backgroundColor: col.bg, color: col.text }}
      >
        {label}
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-pill bg-surface-sunken px-1.5 py-0.5 text-eyebrow text-ink-2">
      {label}
    </span>
  );
}
