import { formatPrice } from '@/lib/format';
import type { RosterPlayer } from './RosterList';

const POS_COLORS: Record<string, { bar: string; label: string }> = {
  QB: { bar: '#3b82f6', label: 'Quarterback' },
  RB: { bar: '#10b981', label: 'Running Backs' },
  WR: { bar: '#f59e0b', label: 'Wide Receivers' },
  TE: { bar: '#a855f7', label: 'Tight Ends' },
  K:  { bar: '#94a3b8', label: 'Kicker' },
};

const TOTAL_CAP = 200_000_000;

export default function CapBreakdown({
  roster,
  budgetRemaining,
}: {
  roster: RosterPlayer[];
  budgetRemaining: number;
}) {
  const totalSpent = TOTAL_CAP - Number(budgetRemaining);
  const usedPct = Math.min(100, (totalSpent / TOTAL_CAP) * 100);

  // Group by position
  const byPos = roster.reduce((acc, p) => {
    if (!acc[p.position]) acc[p.position] = { total: 0, count: 0 };
    acc[p.position].total += Number(p.current_price);
    acc[p.position].count++;
    return acc;
  }, {} as Record<string, { total: number; count: number }>);

  const posEntries = Object.entries(byPos).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm" style={{ padding: 20, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Salary Cap</h3>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Cap allocation breakdown</p>
      </div>

      {/* Big remaining number */}
      <div style={{
        background: Number(budgetRemaining) > 20_000_000 ? '#f0fdf4' : '#fff7ed',
        border: `1px solid ${Number(budgetRemaining) > 20_000_000 ? '#bbf7d0' : '#fed7aa'}`,
        borderRadius: 14, padding: '14px 16px',
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: Number(budgetRemaining) > 20_000_000 ? '#059669' : '#ea580c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Budget Remaining
        </p>
        <p style={{ fontSize: 26, fontWeight: 900, color: Number(budgetRemaining) > 20_000_000 ? '#065f46' : '#9a3412', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {formatPrice(budgetRemaining)}
        </p>
        <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          of {formatPrice(TOTAL_CAP)} total cap
        </p>
      </div>

      {/* Overall usage bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
          <span>Cap Used</span>
          <span>{usedPct.toFixed(1)}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: '#f1f5f9', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 8,
            background: usedPct > 80
              ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
              : 'linear-gradient(90deg, #10b981, #059669)',
            width: `${usedPct}%`,
            transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#94a3b8' }}>
          <span>{formatPrice(totalSpent)} spent</span>
          <span>{formatPrice(Number(budgetRemaining))} free</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#f1f5f9' }} />

      {/* Per-position breakdown — grows to fill remaining space */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
          By Position
        </p>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
          {posEntries.map(([pos, data]) => {
            const col = POS_COLORS[pos] ?? { bar: '#94a3b8', label: pos };
            const pct = (data.total / TOTAL_CAP) * 100;
            return (
              <div key={pos}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.bar, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>{col.label}</span>
                    <span style={{ fontSize: 10, color: '#cbd5e1' }}>×{data.count}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>{formatPrice(data.total)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4, background: col.bar, width: `${pct}%`, opacity: 0.8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Roster count */}
      <div style={{
        background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 12, padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Roster size</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{roster.length} players</span>
      </div>
    </div>
  );
}
