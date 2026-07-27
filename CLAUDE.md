# OneLeague — Project Context

OneLeague is an FPL-style, budget-based fantasy football platform for the NFL. One global league, one standardized format for all users — no custom leagues, no custom rules.

Claude Code reads this file automatically on startup. Keep it updated as decisions change; it's the fastest way to get a fresh session up to speed.

## Core format

- Budget: $100M per manager
- Roster: 11 players — 2 QB, 3 RB, 5 WR/TE, 1 Kicker
- Starting XI: 1 QB, 2 RB, 3 WR/TE, 1 FLEX (RB/WR/TE), 1 Kicker
- Transfers: 1 free/week, max 2 banked, -8pts per extra transfer
- Auto-subs: DNP triggers sub, position-locked, bench order priority

## Scoring (half-PPR with milestone bonuses)

- Passing: 0.04 pts/yard, 4 pts TD, -2 INT, +2 bonus for 300yd game
- Rushing: 0.1 pts/yard, 6 pts TD, +2 bonus 100yds OR +2 bonus 150yds (tiers are exclusive, not stacked — 150+ yards pays only the 150 bonus)
- Receiving: 0.5/reception, 0.1 pts/yard, 6 pts TD, +2 bonus 100yds
- 40+ yard TD: +2 bonus, all positions
- Fumble lost: -2, 2pt conversion: +2, Return TD: +6
- Display whole numbers, calculate in decimals internally

## Pricing system

**Philosophy:** Net Points Above Average (Net PAA) / VORP-based — price reflects how much better than average a player is at their position, which naturally encodes scarcity.

**Formula direction:**
- Net PAA = Projected pts − Positional starter average
- Positional starter average = avg of top N starters (RB24, WR36, TE12, QB12)
- Price = Floor + (Net PAA / Max Net PAA) × (Ceiling − Floor)
- Anchor: best player (Bijan/CMC/Chase tier) ≈ $18.5M, everything scales from there
- Currently using manual tier-based pricing as the working approach; Net PAA formula not yet fully implemented

**FPL analogy (use this framing when discussing pricing):**
- RB mirrors FPL forwards — scarce, expensive: $4.5M floor, $18.5M ceiling
- WR mirrors FPL midfielders — deep pool: $5M floor, $15-17M ceiling
- TE — bifurcated, elite TE expensive, rest cheap: $4.5M floor, $13-15M ceiling
- QB mirrors FPL defenders — budget position: $4.5M floor, $8-9M ceiling
- Kicker mirrors FPL keepers — dirt cheap, hard cap: $3.5M floor, $5.5M ceiling

**Other pricing mechanics:**
- Daily price changes from ownership % + performance + projections
- Volatility discount for boom/bust players
- IR players: price freeze; Questionable/doubtful: 50% drop rate
- Price cap: ±$3M from starting price (rolling cap discussed, not finalized)
- Intra-week supply/demand: ±0.5% per transaction

**RB tiers (established reference points):**
- Tier 1 (~$18.5M): Bijan Robinson, CMC
- Tier 2 (~$16-17M): Jahmyr Gibbs, De'Von Achane, Jonathon Taylor, James Cook, Ashton Jeanty
- Tier 3 (~$12-13M): Saquon Barkley, Derrick Henry, Kenneth Walker, Breece Hall
- Tier 4 (~$9-10M): Kyren Williams, Josh Jacobs, Omarion Hampton, Tyjae Spears
- Tier 5 (~$6-7M): Handcuffs, committee backs
- Floor (~$4.5-5M): Deep fliers, bench fodder

WR and TE tier pricing not yet finalized. Data sources: FantasyPros 2026 consensus rankings, 2025 actuals, nfl-data-py (nflverse wrapper) under consideration for precise half-PPR historical averages.

## Go-to-market & roadmap

- **Launch:** NFL Season 2026, September 4, 2026. No ghost season — launching directly with the real season.
- **Team:** Solo founder (Jesse) + technical co-founder/dev + marketing/community person.
- **Roadmap:** Hardening (→ Mar 2026) → Community seeding (Apr-Jul 2026, waitlist goal 500-1000) → Pre-launch activation (Aug 2026) → Season live (Sep 2026-Jan 2027) → Offseason debrief (Feb-Apr 2027).
- **GTM channels:** r/fantasyfootball, r/DynastyFF, Discord servers, mid-tier NFL creator partnerships (10k-50k followers), UK/FPL-crossover audience.
- **Positioning:** "One format, one global leaderboard, everyone plays identical rules."
- **Monetization:** Y1 free, no monetization. Y2 premium tier ($4-7/mo) + cosmetics. Y3+ entry fees/prize pools + sponsorships.
- **Licensing:** No license needed for player names/stats/team names (CBC Distribution precedent). NFLPA license for headshots (~$10-25k/yr) deferred to Y2. Team logos not pursued. Prize pools (Y3) require state-by-state DFS compliance — engage DFS attorney 6 months out.

## Brand

- **Name:** OneLeague. **Tagline:** "One League. Everyone In."
- Logo direction: wordmark or single ring — clean, travels well on Reddit/Discord/mobile.
- Palette: dark green background, white type, green accent on "One" / the ring.
- Differentiator vs. Sleeper/ESPN/Yahoo: zero customization, everyone plays identical rules — a real meritocracy, not league-specific results.

## Financial modeling rule — important

When modeling OneLeague costs, use **actual cash out the door**, not fully-loaded "market rate" numbers. Founders are unpaid through Y1-Y2 and the team runs lean.

Realistic Y1 OpEx: **$25-30K total.**
- Personnel: $0 (all founders on equity, no salaries, until Y3)
- Hosting: ~$2K (Supabase/Vercel free tiers + minimal paid)
- Data licensing: $10-15K (Sportradar/SportsData feed)
- Legal & accounting: $2-5K
- Other: $1-2K
- Marketing: $9.2K

Never add phantom personnel costs or "what salaries should be" — only model what Jesse actually pays. Cost ramp begins meaningfully at Y3 when there's revenue and an actual hire.

## Working style notes

- No em dashes in generated text/copy.
- This file should be kept current — when a product, pricing, GTM, or brand decision changes, update the relevant section above rather than leaving it stale.
