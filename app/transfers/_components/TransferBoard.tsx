'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPoints } from '@/lib/format';
import { sellProceeds } from '@/lib/pricing';

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

interface PendingTransfer {
  outgoing: CatalogPlayer;
  incoming: CatalogPlayer | null;
}

const POS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  QB: { bg: '#eff6ff', text: '#3b82f6', bar: '#3b82f6' },
  RB: { bg: '#f0fdf4', text: '#10b981', bar: '#10b981' },
  WR: { bg: '#fffbeb', text: '#f59e0b', bar: '#f59e0b' },
  TE: { bg: '#faf5ff', text: '#a855f7', bar: '#a855f7' },
  K:  { bg: '#f8fafc', text: '#64748b', bar: '#94a3b8' },
};

// WR/TE share a flex pool for roster purposes — a swap between them is always
// quota-neutral, same as a straight same-position swap. QB/RB/K only swap 1-for-1.
function flexGroup(position: string): string[] {
  return (position === 'WR' || position === 'TE') ? ['WR', 'TE'] : [position];
}

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

  const [pending, setPending] = useState<PendingTransfer[]>([]);
  const [searchBySlot, setSearchBySlot] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; msg?: string }[] | null>(null);

  const owned = useMemo(() => players.filter(p => p.is_owned), [players]);

  // Budget available for a given slot: base budget + sell proceeds of every pending
  // outgoing player, minus the incoming price already committed on every OTHER slot.
  const availableBudgetFor = useCallback((forOutId: number | null) => {
    let b = Number(budgetRemaining);
    for (const t of pending) {
      b += sellProceeds(Number(t.outgoing.current_price));
      if (t.incoming && t.outgoing.id !== forOutId) {
        b -= Number(t.incoming.current_price);
      }
    }
    return b;
  }, [pending, budgetRemaining]);

  const totalBudgetAfter = availableBudgetFor(null);
  const chosenCount = pending.filter(t => t.incoming).length;
  const canConfirm = pending.length > 0 && chosenCount === pending.length && !confirming;

  const toggleOutgoing = useCallback((p: CatalogPlayer) => {
    setResults(null);
    setPending(prev => {
      const exists = prev.some(t => t.outgoing.id === p.id);
      if (exists) return prev.filter(t => t.outgoing.id !== p.id);
      return [...prev, { outgoing: p, incoming: null }];
    });
  }, []);

  const removeSlot = useCallback((outId: number) => {
    setPending(prev => prev.filter(t => t.outgoing.id !== outId));
  }, []);

  const setSlotIncoming = useCallback((outId: number, incoming: CatalogPlayer | null) => {
    setPending(prev => prev.map(t => t.outgoing.id === outId ? { ...t, incoming } : t));
  }, []);

  const candidatesFor = useCallback((outgoing: CatalogPlayer) => {
    const group = flexGroup(outgoing.position);
    const q = (searchBySlot[outgoing.id] ?? '').trim().toLowerCase();
    const alreadyChosenElsewhere = new Set(
      pending.filter(t => t.outgoing.id !== outgoing.id && t.incoming).map(t => t.incoming!.id)
    );
    return players
      .filter(p => !p.is_owned && group.includes(p.position))
      .filter(p => !alreadyChosenElsewhere.has(p.id))
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q))
      .sort((a, b) => Number(b.current_price) - Number(a.current_price));
  }, [players, pending, searchBySlot]);

  const confirmAll = useCallback(async () => {
    if (!fantasyTeamId) return;
    setConfirming(true);
    const outcomes: { label: string; ok: boolean; msg?: string }[] = [];

    for (const t of pending) {
      if (!t.incoming) continue;
      const label = `${t.outgoing.full_name} → ${t.incoming.full_name}`;
      try {
        const sellRes = await fetch('/api/market/sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: t.outgoing.id, week: currentWeek }),
        });
        if (!sellRes.ok) {
          const j = await sellRes.json();
          throw new Error(j.error ?? 'Sell failed');
        }
        const buyRes = await fetch('/api/market/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: t.incoming.id, week: currentWeek }),
        });
        if (!buyRes.ok) {
          const j = await buyRes.json();
          throw new Error(`sold, but buy failed: ${j.error ?? 'buy failed'}`);
        }
        outcomes.push({ label, ok: true });
      } catch (e) {
        outcomes.push({ label, ok: false, msg: e instanceof Error ? e.message : 'Transfer failed' });
      }
    }

    setResults(outcomes);
    setPending([]);
    setConfirming(false);
    router.refresh();
  }, [pending, fantasyTeamId, currentWeek, router]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* My Squad */}
      <div style={{ borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>My Squad</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
            Tap any number of players to transfer out — pick a replacement for each below
          </p>
        </div>

        {GROUPS.map(group => {
          const groupPlayers = owned.filter(p => group.positions.includes(p.position));
          if (!groupPlayers.length) return null;
          const col = POS_COLORS[group.positions[0]] ?? POS_COLORS.K;
          return (
            <div key={group.key}>
              <div style={{
                padding: '6px 18px', background: '#fafafa', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 3, height: 12, borderRadius: 2, background: col.bar, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{group.label}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>· {groupPlayers.length}</span>
              </div>
              {groupPlayers.map((p, i) => {
                const slot = pending.find(t => t.outgoing.id === p.id);
                const isSelected = !!slot;
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
                      borderBottom: i < groupPlayers.length - 1 ? '1px solid #f8fafc' : 'none',
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
            </div>
          );
        })}
      </div>

      {/* Transfer results */}
      {results && (
        <div style={{ borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px 18px' }}>
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
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                background: r.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${r.ok ? '#bbf7d0' : '#fecaca'}`,
                fontSize: 12, fontWeight: 600, color: r.ok ? '#065f46' : '#991b1b',
              }}>
                <span>{r.ok ? '✓' : '✕'}</span>
                <span>{r.label}</span>
                {r.msg && !r.ok && <span style={{ color: '#dc2626', fontWeight: 500 }}>— {r.msg}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending transfers */}
      {pending.length > 0 && (
        <div style={{ borderRadius: 16, background: '#fff', border: '1.5px solid #ef4444', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>
                Pending Transfers ({pending.length})
              </h3>
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {chosenCount}/{pending.length} replacements chosen · budget after {formatPrice(totalBudgetAfter)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPending([])}
                disabled={confirming}
                style={{
                  padding: '8px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: confirming ? 'default' : 'pointer',
                }}
              >
                Clear all
              </button>
              <button
                onClick={confirmAll}
                disabled={!canConfirm}
                style={{
                  padding: '8px 18px', borderRadius: 20, fontSize: 12, fontWeight: 800,
                  border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed',
                  background: canConfirm ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#f1f5f9',
                  color: canConfirm ? '#fff' : '#cbd5e1',
                }}
              >
                {confirming ? 'Confirming…' : `Confirm ${pending.length} Transfer${pending.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {pending.map((t, idx) => {
              const outCol = POS_COLORS[t.outgoing.position] ?? POS_COLORS.K;
              const available = availableBudgetFor(t.outgoing.id);
              const candidates = candidatesFor(t.outgoing);
              return (
                <div key={t.outgoing.id} style={{ borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none' }}>

                  {/* Slot header: outgoing → incoming (or picker) */}
                  <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, background: '#fafafa' }}>
                    <Avatar player={t.outgoing} size={32} />
                    <div style={{ minWidth: 0, flex: '0 1 auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{t.outgoing.full_name}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: outCol.text, background: outCol.bg, borderRadius: 20, padding: '1px 5px' }}>{t.outgoing.position}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>sells for {formatPrice(sellProceeds(Number(t.outgoing.current_price)))}</div>
                    </div>

                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>

                    {t.incoming ? (
                      <>
                        <Avatar player={t.incoming} size={32} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{t.incoming.full_name}</span>
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              color: (POS_COLORS[t.incoming.position] ?? POS_COLORS.K).text,
                              background: (POS_COLORS[t.incoming.position] ?? POS_COLORS.K).bg,
                              borderRadius: 20, padding: '1px 5px',
                            }}>{t.incoming.position}</span>
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{formatPrice(t.incoming.current_price)}</div>
                        </div>
                        <button
                          onClick={() => setSlotIncoming(t.outgoing.id, null)}
                          style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}
                        >
                          Change
                        </button>
                      </>
                    ) : (
                      <div style={{ flex: 1, fontSize: 12, fontStyle: 'italic', color: '#94a3b8' }}>Choose a replacement below</div>
                    )}

                    <button
                      onClick={() => removeSlot(t.outgoing.id)}
                      title="Remove this transfer"
                      style={{
                        width: 26, height: 26, borderRadius: 8, border: '1px solid #f1f5f9', background: '#fff',
                        color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Replacement picker — shown until a replacement is chosen for this slot */}
                  {!t.incoming && (
                    <div>
                      <div style={{ padding: '10px 18px 0' }}>
                        <div style={{ position: 'relative', maxWidth: 260 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
                            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }}>
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <input
                            value={searchBySlot[t.outgoing.id] ?? ''}
                            onChange={e => setSearchBySlot(s => ({ ...s, [t.outgoing.id]: e.target.value }))}
                            placeholder={`Search ${flexGroup(t.outgoing.position).join('/')}...`}
                            style={{
                              width: '100%', paddingLeft: 28, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
                              fontSize: 12, borderRadius: 20, border: '1px solid #e2e8f0',
                              background: '#f8fafc', color: '#0f172a', outline: 'none',
                            }}
                          />
                        </div>
                      </div>

                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 72px 72px 72px 96px',
                        padding: '6px 18px', marginTop: 8, background: '#fafafa', borderBottom: '1px solid #f1f5f9', borderTop: '1px solid #f1f5f9',
                        fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em',
                      }}>
                        <span>Player</span>
                        <span style={{ textAlign: 'right' }}>Price</span>
                        <span style={{ textAlign: 'right' }}>Last Wk</span>
                        <span style={{ textAlign: 'right' }}>Season</span>
                        <span />
                      </div>

                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {candidates.length === 0 && (
                          <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                            No players found
                          </div>
                        )}
                        {candidates.map((p, i) => {
                          const pcol = POS_COLORS[p.position] ?? POS_COLORS.K;
                          const canAfford = Number(p.current_price) <= available;
                          return (
                            <div key={p.id} style={{
                              display: 'grid', gridTemplateColumns: '1fr 72px 72px 72px 96px',
                              alignItems: 'center', padding: '9px 18px',
                              borderBottom: i < candidates.length - 1 ? '1px solid #f8fafc' : 'none',
                            }}>
                              <Link href={`/players/${p.id}${seasonSuffix}`} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, textDecoration: 'none' }}>
                                <Avatar player={p} size={30} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{p.team_code}</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: pcol.text, background: pcol.bg, borderRadius: 20, padding: '1px 5px' }}>{p.position}</span>
                                  </div>
                                </div>
                              </Link>
                              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 800, color: canAfford ? '#0f172a' : '#cbd5e1' }}>
                                {formatPrice(p.current_price)}
                              </div>
                              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: p.last_week_points != null ? '#0f172a' : '#cbd5e1' }}>
                                {p.last_week_points != null ? formatPoints(p.last_week_points) : '—'}
                              </div>
                              <div style={{ textAlign: 'right', fontSize: 12, color: '#475569' }}>
                                {p.season_points > 0 ? formatPoints(p.season_points) : '—'}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <button
                                  onClick={() => setSlotIncoming(t.outgoing.id, p)}
                                  disabled={!canAfford}
                                  style={{
                                    padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
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
    </div>
  );
}
