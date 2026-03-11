'use client';

import Image from 'next/image';
import { useState } from 'react';
import Link from 'next/link';
import { formatPrice, formatPoints } from '@/lib/format';

export interface AvailablePlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  last_week_points: number | null;
}

const POS_COLORS: Record<string, { pill: string; dot: string }> = {
  QB: { pill: 'bg-blue-100 text-blue-700',      dot: '#3b82f6' },
  RB: { pill: 'bg-emerald-100 text-emerald-700', dot: '#10b981' },
  WR: { pill: 'bg-amber-100 text-amber-700',     dot: '#f59e0b' },
  TE: { pill: 'bg-purple-100 text-purple-700',   dot: '#a855f7' },
  K:  { pill: 'bg-slate-100 text-slate-600',     dot: '#94a3b8' },
};

const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K'];

export default function AvailablePlayers({
  players,
  budgetRemaining,
}: {
  players: AvailablePlayer[];
  budgetRemaining: number;
}) {
  const [pos, setPos] = useState('All');
  const [search, setSearch] = useState('');

  const isSearching = search.trim().length > 0;

  const filtered = players.filter(p => {
    const matchPos    = pos === 'All' || p.position === pos;
    const matchSearch = p.full_name.toLowerCase().includes(search.toLowerCase()) ||
                        p.team_code.toLowerCase().includes(search.toLowerCase());
    return matchPos && matchSearch;
  });

  const displayed = isSearching ? filtered : filtered.slice(0, 25);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>Available Players</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              {isSearching ? `${filtered.length} results` : `Showing top 25 · ${filtered.length} available`} · Budget {formatPrice(budgetRemaining)}
            </p>
          </div>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              style={{
                paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 10,
                outline: 'none', background: '#f8fafc', color: '#0f172a', width: 180,
              }}
            />
          </div>
        </div>

        {/* Position filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {POSITIONS.map(p => (
            <button key={p} onClick={() => setPos(p)}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: pos === p ? '#0f172a' : '#f1f5f9',
                color: pos === p ? '#fff' : '#64748b',
              }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Column labels */}
      <div style={{
        padding: '6px 20px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center',
        fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <div style={{ flex: 1 }}>Player</div>
        <div style={{ width: 80, textAlign: 'right' }}>Price</div>
        <div style={{ width: 80, textAlign: 'right' }}>Last Wk</div>
        <div style={{ width: 96, textAlign: 'right' }}></div>
      </div>

      {/* Player rows */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {displayed.length === 0 && (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            No players found
          </div>
        )}
        {displayed.map((p, i) => {
          const col = POS_COLORS[p.position] ?? { pill: 'bg-slate-100 text-slate-600', dot: '#94a3b8' };
          const canAfford = Number(p.current_price) <= Number(budgetRemaining);
          return (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center',
              padding: '9px 20px',
              borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {/* Avatar + name — clickable */}
              <Link href={`/players/${p.id}`} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, textDecoration: 'none' }}>
                <div style={{ position: 'relative', flexShrink: 0, marginRight: 12 }}>
                  {p.headshot_url ? (
                    <Image src={p.headshot_url} alt={p.full_name} width={38} height={38} unoptimized
                      style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f1f5f9', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#64748b' }}>
                      {p.full_name[0]}
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 14, height: 14, borderRadius: '50%',
                    background: col.dot, border: '2px solid #fff',
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
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{p.team_code}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${col.pill}`}>{p.position}</span>
                  </div>
                </div>
              </Link>

              {/* Price */}
              <div style={{ width: 80, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                {formatPrice(p.current_price)}
              </div>

              {/* Last week */}
              <div style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: 700, color: p.last_week_points != null ? '#0f172a' : '#cbd5e1' }}>
                {p.last_week_points != null ? formatPoints(p.last_week_points) : '—'}
              </div>

              {/* Buy button */}
              <div style={{ width: 96, textAlign: 'right' }}>
                <button
                  disabled={!canAfford}
                  style={{
                    padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    border: 'none', cursor: canAfford ? 'pointer' : 'not-allowed',
                    background: canAfford ? '#0f172a' : '#f1f5f9',
                    color: canAfford ? '#fff' : '#cbd5e1',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (canAfford) (e.currentTarget as HTMLElement).style.background = '#1e293b'; }}
                  onMouseLeave={e => { if (canAfford) (e.currentTarget as HTMLElement).style.background = '#0f172a'; }}
                >
                  {canAfford ? 'Buy' : 'Can\'t afford'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
