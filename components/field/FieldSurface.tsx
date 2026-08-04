// The turf: one SVG, drawn entirely from fieldGeometry.
//
// Inline styles are confined to computed geometry (coordinates, transforms).
// Colour and opacity come from tokens via Tailwind fill/stroke utilities.

import {
  W_NEAR, CANVAS_H, GOAL_LINE_U,
  svgY, edgesAt, xAt, foreshorten,
  YARD_LINES, TURF_BANDS, HASH_YARDS, HASH_NX, NUMERAL_NX,
  yardsToU,
} from './fieldGeometry';

/** Polygon spanning the trapezoid between two depths. */
function band(uNear: number, uFar: number): string {
  const n = edgesAt(uNear);
  const f = edgesAt(uFar);
  return [
    `${n.x1},${svgY(uNear)}`,
    `${n.x2},${svgY(uNear)}`,
    `${f.x2},${svgY(uFar)}`,
    `${f.x1},${svgY(uFar)}`,
  ].join(' ');
}

const FIELD_OUTLINE = band(0, 1);

export default function FieldSurface() {
  return (
    <svg
      viewBox={`0 0 ${W_NEAR} ${CANVAS_H}`}
      className="block w-full h-auto"
      role="img"
      aria-label="Football field showing your squad in formation"
    >
      <defs>
        {/* Turf grain — one tiling pattern, no image asset */}
        <pattern id="turf-grain" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6 L6 0" className="stroke-turf-chalk" strokeWidth="1" />
        </pattern>

        {/* Stadium lighting, as a falloff rather than drawn fixtures */}
        <radialGradient id="turf-vignette" cx="50%" cy="62%" r="72%">
          <stop offset="55%" stopColor="var(--color-turf-deep)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--color-turf-deep)" stopOpacity="0.55" />
        </radialGradient>

        {/* Everything is clipped to the trapezoid, so no marking can escape it
            and no wedge can appear outside it */}
        <clipPath id="turf-clip">
          <polygon points={FIELD_OUTLINE} />
        </clipPath>
      </defs>

      <g clipPath="url(#turf-clip)">
        {/* 1 — base turf */}
        <polygon points={FIELD_OUTLINE} className="fill-turf" />

        {/* 2 — mown bands, foreshortened by the same depth curve */}
        {TURF_BANDS.map(({ key, uNear, uFar, light }) =>
          light ? (
            <polygon key={key} points={band(uNear, uFar)} className="fill-turf-stripe" />
          ) : null
        )}

        {/* 3 — end zone */}
        <polygon points={band(GOAL_LINE_U, 1)} className="fill-turf-deep" />
        <text
          x={W_NEAR / 2}
          y={svgY((GOAL_LINE_U + 1) / 2)}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-turf-chalk opacity-25 font-sans font-bold"
          style={{
            fontSize: 46 * foreshorten(GOAL_LINE_U),
            letterSpacing: 10 * foreshorten(GOAL_LINE_U),
            // Squashed vertically: end zone lettering foreshortens almost flat
            // from a downfield camera.
            transform: `translate(0px, ${svgY((GOAL_LINE_U + 1) / 2)}px) scale(1, 0.34) translate(0px, ${-svgY((GOAL_LINE_U + 1) / 2)}px)`,
          }}
        >
          ONELEAGUE
        </text>

        {/* 4 — sidelines */}
        <polygon
          points={FIELD_OUTLINE}
          fill="none"
          className="stroke-turf-chalk opacity-50"
          strokeWidth="3"
        />

        {/* 5 — hash marks, every yard, both inbounds rows */}
        {HASH_YARDS.map(yards => {
          const u = yardsToU(yards);
          const y = svgY(u);
          const s = foreshorten(u);
          return HASH_NX.map(nx => {
            const cx = xAt(nx, u);
            const half = 7 * s;
            return (
              <line
                key={`${yards}-${nx}`}
                x1={cx - half} x2={cx + half} y1={y} y2={y}
                className="stroke-turf-chalk opacity-30"
                strokeWidth={Math.max(0.75, 2 * s)}
              />
            );
          });
        })}

        {/* 6 — yard lines */}
        {YARD_LINES.map(({ yards, u }) => {
          const { x1, x2 } = edgesAt(u);
          const y = svgY(u);
          const s = foreshorten(u);
          return (
            <line
              key={yards}
              x1={x1} x2={x2} y1={y} y2={y}
              className="stroke-turf-chalk opacity-40"
              strokeWidth={Math.max(1, 2.5 * s)}
            />
          );
        })}

        {/* 7 — grain, then lighting falloff */}
        <polygon points={FIELD_OUTLINE} fill="url(#turf-grain)" className="opacity-5" />
        <polygon points={FIELD_OUTLINE} fill="url(#turf-vignette)" />
      </g>

      {/* 8 — yard-line numerals, deliberately outside the trapezoid clip:
          the near-most line sits exactly on the clip's own edge (y = H), so
          straddling it — half above, half below — needs the sliver of canvas
          between H and CANVAS_H that the clip would otherwise cut off. */}
      {YARD_LINES.map(({ yards, u, number }) => {
        if (number == null) return null;
        const y = svgY(u);
        const s = foreshorten(u);
        return NUMERAL_NX.map(nx => {
          const cx = xAt(nx, u);
          // Real field numerals are painted so they read right-side-up from
          // the nearer sideline, not from the end zone — rotating the digit
          // pair 90° toward that sideline also happens to be what splits the
          // two characters across the yard line itself (a horizontally
          // middle-anchored string becomes vertically split once rotated a
          // quarter turn), instead of both digits sitting flat on top of it.
          const faceDeg = nx < 50 ? 90 : -90;
          return (
            <g
              key={`${yards}-${nx}`}
              style={{
                // Numerals lie flat on the grass, so they squash with depth —
                // applied in screen space, outside the rotation, so it
                // foreshortens the same regardless of which way they face.
                transform: `translate(0px, ${y}px) scale(1, 0.55) translate(0px, ${-y}px)`,
              }}
            >
              <text
                x={cx}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${faceDeg} ${cx} ${y})`}
                className="fill-turf-chalk opacity-30 font-sans font-bold"
                style={{ fontSize: 40 * s, letterSpacing: 8 * s }}
              >
                {number}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
}
