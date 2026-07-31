'use client';

// The field panel: turf SVG with slot content laid over it.
//
// Generic over what a slot renders. The draft screen puts add/remove cards in
// them; the lineup screen puts live-scoring cards with swap states in them. The
// panel owns placement and the surface, nothing else.
//
// Slots are HTML rather than SVG so they can carry real hover/focus states and
// image content. Their placement comes from the same perspective functions the
// turf uses, so they stay locked to the field.

import type { ReactNode } from 'react';
import FieldSurface from './FieldSurface';
import { slotPlacement } from './fieldGeometry';

export interface FieldSlotPlacement {
  /** Stable key for this slot. */
  key: string;
  /** Across-field, 0 = left sideline, 100 = right sideline. */
  nx: number;
  /** Depth, 0 = near/bottom, 1 = far/top. */
  u: number;
}

export default function FieldPanel({
  slots,
  renderSlot,
  footer,
  children,
}: {
  slots: FieldSlotPlacement[];
  renderSlot: (slot: FieldSlotPlacement) => ReactNode;
  /** Optional content pinned near the bottom of the turf (empty states, hints). */
  footer?: ReactNode;
  /** Optional content below the turf, inside the same rounded container. */
  children?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-card bg-turf shadow-sm">
      <div className="relative">
        <FieldSurface />

        <div className="absolute inset-0">
          {slots.map(slot => {
            const { leftPct, topPct, scale } = slotPlacement(slot.nx, slot.u);
            return (
              <div
                key={slot.key}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${leftPct}%`, top: `${topPct}%` }}
              >
                <div style={{ transform: `scale(${scale})` }}>
                  {renderSlot(slot)}
                </div>
              </div>
            );
          })}

          {footer && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
              {footer}
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
