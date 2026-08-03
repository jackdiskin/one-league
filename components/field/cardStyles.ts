// Shared styling for anything that sits on the turf.
//
// Draft slots and lineup slots are different components with different content,
// but they are the same object visually. Keeping the box and the focus ring
// here stops the two drifting apart.

/** Slot card box: fixed size so the perspective scale is the only thing sizing it. */
export const FIELD_CARD =
  'w-24 h-32 rounded-slot flex flex-col items-center justify-center';

// Numeric twins of the width/height above (w-24 = 96px, h-32 = 128px) — kept
// in sync by hand since Tailwind classes aren't readable at runtime, needed
// wherever card size has to feed into layout math (see minOverlapFreeWidth).
export const FIELD_CARD_W = 96;
export const FIELD_CARD_H = 128;

/** Focus ring for controls sitting on dark turf. */
export const FIELD_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-turf';
