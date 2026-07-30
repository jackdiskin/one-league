'use client';

// Virtualized player list. Replaces 20-at-a-time pagination — the full
// catalogue is already client-side, so only the visible window is rendered.
//
// Windowing is hand-rolled rather than pulled from a library because the
// redesign is limited to one new dependency, which went to Radix Select.

import { useCallback, useEffect, useRef, useState } from 'react';
import PlayerRow, { ROW_HEIGHT } from './PlayerRow';
import type { DraftPlayer } from './types';

const OVERSCAN = 8;

export default function PlayerList({
  players,
  isAdded,
  canAdd,
  blockedReason,
  onOpenProfile,
  onToggle,
}: {
  players: DraftPlayer[];
  isAdded: (p: DraftPlayer) => boolean;
  canAdd: (p: DraftPlayer) => boolean;
  blockedReason: (p: DraftPlayer) => string | null;
  onOpenProfile: (id: number) => void;
  onToggle: (p: DraftPlayer) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Track viewport height so the window size adapts to the panel.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setViewportH(entry.contentRect.height));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Any change to the result set invalidates the cursor. Adjusted during
  // render rather than in an effect, so it never renders a stale highlight.
  const [prevPlayers, setPrevPlayers] = useState(players);
  if (players !== prevPlayers) {
    setPrevPlayers(players);
    setActiveIndex(-1);
  }

  const scrollRowIntoView = useCallback((index: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (players.length === 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => {
        const next = e.key === 'ArrowDown'
          ? Math.min(players.length - 1, prev + 1)
          : Math.max(0, prev <= 0 ? 0 : prev - 1);
        scrollRowIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const p = players[activeIndex];
      if (p && (isAdded(p) || canAdd(p))) onToggle(p);
    }
  }, [players, activeIndex, isAdded, canAdd, onToggle, scrollRowIntoView]);

  const total = players.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end   = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN);
  const visible = players.slice(start, end);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky column headers */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface-sunken px-4 py-2">
        <span className="flex-1 text-eyebrow uppercase text-ink-3">Player</span>
        <span className="text-eyebrow uppercase text-ink-3">Price</span>
        <span className="w-8 shrink-0" aria-hidden="true" />
      </div>

      <div
        ref={viewportRef}
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="listbox"
        aria-label="Available players"
        className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald"
      >
        {total === 0 ? (
          <p className="px-4 py-8 text-center text-body text-ink-3">
            No players match these filters.
          </p>
        ) : (
          <div style={{ height: total * ROW_HEIGHT, position: 'relative' }}>
            <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
              {visible.map((player, i) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  isAdded={isAdded(player)}
                  addable={!isAdded(player) && canAdd(player)}
                  blockedReason={blockedReason(player)}
                  isActive={start + i === activeIndex}
                  onOpenProfile={() => onOpenProfile(player.id)}
                  onToggle={() => onToggle(player)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
