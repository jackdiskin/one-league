'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPoints } from '@/lib/format';
import { sellProceeds } from '@/lib/pricing';
import CapBreakdown from './CapBreakdown';

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
  is_owned: boolean;
  purchase_price: number | null;
  acquired_week: number | null;
}

interface Props {
  players: CatalogPlayer[];
  season?: number;
  fantasyTeamId: number | null;
  currentWeek: number;
  budgetRemaining: number;
}

// A pending transfer slot. `outgoing` is null when it originates from an
// already-empty roster slot (a pure buy-in, no sell attached). `incoming`
// is null until a replacement has been chosen.
interface PendingTransfer {
  key: string;
  outgoing: CatalogPlayer | null;
  incoming: CatalogPlayer | null;
  positions: string[];
  groupLabel: string;
}

const POS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  QB: { bg: '#eff6ff', text: '#3b82f6', bar: '#3b82f6' },
  RB: { bg: '#f0fdf4', text: '#10b981', bar: '#10b981' },
  WR: { bg: '#fffbeb', text: '#f59e0b', bar: '#f59e0b' },
  TE: { bg: '#faf5ff', text: '#a855f7', bar: '#a855f7' },
  K:  { bg: '#f8fafc', text: '#64748b', bar: '#94a3b8' },
};

// Mirrors the quota enforced server-side in app/api/market/buy/route.ts
const QUOTA: Record<string, number> = { QB: 2, RB: 3, FLEX: 5, K: 1 };

const GROUPS: { key: string; label: string; positions: string[] }[] = [
  { key: 'QB',   label: 'Quarterbacks',  positions: ['QB'] },
  { key: 'RB',   label: 'Running Backs', positions: ['RB'] },
  { key: 'FLEX', label: 'Receivers',     positions: ['WR', 'TE'] },
  { key: 'K',    label: 'Kicker',        positions: ['K'] },
];

function Avatar({ player, size = 38 }: { player: Pick<CatalogPlayer, 'headshot_url' | 'full_name' | 'position'>; size?: number }) {
  const col = POS_COLORS[player.position] ?? POS_COLORS.K;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {player.headshot_url ? (
        <Image src={player.headshot_url} alt={player.full_name} width={size} height={size} unoptimized
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #f1f5f9', display: 'block' }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: '50%', background: '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.38, fontWeight: 700, color: '#64748b',
        }}>{player.full_name[0]}</div>
      )}
      <div style={{
        position: 'absolute', bottom: -1, right: -1,
        width: 14, height: 14, borderRadius: '50%',
        background: col.bar, border: '2px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 6, fontWeight: 900, color: '#fff',
      }}>{player.position[0]}</div>
    </div>
  );
}

export default function TransferBoard({ players, season, fantasyTeamId, currentWeek, budgetRemaining }: Props) {
  const router = useRouter();
  const seasonSuffix = season ? `?season=${season}` : '';
  const emptySlotCounter = useRef(0);

  const [pending, setPending] = useState<PendingTransfer[]>([]);
  const [searchBySlot, setSearchBySlot] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; msg?: string }[] | null>(null);

  const owned = useMemo(() => players.filter(p => p.is_owned), [players]);

  // Budget available for a given slot: base budget + sell proceeds of every pending
  // outgoing player, minus the incoming price already committed on every OTHER slot.
  const availableBudgetFor = useCallback((forKey: string | null) => {
    let b = Number(budgetRemaining);
    for (const t of pending) {
      if (t.outgoing) b += sellProceeds(Number(t.outgoing.current_price));
      if (t.incoming && t.key !== forKey) b -= Number(t.incoming.current_price);
    }
    return b;
  }, [pending, budgetRemaining]);

  const totalBudgetAfter = availableBudgetFor(null);
  const actionableCount = pending.filter(t => t.outgoing || t.incoming).length;
  const canConfirm = actionableCount > 0 && !confirming;

  const toggleOutgoing = useCallback((p: CatalogPlayer) => {
    setResults(null);
    const key = `out-${p.id}`;
    setPending(prev => {
      const exists = prev.some(t => t.key === key);
      if (exists) return prev.filter(t => t.key !== key);
      const group = GROUPS.find(g => g.positions.includes(p.position))!;
      return [...prev, { key, outgoing: p, incoming: null, positions: group.positions, groupLabel: group.label }];
    });
  }, []);

  const addEmptySlot = useCallback((group: { positions: string[]; label: string }) => {
    setResults(null);
    const key = `empty-${emptySlotCounter.current++}`;
    setPending(prev => [...prev, { key, outgoing: null, incoming: null, positions: group.positions, groupLabel: group.label }]);
  }, []);

  const removeSlot = useCallback((key: string) => {
    setPending(prev => prev.filter(t => t.key !== key));
  }, []);

  const setSlotIncoming = useCallback((key: string, incoming: CatalogPlayer | null) => {
    setPending(prev => prev.map(t => t.key === key ? { ...t, incoming } : t));
  }, []);

  const candidatesFor = useCallback((slot: PendingTransfer) => {
    const q = (searchBySlot[slot.key] ?? '').trim().toLowerCase();
    const alreadyChosenElsewhere = new Set(
      pending.filter(t => t.key !== slot.key && t.incoming).map(t => t.incoming!.id)
    );
    return players
      .filter(p => !p.is_owned && slot.positions.includes(p.position))
      .filter(p => !alreadyChosenElsewhere.has(p.id))
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q))
      .sort((a, b) => Number(b.current_price) - Number(a.current_price));
  }, [players, pending, searchBySlot]);

  const confirmAll = useCallback(async () => {
    if (!fantasyTeamId) return;
    setConfirming(true);
    const outcomes: { label: string; ok: boolean; msg?: string }[] = [];
    const stillPending: PendingTransfer[] = [];

    for (const t of pending) {
      if (!t.outgoing && !t.incoming) {
        stillPending.push(t); // nothing chosen yet — leave it for later
        continue;
      }
      const label = t.outgoing && t.incoming
        ? `${t.outgoing.full_name} → ${t.incoming.full_name}`
        : t.outgoing
          ? `Sold ${t.outgoing.full_name} — slot left open`
          : `Signed ${t.incoming!.full_name}`;
      try {
        if (t.outgoing) {
          const sellRes = await fetch('/api/market/sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: t.outgoing.id, week: currentWeek }),
          });
          if (!sellRes.ok) {
            const j = await sellRes.json();
            throw new Error(j.error ?? 'Sell failed');
          }
        }
        if (t.incoming) {
          const buyRes = await fetch('/api/market/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: t.incoming.id, week: currentWeek }),
          });
          if (!buyRes.ok) {
            const j = await buyRes.json();
            throw new Error(t.outgoing ? `sold, but buy failed: ${j.error ?? 'buy failed'}` : (j.error ?? 'Buy failed'));
          }
        }
        outcomes.push({ label, ok: true });
      } catch (e) {
        outcomes.push({ label, ok: false, msg: e instanceof Error ? e.message : 'Transfer failed' });
      }
    }

    setResults(outcomes);
    setPending(stillPending);
    setConfirming(false);
    router.refresh();
  }, [pending, fantasyTeamId, currentWeek, router]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 16, alignItems: 'start' }}>

      {/* My Squad */}
      <div style={{ borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>My Squad</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
            Tap any number of players (or open slots) to build your transfers
          </p>
        </div>

        {GROUPS.map(group => {
          const groupPlayers = owned.filter(p => group.positions.includes(p.position));
          const pendingEmptyInGroup = pending.filter(t => !t.outgoing && t.groupLabel === group.label).length;
          const openSlots = Math.max(0, QUOTA[group.key] - groupPlayers.length - pendingEmptyInGroup);
          if (!groupPlayers.length && !openSlots) return null;
          const col = POS_COLORS[group.positions[0]] ?? POS_COLORS.K;
          return (
            <div key={group.key}>
              <div style={{
                padding: '6px 18px', background: '#fafafa', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: col.bar, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{group.label}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>· {groupPlayers.length}/{QUOTA[group.key]}</span>
              </div>
              {groupPlayers.map((p, i) => {
                const isSelected = pending.some(t => t.key === `out-${p.id}`);
                const pcol = POS_COLORS[p.position] ?? POS_COLORS.K;
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleOutgoing(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                      cursor: 'pointer', transition: 'background 0.12s',
                      background: isSelected ? '#fef2f2' : 'transparent',
                      outline: isSelected ? '1.5px solid #fca5a5' : 'none',
                      outlineOffset: '-2px', borderRadius: isSelected ? 10 : 0,
                      borderBottom: (i < groupPlayers.length - 1 || openSlots > 0) ? '1px solid #f8fafc' : 'none',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <Avatar player={p} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: pcol.text, background: pcol.bg, borderRadius: 20, padding: '1px 5px' }}>{p.position}</span>
                        {isSelected && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 20, padding: '1px 6px', letterSpacing: '0.04em' }}>
                            OUT
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                        {p.team_code} · {p.last_week_points != null ? `${formatPoints(p.last_week_points)} last wk` : 'no game yet'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{formatPrice(p.current_price)}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isSelected ? '#ef4444' : '#cbd5e1'} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </div>
                );
              })}
              {Array.from({ length: openSlots }, (_, i) => (
                <div
                  key={`empty-${group.key}-${i}`}
                  onClick={() => addEmptySlot(group)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px',
                    cursor: 'pointer', borderBottom: i < openSlots - 1 ? '1px solid #f8fafc' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    border: `2px dashed ${col.bar}`, opacity: 0.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col.bar} strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', fontStyle: 'italic' }}>Open slot</div>
                    <div style={{ fontSize: 10, color: '#cbd5e1' }}>Tap to sign a {group.label.toLowerCase().replace(/s$/, '')}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Sidebar: results, pending transfers + replacement pickers, cap breakdown */}
      <div style={{ position: 'sticky', top: 90, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {results && (
          <div style={{ borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Transfer results</h3>
              <button
                onClick={() => setResults(null)}
                style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
              >
                Dismiss
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', gap: 2, padding: '7px 10px', borderRadius: 8,
                  background: r.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}`,
                  fontSize: 11, fontWeight: 600, color: r.ok ? '#065f46' : '#991b1b',
                }}>
                  <span>{r.ok ? '✓' : '✕'} {r.label}</span>
                  {r.msg && !r.ok && <span style={{ color: '#dc2626', fontWeight: 500 }}>{r.msg}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {pending.length === 0 ? (
          <div style={{
            borderRadius: 16, background: '#fff', border: '1px dashed #e2e8f0',
            padding: '20px 16px', textAlign: 'center',
          }}>
            <p style={{ fontSize: 12, color: '#94a3b8' }}>
              Select a player (or an open slot) on the left to start a transfer
            </p>
          </div>
        ) : (
          <div style={{ borderRadius: 16, background: '#fff', border: '1.5px solid #ef4444', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                  Transfers ({pending.length})
                </h3>
                <button
                  onClick={() => setPending([])}
                  disabled={confirming}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: confirming ? 'default' : 'pointer',
                  }}
                >
                  Clear all
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Budget after: {formatPrice(totalBudgetAfter)}
              </p>
              <button
                onClick={confirmAll}
                disabled={!canConfirm}
                style={{
                  marginTop: 10, width: '100%', padding: '9px 0', borderRadius: 12, fontSize: 12, fontWeight: 800,
                  border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
                  background: canConfirm ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#f1f5f9',
                  color: canConfirm ? '#fff' : '#cbd5e1',
                }}
              >
                {confirming ? 'Confirming…' : `Confirm ${actionableCount || ''} Transfer${actionableCount === 1 ? '' : 's'}`}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pending.map((t, idx) => {
                const available = availableBudgetFor(t.key);
                const candidates = candidatesFor(t);
                return (
                  <div key={t.key} style={{ borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none' }}>

                    {/* Slot summary */}
                    <div style={{ padding: '10px 16px', background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {t.outgoing ? (
                          <>
                            <Avatar player={t.outgoing} size={28} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.outgoing.full_name}</div>
                              <div style={{ fontSize: 9, color: '#94a3b8' }}>sells for {formatPrice(sellProceeds(Number(t.outgoing.current_price)))}</div>
                            </div>
                          </>
                        ) : (
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', fontStyle: 'italic' }}>Open {t.groupLabel.toLowerCase()} slot</div>
                          </div>
                        )}
                        <button
                          onClick={() => removeSlot(t.key)}
                          title="Remove"
                          style={{
                            width: 22, height: 22, borderRadius: 7, border: '1px solid #f1f5f9', background: '#fff',
                            color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>

                      {t.incoming && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <Avatar player={t.incoming} size={28} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.incoming.full_name}</div>
                            <div style={{ fontSize: 9, color: '#94a3b8' }}>{formatPrice(t.incoming.current_price)}</div>
                          </div>
                          <button
                            onClick={() => setSlotIncoming(t.key, null)}
                            style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 700, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Replacement picker */}
                    {!t.incoming && (
                      <div>
                        <div style={{ padding: '8px 16px 0' }}>
                          <div style={{ position: 'relative' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
                              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
                              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                              value={searchBySlot[t.key] ?? ''}
                              onChange={e => setSearchBySlot(s => ({ ...s, [t.key]: e.target.value }))}
                              placeholder={`Search ${t.positions.join('/')}...`}
                              style={{
                                width: '100%', paddingLeft: 26, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
                                fontSize: 11, borderRadius: 20, border: '1px solid #e2e8f0',
                                background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box',
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 6 }}>
                          {candidates.length === 0 && (
                            <div style={{ padding: '16px', textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
                              No players found
                            </div>
                          )}
                          {candidates.map((p, i) => {
                            const pcol = POS_COLORS[p.position] ?? POS_COLORS.K;
                            const canAfford = Number(p.current_price) <= available;
                            return (
                              <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px',
                                borderTop: '1px solid #f8fafc',
                              }}>
                                <Link href={`/players/${p.id}${seasonSuffix}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, textDecoration: 'none' }}>
                                  <Avatar player={p} size={26} />
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span style={{ fontSize: 9, color: '#94a3b8' }}>{p.team_code}</span>
                                      <span style={{ fontSize: 8, fontWeight: 700, color: pcol.text, background: pcol.bg, borderRadius: 20, padding: '1px 4px' }}>{p.position}</span>
                                    </div>
                                  </div>
                                </Link>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontSize: 11, fontWeight: 800, color: canAfford ? '#0f172a' : '#cbd5e1', marginBottom: 3 }}>
                                    {formatPrice(p.current_price)}
                                  </div>
                                  <button
                                    onClick={() => setSlotIncoming(t.key, p)}
                                    disabled={!canAfford}
                                    style={{
                                      padding: '3px 9px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                                      border: 'none', cursor: canAfford ? 'pointer' : 'not-allowed',
                                      background: canAfford ? '#0f172a' : '#f1f5f9',
                                      color: canAfford ? '#fff' : '#cbd5e1',
                                    }}
                                  >
                                    {canAfford ? 'Select' : "Can't afford"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <CapBreakdown
          roster={owned.map(p => ({ position: p.position, current_price: p.current_price }))}
          budgetRemaining={Number(budgetRemaining)}
        />
      </div>
    </div>
  );
}
