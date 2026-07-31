'use client';

// One player row. Used by the draft list, the roster table, the transfers
// squad list and the market movers.
//
// Composition, not a `variant` enum. The four surfaces differ in what they let
// you *do* — add/remove, swap, select for transfer, nothing — so the row owns
// identity, alignment and the interaction states, and each page supplies its
// own trailing value and control. A variant flag would force this component to
// know every page's semantics and grow a branch per page.
//
// What it guarantees: identical identity rendering, aligned columns, and the
// four required states everywhere it's used.

import type { ReactNode } from 'react';
import * as Avatar from '@radix-ui/react-avatar';
import { formatPlayerName } from '@/lib/format';
import { teamColor } from '@/components/teamColors';
import PositionChip from './PositionChip';

export interface RosterRowPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
}

export interface RosterRowState {
  /** Picked up — this row drives a pending action. */
  selected?: boolean;
  /** A legal target for the current selection. */
  eligible?: boolean;
  /** Outside the current selection's legal set. */
  dimmed?: boolean;
  /** Scoring right now. */
  live?: boolean;
  /** A mutation is in flight for this player. */
  busy?: boolean;
  /** Keyboard cursor is on this row. */
  active?: boolean;
}

export default function RosterRow({
  player,
  badge,
  secondary,
  trailing,
  action,
  state = {},
  disabledReason,
  onClick,
}: {
  player: RosterRowPlayer;
  /** Slot label (`FLEX`, `WR/TE`); falls back to the raw position. */
  badge?: string;
  /** Optional second line under the name — matchup, price, meta. */
  secondary?: ReactNode;
  /** Right-aligned value block. */
  trailing?: ReactNode;
  /** Trailing control (add, remove, move). */
  action?: ReactNode;
  state?: RosterRowState;
  /** Why this row can't be actioned. Surfaces on hover. */
  disabledReason?: string | null;
  onClick?: () => void;
}) {
  const { selected, eligible, dimmed, live, busy, active } = state;
  const initials = player.full_name.split(' ').map(p => p[0]).slice(0, 2).join('');
  const interactive = !!onClick && !busy;

  return (
    <div
      onClick={interactive ? onClick : undefined}
      title={disabledReason ?? undefined}
      className={[
        'flex h-14 items-center gap-3 border-b border-line px-4',
        'transition-colors duration-150 ease-out-quart',
        interactive ? 'cursor-pointer' : 'cursor-default',
        selected
          ? 'bg-emerald-tint ring-2 ring-inset ring-emerald'
          : eligible
            ? 'bg-emerald-tint/50 ring-1 ring-inset ring-emerald-line'
            : live
              ? 'bg-emerald-tint/40'
              : interactive ? 'hover:bg-surface-sunken' : '',
        active ? 'bg-surface-sunken ring-2 ring-inset ring-emerald' : '',
        busy ? 'opacity-50' : dimmed ? 'opacity-55' : '',
      ].join(' ')}
    >
      <Avatar.Root className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-pill bg-surface-sunken">
        <Avatar.Image
          src={player.headshot_url ?? undefined}
          alt=""
          className="h-full w-full object-cover"
        />
        <Avatar.Fallback
          delayMs={0}
          className="flex h-full w-full items-center justify-center bg-emerald-tint text-eyebrow text-emerald"
        >
          {initials}
        </Avatar.Fallback>
      </Avatar.Root>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-body font-medium text-ink">
            {formatPlayerName(player.full_name)}
          </p>
          {live && (
            <span className="motion-safe:animate-live-dot h-1.5 w-1.5 shrink-0 rounded-pill bg-emerald" aria-hidden="true" />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-label text-ink-3">
          <PositionChip label={badge ?? player.position} />
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-pill"
            style={{ backgroundColor: teamColor(player.team_code) }}
          />
          <span>{player.team_code}</span>
          {secondary && <>{secondary}</>}
        </div>
      </div>

      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
