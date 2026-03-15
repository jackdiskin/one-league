'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { formatPrice, formatPoints } from '@/lib/format';

export interface CatalogPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  base_weekly_price: number;
  net_order_flow: number;
  last_week_points: number | null;
  season_points: number;
  owner_count: number;
}

interface Props {
  players: CatalogPlayer[];
  season?: number;
}

const POS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  QB: { bg: '#eff6ff', text: '#3b82f6', bar: '#3b82f6' },
  RB: { bg: '#f0fdf4', text: '#10b981', bar: '#10b981' },
  WR: { bg: '#fffbeb', text: '#f59e0b', bar: '#f59e0b' },
  TE: { bg: '#faf5ff', text: '#a855f7', bar: '#a855f7' },
  K:  { bg: '#f8fafc', text: '#64748b', bar: '#94a3b8' },
};

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K'];

type SortKey = 'current_price' | 'last_week_points' | 'season_points' | 'owner_count' | 'price_delta';

export default function PlayerCatalog({ players, season }: Props) {
  const seasonSuffix = season ? `?season=${season}` : '';
  const [pos, setPos]           = useState('ALL');
  const [search, setSearch]     = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('current_price');
  const [sortDir, setSortDir]   = useState<'desc' | 'asc'>('desc');
  const [page, setPage]         = useState(1);
  const PAGE_SIZE = 20;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter(p => (pos === 'ALL' || p.position === pos))
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q))
      .sort((a, b) => {
        let av: number, bv: number;
        if (sortKey === 'price_delta') {
          av = Number(a.current_price) - Number(a.base_weekly_price);
          bv = Number(b.current_price) - Number(b.base_weekly_price);
        } else if (sortKey === 'last_week_points') {
          av = a.last_week_points ?? -Infinity;
          bv = b.last_week_points ?? -Infinity;
        } else {
          av = Number(a[sortKey] ?? 0);
          bv = Number(b[sortKey] ?? 0);
        }
        return sortDir === 'desc' ? bv - av : av - bv;
      });
  }, [players, pos, search, sortKey, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage    = Math.min(page, totalPages);
  const paginated   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 whenever filters change
  useMemo(() => setPage(1), [pos, search]);

  function SortIcon({ col }: { col: SortKey }) {
    const active = sortKey === col;
    return (
      <span style={{ marginLeft: 3, fontSize: 8, color: active ? '#059669' : '#cbd5e1' }}>
        {active ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
      </span>
    );
  }

  function ColHeader({ col, label, align = 'right', width }: { col: SortKey; label: string; align?: string; width: number }) {
    return (
      <button
        onClick={() => toggleSort(col)}
        style={{
          width, textAlign: align as any, background: 'none', border: 'none',
          cursor: 'pointer', padding: 0,
          fontSize: 9, fontWeight: 700, color: sortKey === col ? '#059669' : '#cbd5e1',
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}
      >
        {label}<SortIcon col={col} />
      </button>
    );
  }

  return (
    <div style={{ borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Position tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {POSITIONS.map(p => {
            const col = POS_COLORS[p];
            const active = pos === p;
            return (
              <button
                key={p}
                onClick={() => setPos(p)}
                style={{
                  padding: '4px 11px', borderRadius: 20, border: 'none',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: active ? (col?.bg ?? '#f0fdf4') : '#f8fafc',
                  color: active ? (col?.text ?? '#059669') : '#94a3b8',
                  transition: 'all 0.15s',
                }}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search players..."
            style={{
              paddingLeft: 28, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
              fontSize: 12, borderRadius: 20, border: '1px solid #e2e8f0',
              background: '#f8fafc', color: '#0f172a', outline: 'none', width: 180,
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          {filtered.length.toLocaleString()} players
          {filtered.length > PAGE_SIZE && (
            <span style={{ marginLeft: 6, color: '#cbd5e1' }}>
              · page {safePage} of {totalPages}
            </span>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 72px 80px 72px 72px 72px',
        padding: '7px 18px', background: '#fafafa', borderBottom: '1px solid #f1f5f9',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Player</span>
        <ColHeader col="current_price"   label="Price"    width={72} />
        <ColHeader col="price_delta"     label="Wk Δ"     width={80} />
        <ColHeader col="last_week_points" label="Last Wk" width={72} />
        <ColHeader col="season_points"   label="Season"   width={72} />
        <ColHeader col="owner_count"     label="Owned"    width={72} />
      </div>

      {/* Rows */}
      {filtered.length === 0 && (
        <div style={{ padding: '24px 18px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
          No players found
        </div>
      )}

      {paginated.map((p, i) => {
        const col   = POS_COLORS[p.position] ?? POS_COLORS.K;
        const delta = Number(p.current_price) - Number(p.base_weekly_price);
        const deltaPct = Number(p.base_weekly_price) > 0 ? (delta / Number(p.base_weekly_price)) * 100 : 0;
        const isUp  = delta >= 0;

        return (
          <Link
            key={p.id}
            href={`/players/${p.id}${seasonSuffix}`}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 72px 80px 72px 72px 72px',
              alignItems: 'center', padding: '9px 18px',
              borderBottom: i < paginated.length - 1 ? '1px solid #f8fafc' : 'none',
              cursor: 'pointer', transition: 'background 0.12s',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              {/* Player */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {p.headshot_url ? (
                    <Image src={p.headshot_url} alt={p.full_name} width={34} height={34} unoptimized
                      style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #f1f5f9', display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', background: '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, color: '#64748b',
                    }}>{p.full_name[0]}</div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.full_name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{p.team_code}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: col.text, background: col.bg, borderRadius: 20, padding: '1px 5px' }}>
                      {p.position}
                    </span>
                    {p.net_order_flow > 0 && (
                      <span style={{ fontSize: 9, color: '#10b981' }}>↑ demand</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Price */}
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#0f172a' }}>
                {formatPrice(p.current_price)}
              </div>

              {/* Wk delta */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: delta === 0 ? '#94a3b8' : isUp ? '#10b981' : '#f43f5e' }}>
                  {delta === 0 ? '—' : `${isUp ? '+' : ''}${formatPrice(Math.abs(delta))}`}
                </div>
                {delta !== 0 && (
                  <div style={{ fontSize: 9, color: isUp ? '#10b981' : '#f43f5e' }}>
                    {isUp ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
                  </div>
                )}
              </div>

              {/* Last week */}
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: p.last_week_points != null ? '#0f172a' : '#cbd5e1' }}>
                {p.last_week_points != null ? formatPoints(p.last_week_points) : '—'}
              </div>

              {/* Season */}
              <div style={{ textAlign: 'right', fontSize: 12, color: '#475569' }}>
                {p.season_points > 0 ? formatPoints(p.season_points) : '—'}
              </div>

              {/* Owned */}
              <div style={{ textAlign: 'right', fontSize: 12, color: p.owner_count > 0 ? '#475569' : '#cbd5e1', fontWeight: p.owner_count > 0 ? 600 : 400 }}>
                {p.owner_count > 0 ? `${p.owner_count}` : '—'}
              </div>
            </div>
          </Link>
        );
      })}
      {/* Pagination footer */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderTop: '1px solid #f1f5f9',
          background: '#fafafa',
        }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Prev */}
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
                background: safePage === 1 ? '#f8fafc' : '#fff',
                color: safePage === 1 ? '#cbd5e1' : '#475569',
                cursor: safePage === 1 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
              }}
            >
              ‹
            </button>

            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 2)
              .reduce<(number | '…')[]>((acc, n, idx, arr) => {
                if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('…');
                acc.push(n);
                return acc;
              }, [])
              .map((n, idx) =>
                n === '…' ? (
                  <span key={`ellipsis-${idx}`} style={{ width: 30, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n as number)}
                    style={{
                      width: 30, height: 30, borderRadius: 8,
                      border: safePage === n ? 'none' : '1px solid #e2e8f0',
                      background: safePage === n ? '#0f172a' : '#fff',
                      color: safePage === n ? '#fff' : '#475569',
                      cursor: 'pointer', fontSize: 11, fontWeight: safePage === n ? 800 : 500,
                    }}
                  >
                    {n}
                  </button>
                )
              )
            }

            {/* Next */}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
                background: safePage === totalPages ? '#f8fafc' : '#fff',
                color: safePage === totalPages ? '#cbd5e1' : '#475569',
                cursor: safePage === totalPages ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
