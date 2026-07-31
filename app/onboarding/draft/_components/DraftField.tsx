'use client';

// Draft-side field: the shared turf panel with add/remove slot cards on it.

import FieldPanel from '@/components/field/FieldPanel';
import { FORMATION_SLOTS } from '@/components/field/fieldGeometry';
import { FilledSlot, EmptySlot } from './SlotCards';
import type { DraftPlayer } from './types';

export default function DraftField({
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

  const slots = FORMATION_SLOTS.map(s => ({ key: s.id, nx: s.nx, u: s.u }));

  return (
    <FieldPanel
      slots={slots}
      renderSlot={({ key }) => {
        const def = FORMATION_SLOTS.find(s => s.id === key)!;
        const player = filledSlots[def.id];
        const isActive = filterOn && activeGroup === def.posGroup;
        const isDimmed = filterOn && !isActive;

        return player ? (
          <FilledSlot
            player={player}
            onRemove={() => onRemove(player.id)}
            dimmed={isDimmed}
          />
        ) : (
          <EmptySlot
            label={def.label}
            onClick={() => onSlotClick(def.posGroup)}
            active={isActive}
            dimmed={isDimmed}
          />
        );
      }}
      footer={
        isEmpty ? (
          <p className="rounded-pill bg-turf-deep/80 px-4 py-2 text-label text-turf-chalk">
            Pick your first player to start building.
          </p>
        ) : undefined
      }
    />
  );
}
