'use client';

// A starter's card on the lineup field.
//
// Same box as the draft slot card, different content and states. Beyond the
// four required states it carries the swap model: `selected` (this player is
// picked up), `eligible` (a legal destination for the picked-up player), and
// `dimmed` (everything else while a selection is active).

import Image from 'next/image';
import { formatPoints, formatPrice, formatPlayerName } from '@/lib/format';
import { FIELD_CARD, FIELD_FOCUS } from './cardStyles';
import type { FieldPlayer } from './types';

export function LineupSlotCard({
  player,
  label,
  livePoints,
  hidePrices = false,
  interactive = false,
  selected = false,
  eligible = false,
  dimmed = false,
  swapping = false,
  blockedReason,
  onClick,
}: {
  player: FieldPlayer;
  label: string;
  livePoints: number | null;
  hidePrices?: boolean;
  interactive?: boolean;
  selected?: boolean;
  eligible?: boolean;
  dimmed?: boolean;
  swapping?: boolean;
  /** Why this card can't be swapped with the current selection. */
  blockedReason?: string | null;
  onClick?: () => void;
}) {
  const isLive = livePoints !== null;
  const clickable = (interactive || isLive) && !swapping;
  const hasProj = player.projected_points != null;

  const border = selected
    ? 'border-emerald ring-2 ring-emerald'
    : eligible
      ? 'border-emerald border-dashed'
      : isLive
        ? 'border-emerald-line'
        : 'border-line';

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-pressed={selected}
      title={blockedReason ?? (interactive ? `Swap ${player.full_name}` : player.full_name)}
      className={[
        FIELD_CARD, FIELD_FOCUS,
        'relative gap-1 overflow-hidden border bg-surface shadow-md',
        'transition duration-150 ease-out-quart',
        border,
        swapping ? 'opacity-50' : dimmed ? 'opacity-55' : 'opacity-100',
        clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg' : 'cursor-default',
        eligible ? '-translate-y-0.5 shadow-lg' : '',
        'active:translate-y-0',
      ].join(' ')}
    >
      {isLive && (
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded-pill bg-emerald-tint px-1.5 py-0.5">
          <span className="motion-safe:animate-live-dot h-1 w-1 rounded-pill bg-emerald" aria-hidden="true" />
          <span className="text-eyebrow uppercase text-emerald">Live</span>
        </span>
      )}

      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt="" width={56} height={56} unoptimized
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

      <span className="flex items-center gap-1 text-eyebrow text-ink-3">
        <span>{label}</span>
        <span aria-hidden="true">·</span>
        <span>{player.team_code}</span>
      </span>

      {isLive ? (
        <span className="font-mono tabular-nums text-label text-emerald">
          {formatPoints(livePoints)}
        </span>
      ) : hasProj ? (
        <span className="font-mono tabular-nums text-label text-ink-2">
          {formatPoints(player.projected_points as number)}
          <span className="ml-1 text-eyebrow text-ink-3">proj</span>
        </span>
      ) : !hidePrices ? (
        <span className="font-mono tabular-nums text-label text-ink-2">
          {formatPrice(Number(player.current_price))}
        </span>
      ) : null}
    </button>
  );
}

export function LineupEmptySlot({ label }: { label: string }) {
  return (
    <div
      className={[
        FIELD_CARD,
        'gap-2 border border-dashed border-line-strong bg-surface/90',
      ].join(' ')}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-surface-sunken text-ink-3" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
        </svg>
      </span>
      <span className="text-label text-ink-2">{label}</span>
    </div>
  );
}
