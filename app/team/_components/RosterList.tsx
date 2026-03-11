'use client';

import Image from 'next/image';
import Link from 'next/link';
import { formatPrice, formatPoints } from '@/lib/format';

export interface RosterPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  purchase_price: number;
  acquired_week: number;
  roster_slot: string;
  last_week_points: number | null;
  season_points: number | null;
}

const POS_COLORS: Record<string, { pill: string; bar: string }> = {
  QB: { pill: 'bg-blue-100 text-blue-700',      bar: '#3b82f6' },
  RB: { pill: 'bg-emerald-100 text-emerald-700', bar: '#10b981' },
  WR: { pill: 'bg-amber-100 text-amber-700',     bar: '#f59e0b' },
  TE: { pill: 'bg-purple-100 text-purple-700',   bar: '#a855f7' },
  K:  { pill: 'bg-slate-100 text-slate-600',     bar: '#94a3b8' },
};

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K'];
const POS_LABELS: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running Backs', WR: 'Wide Receivers', TE: 'Tight Ends', K: 'Kicker',
};

export default function RosterList({ roster }: { roster: RosterPlayer[] }) {
  const grouped = POS_ORDER.reduce((acc, pos) => {
    acc[pos] = roster.filter(p => p.position === pos);
    return acc;
  }, {} as Record<string, RosterPlayer[]>);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Full Roster</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{roster.length} active players</p>
        </div>
        {/* Column labels */}
        <div style={{ display: 'flex', gap: 0, fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          <span style={{ width: 72, textAlign: 'right' }}>Price</span>
          <span style={{ width: 72, textAlign: 'right' }}>Bought at</span>
          <span style={{ width: 60, textAlign: 'right' }}>P&amp;L</span>
          <span style={{ width: 68, textAlign: 'right' }}>Last Wk</span>
          <span style={{ width: 72, textAlign: 'right' }}>Season</span>
        </div>
      </div>

      {/* Position groups */}
      {POS_ORDER.map(pos => {
        const players = grouped[pos];
        if (!players?.length) return null;
        const col = POS_COLORS[pos] ?? { pill: 'bg-slate-100 text-slate-600', bar: '#94a3b8' };
        return (
          <div key={pos}>
            {/* Group header */}
            <div style={{
              padding: '8px 20px',
              background: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 3, height: 14, borderRadius: 2, background: col.bar, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {POS_LABELS[pos]}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>· {players.length}</span>
            </div>

            {/* Players */}
            {players.map((p, i) => {
              const pnl = Number(p.current_price) - Number(p.purchase_price);
              const pnlPct = Number(p.purchase_price) > 0 ? (pnl / Number(p.purchase_price)) * 100 : 0;
              const isUp = pnl >= 0;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '10px 20px',
                  borderBottom: i < players.length - 1 ? '1px solid #f8fafc' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  {/* Avatar + Name — clickable link */}
                  <Link href={`/players/${p.id}`} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, textDecoration: 'none', marginRight: 0 }}>
                  <div style={{ position: 'relative', flexShrink: 0, marginRight: 12 }}>
                    {p.headshot_url ? (
                      <Image src={p.headshot_url} alt={p.full_name} width={40} height={40} unoptimized
                        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f1f5f9', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#64748b' }}>
                        {p.full_name[0]}
                      </div>
                    )}
                    <div style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 16, height: 16, borderRadius: '50%',
                      background: col.bar, border: '2px solid #fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 6, fontWeight: 900, color: '#fff',
                    }}>
                      {p.position[0]}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{p.team_code}</span>
                      {p.roster_slot === 'BENCH' && (
                        <span style={{ fontSize: 9, fontWeight: 700, background: '#f1f5f9', color: '#94a3b8', borderRadius: 4, padding: '1px 5px' }}>BENCH</span>
                      )}
                    </div>
                  </div>
                  </Link>

                  {/* Current price */}
                  <div style={{ width: 72, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                    {formatPrice(p.current_price)}
                  </div>

                  {/* Purchase price */}
                  <div style={{ width: 72, textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
                    {formatPrice(p.purchase_price)}
                  </div>

                  {/* P&L */}
                  <div style={{ width: 60, textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isUp ? '#10b981' : '#f43f5e' }}>
                      {isUp ? '+' : ''}{formatPrice(Math.abs(pnl))}
                    </div>
                    <div style={{ fontSize: 9, color: isUp ? '#10b981' : '#f43f5e' }}>
                      {isUp ? '▲' : '▼'} {Math.abs(pnlPct).toFixed(1)}%
                    </div>
                  </div>

                  {/* Last week */}
                  <div style={{ width: 68, textAlign: 'right', fontSize: 13, fontWeight: 700, color: p.last_week_points != null ? '#0f172a' : '#cbd5e1' }}>
                    {p.last_week_points != null ? formatPoints(p.last_week_points) : '—'}
                  </div>

                  {/* Season */}
                  <div style={{ width: 72, textAlign: 'right', fontSize: 12, color: '#475569' }}>
                    {p.season_points != null ? formatPoints(p.season_points) : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
