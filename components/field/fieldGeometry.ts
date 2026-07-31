// Field perspective geometry.
//
// The field is drawn as a single SVG trapezoid in a fixed 1000 x 620 viewBox.
// Everything — yard lines, stripes, hash marks, numerals, slot positions —
// derives from the two functions below, so nothing can drift outside the
// trapezoid or fall out of sync with anything else.

// ─── Panel ────────────────────────────────────────────────────────────────────
export const W_NEAR = 1000;                 // near (bottom) edge width
export const W_FAR  = W_NEAR * 0.54;        // far (top) edge = 54% of near
export const H      = W_NEAR * 0.62;        // panel height
const K = 1.4;                              // perspective compression constant

/**
 * Depth curve. `u` runs 0 (near/bottom) → 1 (far/top) in *field* space and
 * returns distance from the near edge in *panel* space. Non-linear, so equal
 * real distances compress as they recede — evenly spaced yard lines are the
 * single biggest tell that a field is faked.
 */
export function depthY(u: number): number {
  return (H * u * (1 + K)) / (1 + K * u);
}

/** Trapezoid width at depth `u`. */
export function widthAt(u: number): number {
  return W_NEAR - (W_NEAR - W_FAR) * (depthY(u) / H);
}

/** SVG y coordinate (origin top-left) at depth `u`. */
export function svgY(u: number): number {
  return H - depthY(u);
}

/** Left/right x coordinates of the sideline at depth `u`. */
export function edgesAt(u: number): { x1: number; x2: number } {
  const half = widthAt(u) / 2;
  return { x1: W_NEAR / 2 - half, x2: W_NEAR / 2 + half };
}

/**
 * Horizontal position at depth `u` for a nominal across-field coordinate
 * `nx` (0 = left sideline, 100 = right sideline).
 */
export function xAt(nx: number, u: number): number {
  return W_NEAR / 2 + ((nx - 50) / 100) * widthAt(u);
}

/** How much smaller something at depth `u` renders than at the near edge. */
export function foreshorten(u: number): number {
  return widthAt(u) / W_NEAR;
}

// ─── Field markings ───────────────────────────────────────────────────────────
// 50 yards of field of play plus a 10-yard end zone at the far end.
export const FIELD_YARDS   = 50;
export const ENDZONE_YARDS = 10;

/**
 * Convert yards downfield from the near edge into a depth fraction.
 *
 * The divisor is written inline rather than hoisted into a `TOTAL_YARDS` const,
 * and it must stay that way. The production minifier inlines this function into
 * the module-eval-time `Array.from` calls below; a const holding a *computed*
 * expression does not constant-fold, so its declaration was tree-shaken while
 * the inlined copies kept referencing it — throwing "TOTAL_YARDS is not defined"
 * on the client, in production only. Literal-valued consts like the two above do
 * fold, so this form is safe. Dev builds don't minify, which is why it never
 * reproduced locally.
 */
export function yardsToU(yards: number): number {
  return yards / (FIELD_YARDS + ENDZONE_YARDS);
}

export const GOAL_LINE_U = yardsToU(FIELD_YARDS);

/**
 * Every 5-yard line. NFL numerals count down toward the nearer goal line, so
 * with the camera at midfield the line 10 yards downfield is "the 40".
 */
export const YARD_LINES = Array.from({ length: FIELD_YARDS / 5 + 1 }, (_, i) => {
  const yards = i * 5;
  const number = FIELD_YARDS - yards;
  return {
    yards,
    u: yardsToU(yards),
    // numerals only every 10 yards, and not on the goal line itself
    number: number > 0 && number % 10 === 0 ? number : null,
  };
});

/** Alternating mown bands between consecutive yard lines. */
export const TURF_BANDS = Array.from({ length: FIELD_YARDS / 5 }, (_, i) => ({
  key: i,
  uNear: yardsToU(i * 5),
  uFar: yardsToU((i + 1) * 5),
  light: i % 2 === 0,
}));

/** Inbounds hash marks at every yard that isn't already a full line. */
export const HASH_YARDS = Array.from({ length: FIELD_YARDS }, (_, i) => i + 1)
  .filter(y => y % 5 !== 0);

// A regulation field is 160ft wide with hashes 70ft9in from each sideline, and
// numerals set 12 yards (36ft) in. Expressed as nominal across-field percents.
export const HASH_NX    = [44.2, 55.8];
export const NUMERAL_NX = [22.5, 77.5];

// ─── Formation slots ──────────────────────────────────────────────────────────
// `nx` is across-field (0–100), `u` is depth (0 = near, 1 = far). All 11
// drafted players get an on-field slot; there is no separate bench area.
// Depth follows a shotgun snap: receivers widest and furthest downfield,
// backs set behind them, quarterbacks deepest.
export const FORMATION_SLOTS = [
  { id: 'FLEX1', posGroup: 'FLEX', label: 'WR/TE', nx: 7,  u: 0.60 },
  { id: 'FLEX2', posGroup: 'FLEX', label: 'WR/TE', nx: 28, u: 0.60 },
  { id: 'FLEX3', posGroup: 'FLEX', label: 'WR/TE', nx: 50, u: 0.60 },
  { id: 'FLEX4', posGroup: 'FLEX', label: 'WR/TE', nx: 72, u: 0.60 },
  { id: 'FLEX5', posGroup: 'FLEX', label: 'WR/TE', nx: 93, u: 0.60 },
  { id: 'RB1',   posGroup: 'RB',   label: 'RB',    nx: 14, u: 0.34 },
  { id: 'RB2',   posGroup: 'RB',   label: 'RB',    nx: 38, u: 0.34 },
  { id: 'RB3',   posGroup: 'RB',   label: 'RB',    nx: 62, u: 0.34 },
  { id: 'RB4',   posGroup: 'RB',   label: 'RB',    nx: 86, u: 0.34 },
  { id: 'QB1',   posGroup: 'QB',   label: 'QB',    nx: 33, u: 0.10 },
  { id: 'QB2',   posGroup: 'QB',   label: 'QB',    nx: 67, u: 0.10 },
] as const;

/** Panel-relative position (percent) and depth scale for a formation slot. */
export function slotPlacement(nx: number, u: number) {
  return {
    leftPct: (xAt(nx, u) / W_NEAR) * 100,
    topPct: (svgY(u) / H) * 100,
    // Cards shrink with depth, but more gently than the turf does — at full
    // foreshortening the far cards become unreadable.
    scale: 1 - 0.28 * u,
  };
}
