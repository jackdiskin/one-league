'use client';

// Position counters as segmented pills — one segment per required slot, so
// squad progress is glanceable rather than something you have to read.

function Group({ label, current, max }: { label: string; current: number; max: number }) {
  const done = current >= max;

  return (
    <div className="flex items-center gap-2">
      <span className="text-eyebrow uppercase text-ink-3">{label}</span>
      <span className="flex gap-0.5" role="img" aria-label={`${label}: ${current} of ${max} filled`}>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={[
              'h-1.5 w-4 rounded-pill transition-colors duration-150 ease-out-quart',
              i < current ? (done ? 'bg-emerald' : 'bg-emerald/70') : 'bg-line',
            ].join(' ')}
          />
        ))}
      </span>
      <span className="font-mono tabular-nums text-label text-ink-2">
        {current}/{max}
      </span>
    </div>
  );
}

export default function QuotaPills({
  qb, rb, flex, quota,
}: {
  qb: number;
  rb: number;
  flex: number;
  quota: { QB: number; RB: number; FLEX: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <Group label="QB"    current={qb}   max={quota.QB} />
      <Group label="RB"    current={rb}   max={quota.RB} />
      <Group label="WR/TE" current={flex} max={quota.FLEX} />
    </div>
  );
}
