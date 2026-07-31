import type { ReactNode } from 'react';

/**
 * An empty screen is an invitation to act, not a place to explain the UI.
 *
 * Give one line of direction in the interface's voice and, where there's
 * something to do, attach the action. Don't describe what would have been here.
 */
export default function EmptyState({
  title,
  action,
  icon,
  compact = false,
}: {
  /** One line of direction. Sentence case, active voice. */
  title: string;
  action?: ReactNode;
  icon?: ReactNode;
  /** Inline variant for use inside a list or narrow panel. */
  compact?: boolean;
}) {
  return (
    <div
      className={[
        'flex flex-col items-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-12',
      ].join(' ')}
    >
      {icon && (
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-emerald-tint text-emerald">
          {icon}
        </span>
      )}
      <p className={compact ? 'text-label text-ink-2' : 'text-body text-ink-2'}>
        {title}
      </p>
      {action}
    </div>
  );
}
