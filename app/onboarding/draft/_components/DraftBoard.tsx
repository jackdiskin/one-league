'use client';

import { useState, useMemo } from 'react';
import { formatPrice } from '@/lib/format';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import type { Matchup } from '@/lib/schedule';

import { CAP, QUOTA, TOTAL_SLOTS, STARTERS, posGroup, type DraftPlayer } from './types';
import { sortPlayers, type SortKey } from './sorting';
import CapHeader from './CapHeader';
import { FORMATION_SLOTS } from '@/components/field/fieldGeometry';
import DraftField from './DraftField';
import FilterBar from './FilterBar';
import PlayerList from './PlayerList';
import WelcomeModal from './WelcomeModal';
import LeagueModal from './LeagueModal';

export type { DraftPlayer } from './types';

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DraftBoard({
  players,
  userName,
  season,
  matchups,
}: {
  players: DraftPlayer[];
  userName: string;
  season: number;
  matchups: Record<string, Matchup>;
}) {
  const [selected, setSelected]     = useState<DraftPlayer[]>([]);
  const [slotAssignment, setSlotAssignment] = useState<Record<string, number>>({}); // slotId -> playerId
  const [pos, setPos]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [profileId, setProfileId]   = useState<number | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [sortBy, setSortBy]         = useState<SortKey>('price_desc');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [maxPrice, setMaxPrice]     = useState<number | null>(null);
  const [affordableOnly, setAffordableOnly] = useState(false);

  const teams = useMemo(
    () => Array.from(new Set(players.map(p => p.team_code))).sort(),
    [players]
  );

  // ── Derived quota counts ──────────────────────────────────────────────────
  const qbCount   = selected.filter(p => p.position === 'QB').length;
  const rbCount   = selected.filter(p => p.position === 'RB').length;
  const flexCount = selected.filter(p => p.position === 'WR' || p.position === 'TE').length;
  const totalCost = selected.reduce((s, p) => s + Number(p.current_price), 0);
  const capLeft   = CAP - totalCost;
  const isComplete = qbCount === QUOTA.QB && rbCount === QUOTA.RB && flexCount === QUOTA.FLEX;

  // What's stopping the squad being finalised — the most actionable single
  // thing, so the disabled CTA explains itself instead of just sitting dead.
  const blockingLabel: string | null = (() => {
    if (capLeft < 0) return `${formatPrice(-capLeft)} over the cap`;
    const short: string[] = [];
    if (qbCount   < QUOTA.QB)   short.push(`${QUOTA.QB - qbCount} more QB`);
    if (rbCount   < QUOTA.RB)   short.push(`${QUOTA.RB - rbCount} more RB`);
    if (flexCount < QUOTA.FLEX) short.push(`${QUOTA.FLEX - flexCount} more WR/TE`);
    if (short.length === 0) return null;
    return `Still need ${short.join(', ')}`;
  })();

  function canAdd(player: DraftPlayer): boolean {
    if (selected.find(p => p.id === player.id)) return false;
    const pg = posGroup(player.position);
    if (pg === 'QB'   && qbCount   >= QUOTA.QB)   return false;
    if (pg === 'RB'   && rbCount   >= QUOTA.RB)   return false;
    if (pg === 'FLEX' && flexCount >= QUOTA.FLEX)  return false;
    if (totalCost + Number(player.current_price) > CAP) return false;
    return true;
  }

  // Why a player can't be added, phrased for the manager rather than the
  // system. Mirrors canAdd's checks in the same order.
  function blockedReason(player: DraftPlayer): string | null {
    if (selected.find(p => p.id === player.id)) return null;
    const pg = posGroup(player.position);
    if (pg === 'QB'   && qbCount   >= QUOTA.QB)   return `All ${QUOTA.QB} QB spots are filled`;
    if (pg === 'RB'   && rbCount   >= QUOTA.RB)   return `All ${QUOTA.RB} RB spots are filled`;
    if (pg === 'FLEX' && flexCount >= QUOTA.FLEX) return `All ${QUOTA.FLEX} WR/TE spots are filled`;
    if (totalCost + Number(player.current_price) > CAP) {
      return `${formatPrice(Number(player.current_price) - capLeft)} over your remaining cap`;
    }
    return null;
  }

  function addPlayer(player: DraftPlayer) {
    if (!canAdd(player)) return;
    const pg = posGroup(player.position);
    const emptySlot = FORMATION_SLOTS.find(slot => slot.posGroup === pg && !(slot.id in slotAssignment));
    setSelected(prev => [...prev, player]);
    if (emptySlot) {
      setSlotAssignment(prev => ({ ...prev, [emptySlot.id]: player.id }));
    }
  }

  function removePlayer(playerId: number) {
    setSelected(prev => prev.filter(p => p.id !== playerId));
    setSlotAssignment(prev => {
      const next = { ...prev };
      for (const slotId of Object.keys(next)) {
        if (next[slotId] === playerId) delete next[slotId];
      }
      return next;
    });
  }

  // ── Assign players to formation slots ─────────────────────────────────────
  // Slot assignment is stable per-player (set once on add, cleared once on
  // remove) rather than re-derived from array order — otherwise removing one
  // player would "slide" every later same-position player into a lower slot.
  const filledSlots = useMemo(() => {
    const map: Record<string, DraftPlayer> = {};
    for (const [slotId, playerId] of Object.entries(slotAssignment)) {
      const player = selected.find(p => p.id === playerId);
      if (player) map[slotId] = player;
    }
    return map;
  }, [selected, slotAssignment]);

  // ── Filtered & sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = players
      .filter(p => {
        if (pos === 'ALL') return true;
        if (pos === 'FLEX') return p.position === 'WR' || p.position === 'TE';
        return p.position === pos;
      })
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q))
      .filter(p => teamFilter === 'ALL' || p.team_code === teamFilter)
      .filter(p => maxPrice == null || Number(p.current_price) <= maxPrice)
      .filter(p => !affordableOnly || Number(p.current_price) <= capLeft);
    return sortPlayers(list, sortBy);
  }, [players, pos, search, teamFilter, maxPrice, affordableOnly, sortBy, capLeft]);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* ── LEFT PANEL ────────────────────────────────────────────────────────── */}
      <aside className="flex w-80 min-w-72 shrink-0 flex-col overflow-hidden border-r border-line bg-surface">
        <div className="shrink-0 px-4 pb-3 pt-4">
          <p className="text-eyebrow uppercase text-emerald">Draft {season}</p>
          <h1 className="mt-1 text-section text-ink">Pick your squad</h1>
        </div>

        <FilterBar
          search={search} setSearch={setSearch}
          pos={pos} setPos={setPos}
          sortBy={sortBy} setSortBy={setSortBy}
          teamFilter={teamFilter} setTeamFilter={setTeamFilter}
          maxPrice={maxPrice} setMaxPrice={setMaxPrice}
          affordableOnly={affordableOnly} setAffordableOnly={setAffordableOnly}
          teams={teams}
          resultCount={filtered.length}
        />

        <PlayerList
          players={filtered}
          isAdded={p => !!selected.find(s => s.id === p.id)}
          canAdd={canAdd}
          blockedReason={blockedReason}
          onOpenProfile={setProfileId}
          onToggle={p => {
            if (selected.find(s => s.id === p.id)) removePlayer(p.id);
            else addPlayer(p);
          }}
        />
      </aside>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CapHeader
          capLeft={capLeft}
          cap={CAP}
          qb={qbCount} rb={rbCount} flex={flexCount} quota={QUOTA}
          selectedCount={selected.length}
          totalSlots={TOTAL_SLOTS}
          starterCount={STARTERS}
          isComplete={isComplete}
          blockingLabel={blockingLabel}
          onFinalize={() => setShowModal(true)}
        />

        {/* Field — a single SVG trapezoid in a contained panel. See
            fieldGeometry for the perspective math. */}
        <div className="flex-1 overflow-auto bg-surface p-6">
          <DraftField
            filledSlots={filledSlots}
            activeGroup={pos === 'WR' || pos === 'TE' ? 'FLEX' : pos}
            onSlotClick={setPos}
            onRemove={removePlayer}
            isEmpty={selected.length === 0}
          />
        </div>
      </div>

      {/* ── LEAGUE MODAL ──────────────────────────────────────────────────────── */}
      {showModal && (
        <LeagueModal
          teamName={`${userName.split(' ')[0]}'s Squad`}
          playerIds={selected.map(p => p.id)}
          season={season}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── WELCOME MODAL ─────────────────────────────────────────────────────── */}
      {showWelcome && (
        <WelcomeModal
          userName={userName}
          onClose={() => setShowWelcome(false)}
        />
      )}

      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
