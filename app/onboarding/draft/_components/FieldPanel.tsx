'use client';

// The field panel: turf SVG with the formation slots laid over it.
//
// Slots are HTML rather than SVG so they can carry real hover/focus states and
// image content. Their placement is computed from the same perspective
// functions the turf uses, so they stay locked to the field.

import FieldSurface from './FieldSurface';
import { FilledSlot, EmptySlot } from './SlotCards';
import { FORMATION_SLOTS, slotPlacement } from './fieldGeometry';
import type { DraftPlayer } from './types';

export default function FieldPanel({
  filledSlots,
  activeGroup,
  onSlotClick,
  onRemove,
  isEmpty,
}: {
  filledSlots: Record<string, DraftPlayer>;
  activeGroup: string;
  onSlotClick: (posGroup: string) => void;
  onRemove: (playerId: number) => void;
  isEmpty: boolean;
}) {
  // A slot is "active" when its own position group drives the list filter.
  // When any group is active, every slot outside it dims.
  const filterOn = activeGroup !== 'ALL';

  return (
    <div className="relative overflow-hidden rounded-card bg-turf shadow-sm">
      <FieldSurface />

      <div className="absolute inset-0">
        {FORMATION_SLOTS.map(slot => {
          const player = filledSlots[slot.id];
          const { leftPct, topPct, scale } = slotPlacement(slot.nx, slot.u);
          const isActive = filterOn && activeGroup === slot.posGroup;
          const isDimmed = filterOn && !isActive;

          return (
            <div
              key={slot.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              <div style={{ transform: `scale(${scale})` }}>
                {player ? (
                  <FilledSlot
                    player={player}
                    onRemove={() => onRemove(player.id)}
                    dimmed={isDimmed}
                  />
                ) : (
                  <EmptySlot
                    label={slot.label}
                    onClick={() => onSlotClick(slot.posGroup)}
                    active={isActive}
                    dimmed={isDimmed}
                  />
                )}
              </div>
            </div>
          );
        })}

        {isEmpty && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
            <p className="rounded-pill bg-turf-deep/80 px-4 py-2 text-label text-turf-chalk">
              Pick your first player to start building.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
