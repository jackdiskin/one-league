// Shared styling for anything that sits on the turf.
//
// Draft slots and lineup slots are different components with different content,
// but they are the same object visually. Keeping the box and the focus ring
// here stops the two drifting apart.

/** Slot card box: fixed size so the perspective scale is the only thing sizing it. */
export const FIELD_CARD =
  'w-28 h-36 rounded-slot flex flex-col items-center justify-center';

/** Focus ring for controls sitting on dark turf. */
export const FIELD_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-turf';
