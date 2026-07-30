# OneLeague — Draft page redesign spec

Drop this file in the repo root. In Claude Code, open the repo and say:

> Read `DRAFT_REDESIGN.md` and execute Phase 0. Stop and report before writing any code.

Then approve and continue phase by phase. Do not let it do the whole thing in one shot — the conversion is mechanical and you want to catch drift early.

---

## Context

OneLeague is a fantasy football platform with a stock-market-style player pricing mechanic. It is a fantasy football site that happens to price players — not a trading platform. The draft page (`/onboarding/draft`) is an async solo squad build: the user picks 11 players under a $100.0M cap, filling position quotas (QB, RB, WR/TE), and 7 of the 11 start each week.

This page is the first thing a new user sees. Its single job: **get someone from zero to a completed 10-player squad without friction.**

The current page works. It looks like it was generated rather than designed. This spec fixes the second thing without touching the first.

Design references, for calibration: Sorare (restraint, near-monochrome, one accent), Madden Ultimate Team (geometric accuracy, information density, HUD framing), Fantasy Premier League (two-panel browse/build split, column headers, real filter controls).

---

## Phase 0 — Audit first, no code

Read and report before changing anything:

1. `DraftBoard.tsx` and every component it imports. List each child component and its responsibility.
2. Every distinct inline `style={{}}` object in that tree. Produce a table: component → property → value → how many times that value appears across the codebase. This is the token inventory.
3. Current `globals.css` — what's already there, whether `@import "tailwindcss"` is present, and whether any `@theme` block exists.
4. Current font setup in `app/layout.tsx`.
5. How the player list is paginated (the footer reads `1–20 of 1826`), where that query lives, and whether the full list is already client-side.
6. How the position-filter-on-slot-click interaction is currently wired.
7. Anything in the tree that will fight this redesign — hardcoded pixel widths, absolute positioning hacks, magic numbers.

**Report all seven, then stop.** Do not write code until the audit is approved.

---

## Hard constraints

These are non-negotiable. Violating any of them means the change gets reverted.

- **Visual changes only.** Behavior, props, handlers, state shape, and SQL stay byte-for-byte identical in effect. If a change would alter what the page *does*, stop and ask.
- **Never touch:** `lib/`, `app/api/`, `hooks/`, `better-auth_migrations/`, `data-pipeline/`, `scripts/`.
- **In scope:** page and component files, plus `globals.css` and `app/layout.tsx` (font wiring only).
- **Do not rename** `roster_slot` values. **Do not change** `QUOTA`.
- **In `Sidebar.tsx`:** keep `display` in `className`. Never inline.
- **No new dependencies** except `@radix-ui/react-select`. Radix avatar, checkbox, and dialog are already installed — use them.
- **No arbitrary Tailwind values.** `bg-[#0B3B2A]`, `text-[13px]`, `p-[7px]` are all banned. If a value isn't a token, either add a token or use the nearest existing one. This rule is what prevents the design system from rotting in three weeks.
- **No inline `style={{}}`** in any file you touch, with exactly one exception: computed geometry for the field SVG (perspective transforms, trapezoid coordinates). Everything else is Tailwind classes referencing tokens.
- **Routing is out of scope.** Making the draft page the default landing route is a separate task.
- **Do not run migrations.** Do not touch the database.

---

## Direction

Palette is emerald on white. That is the opposite of every dark fantasy sports site, and it's the differentiator — lean into it rather than hedging toward dark.

The page is white, near-black, and disciplined. **The field is the one bold element.** Everything around it stays quiet: hairline borders, generous whitespace, no gradients on chrome, no shadows beyond the faintest card lift, no decorative anything. Spend all the visual budget on the turf panel and the player cards that sit on it.

### Anti-patterns to eliminate

These are the specific things making the current page read as machine-made. Each one is a task:

1. **Native `<select>` elements.** "Price: High to Low," "All Teams," and "Any Price" are unstyled browser selects. Replace with Radix Select.
2. **Native checkbox.** "Show affordable players only" is a default checkbox. Use the Radix checkbox already installed.
3. **The confetti particle field** behind the end zone. Delete it entirely. It reads as a rendering bug.
4. **The floating white wedges** at the field's left and right edges, caused by faking perspective with CSS gradients. Fixed by drawing the field as a proper SVG trapezoid.
5. **The white light blobs** along the top of the field. Delete. Replaced by a vignette.
6. **Perspective far too steep**, which is what makes the field read as cartoonish. See geometry below.
7. **Uniform yard line spacing.** Real perspective compresses lines toward the far end. See formula below.
8. **Flat typographic hierarchy.** "Build Your Team" is barely larger than its own labels.
9. **Uniformly weighted list rows.** Price is the most important number on this page and it's currently the same size and weight as the team abbreviation.
10. **No hover, focus, active, or disabled states anywhere** — a direct consequence of inline styles. Every interactive element gets all four.
11. **Pagination through 1,826 players, 20 at a time.** Replace with a virtualized scrolling list.
12. **The floating tooltip** reading "Select players from the left / They'll appear in formation here." Replaced by a real empty state.
13. **Emerald UI on green turf.** The two greens currently fight. Turf is dark; chrome accents are emerald; they never touch.

---

## Phase 1 — Tokens

Add to `globals.css`, after the existing `@import "tailwindcss"`. Do not delete or modify existing rules.

```css
@theme {
  /* surfaces */
  --color-surface:         #FFFFFF;
  --color-surface-sunken:  #FAFAF9;
  --color-line:            #E7E5E4;
  --color-line-strong:     #D6D3D1;

  /* ink */
  --color-ink:             #0A0A0A;
  --color-ink-2:           #52525B;
  --color-ink-3:           #A1A1AA;

  /* emerald — chrome accent only, never on turf */
  --color-emerald:         #00A86B;
  --color-emerald-hover:   #008F5A;
  --color-emerald-press:   #00794C;
  --color-emerald-tint:    #E8F7F0;
  --color-emerald-line:    #B9E6D3;

  /* turf — the field panel only */
  --color-turf:            #0B3B2A;
  --color-turf-stripe:     #0E4632;
  --color-turf-deep:       #072A1E;
  --color-turf-chalk:      #FFFFFF;

  /* semantic */
  --color-up:              #00A86B;
  --color-down:            #DC2626;
  --color-warn:            #D97706;

  /* radii */
  --radius-card:           12px;
  --radius-slot:           8px;
  --radius-control:        8px;
  --radius-pill:           999px;

  /* motion */
  --ease-out-quart:        cubic-bezier(0.25, 1, 0.5, 1);
}
```

### Type

`app/layout.tsx`: add DM Sans via `next/font/google` as `--font-sans`. Keep Geist Mono as `--font-mono`. Remove Geist Sans if nothing else depends on it; if something does, leave it and just stop using it in this tree.

Scale — use these six sizes and nothing else:

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Display | 32 / 36 | 700 | -0.02em |
| Section | 20 / 28 | 700 | -0.01em |
| Body | 15 / 22 | 400 | 0 |
| Label | 13 / 18 | 500 | 0 |
| Eyebrow | 11 / 14 | 500 | 0.08em, uppercase |
| Numeral | inherits | 500 | 0, `font-mono`, `tabular-nums` |

**Every number on this page uses the numeral role** — prices, cap remaining, position counts, selection count, player count. `font-variant-numeric: tabular-nums` so digits don't reflow as values change. This is the single cheapest craft signal available and the page currently gets it wrong everywhere.

### Spacing

Use Tailwind's default 4px scale. The current page mixes generous header padding with cramped list rows — pick one rhythm and hold it. Section gaps `24px`, card padding `16px`, list row vertical padding `12px`.

---

## Phase 2 — The field (the signature element)

Rebuild as a **single SVG** inside a contained, rounded panel (`--radius-card`) on the white page. Not a CSS-transformed div. The SVG is what makes the geometry exact and the edges clean.

### Geometry

- Trapezoid. Far edge (top) width = **54%** of near edge (bottom) width. Panel height = **0.62 × near-edge width**. This is a much shallower angle than the current implementation and is the main fix for the cartoonish read.
- Yard lines at correct perspective, not evenly spaced. For yard fraction `u ∈ [0,1]` running near→far:

  ```
  y(u) = H · u · (1 + k) / (1 + k · u)      with k = 1.4
  w(u) = w_near − (w_near − w_far) · y(u)/H
  ```

  Compute these in the component and emit the coordinates. Every line's endpoints derive from `w(u)`, so nothing can drift out of the trapezoid.

### Surface, near to far

1. Base fill `--color-turf`.
2. **Mowing stripes:** alternating `--color-turf-stripe` bands between yard lines, foreshortened with the same `y(u)`. Subtle — this should read at a glance, not stripe like a beach umbrella.
3. **Yard numbers:** foreshortened chalk numerals along both sidelines, `--color-turf-chalk` at low opacity, scaled by `w(u)/w_near` so they shrink with distance. Nobody bothers with these, which is exactly why they land.
4. **Hash marks and sidelines:** thin chalk ticks. The current field has none.
5. **Turf grain:** one small tiling pattern at 4–6% opacity. An SVG `<pattern>` is fine; do not add an image asset.
6. **Vignette:** subtle radial darkening toward the panel edges using `--color-turf-deep`. This reads as stadium lighting. Do not draw light fixtures.
7. **End zone:** the OneLeague wordmark, foreshortened, chalk at low opacity.

No photographs. No 3D renders. No new image assets. The field must respond to state, and a photo can't.

### Slots

Position slots are **cards, not translucent rectangles**. Light fill so they separate cleanly from dark turf, `--radius-slot`, position label in the Label role.

Four states, all required:

- **Empty** — light card, dashed hairline border, position abbreviation centered, subtle emerald `+` affordance on hover.
- **Hover** — border strengthens, 2px lift, cursor pointer. This slot is clickable and currently gives zero indication of that.
- **Filter-active** — when this slot's position filter is applied to the list, the slot gets an emerald ring and the *other* slots dim to ~55% opacity. Right now this interaction is invisible, which is a shame because it's the best thing on the page.
- **Filled** — headshot, last name, team abbreviation, price in mono. Small `×` on hover to remove.

Filling a slot animates: 180ms, `--ease-out-quart`, opacity plus a 4px rise. Wrap in `@media (prefers-reduced-motion: no-preference)`.

---

## Phase 3 — Player list

Left panel, white, hairline right border.

- **Sticky column headers:** `PLAYER` / `PRICE` in the Eyebrow role. Price column right-aligned. FPL does this and it's why their list is scannable.
- **Row hierarchy:** name in Body 500; position and team chips in Label at `--color-ink-3`; **price in the numeral role, right-aligned, one step larger than the chips.** Currently everything is the same weight, so nothing reads first.
- **Team identity:** color chip plus abbreviation rather than the tiny logos. Simpler, cleaner, and avoids trademark questions.
- **Headshots:** consistent circular crop via Radix Avatar, with a deterministic initials fallback on `--color-emerald-tint`. A missing image must never break row alignment.
- **Row states:** hover (`--color-surface-sunken`), `focus-visible` (2px emerald ring, never `outline: none` without a replacement), and **disabled with a reason** — if a player is unaffordable or their position is full, dim the row and put the reason in a tooltip on the add button. Currently the user has to guess.
- **Keyboard:** arrow keys move through rows, Enter adds. Cheap to add, and it's the kind of thing that signals a real product.
- **Virtualized list replaces pagination.** 20-at-a-time through 1,826 players is genuinely bad during a draft. If the full list is already client-side this is straightforward; if not, report what's needed before implementing.
- **Search:** icon inside the input, clear button when non-empty, `⌘K` focus shortcut, count formatted as `1,826 players` with a locale separator.
- **Filters:** three Radix Selects replacing the native ones, plus the Radix Checkbox. Match control heights exactly — the current row has three different ones.

---

## Phase 4 — Header and cap

- **Cap remaining** is the hero number: Display role, mono, tabular. Below it a thin progress bar in emerald showing spend against $100.0M.
- **Position counters** (`QB 0/2`, `RB 0/3`, `WR/TE 0/5`) become segmented pills that fill as slots are taken — glanceable rather than read.
- **Primary CTA** replaces the passive `10 selections left`. Disabled state shows what's blocking (`3 more RB needed`, `Over cap by $2.5M`). Enabled state is a single emerald button that finishes the squad. This is the page's one job — it should be the most obvious thing on screen once it's reachable.
- The `Only 7 of these 11 each week` line stays, but as a quiet inline note in Label role, not a full-width banner competing with the header.

---

## Phase 5 — Empty and loading

- **Empty field:** replace the floating tooltip with a proper empty state inside the field panel. One line of direction, in the interface's voice: `Pick your first player to start building.` An empty screen is an invitation to act, not a place to explain the UI.
- **Loading:** skeleton rows matching final row height exactly, so nothing shifts when data lands. No spinners.
- **Copy pass:** every string gets reviewed. Sentence case throughout. Active voice. Buttons say what happens. Labels name what the user controls, not what the system does.

---

## Quality floor

Not optional, not announced:

- Every interactive element has hover, `focus-visible`, active, and disabled states.
- Visible keyboard focus everywhere. Never remove an outline without replacing it.
- All motion inside `@media (prefers-reduced-motion: no-preference)`.
- Body text meets 4.5:1 contrast; large text 3:1. Verify `--color-ink-3` on white actually passes for the sizes it's used at — if it doesn't, darken it.
- No layout shift between loading and loaded.
- All numerals tabular.
- No `console.log` left behind.

---

## Conversion procedure

Bottom-up, so a converted child never fights an unconverted parent:

1. Tokens in `globals.css`, fonts in `layout.tsx`.
2. Leaf components — player row, filter bar, slot card, cap chips, search input.
3. The field SVG.
4. `DraftBoard.tsx` container and layout.
5. Delete every now-orphaned style object.

One commit per step, each one independently reviewable. After each step, confirm the page still renders and behaves identically before continuing.

---

## Definition of done

Self-check before declaring finished. Every line must be true:

- [ ] Zero `style={{}}` in the draft tree except computed field geometry
- [ ] Zero arbitrary Tailwind values — every color, size, and radius traces to a token
- [ ] Zero native `<select>` or `<input type="checkbox">`
- [ ] Confetti, white wedges, and light blobs all deleted
- [ ] Yard lines non-uniformly spaced per the formula
- [ ] Every number in mono with tabular figures
- [ ] Every interactive element has all four states
- [ ] Slot position-filter interaction is visibly discoverable
- [ ] No behavior, prop, handler, or query changed
- [ ] `roster_slot` values and `QUOTA` untouched
- [ ] `Sidebar.tsx` still has `display` in `className`
- [ ] Nothing in `lib/`, `app/api/`, `hooks/`, `better-auth_migrations/`, `data-pipeline/`, or `scripts/` modified

---

## Separate task, ask before starting

**Headshots load in production but not on localhost.** Likely one of: the image host missing from `images.remotePatterns` in `next.config.ts` for dev, a CDN base URL env var absent from `.env.local`, or the source rejecting requests without a production referrer. Diagnose and report the cause — do not fix it as part of the redesign, since `next.config.ts` is outside the scope above.
