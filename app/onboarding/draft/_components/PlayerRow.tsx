'use client';

// One row of the draft player list.
//
// Identity, alignment and states come from the shared RosterRow; this file
// supplies only what's specific to drafting — the price and the add/remove
// control with its blocked reason.

import { formatPrice } from '@/lib/format';
import RosterRow from '@/components/ui/RosterRow';
import type { DraftPlayer } from './types';

export const ROW_HEIGHT = 56;

export default function PlayerRow({
  player,
  isAdded,
  addable,
  blockedReason,
  isActive,
  onOpenProfile,
  onToggle,
}: {
  player: DraftPlayer;
  isAdded: boolean;
  addable: boolean;
  /** Why this player can't be added; null when they can. */
  blockedReason: string | null;
  /** Keyboard cursor is on this row. */
  isActive: boolean;
  onOpenProfile: () => void;
  onToggle: () => void;
}) {
  const disabled = !isAdded && !addable;

  return (
    <RosterRow
      player={player}
      onClick={onOpenProfile}
      disabledReason={disabled ? blockedReason : null}
      state={{ selected: isAdded, active: isActive, dimmed: disabled }}
      trailing={
        <span className="font-mono tabular-nums text-body font-medium text-ink">
          {formatPrice(Number(player.current_price))}
        </span>
      }
      action={
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onToggle(); }}
          disabled={disabled}
          title={isAdded ? `Remove ${player.full_name}` : blockedReason ?? `Add ${player.full_name}`}
          aria-label={isAdded ? `Remove ${player.full_name}` : `Add ${player.full_name}`}
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-control border',
            'transition-colors duration-150 ease-out-quart',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
            isAdded
              ? 'border-line bg-surface text-down hover:border-down hover:bg-surface-sunken'
              : addable
                ? 'border-emerald-line bg-emerald-tint text-emerald hover:border-emerald hover:bg-emerald hover:text-surface active:bg-emerald-press'
                : 'cursor-not-allowed border-line bg-surface-sunken text-ink-3',
          ].join(' ')}
        >
          {isAdded ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
      }
    />
  );
}
