import { formatPrice } from '@/lib/format';
import { positionColor, positionLabel } from '@/components/positions';

export interface CapPlayer {
  position: string;
  current_price: number;
}

const TOTAL_CAP = 100_000_000;

export default function CapBreakdown({
  roster,
  budgetRemaining,
}: {
  roster: CapPlayer[];
  budgetRemaining: number;
}) {
  const remaining = Number(budgetRemaining);
  const totalSpent = TOTAL_CAP - remaining;
  const usedPct = Math.min(100, (totalSpent / TOTAL_CAP) * 100);

  // Group by position
  const byPos = roster.reduce((acc, p) => {
    if (!acc[p.position]) acc[p.position] = { total: 0, count: 0 };
    acc[p.position].total += Number(p.current_price);
    acc[p.position].count++;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const posEntries = Object.entries(byPos).sort((a, b) => b[1].total - a[1].total);

  // Solid fill, no gradient. Only genuinely tight cap reads as a warning.
  const barTone =
    usedPct >= 100 ? 'bg-down' : usedPct > 90 ? 'bg-warn' : 'bg-emerald';

  return (
    <div className="flex h-full flex-col gap-5 rounded-card border border-line bg-surface p-5">
      <div>
        <h3 className="text-section text-ink">Salary cap</h3>
        <p className="mt-0.5 text-label text-ink-3">How your cap is allocated</p>
      </div>

      {/* Budget remaining — information, not a warning, so it stays neutral
          regardless of how much is left. */}
      <div className="rounded-control border border-emerald-line bg-emerald-tint px-4 py-3">
        <p className="text-eyebrow uppercase text-emerald">Budget remaining</p>
        <p className="mt-1 font-mono tabular-nums text-display text-ink">
          {formatPrice(remaining)}
        </p>
        <p className="mt-1 text-label text-ink-3">
          of <span className="font-mono tabular-nums">{formatPrice(TOTAL_CAP)}</span> total cap
        </p>
      </div>

      {/* Overall usage */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-label text-ink-2">Cap used</span>
          <span className="font-mono tabular-nums text-label text-ink">{usedPct.toFixed(1)}%</span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-pill bg-line"
          role="progressbar"
          aria-valuenow={Math.round(usedPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${formatPrice(totalSpent)} of ${formatPrice(TOTAL_CAP)} spent`}
        >
          <div
            className={`h-full rounded-pill transition-[width] duration-300 ease-out-quart ${barTone}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-label text-ink-3">
          <span><span className="font-mono tabular-nums">{formatPrice(totalSpent)}</span> spent</span>
          <span><span className="font-mono tabular-nums">{formatPrice(remaining)}</span> free</span>
        </div>
      </div>

      <div className="h-px bg-line" />

      {/* Per-position breakdown — grows to fill remaining space */}
      <div className="flex flex-1 flex-col">
        <p className="mb-2.5 text-eyebrow uppercase text-ink-3">By position</p>
        <div className="flex flex-1 flex-col justify-evenly">
          {posEntries.map(([pos, data]) => {
            const col = positionColor(pos);
            const pct = (data.total / TOTAL_CAP) * 100;
            return (
              <div key={pos}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-pill"
                      style={{ backgroundColor: col.bar }}
                    />
                    <span className="text-label text-ink-2">{positionLabel(pos)}</span>
                    <span className="font-mono tabular-nums text-eyebrow text-ink-3">×{data.count}</span>
                  </span>
                  <span className="font-mono tabular-nums text-label text-ink">
                    {formatPrice(data.total)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-line">
                  <div
                    className="h-full rounded-pill"
                    style={{ width: `${pct}%`, backgroundColor: col.bar }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Roster count */}
      <div className="flex items-center justify-between rounded-control border border-line bg-surface-sunken px-3.5 py-2.5">
        <span className="text-label text-ink-2">Roster size</span>
        <span className="font-mono tabular-nums text-body text-ink">
          {roster.length} players
        </span>
      </div>
    </div>
  );
}
