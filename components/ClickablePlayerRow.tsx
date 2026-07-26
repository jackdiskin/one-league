'use client';

import { useState, type ReactNode, type HTMLAttributes } from 'react';
import PlayerProfileModal from './PlayerProfileModal';

interface Props extends HTMLAttributes<HTMLDivElement> {
  playerId: number;
  season?: number;
  children: ReactNode;
}

// Wraps read-only player row content (Market, League activity, Dashboard
// movers, etc.) so clicking it opens the profile popup instead of navigating
// away — usable as a child of a server component since this is the only
// client boundary needed.
export default function ClickablePlayerRow({ playerId, season, style, onClick, ...rest }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        {...rest}
        onClick={e => { setOpen(true); onClick?.(e); }}
        style={{ cursor: 'pointer', ...style }}
      />
      {open && (
        <PlayerProfileModal playerId={playerId} season={season} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
