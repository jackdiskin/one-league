'use client';

// One row of the player list. Price is the most important number here, so it
// outranks the chips; the name outranks everything else.

import * as Avatar from '@radix-ui/react-avatar';
import { formatPrice, formatPlayerName } from '@/lib/format';
import { teamColor } from './teamColors';
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
  const initials = player.full_name.split(' ').map(p => p[0]).slice(0, 2).join('');

  return (
    <div
      onClick={onOpenProfile}
      className={[
        'flex h-14 cursor-pointer items-center gap-3 border-b border-line px-4',
        'transition-colors duration-150 ease-out-quart',
        isAdded ? 'bg-emerald-tint' : 'hover:bg-surface-sunken',
        isActive ? 'bg-surface-sunken ring-2 ring-inset ring-emerald' : '',
        disabled ? 'opacity-55' : '',
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
        <p className="truncate text-body font-medium text-ink">
          {formatPlayerName(player.full_name)}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-label text-ink-3">
          <span>{player.position}</span>
          <span aria-hidden="true">·</span>
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-pill"
            style={{ backgroundColor: teamColor(player.team_code) }}
          />
          <span>{player.team_code}</span>
        </p>
      </div>

      <span className="shrink-0 font-mono tabular-nums text-body font-medium text-ink">
        {formatPrice(Number(player.current_price))}
      </span>

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
    </div>
  );
}
