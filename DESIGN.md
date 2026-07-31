# OneLeague design system

Reference for redesigning pages to match the draft page (`/onboarding/draft`), which is the
first page converted to this system and the working example for everything below.

Read this before touching another page. The rules that keep the system from rotting are in
[Ground rules](#ground-rules) — those are the ones people break first.

---

## Ground rules

1. **No inline `style={{}}`.** The only exception is *computed geometry* — a value that can't
   be a static class because it's derived at runtime (an SVG coordinate, a virtualizer offset,
   a progress-bar width, a colour from a data map). Decoration never qualifies.
2. **No arbitrary Tailwind values.** `bg-[#0B3B2A]`, `text-[13px]`, `p-[7px]` are banned. If a
   value isn't a token, add a token or use the nearest existing one.
3. **Every number uses the numeral treatment:** `font-mono tabular-nums`. Prices, counts, caps,
   ranks, percentages. Tabular figures stop digits reflowing as values change.
4. **Every interactive element needs four states** — hover, `focus-visible`, active, disabled.
   See [Component states](#component-states).
5. **All motion sits behind `motion-safe:`.**
6. **Turf greens and chrome emeralds never touch.** They are separate scales for separate
   surfaces. Emerald is UI chrome; turf is the field panel only.

---

## Tokens

All defined in `app/globals.css` inside `@theme`. Tailwind v4 generates utilities from these
automatically — `--color-ink` becomes `text-ink` / `bg-ink` / `border-ink` / `fill-ink` /
`stroke-ink`, `--radius-card` becomes `rounded-card`, and so on.

> There is a **second** `@theme inline` block lower in the file. That one belongs to the
> pre-existing shadcn/better-auth-ui setup (`--color-primary`, `--color-muted`, …). Leave it
> alone; it's unrelated and there are no name collisions.

### Surfaces

| Token | Value | Use for |
|---|---|---|
| `--color-surface` | `#FFFFFF` | Page background, cards, panels, input fills |
| `--color-surface-sunken` | `#FAFAF9` | Recessed areas: row hover, column headers, disabled fills, inset chips |
| `--color-line` | `#E7E5E4` | Default hairline borders and dividers |
| `--color-line-strong` | `#D6D3D1` | Border on hover, or where a boundary needs more weight |

### Ink

| Token | Value | Contrast on white | Use for |
|---|---|---|---|
| `--color-ink` | `#0A0A0A` | 19.8:1 | Primary text, headings, the number that matters |
| `--color-ink-2` | `#52525B` | 7.7:1 | Secondary text, body copy, labels |
| `--color-ink-3` | `#71717A` | 4.8:1 | Tertiary: eyebrows, meta chips, placeholders, disabled text |

`--color-ink-3` is deliberately **`#71717A`, not `#A1A1AA`**. The lighter value measures 2.57:1
on white and fails the 4.5:1 body-text floor at the 13px sizes it gets used at. Don't lighten it.

### Emerald — chrome accent only

| Token | Value | Use for |
|---|---|---|
| `--color-emerald` | `#00A86B` | Accent: rings, active pills, icons, progress fill, selection |
| `--color-emerald-hover` | `#008F5A` | Hover on a filled emerald button |
| `--color-emerald-press` | `#00794C` | **Filled button backgrounds** and active/pressed state |
| `--color-emerald-tint` | `#E8F7F0` | Tinted backgrounds: selected rows, avatar fallbacks, icon wells |
| `--color-emerald-line` | `#B9E6D3` | Borders on tinted emerald surfaces |

⚠️ **White text on `--color-emerald` is only 3.08:1 and fails 4.5:1 at normal button size.**
Filled buttons use `bg-emerald-press` (5.47:1) with `hover:bg-emerald-hover`. Use plain
`--color-emerald` for accents, rings and icons — not as a fill behind small white text.

### Turf — the field panel only

| Token | Value | Use for |
|---|---|---|
| `--color-turf` | `#0B3B2A` | Base grass |
| `--color-turf-stripe` | `#0E4632` | Alternating mown bands |
| `--color-turf-deep` | `#072A1E` | End zone, vignette falloff |
| `--color-turf-chalk` | `#FFFFFF` | Yard lines, hash marks, numerals, wordmark |

Never use these outside the field. Never put emerald on them.

### Semantic

| Token | Value | Use for |
|---|---|---|
| `--color-up` | `#00A86B` | Price rises, positive deltas |
| `--color-down` | `#DC2626` | Price falls, destructive actions, errors, over-cap |
| `--color-warn` | `#D97706` | Warnings |

### Radii

| Token | Value | Use for |
|---|---|---|
| `--radius-card` | `12px` | Panels, modals, cards, the field panel |
| `--radius-slot` | `8px` | Formation slot cards |
| `--radius-control` | `8px` | Buttons, inputs, selects, small chips |
| `--radius-pill` | `999px` | Pills, tabs, avatars, progress bars, dots |

### Motion

| Token | Value | Use for |
|---|---|---|
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | Every transition — `ease-out-quart` |
| `--animate-slot-in` | `slot-in 180ms` | Content appearing in place (opacity + 4px rise) |
| `--animate-modal-in` | `modal-in 200ms` | Modals (opacity + 8px rise + slight scale) |

Standard transition: `transition duration-150 ease-out-quart`. Animations always as
`motion-safe:animate-slot-in`.

---

## Type scale

Six roles. Nothing else. None of these sizes exist in Tailwind's default scale, which is why
each is a token — that's what makes arbitrary values unnecessary.

| Role | Class | Size / line-height | Weight | Tracking | Use for |
|---|---|---|---|---|---|
| Display | `text-display` | 32 / 36 | 700 | -0.02em | The one hero number or title per screen |
| Section | `text-section` | 20 / 28 | 700 | -0.01em | Panel and section headings |
| Body | `text-body` | 15 / 22 | 400 | 0 | Paragraphs, list item names, button labels, inputs |
| Label | `text-label` | 13 / 18 | 500 | 0 | Field labels, meta chips, secondary rows, helper text |
| Eyebrow | `text-eyebrow` | 11 / 14 | 500 | 0.08em | Kickers above headings, column headers. Add `uppercase` |
| Numeral | `font-mono tabular-nums` | inherits | 500 | 0 | **Every number** |

Weight and tracking come baked into the token, so `text-display` alone is enough — don't add
`font-bold`.

**Numerals are a modifier, not a size.** Combine with whichever size role fits:

```tsx
<span className="font-mono tabular-nums text-display text-ink">$100.0M</span>  {/* hero */}
<span className="font-mono tabular-nums text-body  text-ink">$18.5M</span>     {/* list row */}
<span className="font-mono tabular-nums text-label text-ink-2">2/4</span>      {/* counter */}
```

### Hierarchy in a row

The thing that matters most gets a size step **and** a weight step over its neighbours. In a
player row: name is `text-body font-medium text-ink`, meta chips are `text-label text-ink-3`,
and price is `text-body font-medium text-ink` — a full step above the chips. Before the
redesign everything was the same size and weight, so nothing read first.

### Fonts

`DM Sans` (`--font-sans`) and `Geist Mono` (`--font-mono`), both via `next/font/google` in
`app/layout.tsx`. `body` in `globals.css` sets DM Sans globally. **Never set `fontFamily` on a
container** — the old draft page did, which silently overrode the loaded font.

### Spacing

Tailwind's default 4px scale. Section gaps `24px` (`gap-6`), card padding `16px` (`p-4`), list
row vertical padding `12px`. Pick one rhythm per panel and hold it.

---

## Component states

Every interactive element implements all four. This is the single most common gap when
converting a page, because inline styles make states impractical and they just get skipped.

### The focus ring

One pattern everywhere:

```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2
```

`focus-visible`, not `focus` — so it appears for keyboard users and not on mouse click. **Never
remove an outline without replacing it.** On dark backgrounds add a matching offset colour, e.g.
`focus-visible:ring-offset-turf` for the slot cards on the field.

`SlotCards.tsx` exports this as a `FOCUS` constant and composes it — worth copying for any
component with more than one interactive variant.

### The four states by element type

**Buttons (filled / primary)**

```tsx
className={[
  'h-10 rounded-control px-5 text-body font-medium',
  'transition-colors duration-150 ease-out-quart',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2',
  enabled
    ? 'cursor-pointer bg-emerald-press text-surface hover:bg-emerald-hover active:bg-emerald-press'
    : 'cursor-not-allowed bg-surface-sunken text-ink-3',
].join(' ')}
```

**Buttons (outline / secondary)** — `border-line` at rest, `hover:border-line-strong hover:text-ink`.

**Rows** — `hover:bg-surface-sunken`, `focus-visible:ring-inset` (a ring inside the bounds, since
rows are flush), selected state uses `bg-emerald-tint`.

**Cards that lift** — `hover:-translate-y-0.5 hover:shadow-lg`, returning to `active:translate-y-0`.

### Disabled must say why

A dimmed control with no explanation makes the user guess. Two layers:

1. `disabled` attribute + `opacity-55` + `cursor-not-allowed` + `text-ink-3`
2. **The reason, in the `title`** — computed by a function that mirrors the enable check in the
   same order, so they can't disagree.

```tsx
// DraftBoard.tsx — blockedReason() mirrors canAdd() case for case
if (pg === 'RB' && rbCount >= QUOTA.RB) return `All ${QUOTA.RB} RB spots are filled`;
if (totalCost + price > CAP) return `${formatPrice(price - capLeft)} over your remaining cap`;
```

The same idea drives the disabled primary CTA, which shows `Still need 2 more QB, 4 more RB`
beneath itself rather than sitting dead.

### Selection state that spans components

When one element's state changes another's, make it visible in both. Clicking a formation slot
filters the player list; the slot takes `ring-2 ring-emerald` **and every other slot drops to
`opacity-55`**. Before, this interaction existed but had zero visual feedback.

### Keyboard

Lists get arrow-key navigation with `Enter` to action, cursor tracked in state, and
`scrollIntoView` handling on move (`PlayerList.tsx`). Search inputs get a `⌘K` focus shortcut.
Modals get `role="dialog"` + `aria-modal`. Inputs get a real `<label htmlFor>`, plus
`aria-invalid` / `aria-describedby` pointing at the error when one exists.

---

## The field SVG

`fieldGeometry.ts` + `FieldSurface.tsx` + `FieldPanel.tsx`. Relevant to any page that needs a
perspective field (the dashboard and team pages both have their own copies that predate this).

### Approach

**One SVG in a fixed `1000 × 620` viewBox** — not CSS transforms on divs. The old implementation
faked perspective with `clip-path` and gradients, which produced floating white wedges at the
edges and couldn't keep markings inside the shape. An SVG with a `<clipPath>` makes that
structurally impossible.

The SVG has no width/height, only a `viewBox` and `className="block w-full h-auto"`, so its
intrinsic aspect ratio sizes the container. No aspect-ratio utility needed.

### Geometry

Two coordinate inputs: `u` = depth (0 near/bottom → 1 far/top), `nx` = across-field (0 left
sideline → 100 right).

```ts
W_NEAR = 1000
W_FAR  = W_NEAR * 0.54     // far edge is 54% of near
H      = W_NEAR * 0.62     // panel height
K      = 1.4               // compression constant

depthY(u)  = H * u * (1 + K) / (1 + K * u)      // non-linear depth
widthAt(u) = W_NEAR - (W_NEAR - W_FAR) * depthY(u) / H
svgY(u)    = H - depthY(u)
xAt(nx, u) = W_NEAR/2 + ((nx - 50) / 100) * widthAt(u)
foreshorten(u) = widthAt(u) / W_NEAR             // scale factor at depth
```

**Everything derives from these.** Yard lines, mown bands, hash marks, numerals and slot
positions all call the same functions, so nothing can drift out of the trapezoid or fall out of
sync. The non-linear `depthY` is what sells the depth — evenly spaced yard lines are the
single biggest tell that a field is fake.

### Layer order (near → far)

1. Base turf polygon
2. Mown 5-yard bands, foreshortened by the same curve
3. End zone + wordmark, squashed with `scale(1, 0.34)` — real end zone lettering foreshortens
   almost flat from a downfield camera
4. Sidelines
5. Hash marks, every yard, both inbounds rows
6. Yard lines + numerals, scaled by `foreshorten(u)`
7. `<pattern>` grain at `opacity-5`, then a radial vignette in `--color-turf-deep`

No photographs, no 3D renders, no image assets — the field responds to state, and a photo can't.
Lighting is a vignette, never drawn fixtures.

### Slots are HTML, not SVG

Formation slots overlay the SVG as absolutely-positioned HTML so they can carry real hover/focus
states and image content. `slotPlacement(nx, u)` returns `leftPct` / `topPct` / `scale` from the
same functions. Cards shrink more gently than the turf (`1 - 0.28 * u`) because full
foreshortening makes far cards unreadable.

Positioning uses a **wrapper for translate and an inner element for scale**. Combining a
percentage translate with `scale()` in one transform list scales the translate distance too and
the element lands in the wrong place.

---

## Radix replacements

Three native elements were replaced. Wrappers live in `_components/ui/`.

| Native | Radix | Wrapper | Why |
|---|---|---|---|
| `<select>` | `@radix-ui/react-select` | `ui/Select.tsx` | Native selects can't be styled; they were the most obvious "unstyled default" on the page |
| `<input type="checkbox">` | `@radix-ui/react-checkbox` | `ui/Checkbox.tsx` | Same, plus a properly linked label |
| `<img>` avatar + manual fallback | `@radix-ui/react-avatar` | used inline in `PlayerRow.tsx` | Consistent circular crop; a missing image can never break row alignment |

All three are already in `package.json`. Style Radix state through its data attributes rather
than React state:

```
data-[state=open]:border-emerald        // Select trigger, open
data-[highlighted]:bg-surface-sunken    // Select item, keyboard/hover cursor
data-[state=checked]:bg-emerald         // Checkbox, checked
```

**Match control heights.** Every filter control is `h-9`; buttons and inputs in modals are
`h-10`. The old page had three different heights in one row.

> Radix Select renders its own `aria-hidden` native `<select>` for form compatibility. That's
> expected — it isn't yours and can't be removed without dropping Radix.

---

## Lists at scale

`PlayerList.tsx` windows a 1,826-row list by hand (only ~19 rows in the DOM). Pagination was
removed; paging 20-at-a-time through a catalogue during a draft is genuinely bad.

Virtualization is hand-rolled because the redesign allowed one new dependency and it went to
Radix Select. If another page needs this, reuse the pattern: fixed row height exported as a
constant, `ResizeObserver` for viewport height, a spacer div at `total * ROW_HEIGHT`, and a
`translateY` offset on the window.

Reset derived cursor state **during render**, not in an effect:

```tsx
const [prevPlayers, setPrevPlayers] = useState(players);
if (players !== prevPlayers) { setPrevPlayers(players); setActiveIndex(-1); }
```

An effect would render one frame with a stale highlight, and lint rightly flags it.

---

## Loading and empty states

**Loading** — `app/onboarding/draft/loading.tsx`. Skeletons must match final dimensions exactly
(`h-14` rows, same panel widths, same header heights) so nothing shifts when data lands.
`animate-pulse` on `bg-line`. **No spinners.**

**Empty** — an invitation to act, not an explanation of the UI. The field's empty state reads
*"Pick your first player to start building."* It replaced a floating tooltip that explained
where things would appear.

---

## Copy

- Sentence case everywhere. Not Title Case.
- Active voice. Buttons say what happens: **"Create my team"**, not "Start Playing". **"Finish
  squad"**, not "11 selections left".
- An action keeps its name through the whole flow.
- Errors explain what happened and what to do, in the interface's voice, and never apologise:
  *"That didn't reach the server. Check your connection and try again."*
- Name things by what the user controls, not how the system is built.
- **Derive numbers from constants, never hardcode them.** The page said "6 of these 11 will
  start" for weeks while the real number was 7. Roster copy now interpolates `QUOTA`,
  `TOTAL_SLOTS` and `STARTERS` from `types.ts`.

---

## File layout

```
app/onboarding/draft/
├── loading.tsx                 skeleton, matches final dimensions
└── _components/
    ├── types.ts                DraftPlayer, CAP/QUOTA/TOTAL_SLOTS/STARTERS, POS_COLORS
    ├── sorting.ts              sort options + comparator
    ├── teamColors.ts           team colour map for identity chips
    ├── fieldGeometry.ts        perspective math, formation slots
    ├── FieldSurface.tsx        the turf SVG
    ├── FieldPanel.tsx          SVG + overlaid slots
    ├── SlotCards.tsx           FilledSlot / EmptySlot, four states
    ├── PlayerRow.tsx           one row (exports ROW_HEIGHT)
    ├── PlayerList.tsx          virtualized viewport, sticky headers, keyboard
    ├── FilterBar.tsx           search + selects + checkbox
    ├── CapHeader.tsx           hero cap number, progress, CTA
    ├── QuotaPills.tsx          segmented position counters
    ├── WelcomeModal.tsx        onboarding
    ├── LeagueModal.tsx         name-your-team
    ├── DraftBoard.tsx          container: state + layout only
    └── ui/
        ├── Select.tsx
        └── Checkbox.tsx
```

`DraftBoard.tsx` went from 1,469 lines to 226 and holds no styling — just state, derived values
and layout. **Aim for that split on other pages: a container that owns state, leaf components
that own presentation.** Extract before restyling; converting a 1,000-line file in place is
where behaviour quietly changes.

---

## Converting another page

1. Audit first. Inventory the inline styles and count how often each value appears across the
   codebase — that tells you which token each maps to.
2. Extract leaf components with **no styling changes**, as its own commit. Verify it renders
   identically before restyling anything.
3. Convert bottom-up: leaves, then containers. A converted child fighting an unconverted parent
   wastes time.
4. Delete orphaned style objects, keyframes and now-unused state as you go.
5. Verify per step: `npx tsc --noEmit`, `npx eslint <path>`, and load the page.

### Shared primitives

Build with these rather than reimplementing per page.

| Component | Use for |
|---|---|
| `components/ui/StatCard` | Eyebrow + number + sub. `size="display"` for a page's one hero number, `section` otherwise. `numeric` is on by default — turn it off for word values. `bare` drops card chrome inside an existing panel |
| `components/ui/SectionHeader` | Panel heading with optional sub and right-hand chip. **Section identity comes from the label, not a slab of colour** |
| `components/ui/ProgressBar` | Filled track. `tone="auto"` goes amber past 90% and red at 100% — that's the cap rule; anything that isn't a budget stays `emerald` |
| `components/ui/EmptyState` | One line of direction plus an optional action |
| `components/ui/PositionChip` | Position/slot badge. **Neutral by default — see below** |
| `components/ui/RosterRow` | The player row, on all four surfaces |
| `components/ui/Icon` | The icon set. **Never use emoji as UI** — it renders differently per platform and can't inherit colour |
| `components/positions.ts` | `POS_COLORS`, `positionColor()`, `positionLabel()` |
| `components/teamColors.ts` | `teamColor()` for team identity dots |

⚠️ **`POS_COLORS` may only be defined in `components/positions.ts`.** It previously existed in
three files with three different shapes *and three different palettes* — WR was `#f59e0b` on
Transfers and `#ea580c` on the draft board, so the same position was a different colour depending
on the page.

⚠️ **Position badges are neutral gray; position colour is for bars and dots.** This is an existing
app-wide convention (the identical gray pill was duplicated in `market/page.tsx` and
`RosterList.tsx`). `PositionChip` defaults to neutral; pass `tone="position"` only when the chip
is itself the colour key for something adjacent.

#### RosterRow is composition, not variants

The row appears on the draft list, the roster table, the transfers squad list and the market
movers. Those differ in what they let you *do* — add/remove, swap, select, nothing — so the row
owns identity, alignment and state, and each page passes its own `trailing` value and `action`:

```tsx
<RosterRow
  player={player}
  badge="FLEX"                      // optional slot label
  secondary={<MatchupBadge … />}    // optional second line
  trailing={<Price … />}            // right-aligned value
  action={<AddButton … />}          // trailing control
  state={{ selected, eligible, dimmed, live, busy, active }}
  disabledReason="All 4 RB spots are filled"
  onClick={…}
/>
```

**Don't add a `variant` prop.** That would make the row know every page's semantics and grow a
branch per page — the same trap called out for the field slot cards.

### Shared components (converted)

`components/PlayerProfileModal.tsx` and `components/TeamLogo.tsx` are on the system as of the
cross-page pass. They render on Dashboard, My Team, Transfers, Market, League, the draft board
and the lineup field — **check all of them when changing either.**

### The field is shared — don't fork it

`components/field/` is the one field implementation. `LiveTeamField.tsx` (the old
CSS-transform copy) has been deleted.

```
components/field/
├── fieldGeometry.ts     perspective math (see The field SVG above)
├── FieldSurface.tsx     the turf SVG
├── FieldPanel.tsx       generic shell: takes `slots` + `renderSlot`
├── cardStyles.ts        shared card box + focus ring
├── types.ts             FieldPlayer, PlacedSlot
├── slots.ts             ⚠️ canonical lineup slot rules — see below
├── formations.ts        where each starter stands
├── LineupSlotCard.tsx   lineup card (live / selected / eligible / dimmed)
├── LineupField.tsx      live lineup: swap, live scoring, bench
└── LiveStatsModal.tsx   live stat breakdown
```

`FieldPanel` is generic over slot content. The draft board supplies add/remove cards
(`DraftField.tsx`); the lineup supplies live-scoring cards. **Add a sibling component rather than
growing either with mode flags.**

⚠️ **`components/field/slots.ts` is the only place lineup eligibility may be defined.** It used to
exist twice — in the dashboard field and the roster list, with different shapes, both feeding
`/api/roster/swap`. Keeping them in sync was luck, and that is how the "WR3 isn't a real FLEX" bug
shipped. `roster_slot` values are persisted in MySQL; never rename them.

⚠️ `app/dashboard/_components/Sidebar.tsx`: keep `display` in `className`, never inline. An
inline `display` overrides the `md:hidden` breakpoint class and shows the mobile bar at every
width — that bug has already shipped once.
