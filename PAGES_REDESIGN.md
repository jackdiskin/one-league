# OneLeague — remaining pages

Companion to `DESIGN.md`. That doc is the system; this one is the work order for applying it to
Dashboard, My Team, Transfers, Market and Leagues, plus one new feature.

**Read `DESIGN.md` first.** Everything below assumes its tokens, type scale, four component
states, and conversion procedure. Where this doc says "per `DESIGN.md`," go read the rule rather
than guessing.

Run this in order. Phase A is shared groundwork — doing it after the pages means five copies of
the same thing.

---

## Phase A — shared foundation

Nothing page-specific happens until these four are done.

### A1. One field component, used everywhere

`app/dashboard/_components/LiveTeamField.tsx` holds a copy of the old CSS-transform field. It
renders on Dashboard **and** My Team. Both need the real one.

Do not restyle the copy. Promote the draft page's field out of `app/onboarding/draft/_components/`
into a shared location (`components/field/`), then delete `LiveTeamField.tsx` and point both
pages at the shared version:

- `fieldGeometry.ts` — unchanged, it's already generic
- `FieldSurface.tsx` — unchanged
- `FieldPanel.tsx` — needs to accept slot content as a render prop or children, since draft slots
  (add/remove, position filter) and lineup slots (projection, live score, swap) are different
- `SlotCards.tsx` — draft-specific. Add a sibling `LineupSlotCard.tsx` rather than growing this
  one with mode flags

Report the import graph before moving anything. If other pages import from the draft folder, that
tells you what else is coupled.

### A2. Convert the two carve-outs

`DESIGN.md` deliberately left `components/PlayerProfileModal.tsx` (5 consumers) and
`components/TeamLogo.tsx` (10 consumers) unconverted, because restyling them changes five pages
at once. **We are now changing five pages at once — this is the pass they were waiting for.**

Convert both first, before any individual page, so the pages inherit them already correct.

### A3. Reconcile the colour drift

Several pages use colours that aren't in the system. Each needs a ruling, not a re-tokenisation of
whatever's currently there:

| Where | Current | Do this |
|---|---|---|
| Transfers — "Budget remaining" callout | cream fill, orange text | `bg-emerald-tint` / `border-emerald-line` / `text-ink`, with the number in `text-ink`. It's information, not a warning |
| Transfers — cap-used progress bar | orange→red gradient | Solid `bg-emerald`. Switch to `bg-warn` above 90% and `bg-down` at 100%. Gradients on chrome are banned |
| Transfers — position group bars | yellow / green / blue | `POS_COLORS` from `types.ts`, which already exists. One source of truth for position identity |
| Market — "Top demand" dash | blue | `text-ink-3` when empty |
| Market — gainers / drops | green / red | Correct already — make sure they're `--color-up` / `--color-down`, not hardcoded |
| Leagues — trophy | 🏆 emoji | An icon. Emoji renders differently on every platform and is the single most obvious "generated" tell on that page |

**Position colours are the one sanctioned exception to emerald-only chrome.** They encode
something real. They come from `POS_COLORS` and nowhere else — no page defines its own.

### A4. Extract shared primitives

The same components are being reimplemented per page. Build these once in `components/ui/`:

- **`StatCard`** — eyebrow, numeral, sub-label. Used on Dashboard, My Team, Market, Transfers, Leagues
- **`EmptyState`** — one line of direction plus an optional action. See the copy rules below
- **`ProgressBar`** — used by cap on Transfers and Draft
- **`SectionHeader`** — title, optional sub, optional right-side chip. Every panel on every page
- **`PositionChip`** — reads from `POS_COLORS`
- **`RosterRow`** — the player row appears in four variants (transfers, roster table, market
  mover, draft). Extract one component with variants; don't build a fourth from scratch

---

## Cross-cutting fixes

These apply to **every** page. Check each one per page rather than assuming.

1. **Every number gets `font-mono tabular-nums`.** Currently almost none do — `$11.5M`, `11/11`,
   `0.0`, `8th`, `16.9`, `+$0.0M`, `88.5%`, `13 members`. This is `DESIGN.md` rule 3 and it's
   violated on all five pages.
2. **The old field's confetti, light blobs, and clipped white wedges** appear anywhere
   `LiveTeamField` renders. Fixed by A1, but verify visually.
3. **Placeholder-as-label.** The Leagues create/join forms have no `<label>`. Every input gets a
   real `<label htmlFor>` per `DESIGN.md`. Placeholders disappear on focus and are invisible to
   screen readers.
4. **Disabled buttons that don't say why.** "Create League" and "Join League" sit dead with no
   explanation. Per `DESIGN.md`, disabled state carries its reason.
5. **Dark panels need a rule.** Dark cards currently appear on Dashboard (projected points),
   Market (High Demand, Sell Pressure), and the old leaderboard (Race Snapshot) with no consistent
   meaning. **Ruling: dark = live or market-state data.** Anything else is a white card. Apply it
   or drop the dark treatment from the ones that don't qualify.
6. **The em-dash placeholder.** `—` in the roster table's LIVE/WK and SEASON columns is ambiguous
   between "zero", "no data", and "not started". Use `text-ink-3` with an explicit short string,
   and set the column header to say what state it's in.
7. **Stat-card row inflation.** Dashboard, Market, and My Team all open with a row of four
   near-identical cards. It's the default dashboard answer and it makes three pages look like one
   page. Keep it where the numbers are genuinely the page's headline; on the others, promote one
   number to `text-display` and demote the rest into the panel they belong to.

---

## Phase B — page conversions

Convert in this order. Each is its own commit series; verify with `npx tsc --noEmit`,
`npx eslint <path>`, and loading the page before moving on.

### B1. Dashboard

- **Hero banner** ("WEEK 1 · Games haven't started yet · 87.9 projected pts"). The projected
  number is currently dimmer than the label beside it, so the hero reads as disabled. It should be
  the brightest element on the panel: `text-display`, mono, `text-turf-chalk`. The navy→green
  gradient is off-system — use a flat `bg-ink` or the turf tokens, no gradient.
- **"Welcome back, {name}"** with emerald on the name is a nice brand moment. Keep it, and use the
  same treatment on `{name}'s Squad` — but nowhere else, or it stops meaning anything.
- **Squad panel** — swap to the shared field (A1).
- **Below-fold cards** — convert per the shared primitives. Report what's down there in the audit;
  the screenshots cut off.

### B2. My Team

Two views, both on this page.

- **Squad view** — Total Points / League Rank stat cards, then the field. Same field swap as B1.
- **Full Roster table** — the densest thing in the app and the best candidate for real table craft:
  - Sticky column headers, `text-eyebrow uppercase text-ink-3`, right-aligned for numeric columns
  - Every numeric cell mono tabular, right-aligned, so columns actually align
  - The starters/bench divider is currently a heavy dark bar — replace with a `SectionHeader` and
    a `border-line` rule. Section identity comes from the label, not a slab of colour
  - Row hover, `focus-visible`, and keyboard navigation per `DESIGN.md`
  - "Move" buttons become the secondary/outline button variant, consistent height
  - Game time and opponent (`Sun 9/13 · 1:00 PM · vs CLE`) is the secondary line — `text-label
    text-ink-3`, and don't let it compete with the player name

### B3. Transfers

Worst colour drift in the app; fix A3 before touching layout.

- **Budget Left / Roster** header card — both numbers mono, `text-display` for budget.
- **My Squad list** — position groups with coloured left bars are good structure; source the
  colours from `POS_COLORS`. Group headers become `SectionHeader` with the count as the right chip.
- **Right panel empty state** — "Select a player (or an open slot) on the left to start a transfer"
  in a dashed box is the same floating-instruction pattern removed from the draft page. Replace
  with a real `EmptyState`: one line of direction in the interface's voice.
- **Salary Cap panel** — the strongest information design on the site right now. Keep the
  structure (cap used %, spent/free split, by-position breakdown), retoken the colours, put every
  number in mono.

### B4. Market

**This page is the product's differentiator and currently the most generic-looking one.** Four
stat cards and two lists is the template answer. Two things to fix beyond conversion:

- **The pre-season zero state is the real design problem.** Every value reads `+$0.0M`, `0.0%`,
  `No drops yet`, `No demand data`. That isn't an edge case — it's what every user sees until
  meaningful volume exists, so it's the page's default state and deserves to be designed, not
  patched. Right now it reads as broken. Give it a deliberate pre-season treatment: say plainly
  that pricing starts moving once games do, and show what *will* appear rather than eight rows of
  zeros. Per `DESIGN.md`, an empty screen is an invitation, not an explanation.
- **Convert first, redesign second.** Get it on the system, then treat the Market page as its own
  design pass. Don't try to do both in one go.

Everything else is a straight conversion: gainers/drops lists become `RosterRow` variants, the
up/down colours are already semantically right, the dark cards stay dark under the ruling in
cross-cutting item 5.

### B5. Leagues

Smallest page, so a good one to end on.

- Trophy emoji → icon (A3).
- Global Rank number → `text-display` mono.
- Both forms get real labels, real field validation, and disabled buttons that state their
  condition ("Enter a league name and a password of at least 4 characters").
- "You're not in any private leagues yet" → `EmptyState` with the create action attached, rather
  than a dashed box floating above two forms that do the same thing.
- "View full standings →" is a link styled as body text; make it the standard link treatment with
  a real focus ring.

---

## Phase C — lineup switching on the field

**This is a behaviour change and the scope rules above do not apply to it.** Everything in Phases
A and B is visual-only. This is new functionality and needs its own commit series, reviewed
separately.

### C0. Audit before designing

Answer these and report before writing anything:

1. Does a lineup-change mutation already exist? The "Move" buttons on My Team suggest yes — find
   the handler and the endpoint it calls.
2. What validates a move server-side — position eligibility (FLEX vs WR/TE vs RB), starter count,
   game-lock?
3. Is there a lock concept already? The Dashboard says "Games haven't started yet," which implies
   a player whose game has kicked off can't be moved.
4. What does the roster shape look like in state — where does `roster_slot` live, and what's the
   minimal change to swap two players?

**If no mutation exists, stop and report.** Writing a new endpoint is a separate conversation, not
part of this.

### C1. Interaction model

Click-to-swap, not drag-and-drop:

1. Click a filled slot → it enters selected state (`ring-2 ring-emerald`), and **every slot it can
   legally swap with lifts while the rest drop to `opacity-55`**. This is the same
   selection-spans-components pattern the draft page uses for position filtering, so it'll already
   feel familiar.
2. Click an eligible slot → the two swap.
3. Click the selected slot again, or press `Escape` → cancel.

Drag-and-drop can come later as an enhancement. It needs a dependency or a hand-roll, it's poor
for keyboard and touch without a parallel path, and click-to-swap has to exist underneath it
anyway.

Bench players need to be reachable from the field. Either a bench strip below the field panel
using the same slot cards, or clicking an empty/starter slot opens the eligible bench list.
Propose one in the audit rather than building both.

### C2. Rules

- **Ineligible slots aren't clickable and say why on hover**, per the `blockedReason()` pattern in
  `DraftBoard.tsx` — a function mirroring the eligibility check case for case, so they can't
  disagree.
- **Locked players** (game started) get a distinct visual state and can't be selected. Don't rely
  on the hover reason alone; the lock should be visible at rest.
- **Optimistic update with rollback.** Swap in local state immediately, fire the mutation, revert
  and surface an error toast on failure. The error explains what happened and what to do, and
  doesn't apologise.
- **Keyboard**: slots are focusable, `Enter` selects, `Enter` on an eligible slot swaps, `Escape`
  cancels. Focus ring uses `focus-visible:ring-offset-turf` since these sit on dark.
- **Reduced motion**: the swap animation goes behind `motion-safe:`.

### C3. Consistency across pages

The same component serves Dashboard and My Team, so behaviour is identical in both. If lineup
changes should be blocked on one page but not the other, that's a prop, not a second
implementation.

---

## Scope rules

**Phases A and B — visual only.** Behaviour, props, handlers, state shape, and SQL unchanged in
effect. Never touch `lib/`, `app/api/`, `hooks/`, `better-auth_migrations/`, `data-pipeline/`, or
`scripts/`. `globals.css` and `app/layout.tsx` are editable.

**Phase C** may add interaction state and call existing mutations. It may **not** add or modify
API routes, SQL, or migrations. If it needs one, stop and report.

**Always:**

- No inline `style={{}}` except computed geometry
- No arbitrary Tailwind values
- No new dependencies without asking
- Don't rename `roster_slot` values. Don't change `QUOTA`
- `Sidebar.tsx`: keep `display` in `className`, never inline — this bug has shipped once already
- Extract leaf components with no styling changes as their own commit, then restyle. Converting a
  large file in place is where behaviour quietly changes

---

## Definition of done

Per page, every line true:

- [ ] Zero `style={{}}` except computed geometry
- [ ] Zero arbitrary Tailwind values
- [ ] Every number mono with tabular figures
- [ ] Every interactive element has hover, `focus-visible`, active, disabled
- [ ] Every disabled control states its reason
- [ ] Every input has a real `<label htmlFor>`
- [ ] No emoji used as UI
- [ ] All colours trace to a token; position colours come from `POS_COLORS`
- [ ] Empty states are invitations, not explanations
- [ ] Loading skeletons match final dimensions
- [ ] Copy is sentence case, active voice, derived from constants not hardcoded
- [ ] `npx tsc --noEmit` and `npx eslint` clean

And overall:

- [ ] `LiveTeamField.tsx` deleted, one shared field component
- [ ] `PlayerProfileModal.tsx` and `TeamLogo.tsx` converted
- [ ] No page defines a colour, spacing value, or type size locally
- [ ] `DESIGN.md` updated with any new shared primitives and the dark-panel ruling
