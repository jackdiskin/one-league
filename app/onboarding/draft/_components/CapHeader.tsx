'use client';

// Squad header. Cap remaining is the hero number; the CTA is the page's one
// job and says what's blocking it while it can't be pressed.

import { formatPrice } from '@/lib/format';
import QuotaPills from './QuotaPills';

export default function CapHeader({
  capLeft,
  cap,
  qb, rb, flex, quota,
  selectedCount,
  totalSlots,
  starterCount,
  isComplete,
  blockingLabel,
  onFinalize,
}: {
  capLeft: number;
  cap: number;
  qb: number;
  rb: number;
  flex: number;
  quota: { QB: number; RB: number; FLEX: number };
  selectedCount: number;
  totalSlots: number;
  starterCount: number;
  isComplete: boolean;
  /** What's stopping the squad being finalised; null when nothing is. */
  blockingLabel: string | null;
  onFinalize: () => void;
}) {
  const spentPct = Math.min(100, Math.max(0, ((cap - capLeft) / cap) * 100));
  const overCap = capLeft < 0;

  return (
    <header className="shrink-0 border-b border-line bg-surface px-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        {/* Hero: cap remaining */}
        <div className="min-w-48">
          <p className="text-eyebrow uppercase text-ink-3">Cap remaining</p>
          <p
            className={[
              'font-mono tabular-nums text-display',
              overCap ? 'text-down' : 'text-ink',
            ].join(' ')}
          >
            {formatPrice(capLeft)}
          </p>

          {/* Spend against the cap */}
          <div
            className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-line"
            role="progressbar"
            aria-valuenow={Math.round(spentPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${formatPrice(cap - capLeft)} of ${formatPrice(cap)} spent`}
          >
            <div
              className={[
                'h-full rounded-pill transition-[width] duration-300 ease-out-quart',
                overCap ? 'bg-down' : 'bg-emerald',
              ].join(' ')}
              style={{ width: `${spentPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-label text-ink-3">
            <span className="font-mono tabular-nums">{selectedCount}</span> of{' '}
            <span className="font-mono tabular-nums">{totalSlots}</span> picked ·{' '}
            <span className="font-mono tabular-nums">{starterCount}</span> start each week
          </p>
        </div>

        {/* Quota progress */}
        <QuotaPills qb={qb} rb={rb} flex={flex} quota={quota} />

        {/* Primary action */}
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onFinalize}
            disabled={!isComplete}
            className={[
              'h-10 rounded-control px-5 text-body font-medium',
              'transition-colors duration-150 ease-out-quart',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
              isComplete
                ? 'cursor-pointer bg-emerald-press text-surface hover:bg-emerald-hover active:bg-emerald-press'
                : 'cursor-not-allowed bg-surface-sunken text-ink-3',
            ].join(' ')}
          >
            Finish squad
          </button>
          {blockingLabel && (
            <p className="text-label text-ink-3">{blockingLabel}</p>
          )}
        </div>
      </div>
    </header>
  );
}
