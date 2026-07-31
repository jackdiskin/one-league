'use client';

// The live lineup field — Dashboard and My Team both render this.
//
// Replaces the old LiveTeamField, carrying every behaviour it had: live
// WebSocket scoring, the live stat modal, click-to-swap lineup changes against
// /api/roster/swap, the bench strip, and the player profile modal. What changed
// is the surface underneath (shared SVG field) and the styling (tokens).
//
// Swap model, matching the draft page's selection-spans-components pattern:
//   click a player      → selected, legal destinations lift, everything else dims
//   click a legal slot  → the two swap
//   click it again /Esc → cancel

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveStats, type LivePlayerStats } from '@/hooks/useLiveStats';
import { formatPoints, formatPlayerName } from '@/lib/format';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import FieldPanel from './FieldPanel';
import LiveStatsModal from './LiveStatsModal';
import { LineupSlotCard, LineupEmptySlot } from './LineupSlotCard';
import { isEligibleSwap, swapBlockedReason, slotBadgeLabel } from './slots';
import type { FieldPlayer, PlacedSlot } from './types';

export default function LineupField({
  formation,
  bench = [],
  teamId,
  season,
  interactive = false,
  hidePrices = false,
}: {
  formation: PlacedSlot[];
  bench?: FieldPlayer[];
  teamId?: number;
  season?: number;
  interactive?: boolean;
  hidePrices?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const starters = useMemo(
    () => formation.flatMap(s => (s.player ? [s.player] : [])),
    [formation],
  );
  const allPlayers = useMemo(() => [...starters, ...bench], [starters, bench]);

  const playerIds = useMemo(
    () => allPlayers.flatMap(p => (p.external_player_id ? [p.external_player_id] : [])),
    [allPlayers],
  );
  const liveStats = useLiveStats(playerIds);

  const [selected, setSelected] = useState<FieldPlayer | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());
  const [statsFor, setStatsFor] = useState<{ player: FieldPlayer; stats: LivePlayerStats } | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  // Escape cancels a pending selection.
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const executeSwap = useCallback(async (a: FieldPlayer, b: FieldPlayer) => {
    if (!teamId) return;
    setSwapping(new Set([a.id, b.id]));
    setSelected(null);
    try {
      const res = await fetch('/api/roster/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: teamId, player_a_id: a.id, player_b_id: b.id }),
      });
      if (!res.ok) throw new Error('Swap failed');
      startTransition(() => router.refresh());
    } catch {
      startTransition(() => router.refresh());
    } finally {
      setSwapping(new Set());
    }
  }, [teamId, router, startTransition]);

  const livePointsFor = useCallback((p: FieldPlayer): number | null => {
    const s = p.external_player_id ? liveStats.get(p.external_player_id) : undefined;
    return s ? s.totals.fantasyPointsTotal : null;
  }, [liveStats]);

  const handlePlayerClick = useCallback((p: FieldPlayer) => {
    if (swapping.size > 0) return;

    // Not in swap mode: a click surfaces live stats, or the profile.
    if (!interactive) {
      const s = p.external_player_id ? liveStats.get(p.external_player_id) : undefined;
      if (s) setStatsFor({ player: p, stats: s });
      else setProfileId(p.id);
      return;
    }

    if (!selected) { setSelected(p); return; }
    if (selected.id === p.id) { setSelected(null); return; }
    if (isEligibleSwap(selected, p)) { executeSwap(selected, p); return; }
    // Illegal target — move the selection there instead of dead-ending.
    setSelected(p);
  }, [interactive, selected, swapping, liveStats, executeSwap]);

  const slots = formation.map((s, i) => ({ key: s.slot || `slot-${i}`, nx: s.nx, u: s.u }));

  function renderPlayer(p: FieldPlayer, label: string) {
    const isSelected = selected?.id === p.id;
    const eligible = !!selected && !isSelected && isEligibleSwap(selected, p);
    const dimmed = !!selected && !isSelected && !eligible;
    return (
      <LineupSlotCard
        player={p}
        label={label}
        livePoints={livePointsFor(p)}
        hidePrices={hidePrices}
        interactive={interactive}
        selected={isSelected}
        eligible={eligible}
        dimmed={dimmed}
        swapping={swapping.has(p.id)}
        blockedReason={selected && !isSelected && !eligible ? swapBlockedReason(selected, p) : null}
        onClick={() => handlePlayerClick(p)}
      />
    );
  }

  return (
    <>
      <FieldPanel
        slots={slots}
        renderSlot={({ key }) => {
          const s = formation.find((f, i) => (f.slot || `slot-${i}`) === key);
          if (!s) return null;
          return s.player
            ? renderPlayer(s.player, s.label)
            : <LineupEmptySlot label={s.label} />;
        }}
        footer={
          interactive && selected ? (
            <p className="rounded-pill bg-turf-deep/80 px-4 py-2 text-label text-turf-chalk">
              Pick a highlighted player to swap, or press Escape to cancel.
            </p>
          ) : undefined
        }
      >
        {bench.length > 0 && (
          <div className="border-t border-turf-chalk/15 px-4 py-4">
            <p className="mb-3 text-eyebrow uppercase text-turf-chalk/60">Bench</p>
            <div className="flex flex-wrap gap-3">
              {bench.map(p => {
                const isSelected = selected?.id === p.id;
                const eligible = !!selected && !isSelected && isEligibleSwap(selected, p);
                const dimmed = !!selected && !isSelected && !eligible;
                const live = livePointsFor(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePlayerClick(p)}
                    disabled={swapping.has(p.id)}
                    aria-pressed={isSelected}
                    title={
                      selected && !isSelected && !eligible
                        ? swapBlockedReason(selected, p) ?? p.full_name
                        : p.full_name
                    }
                    className={[
                      'flex items-center gap-2 rounded-control border bg-surface px-2.5 py-2',
                      'transition duration-150 ease-out-quart',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald',
                      'focus-visible:ring-offset-2 focus-visible:ring-offset-turf',
                      isSelected ? 'border-emerald ring-2 ring-emerald' : eligible ? 'border-emerald border-dashed -translate-y-0.5' : 'border-line',
                      swapping.has(p.id) ? 'opacity-50' : dimmed ? 'opacity-55' : 'opacity-100',
                      'hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0',
                    ].join(' ')}
                  >
                    {p.headshot_url ? (
                      <Image
                        src={p.headshot_url} alt="" width={32} height={32} unoptimized
                        className="h-8 w-8 shrink-0 object-contain"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-emerald-tint text-eyebrow text-emerald">
                        {p.full_name.charAt(0)}
                      </span>
                    )}
                    <span className="flex flex-col items-start">
                      <span className="text-label text-ink">{formatPlayerName(p.full_name)}</span>
                      <span className="text-eyebrow text-ink-3">
                        {slotBadgeLabel(p.roster_slot, p.position)} · {p.team_code}
                      </span>
                    </span>
                    {live !== null && (
                      <span className="ml-1 font-mono tabular-nums text-label text-emerald">
                        {formatPoints(live)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </FieldPanel>

      {statsFor && (
        <LiveStatsModal
          player={statsFor.player}
          stats={statsFor.stats}
          onClose={() => setStatsFor(null)}
        />
      )}

      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </>
  );
}
