import type { ReactNode } from 'react';

export type StatTone = 'default' | 'accent' | 'up' | 'down' | 'muted';

const TONE: Record<StatTone, string> = {
  default: 'text-ink',
  accent:  'text-emerald',
  up:      'text-up',
  down:    'text-down',
  muted:   'text-ink-3',
};

/**
 * Eyebrow + number + optional sub-label.
 *
 * `numeric` controls the mono/tabular treatment — on by default, since almost
 * every stat is a number. Turn it off for word values (a player name, a rank
 * label) so they don't render in the terminal face.
 *
 * `bare` drops the card chrome for use inside a panel that already has its own.
 */
export default function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  size = 'section',
  align = 'left',
  numeric = true,
  bare = false,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  /** `display` for a page's one hero number; `section` for everything else. */
  size?: 'display' | 'section';
  align?: 'left' | 'right';
  numeric?: boolean;
  bare?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={[
        bare ? '' : 'rounded-card border border-line bg-surface p-4',
        align === 'right' ? 'text-right' : '',
      ].join(' ')}
    >
      <div className={[
        'flex items-center gap-1.5',
        align === 'right' ? 'justify-end' : '',
      ].join(' ')}>
        {icon && <span className="text-ink-3">{icon}</span>}
        <p className="text-eyebrow uppercase text-ink-3">{label}</p>
      </div>

      <p className={[
        'mt-1.5 truncate',
        size === 'display' ? 'text-display' : 'text-section',
        numeric ? 'font-mono tabular-nums' : '',
        TONE[tone],
      ].join(' ')}>
        {value}
      </p>

      {sub && <p className="mt-1 truncate text-label text-ink-3">{sub}</p>}
    </div>
  );
}
