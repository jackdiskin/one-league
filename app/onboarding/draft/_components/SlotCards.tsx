'use client';

// Formation slot cards. Light cards on dark turf — the chrome emerald and the
// turf green never touch.
//
// Both variants carry rest, hover, focus-visible and active states. Empty
// slots additionally carry a filter-active state: when this slot's position
// filter is applied to the list, it takes an emerald ring and every other
// slot dims.

import Image from 'next/image';
import { formatPrice, formatPlayerName } from '@/lib/format';
import { FIELD_CARD as CARD, FIELD_FOCUS as FOCUS } from '@/components/field/cardStyles';
import type { DraftPlayer } from './types';

export function EmptySlot({
  label,
  onClick,
  active = false,
  dimmed = false,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Show available ${label} players`}
      className={[
        CARD, FOCUS,
        'group gap-2 cursor-pointer border border-dashed bg-surface/90',
        'transition duration-150 ease-out-quart',
        dimmed ? 'opacity-55' : 'opacity-100',
        active
          ? 'border-emerald ring-2 ring-emerald shadow-lg'
          : 'border-line-strong hover:-translate-y-0.5 hover:border-ink-3 hover:shadow-lg',
        'active:translate-y-0 active:shadow-md',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'flex h-7 w-7 items-center justify-center rounded-pill transition-colors duration-150',
          active
            ? 'bg-emerald text-surface'
            : 'bg-surface-sunken text-ink-3 group-hover:bg-emerald-tint group-hover:text-emerald',
        ].join(' ')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>
      <span className="text-label text-ink-2">{label}</span>
    </button>
  );
}

export function FilledSlot({
  player,
  onRemove,
  dimmed = false,
}: {
  player: DraftPlayer;
  onRemove: () => void;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title={`Remove ${player.full_name}`}
      className={[
        CARD, FOCUS,
        'group relative gap-1 cursor-pointer overflow-hidden',
        'border border-line bg-surface shadow-md',
        'motion-safe:animate-slot-in transition duration-150 ease-out-quart',
        dimmed ? 'opacity-55' : 'opacity-100',
        'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg',
        'active:translate-y-0',
      ].join(' ')}
    >
      {/* Remove affordance, revealed on hover or keyboard focus */}
      <span
        aria-hidden="true"
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-down text-surface opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>

      {player.headshot_url ? (
        <Image
          src={player.headshot_url}
          alt=""
          width={56}
          height={56}
          unoptimized
          className="h-14 w-14 object-contain"
        />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-pill bg-emerald-tint text-section text-emerald">
          {player.full_name.charAt(0)}
        </span>
      )}

      <span className="max-w-full truncate px-1 text-label text-ink">
        {formatPlayerName(player.full_name)}
      </span>
      <span className="text-eyebrow text-ink-3">{player.team_code}</span>
      <span className="font-mono tabular-nums text-label text-ink-2">
        {formatPrice(Number(player.current_price))}
      </span>
    </button>
  );
}
