'use client';

import Image from 'next/image';
import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPoints, formatPlayerName } from '@/lib/format';
import { sellProceeds } from '@/lib/pricing';
import CapBreakdown from './CapBreakdown';
import TeamLogo from '@/components/TeamLogo';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import type { Matchup } from '@/lib/schedule';
import { POS_COLORS } from '@/components/positions';
import { quotaFor } from '@/components/rosterRules';
import Select from '@/components/ui/Select';
import Checkbox from '@/components/ui/Checkbox';
import SectionHeader from '@/components/ui/SectionHeader';
import PositionChip from '@/components/ui/PositionChip';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';

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
  last_year_points: number;
  owner_count: number;
  ownership_pct: number;
  trades_in: number;
  trades_out: number;
  price_pct_change: number;
  projected_next_week: number;
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
  matchups: Record<string, Matchup>;
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

// Position identity comes from components/positions.ts — see A3.

// Squad composition comes from components/rosterRules.ts.

// $0.5M increments from $18M down to $1M, e.g. "$17.5M", "$17M", ... (same presets as the draft screen)
const PRICE_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Any Price', value: null },
  ...Array.from({ length: 28 }, (_, i) => {
    const m = 18 - i * 0.5;
    return { label: `$${m}M`, value: Math.round(m * 1_000_000) };
  }),
];

const SORT_OPTIONS = [
  { key: 'price_desc',          label: 'Price: High to Low' },
  { key: 'price_asc',           label: 'Price: Low to High' },
  { key: 'season_points',       label: 'Total Points This Year' },
  { key: 'last_year_points',    label: 'Points Last Year' },
  { key: 'ownership_pct',       label: '% Selected' },
  { key: 'trades_in',           label: 'Trades In' },
  { key: 'trades_out',          label: 'Trades Out' },
  { key: 'rising',              label: 'Highest Rising' },
  { key: 'falling',             label: 'Highest Falling' },
  { key: 'projected_next_week', label: 'Projected Points Next Week' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['key'];

function sortCandidates(list: CatalogPlayer[], key: SortKey): CatalogPlayer[] {
  const sorted = [...list];
  switch (key) {
    case 'price_desc':          return sorted.sort((a, b) => Number(b.current_price) - Number(a.current_price));
    case 'price_asc':           return sorted.sort((a, b) => Number(a.current_price) - Number(b.current_price));
    case 'season_points':       return sorted.sort((a, b) => b.season_points - a.season_points);
    case 'last_year_points':    return sorted.sort((a, b) => b.last_year_points - a.last_year_points);
    case 'ownership_pct':       return sorted.sort((a, b) => b.ownership_pct - a.ownership_pct);
    case 'trades_in':           return sorted.sort((a, b) => b.trades_in - a.trades_in);
    case 'trades_out':          return sorted.sort((a, b) => b.trades_out - a.trades_out);
    case 'rising':              return sorted.sort((a, b) => b.price_pct_change - a.price_pct_change);
    case 'falling':             return sorted.sort((a, b) => a.price_pct_change - b.price_pct_change);
    case 'projected_next_week': return sorted.sort((a, b) => b.projected_next_week - a.projected_next_week);
    default:                    return sorted;
  }
}

const GROUPS: { key: string; label: string; positions: string[] }[] = [
  { key: 'QB',   label: 'Quarterbacks',  positions: ['QB'] },
  { key: 'RB',   label: 'Running Backs', positions: ['RB'] },
  { key: 'FLEX', label: 'Receivers',     positions: ['WR', 'TE'] },
];

// Reads an error message from a failed fetch response without crashing if the
// body isn't valid JSON (e.g. a raw 500 from an unhandled server exception).
async function extractError(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return j?.error ?? `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

function Avatar({ player, size = 38 }: { player: Pick<CatalogPlayer, 'headshot_url' | 'full_name' | 'position'>; size?: number }) {
  return (
    <div className="relative shrink-0">
      {player.headshot_url ? (
        <Image src={player.headshot_url} alt={player.full_name} width={size} height={size} unoptimized
          className="block object-contain" style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-pill bg-emerald-tint text-emerald"
          style={{ width: size, height: size }}
        >{player.full_name[0]}</div>
      )}
    </div>
  );
}

export default function TransferBoard({ players, season, fantasyTeamId, currentWeek, budgetRemaining, matchups }: Props) {
  const router = useRouter();
  const emptySlotCounter = useRef(0);

  const [pending, setPending] = useState<PendingTransfer[]>([]);
  const [searchBySlot, setSearchBySlot] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; msg?: string }[] | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  // Replacement-picker sort/filter — shared across every pending slot's candidate list
  const [sortBy, setSortBy]             = useState<SortKey>('price_desc');
  const [teamFilter, setTeamFilter]     = useState('ALL');
  const [maxPrice, setMaxPrice]         = useState<number | null>(null);
  const [affordableOnly, setAffordableOnly] = useState(false);

  const owned = useMemo(() => players.filter(p => p.is_owned), [players]);
  const teams = useMemo(
    () => Array.from(new Set(players.map(p => p.team_code))).sort(),
    [players]
  );

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
    const available = availableBudgetFor(slot.key);
    const list = players
      .filter(p => !p.is_owned && slot.positions.includes(p.position))
      .filter(p => !alreadyChosenElsewhere.has(p.id))
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q))
      .filter(p => teamFilter === 'ALL' || p.team_code === teamFilter)
      .filter(p => maxPrice == null || Number(p.current_price) <= maxPrice)
      .filter(p => !affordableOnly || Number(p.current_price) <= available);
    return sortCandidates(list, sortBy);
  }, [players, pending, searchBySlot, teamFilter, maxPrice, affordableOnly, sortBy, availableBudgetFor]);

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
        ? `${formatPlayerName(t.outgoing.full_name)} → ${formatPlayerName(t.incoming.full_name)}`
        : t.outgoing
          ? `Sold ${formatPlayerName(t.outgoing.full_name)} — slot left open`
          : `Signed ${formatPlayerName(t.incoming!.full_name)}`;
      try {
        if (t.outgoing) {
          const sellRes = await fetch('/api/market/sell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: t.outgoing.id, week: currentWeek }),
          });
          if (!sellRes.ok) {
            throw new Error(await extractError(sellRes, 'Sell failed'));
          }
        }
        if (t.incoming) {
          const buyRes = await fetch('/api/market/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fantasy_team_id: fantasyTeamId, player_id: t.incoming.id, week: currentWeek }),
          });
          if (!buyRes.ok) {
            const msg = await extractError(buyRes, 'Buy failed');
            throw new Error(t.outgoing ? `sold, but buy failed: ${msg}` : msg);
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
    <div className="grid grid-cols-1 items-start gap-4 lg:[grid-template-columns:minmax(0,1fr)_380px]">

      {/* My Squad */}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="border-b border-line px-5 py-3.5">
          <SectionHeader
            title="My squad"
            sub="Pick players or open slots to build your transfers"
          />
        </div>

        {GROUPS.map(group => {
          const groupPlayers = owned.filter(p => group.positions.includes(p.position));
          const pendingEmptyInGroup = pending.filter(t => !t.outgoing && t.groupLabel === group.label).length;
          const openSlots = Math.max(0, quotaFor(group.key) - groupPlayers.length - pendingEmptyInGroup);
          if (!groupPlayers.length && !openSlots) return null;
          const col = POS_COLORS[group.positions[0]] ?? POS_COLORS.QB;
          return (
            <div key={group.key}>
              <div className="flex items-center gap-2 border-y border-line bg-surface-sunken px-5 py-1.5">
                {/* Position colour is the sanctioned exception — it keys the group. */}
                <div aria-hidden="true" className="h-3 w-[3px] shrink-0 rounded-pill" style={{ background: col.bar }} />
                <span className="text-eyebrow uppercase text-ink-2">{group.label}</span>
                <span className="font-mono tabular-nums text-eyebrow text-ink-3">
                  · {groupPlayers.length}/{quotaFor(group.key)}
                </span>
              </div>
              {groupPlayers.map((p, i) => {
                const isSelected = pending.some(t => t.key === `out-${p.id}`);
                return (
                  <div
                    key={p.id}
                    onClick={() => setProfileId(p.id)}
                    className={[
                      'flex cursor-pointer items-center gap-2.5 px-5 py-2.5',
                      'transition-colors duration-150 ease-out-quart',
                      isSelected
                        ? 'bg-down/5 ring-1 ring-inset ring-down/40'
                        : 'hover:bg-surface-sunken',
                      (i < groupPlayers.length - 1 || openSlots > 0) ? 'border-b border-line' : '',
                    ].join(' ')}
                  >
                    <Avatar player={p} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-body font-medium text-ink">{formatPlayerName(p.full_name)}</span>
                        <PositionChip label={p.position} />
                        <TeamLogo code={p.team_code} size={12} />
                        <span className="shrink-0 text-label text-ink-3">{p.team_code}</span>
                        {isSelected && (
                          <span className="shrink-0 rounded-pill border border-down/30 bg-down/10 px-1.5 py-0.5 text-eyebrow uppercase text-down">
                            Out
                          </span>
                        )}
                      </div>
                      {p.last_week_points != null && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-label text-ink-3">
                          <span>{formatPoints(p.last_week_points)} last wk</span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono tabular-nums text-body text-ink">{formatPrice(p.current_price)}</div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); toggleOutgoing(p); }}
                      type="button"
                      aria-pressed={isSelected}
                      className={[
                        'flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-control border px-2.5 text-label',
                        'transition-colors duration-150 ease-out-quart',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                        isSelected
                          ? 'border-down/40 bg-down/10 text-down'
                          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                      ].join(' ')}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                      </svg>
                      Transfer
                    </button>
                  </div>
                );
              })}
              {Array.from({ length: openSlots }, (_, i) => (
                <div
                  key={`empty-${group.key}-${i}`}
                  onClick={() => addEmptySlot(group)}
                  className={[
                    'flex cursor-pointer items-center gap-2.5 px-5 py-2.5',
                    'transition-colors duration-150 ease-out-quart hover:bg-surface-sunken',
                    i < openSlots - 1 ? 'border-b border-line' : '',
                  ].join(' ')}
                >
                  <div
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-pill border-2 border-dashed opacity-50"
                    style={{ borderColor: col.bar, color: col.bar }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-label text-ink-2">Open slot</div>
                    <div className="text-eyebrow text-ink-3">Sign a {group.label.toLowerCase().replace(/s$/, '')}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Sidebar: results, pending transfers + replacement pickers, cap breakdown */}
      <div className="sticky top-[90px] flex flex-col gap-4">

        {results && (
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-section text-ink">Transfer results</h3>
              <button
                type="button"
                onClick={() => setResults(null)}
                className="rounded-control px-1.5 py-0.5 text-label text-ink-3 transition-colors duration-150 ease-out-quart hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
              >
                Dismiss
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {results.map((r, i) => (
                <div key={i} className={[
                  'flex flex-col gap-0.5 rounded-control border px-2.5 py-2 text-label',
                  r.ok ? 'border-emerald-line bg-emerald-tint text-ink' : 'border-down/30 bg-down/5 text-down',
                ].join(' ')}>
                  <span className="flex items-center gap-1.5">
                    <Icon name={r.ok ? 'check' : 'plus'} size={12} className={r.ok ? 'text-emerald' : 'rotate-45 text-down'} />
                    {r.label}
                  </span>
                  {r.msg && !r.ok && <span className="text-ink-2">{r.msg}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {pending.length === 0 ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              compact
              icon={<Icon name="arrowRight" size={18} />}
              title="Pick a player to trade away, or an open slot to fill."
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-emerald bg-surface">
            <div className="border-b border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionHeader
                  title="Pending transfers"
                  right={
                    <button
                      type="button"
                      onClick={() => setPending([])}
                      disabled={confirming}
                      className={[
                        'h-8 rounded-control border border-line px-2.5 text-label',
                        'transition-colors duration-150 ease-out-quart',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                        confirming
                          ? 'cursor-not-allowed bg-surface-sunken text-ink-3'
                          : 'cursor-pointer bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                      ].join(' ')}
                    >
                      Clear all
                    </button>
                  }
                />
              </div>
              <p className="mt-2 text-label text-ink-3">
                Budget after: <span className="font-mono tabular-nums text-ink">{formatPrice(totalBudgetAfter)}</span>
              </p>
              <button
                type="button"
                onClick={confirmAll}
                disabled={!canConfirm}
                // A disabled control states its condition.
                title={canConfirm ? undefined : confirming ? 'Confirming your transfers' : 'Pick a replacement for each pending transfer first'}
                className={[
                  'mt-3 h-10 w-full rounded-control text-body font-medium',
                  'transition-colors duration-150 ease-out-quart',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                  canConfirm
                    ? 'cursor-pointer bg-emerald-press text-surface hover:bg-emerald-hover active:bg-emerald-press'
                    : 'cursor-not-allowed bg-surface-sunken text-ink-3',
                ].join(' ')}
              >
                {confirming
                  ? 'Confirming'
                  : `Confirm ${actionableCount || ''} transfer${actionableCount === 1 ? '' : 's'}`}
              </button>
            </div>

            <div className="flex flex-col">
              {pending.map((t, idx) => {
                const available = availableBudgetFor(t.key);
                const candidates = candidatesFor(t);
                return (
                  <div key={t.key} className={idx > 0 ? 'border-t border-line' : ''}>

                    {/* Slot summary */}
                    <div className="bg-surface-sunken px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {t.outgoing ? (
                          <>
                            <Avatar player={t.outgoing} size={28} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-label text-ink">{formatPlayerName(t.outgoing.full_name)}</div>
                              <div className="text-eyebrow text-ink-3">
                                Sells for <span className="font-mono tabular-nums">{formatPrice(sellProceeds(Number(t.outgoing.current_price)))}</span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="text-label text-ink-2">Open {t.groupLabel.toLowerCase()} slot</div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeSlot(t.key)}
                          aria-label="Remove this transfer"
                          title="Remove this transfer"
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink-3 transition-colors duration-150 ease-out-quart hover:border-down hover:text-down focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>

                      {t.incoming && (
                        <div className="mt-2 flex items-center gap-2 border-t border-dashed border-line pt-2">
                          <Icon name="check" size={12} className="shrink-0 text-emerald" />
                          <Avatar player={t.incoming} size={28} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-label text-ink">{formatPlayerName(t.incoming.full_name)}</div>
                            <div className="font-mono tabular-nums text-eyebrow text-ink-3">{formatPrice(t.incoming.current_price)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSlotIncoming(t.key, null)}
                            className="h-8 shrink-0 rounded-control border border-line bg-surface px-2.5 text-label text-ink-2 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
                          >
                            Change
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Replacement picker */}
                    {!t.incoming && (
                      <div>
                        <div className="px-4 pt-2">
                          <div className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                            </span>
                            <input
                              value={searchBySlot[t.key] ?? ''}
                              onChange={e => setSearchBySlot(s => ({ ...s, [t.key]: e.target.value }))}
                              placeholder={`Search ${t.positions.join('/')}`}
                              aria-label={`Search ${t.positions.join('/')} players`}
                              className="h-9 w-full rounded-control border border-line bg-surface pl-8 pr-3 text-label text-ink placeholder:text-ink-3 transition-colors duration-150 ease-out-quart hover:border-line-strong focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald"
                            />
                          </div>

                          <div className="mt-2 flex gap-2">
                            <Select
                              ariaLabel="Sort replacements"
                              value={sortBy}
                              onValueChange={v => setSortBy(v as SortKey)}
                              options={SORT_OPTIONS.map(o => ({ value: o.key, label: o.label }))}
                              className="min-w-0 flex-1"
                            />
                            <Select
                              ariaLabel="Filter by team"
                              value={teamFilter}
                              onValueChange={setTeamFilter}
                              options={[{ value: 'ALL', label: 'All teams' }, ...teams.map(tc => ({ value: tc, label: tc }))]}
                              className="w-24 shrink-0"
                            />
                          </div>

                          <Select
                            ariaLabel="Maximum price"
                            value={maxPrice == null ? 'any' : String(maxPrice)}
                            onValueChange={v => setMaxPrice(v === 'any' ? null : Number(v))}
                            options={PRICE_PRESETS.map(preset => ({
                              value: preset.value == null ? 'any' : String(preset.value),
                              label: preset.value == null ? 'Any price' : preset.label,
                            }))}
                            className="mt-2 w-full"
                          />

                          <div className="mt-2.5">
                            <Checkbox
                              checked={affordableOnly}
                              onCheckedChange={setAffordableOnly}
                              label="Only show players I can afford"
                            />
                          </div>
                        </div>

                        <div className="mt-2 max-h-72 overflow-y-auto">
                          {candidates.length === 0 && (
                            <EmptyState compact title="No players match these filters." />
                          )}
                          {candidates.map(p => {
                            const canAfford = Number(p.current_price) <= available;
                            return (
                              <div key={p.id} className="flex items-center gap-2 border-t border-line px-4 py-2">
                                <div
                                  onClick={() => setProfileId(p.id)}
                                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                                >
                                  <Avatar player={p} size={26} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate text-label text-ink">{formatPlayerName(p.full_name)}</span>
                                      <PositionChip label={p.position} />
                                      <TeamLogo code={p.team_code} size={11} />
                                      <span className="text-eyebrow text-ink-3">{p.team_code}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className={[
                                    'mb-1 font-mono tabular-nums text-label',
                                    canAfford ? 'text-ink' : 'text-ink-3',
                                  ].join(' ')}>
                                    {formatPrice(p.current_price)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setSlotIncoming(t.key, p)}
                                    disabled={!canAfford}
                                    title={canAfford ? undefined : `${formatPrice(Number(p.current_price) - available)} over your remaining budget`}
                                    className={[
                                      'h-7 rounded-control px-2.5 text-label',
                                      'transition-colors duration-150 ease-out-quart',
                                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
                                      canAfford
                                        ? 'cursor-pointer bg-emerald-press text-surface hover:bg-emerald-hover'
                                        : 'cursor-not-allowed bg-surface-sunken text-ink-3',
                                    ].join(' ')}
                                  >
                                    {canAfford ? 'Select' : 'Too pricey'}
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

      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
