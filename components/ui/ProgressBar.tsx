export type ProgressTone = 'emerald' | 'auto';

/**
 * A filled track. `auto` turns amber past 90% and red at 100%, which is the
 * cap-usage rule; anything that isn't a budget should stay on `emerald`.
 *
 * Always solid — gradients on chrome are banned.
 */
export default function ProgressBar({
  value,
  label,
  tone = 'emerald',
  size = 'md',
}: {
  /** 0–100. Clamped. */
  value: number;
  /** Describes the bar for screen readers, e.g. "$58.5M of $100.0M spent". */
  label: string;
  tone?: ProgressTone;
  size?: 'sm' | 'md';
}) {
  const pct = Math.min(100, Math.max(0, value));
  const fill =
    tone === 'auto'
      ? pct >= 100 ? 'bg-down' : pct > 90 ? 'bg-warn' : 'bg-emerald'
      : 'bg-emerald';

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={[
        'w-full overflow-hidden rounded-pill bg-line',
        size === 'sm' ? 'h-1' : 'h-2',
      ].join(' ')}
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-300 ease-out-quart ${fill}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
