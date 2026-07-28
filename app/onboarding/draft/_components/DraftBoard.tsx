'use client';

import Image from 'next/image';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatPlayerName } from '@/lib/format';
import TeamLogo from '@/components/TeamLogo';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import type { Matchup } from '@/lib/schedule';

export interface DraftPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  current_price: number;
  season_points: number;
  last_year_points: number;
  ownership_pct: number;
  trades_in: number;
  trades_out: number;
  price_pct_change: number;
  projected_next_week: number;
}

export interface PublicLeague {
  id: number;
  name: string;
  season_year: number;
  salary_cap: number;
  max_members: number;
  member_count: number;
}

// ─── Quotas ───────────────────────────────────────────────────────────────────
const CAP          = 100_000_000;
const QUOTA        = { QB: 2, RB: 3, FLEX: 5 }; // FLEX = WR+TE combined
const TOTAL_SLOTS  = 10;

// Deep green HUD gradient — the app's actual brand tone (dark green / white / green
// accent), replacing the generic navy-fintech background this screen had before.
const HUD_BG = 'linear-gradient(135deg, #04150c 0%, #0a2e1a 55%, #0f3d24 100%)';

const POS_COLORS: Record<string, { bg: string; text: string; bar: string; light: string }> = {
  QB: { bg: '#eff6ff', text: '#2563eb', bar: '#2563eb', light: 'rgba(37,99,235,0.14)' },
  RB: { bg: '#ecfdf5', text: '#059669', bar: '#059669', light: 'rgba(5,150,105,0.14)' },
  WR: { bg: '#fff7ed', text: '#ea580c', bar: '#ea580c', light: 'rgba(234,88,12,0.14)' },
  TE: { bg: '#faf5ff', text: '#9333ea', bar: '#9333ea', light: 'rgba(147,51,234,0.14)' },
};

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'];

// $0.5M increments from $18M down to $1M, e.g. "$17.5M", "$17M", ...
const PRICE_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Any Price', value: null },
  ...Array.from({ length: 28 }, (_, i) => {
    const m = 18 - i * 0.5;
    return { label: `$${m}M`, value: Math.round(m * 1_000_000) };
  }),
];

const SORT_OPTIONS = [
  { key: 'price_desc',         label: 'Price: High to Low' },
  { key: 'price_asc',          label: 'Price: Low to High' },
  { key: 'season_points',      label: 'Total Points This Year' },
  { key: 'last_year_points',   label: 'Points Last Year' },
  { key: 'ownership_pct',      label: '% Selected' },
  { key: 'trades_in',          label: 'Trades In' },
  { key: 'trades_out',         label: 'Trades Out' },
  { key: 'rising',             label: 'Highest Rising' },
  { key: 'falling',            label: 'Highest Falling' },
  { key: 'projected_next_week', label: 'Projected Points Next Week' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['key'];

function sortPlayers(list: DraftPlayer[], key: SortKey): DraftPlayer[] {
  const sorted = [...list];
  switch (key) {
    case 'price_desc':          return sorted.sort((a, b) => Number(b.current_price) - Number(a.current_price));
    case 'price_asc':           return sorted.sort((a, b) => Number(a.current_price) - Number(b.current_price));
    case 'season_points':       return sorted.sort((a, b) => b.season_points - a.season_points);
    case 'last_year_points':    return sorted.sort((a, b) => b.last_year_points - a.last_year_points);
    case 'ownership_pct':       return sorted.sort((a, b) => b.ownership_pct - a.ownership_pct);
    case 'trades_in':           return sorted.sort((a, b) => b.trades_in - a.trades_in);
    case 'trades_out':          return sorted.sort((a, b) => b.trades_out - a.trades_out);
    case 'rising':              return sorted.sort((a, b) => b.price_pct_change - a.price_pct_change);
    case 'falling':             return sorted.sort((a, b) => a.price_pct_change - b.price_pct_change);
    case 'projected_next_week': return sorted.sort((a, b) => b.projected_next_week - a.projected_next_week);
    default:                    return sorted;
  }
}

// ─── Pseudo-3D perspective helpers ─────────────────────────────────────────────
// The camera sits behind OUR OWN goal (bottom of screen, near/large) tilted
// down, looking north up the field toward the OPPONENT's goal (top of screen,
// far/small) — like FPL's squad pitch, but the team scores toward the top.
// Nominal x/y coordinates below get remapped through these at render time so
// everything converges toward a vanishing point near the top.
// The field itself only occupies the bottom portion of the container — its
// far/top edge (back of the end zone) stops well short of the container's own
// top edge instead of running all the way up, leaving a plain blank margin
// above it.
const FIELD_TOP_Y = 24;
// More birds-eye than horizon-level: a wider top (less narrowing), gentler
// scale falloff, and a gentler compression curve (see yardToY's exponent)
// all make the far end zone read as closer/less "way off in the distance."
const FIELD_TOP_WIDTH_PCT = 68; // visible width of the trapezoid at y=0 (top/far)
const SCALE_AT_TOP    = 0.75;
const SCALE_AT_BOTTOM = 1.15;
// The turf's bottom edge is drawn wider than the container itself and relies
// on the container's overflow:hidden to crop it — so the sidelines exit off
// the left/right edges of the screen instead of converging into a visible
// bottom-left/bottom-right corner.
const FIELD_BOTTOM_OVERFLOW_PCT = 35;

function widthAtDepth(y: number): number {
  return FIELD_TOP_WIDTH_PCT + (100 - FIELD_TOP_WIDTH_PCT) * (y / 100);
}
function remapX(x: number, y: number): number {
  return 50 + (x - 50) * (widthAtDepth(y) / 100);
}
function depthScale(y: number): number {
  return SCALE_AT_TOP + (SCALE_AT_BOTTOM - SCALE_AT_TOP) * (y / 100);
}

// The camera sits AT the 25-yard line (25 yards from their goal) — nothing
// south of it is ever in frame. This is a closer/more zoomed-in vantage point
// than midfield would be, while the far/top edge (the end zone, FIELD_TOP_Y,
// THEIR_GOAL_Y) stays exactly where it was. Maps "yards from the camera
// toward their goal" (0 = camera/25-yard line, 25 = their goal) to a screen
// y% — eased (not linear) so far-away yard lines compress together near the
// vanishing point instead of being evenly spaced, matching real perspective
// foreshortening.
const CAMERA_Y            = 96; // near/bottom — right at the camera (the 25)
const CAMERA_YARDS_TO_GOAL = 25; // how many real yards are visible at all
// The end zone is only 10 real yards deep (vs. 25 for the field-of-play
// stretch shown here) and this far from camera everything is heavily
// compressed, so its screen band has to be much thinner than the field's
// last 10-yard stretch, not the same size — hence a small value close to the
// vanishing point. Unchanged from before per "keep the end zone where it is."
const THEIR_GOAL_Y  = 3; // far/top — the goal line; end zone band is 0 to this
const GOALPOST_Y    = 1; // back of the end zone, right at the vanishing point
function yardToY(yardsFromCamera: number): number {
  const t = Math.max(0, Math.min(1, yardsFromCamera / CAMERA_YARDS_TO_GOAL));
  const eased = 1 - Math.pow(1 - t, 1.25);
  return CAMERA_Y - eased * (CAMERA_Y - THEIR_GOAL_Y);
}

// Yard lines within the visible 25-yard stretch (the 20 and the 10).
const YARD_LINES = [5, 15].map(yardsFromCamera => ({
  key: yardsFromCamera,
  y: yardToY(yardsFromCamera),
}));

// Continuous hash-mark ticks every yard (not just at the two labeled lines),
// like the inbounds lines on a real field.
const YARD_TICKS = Array.from({ length: 24 }, (_, i) => i + 1).map(yardsFromCamera => ({
  key: yardsFromCamera,
  y: yardToY(yardsFromCamera),
}));

// ─── Stadium crowd (fills the blank margin above the field) ───────────────────
// Deterministic PRNG (mulberry32) — Math.random() here would give the server
// render and the client's first render different values for the exact same
// dots, and React would throw a hydration mismatch on every one of them.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CROWD_COLORS = [
  '#c53030', '#dd6b20', '#d69e2e', '#38a169', '#3182ce', '#5a67d8',
  '#805ad5', '#d53f8c', '#e2e8f0', '#a0aec0', '#718096', '#2d3748',
  '#f6e05e', '#fefcbf', '#fbd38d', '#feb2b2', '#9ae6b4', '#90cdf4',
];

interface CrowdDot { x: number; y: number; w: number; h: number; color: string; opacity: number }

// yMin/yMax are % within this tier's own band; depth (0=far edge of the tier,
// 1=near edge) drives both size and brightness, same idea as depthScale for
// the field itself — the tier closer to the field reads bigger/punchier.
function generateCrowd(seed: number, count: number, yMin: number, yMax: number, sizeMin: number, sizeMax: number): CrowdDot[] {
  const rand = mulberry32(seed);
  const dots: CrowdDot[] = [];
  for (let i = 0; i < count; i++) {
    const y = yMin + rand() * (yMax - yMin);
    const depth = (y - yMin) / (yMax - yMin);
    const size = sizeMin + depth * (sizeMax - sizeMin) + rand() * 1.1;
    dots.push({
      x: rand() * 100,
      y,
      w: size,
      h: size * (1.1 + rand() * 0.3),
      color: CROWD_COLORS[Math.floor(rand() * CROWD_COLORS.length)],
      opacity: 0.5 + depth * 0.35 + rand() * 0.15,
    });
  }
  return dots;
}

// Upper deck: further from the field, smaller/dimmer dots. Lower deck: right
// above the field, bigger/brighter dots. Fixed seeds keep both decks stable
// across re-renders instead of reshuffling every time.
const UPPER_DECK_CROWD = generateCrowd(1001, 240, 6, 40, 2, 3.6);
const LOWER_DECK_CROWD = generateCrowd(2002, 300, 50, 97, 3.2, 6);
const STADIUM_LIGHT_X = [12, 34, 66, 88];

// ─── Formation slot definitions ───────────────────────────────────────────────
// Nominal x/y (0=top/far, 100=bottom/near) — x gets remapped via remapX above.
// All 10 drafted players (2 QB, 3 RB, 5 WR/TE) get an on-field slot — no
// separate bench area. Same front-to-back depth logic as a real shotgun snap:
// the 5 WR/TE are shallowest (closest to their goal, on the line of
// scrimmage), the 3 RBs a few yards behind that, and the 2 QBs deepest of all
// ten (furthest from their goal).
const FORMATION_SLOTS = [
  { id: 'FLEX1',  posGroup: 'FLEX', label: 'WR/TE', x: 8,  y: 18 },
  { id: 'FLEX2',  posGroup: 'FLEX', label: 'WR/TE', x: 29, y: 18 },
  { id: 'FLEX3',  posGroup: 'FLEX', label: 'WR/TE', x: 50, y: 18 },
  { id: 'FLEX4',  posGroup: 'FLEX', label: 'WR/TE', x: 71, y: 18 },
  { id: 'FLEX5',  posGroup: 'FLEX', label: 'WR/TE', x: 92, y: 18 },
  { id: 'RB1',    posGroup: 'RB',   label: 'RB',    x: 25, y: 48 },
  { id: 'RB2',    posGroup: 'RB',   label: 'RB',    x: 50, y: 48 },
  { id: 'RB3',    posGroup: 'RB',   label: 'RB',    x: 75, y: 48 },
  { id: 'QB1',    posGroup: 'QB',   label: 'QB',    x: 35, y: 80 },
  { id: 'QB2',    posGroup: 'QB',   label: 'QB',    x: 65, y: 80 },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function posGroup(pos: string): string {
  if (pos === 'WR' || pos === 'TE') return 'FLEX';
  return pos;
}

function slotColor(group: string): typeof POS_COLORS[string] {
  if (group === 'FLEX') return POS_COLORS.WR;
  return POS_COLORS[group] ?? POS_COLORS.QB;
}

// ─── Player Avatar ─────────────────────────────────────────────────────────────
function PlayerAvatar({ player, size = 48 }: { player: DraftPlayer; size?: number }) {
  const col = POS_COLORS[player.position] ?? POS_COLORS.QB;
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt={player.full_name}
          width={size} height={size} unoptimized
          style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: 8,
          background: '#334155', border: '2px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.35, fontWeight: 800, color: '#fff',
        }}>
          {player.full_name[0]}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: -2, right: -2,
        width: Math.round(size * 0.38), height: Math.round(size * 0.38),
        borderRadius: '50%', background: col.bar,
        border: '1.5px solid #fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.16), fontWeight: 900, color: '#fff',
      }}>
        {player.position[0]}
      </div>
    </div>
  );
}

// ─── Field slot: filled ────────────────────────────────────────────────────────
// Big clickable rectangle cards, FPL-pick-team style, instead of circular
// avatars — used for every one of the 10 on-field slots (no separate bench).
const CARD_W = 112;
const CARD_H = 144;

// Filled cards render slightly bigger than the empty placeholder they
// replace, so a drafted player visually "pops" against the open slots.
const FILLED_W = CARD_W + 7;
const FILLED_H = CARD_H + 6;

function FilledSlot({ player, onRemove }: { player: DraftPlayer; onRemove: () => void }) {
  const displayName = formatPlayerName(player.full_name);
  const col = POS_COLORS[player.position] ?? POS_COLORS.QB;

  return (
    <div
      onClick={onRemove}
      title={`Remove ${player.full_name}`}
      style={{
        width: FILLED_W, height: FILLED_H, borderRadius: 10,
        background: `linear-gradient(160deg, rgba(15,23,42,0.82), rgba(15,23,42,0.62))`,
        border: `1px solid ${col.bar}77`,
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: 'pointer', position: 'relative', overflow: 'hidden',
        animation: 'slot-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
      }}
    >
      {/* Remove X overlay on hover */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 10,
        background: 'rgba(244,63,94,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0, transition: 'opacity 0.15s', zIndex: 2,
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>

      {player.headshot_url ? (
        <Image
          src={player.headshot_url} alt={player.full_name}
          width={68} height={68} unoptimized
          style={{ width: 68, height: 68, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div style={{
          width: 68, height: 68, borderRadius: '50%', background: col.bar,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, color: '#fff',
        }}>
          {player.full_name[0]}
        </div>
      )}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 14, fontWeight: 800, color: '#fff',
          maxWidth: FILLED_W - 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayName}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600, marginTop: 1 }}>
          {player.team_code} · {formatPrice(Number(player.current_price))}
        </div>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 800, color: col.bar, background: '#fff',
        borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em',
      }}>
        {player.position}
      </span>
    </div>
  );
}

// ─── Field slot: empty ─────────────────────────────────────────────────────────
function EmptySlot({ label, group, onClick }: { label: string; group: string; onClick?: () => void }) {
  const col = slotColor(group);
  const baseBg     = `linear-gradient(160deg, ${col.bar}4d, ${col.bar}26)`;
  const hoverBg    = `linear-gradient(160deg, ${col.bar}b0, ${col.bar}75)`;
  const baseBorder  = `1px solid ${col.bar}70`;
  const hoverBorder = `1.5px solid ${col.bar}`;
  const baseShadow  = '0 4px 14px rgba(0,0,0,0.22)';
  const hoverShadow = `0 6px 22px ${col.bar}88`;
  return (
    <div
      onClick={onClick}
      title={onClick ? `Show available ${label} players` : undefined}
      style={{
        width: CARD_W, height: CARD_H, borderRadius: 10,
        background: baseBg,
        border: baseBorder,
        boxShadow: baseShadow,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s, border 0.15s, box-shadow 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        if (!onClick) return;
        const el = e.currentTarget as HTMLElement;
        el.style.background = hoverBg;
        el.style.border = hoverBorder;
        el.style.boxShadow = hoverShadow;
        el.style.transform = 'scale(1.045)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = baseBg;
        el.style.border = baseBorder;
        el.style.boxShadow = baseShadow;
        el.style.transform = 'scale(1)';
      }}
    >
      <div style={{ position: 'relative', width: 34, height: 34 }}>
        <svg viewBox="0 0 24 24" width="34" height="34" fill="rgba(255,255,255,0.92)">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7z" />
        </svg>
        <div style={{
          position: 'absolute', top: -4, left: -6,
          width: 15, height: 15, borderRadius: '50%', background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 900, color: col.bar, lineHeight: 1,
        }}>
          +
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '0.04em' }}>{label}</span>
    </div>
  );
}

// ─── Welcome / how-it-works modal ─────────────────────────────────────────────
const WELCOME_STEPS = [
  {
    icon: '🏈',
    eyebrow: 'Welcome To OneLeague',
    title: 'Draft 2026',
    subtitle: 'The fantasy football league where the market never sleeps.',
    body: 'OneLeague combines classic fantasy football with a live trading market. Draft a squad, set your lineup each week, actively buy and sell players like stocks, and compete globally.',
    accent: '#34d399',
  },
  {
    icon: '📋',
    eyebrow: 'Step 1',
    title: 'Draft Your Squad',
    subtitle: '10 players. $100M cap. One shot.',
    body: null,
    bullets: [
      { icon: '🔵', label: '2 Quarterbacks', sub: 'Your franchise signal-callers' },
      { icon: '🟢', label: '3 Running Backs', sub: 'Ground game and receiving threats' },
      { icon: '🟡', label: '5 Wide Receivers / Tight Ends', sub: 'Any mix — all count as flex spots' },
    ],
    accent: '#60a5fa',
  },
  {
    icon: '📈',
    eyebrow: 'Step 2',
    title: 'Trade the Market',
    subtitle: 'Prices move in real time — buy low, sell high.',
    body: 'Every buy pushes a player\'s price up; every sell pushes it down. Weekly prices also reset based on performance vs. projections and momentum. Your market cap starts at $100M, but grows or shrinks with your P&L.',
    callout: {
      label: 'P&L Example',
      text: 'Buy a player for $5M → sell for $8M → your cap grows by $3M. Lose on a trade and your cap shrinks.',
    },
    accent: '#fbbf24',
  },
  {
    icon: '🏆',
    eyebrow: 'Step 3',
    title: 'Compete & Win',
    subtitle: 'Weekly lineups. Season-long standings.',
    body: 'Each week, set your starting lineup from your active roster. Your starters earn fantasy points based on real NFL performance. Compete in private leagues with friends or go head-to-head in global public leagues.',
    bullets: [
      { icon: '📅', label: 'Weekly lineup decisions', sub: 'Start your best 6 — your other 4 sit on the bench and score nothing' },
      { icon: '🌐', label: 'Global public leagues', sub: 'Compete against the world' },
      { icon: '🔒', label: 'Private leagues', sub: 'Invite friends with a code' },
    ],
    accent: '#a78bfa',
  },
] as const;

function WelcomeModal({ userName, onClose }: { userName: string; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = WELCOME_STEPS[step];
  const isLast = step === WELCOME_STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(5,8,20,0.92)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        borderRadius: 24, overflow: 'hidden',
        boxShadow: '0 40px 100px rgba(0,0,0,0.7)',
        animation: 'modal-in 0.4s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        {/* Hero banner */}
        <div style={{
          padding: '32px 32px 28px',
          background: `linear-gradient(135deg, #070a16 0%, #0d1f3c 60%, #0f2a1e 100%)`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle grid pattern */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }} />

          {/* Glow orb */}
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 160, height: 160, borderRadius: '50%',
            background: s.accent, opacity: 0.12, filter: 'blur(40px)',
            transition: 'background 0.4s',
          }} />

          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 40, marginBottom: 10, lineHeight: 1 }}>{s.icon}</div>
            {step === 0 ? (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
                  marginBottom: 10,
                }}>
                  {s.eyebrow}
                </div>
                <div style={{
                  fontSize: 40, fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  margin: '0 0 14px',
                  color: '#fff',
                }}>
                  {s.title}
                </div>
              </>
            ) : (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: s.accent, marginBottom: 6,
                  transition: 'color 0.3s',
                }}>
                  {s.eyebrow}
                </div>
                <h2 style={{
                  fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em',
                  color: '#fff', margin: '0 0 6px',
                }}>
                  {s.title}
                </h2>
              </>
            )}
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>
              {s.subtitle}
            </p>
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
            {WELCOME_STEPS.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 3, borderRadius: 99, transition: 'all 0.3s',
                  background: i === step ? s.accent : 'rgba(255,255,255,0.15)',
                  width: i === step ? 24 : 8,
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ background: '#fff', padding: '24px 32px 28px' }}>
          {s.body && (
            <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: '0 0 16px' }}>
              {s.body}
            </p>
          )}

          {'bullets' in s && s.bullets && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {s.bullets.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 10, background: '#f8fafc',
                  border: '1px solid #f1f5f9',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{b.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {'callout' in s && s.callout && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 12,
              background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
              border: '1px solid #fde68a',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                {s.callout.label}
              </div>
              <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                {s.callout.text}
              </div>
            </div>
          )}

          {/* CTA row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20, alignItems: 'center' }}>
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                style={{
                  padding: '9px 16px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#fff',
                  fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer',
                }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => isLast ? onClose() : setStep(s => s + 1)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12, border: 'none',
                background: `linear-gradient(135deg, ${s.accent} 0%, ${s.accent}cc 100%)`,
                fontSize: 14, fontWeight: 800, color: '#fff', cursor: 'pointer',
                boxShadow: `0 4px 16px ${s.accent}44`,
                transition: 'all 0.2s',
              }}
            >
              {isLast
                ? `Let's Draft, ${userName.split(' ')[0]} →`
                : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── League joining modal ──────────────────────────────────────────────────────
function LeagueModal({
  publicLeagues,
  teamName,
  playerIds,
  season,
  onClose,
}: {
  publicLeagues: PublicLeague[];
  teamName: string;
  playerIds: number[];
  season: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'public' | 'code'>('public');
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState(teamName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = name.trim().length >= 2 && (selectedLeague !== null || inviteCode.trim().length >= 4);

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: name.trim(),
          player_ids: playerIds,
          league_id: tab === 'public' ? selectedLeague : undefined,
          invite_code: tab === 'code' ? inviteCode.trim() : undefined,
          season_year: season,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Something went wrong'); return; }
      router.push(`/dashboard?season=${season}`);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(7,10,22,0.88)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 24, width: '100%', maxWidth: 520,
        boxShadow: '0 32px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
        animation: 'modal-in 0.35s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
            Step 2 of 2
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', margin: 0 }}>
            Join a League
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
            Compete against other GMs to win the season.
          </p>
        </div>

        <div style={{ padding: '20px 28px 24px' }}>
          {/* Team name */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Team Name
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. The Dream Team"
              maxLength={40}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 10,
                border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 600,
                color: '#0f172a', background: '#f8fafc', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
            {(['public', 'code'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelectedLeague(null); setInviteCode(''); setError(''); }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  background: tab === t ? '#fff' : 'transparent',
                  color: tab === t ? '#0f172a' : '#94a3b8',
                  boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {t === 'public' ? '🌐 Public Leagues' : '🔒 Invite Code'}
              </button>
            ))}
          </div>

          {/* Public leagues list */}
          {tab === 'public' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {publicLeagues.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
                  No public leagues available right now.
                </div>
              )}
              {publicLeagues.map(league => {
                const full = league.member_count >= league.max_members;
                const pct  = Math.round((league.member_count / league.max_members) * 100);
                const active = selectedLeague === league.id;
                return (
                  <div
                    key={league.id}
                    onClick={() => !full && setSelectedLeague(active ? null : league.id)}
                    style={{
                      padding: '10px 14px', borderRadius: 12, cursor: full ? 'default' : 'pointer',
                      border: `1.5px solid ${active ? '#059669' : '#e2e8f0'}`,
                      background: active ? '#f0fdf4' : full ? '#fafafa' : '#fff',
                      opacity: full ? 0.5 : 1, transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: active ? '#059669' : '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'background 0.15s',
                    }}>
                      {active
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <div style={{ flex: 1, height: 3, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: '#059669', borderRadius: 99, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, flexShrink: 0 }}>
                          {league.member_count}/{league.max_members}
                        </span>
                      </div>
                    </div>
                    {full && <span style={{ fontSize: 10, fontWeight: 700, color: '#f43f5e' }}>FULL</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Invite code input */}
          {tab === 'code' && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                Invite Code
              </label>
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. ALPHA-2025"
                maxLength={20}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', fontSize: 14, fontWeight: 700,
                  color: '#0f172a', background: '#f8fafc', outline: 'none',
                  boxSizing: 'border-box', letterSpacing: '0.08em',
                }}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                Ask your league commissioner for your invite code.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 12,
                border: '1.5px solid #e2e8f0', background: '#fff',
                fontSize: 13, fontWeight: 700, color: '#64748b',
                cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                flex: 2, padding: '10px 0', borderRadius: 12, border: 'none',
                background: canSubmit && !submitting
                  ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                  : '#e2e8f0',
                fontSize: 13, fontWeight: 800, color: canSubmit && !submitting ? '#fff' : '#94a3b8',
                cursor: canSubmit && !submitting ? 'pointer' : 'default',
                transition: 'all 0.15s', boxShadow: canSubmit && !submitting ? '0 4px 14px rgba(16,185,129,0.35)' : 'none',
              }}
            >
              {submitting ? 'Creating your squad...' : '🏈 Start Playing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DraftBoard({
  players,
  publicLeagues,
  userName,
  season,
  matchups,
}: {
  players: DraftPlayer[];
  publicLeagues: PublicLeague[];
  userName: string;
  season: number;
  matchups: Record<string, Matchup>;
}) {
  const [selected, setSelected]     = useState<DraftPlayer[]>([]);
  const [slotAssignment, setSlotAssignment] = useState<Record<string, number>>({}); // slotId -> playerId
  const [pos, setPos]               = useState('ALL');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [profileId, setProfileId]   = useState<number | null>(null);
  const [showModal, setShowModal]   = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [justAdded, setJustAdded]   = useState<number | null>(null);
  const [sortBy, setSortBy]         = useState<SortKey>('price_desc');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [maxPrice, setMaxPrice]     = useState<number | null>(null);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const PAGE_SIZE = 20;

  const teams = useMemo(
    () => Array.from(new Set(players.map(p => p.team_code))).sort(),
    [players]
  );

  // ── Derived quota counts ──────────────────────────────────────────────────
  const qbCount   = selected.filter(p => p.position === 'QB').length;
  const rbCount   = selected.filter(p => p.position === 'RB').length;
  const flexCount = selected.filter(p => p.position === 'WR' || p.position === 'TE').length;
  const totalCost = selected.reduce((s, p) => s + Number(p.current_price), 0);
  const capLeft   = CAP - totalCost;
  const isComplete = qbCount === QUOTA.QB && rbCount === QUOTA.RB && flexCount === QUOTA.FLEX;

  function canAdd(player: DraftPlayer): boolean {
    if (selected.find(p => p.id === player.id)) return false;
    const pg = posGroup(player.position);
    if (pg === 'QB'   && qbCount   >= QUOTA.QB)   return false;
    if (pg === 'RB'   && rbCount   >= QUOTA.RB)   return false;
    if (pg === 'FLEX' && flexCount >= QUOTA.FLEX)  return false;
    if (totalCost + Number(player.current_price) > CAP) return false;
    return true;
  }

  function addPlayer(player: DraftPlayer) {
    if (!canAdd(player)) return;
    const pg = posGroup(player.position);
    const emptySlot = FORMATION_SLOTS.find(slot => slot.posGroup === pg && !(slot.id in slotAssignment));
    setSelected(prev => [...prev, player]);
    if (emptySlot) {
      setSlotAssignment(prev => ({ ...prev, [emptySlot.id]: player.id }));
    }
    setJustAdded(player.id);
    setTimeout(() => setJustAdded(null), 600);
  }

  function removePlayer(playerId: number) {
    setSelected(prev => prev.filter(p => p.id !== playerId));
    setSlotAssignment(prev => {
      const next = { ...prev };
      for (const slotId of Object.keys(next)) {
        if (next[slotId] === playerId) delete next[slotId];
      }
      return next;
    });
  }

  // ── Assign players to formation slots ─────────────────────────────────────
  // Slot assignment is stable per-player (set once on add, cleared once on
  // remove) rather than re-derived from array order — otherwise removing one
  // player would "slide" every later same-position player into a lower slot.
  const filledSlots = useMemo(() => {
    const map: Record<string, DraftPlayer> = {};
    for (const [slotId, playerId] of Object.entries(slotAssignment)) {
      const player = selected.find(p => p.id === playerId);
      if (player) map[slotId] = player;
    }
    return map;
  }, [selected, slotAssignment]);

  // ── Filtered, sorted & paginated list ─────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = players
      .filter(p => {
        if (pos === 'ALL') return true;
        if (pos === 'FLEX') return p.position === 'WR' || p.position === 'TE';
        return p.position === pos;
      })
      .filter(p => !q || p.full_name.toLowerCase().includes(q) || p.team_code.toLowerCase().includes(q))
      .filter(p => teamFilter === 'ALL' || p.team_code === teamFilter)
      .filter(p => maxPrice == null || Number(p.current_price) <= maxPrice)
      .filter(p => !affordableOnly || Number(p.current_price) <= capLeft);
    return sortPlayers(list, sortBy);
  }, [players, pos, search, teamFilter, maxPrice, affordableOnly, sortBy, capLeft]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [pos, search, teamFilter, maxPrice, affordableOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Quota badge helper ────────────────────────────────────────────────────
  function QuotaBadge({ label, current, max, color }: { label: string; current: number; max: number; color: string }) {
    const done = current === max;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', borderRadius: 20,
        background: done ? 'rgba(52,211,153,0.18)' : current > 0 ? `${color}26` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${done ? 'rgba(52,211,153,0.5)' : current > 0 ? `${color}70` : 'rgba(255,255,255,0.1)'}`,
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: done ? '#34d399' : color, letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: done ? '#34d399' : '#fff' }}>{current}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>/ {max}</span>
        {done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif', fontWeight: 400,
    }}>
      <style>{`
        @keyframes slot-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes modal-in {
          0%   { transform: translateY(20px) scale(0.97); opacity: 0; }
          100% { transform: translateY(0)    scale(1);    opacity: 1; }
        }
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }
      `}</style>

      {/* ── LEFT PANEL ────────────────────────────────────────────────────────── */}
      <div style={{
        width: '20%', minWidth: 260, maxWidth: 320,
        display: 'flex', flexDirection: 'column',
        background: '#fff', borderRight: '1px solid #e2e8f0',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {/* Panel header */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
              Draft Mode · {season}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Pick Your Squad
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              {selected.length}/{TOTAL_SLOTS} selected
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height: '100%', borderRadius: 99, transition: 'width 0.3s ease',
              width: `${(selected.length / TOTAL_SLOTS) * 100}%`,
              background: isComplete
                ? 'linear-gradient(90deg, #059669, #10b981)'
                : 'linear-gradient(90deg, #3b82f6, #10b981)',
            }} />
          </div>

          {/* Position filter tabs */}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 10 }}>
            {POSITIONS.map(p => {
              const col = POS_COLORS[p];
              const active = pos === p || (pos === 'FLEX' && (p === 'WR' || p === 'TE'));
              return (
                <button
                  key={p}
                  onClick={() => setPos(p)}
                  style={{
                    padding: '4px 11px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 800,
                    background: active ? (col?.bar ?? '#059669') : '#f1f5f9',
                    color: active ? '#fff' : '#94a3b8',
                    boxShadow: active ? `0 2px 8px ${col?.bar ?? '#059669'}55` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players..."
              style={{
                width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                fontSize: 12, borderRadius: 20, border: '1px solid #e2e8f0',
                background: '#f8fafc', color: '#0f172a', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Sort + team filter */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortKey)}
              style={{
                flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 11, fontWeight: 600,
                borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc',
                color: '#0f172a', outline: 'none',
              }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <select
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
              style={{
                width: 84, padding: '6px 8px', fontSize: 11, fontWeight: 600,
                borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc',
                color: '#0f172a', outline: 'none',
              }}
            >
              <option value="ALL">All Teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Max price filter */}
          <select
            value={maxPrice == null ? 'any' : String(maxPrice)}
            onChange={e => setMaxPrice(e.target.value === 'any' ? null : Number(e.target.value))}
            style={{
              width: '100%', marginTop: 6, padding: '6px 8px', fontSize: 11, fontWeight: 600,
              borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc',
              color: '#0f172a', outline: 'none', boxSizing: 'border-box',
            }}
          >
            {PRICE_PRESETS.map(preset => (
              <option key={preset.label} value={preset.value == null ? 'any' : preset.value}>
                {preset.label}
              </option>
            ))}
          </select>

          {/* Affordable-only toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
            fontSize: 11, fontWeight: 600, color: '#475569', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={affordableOnly}
              onChange={e => setAffordableOnly(e.target.checked)}
            />
            Show affordable players only
          </label>
        </div>

        {/* Player rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {paginated.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              No players found
            </div>
          )}
          {paginated.map(player => {
            const col      = POS_COLORS[player.position] ?? POS_COLORS.QB;
            const isAdded  = !!selected.find(p => p.id === player.id);
            const addable  = !isAdded && canAdd(player);
            const justPop  = justAdded === player.id;

            return (
              <div
                key={player.id}
                onClick={() => setProfileId(player.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px',
                  borderBottom: '1px solid #f8fafc',
                  opacity: !isAdded && !addable && selected.length > 0 ? 0.45 : 1,
                  transition: 'all 0.15s',
                  background: isAdded ? col.bg : 'transparent',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!isAdded) (e.currentTarget as HTMLElement).style.background = '#fafafa'; }}
                onMouseLeave={e => { if (!isAdded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Avatar */}
                <div style={{ flexShrink: 0 }}>
                  {player.headshot_url ? (
                    <Image
                      src={player.headshot_url} alt={player.full_name}
                      width={32} height={32} unoptimized
                      style={{ width: 32, height: 32, objectFit: 'contain', display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#64748b',
                    }}>
                      {player.full_name[0]}
                    </div>
                  )}
                </div>

                {/* Name / meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatPlayerName(player.full_name)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', background: '#f1f5f9', borderRadius: 20, padding: '1px 5px' }}>{player.position}</span>
                    <TeamLogo code={player.team_code} size={11} />
                    <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{player.team_code}</span>
                  </div>
                </div>

                {/* Price */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', flexShrink: 0, marginRight: 4 }}>
                  {formatPrice(Number(player.current_price))}
                </div>

                {/* Add / Added button */}
                <button
                  onClick={e => { e.stopPropagation(); isAdded ? removePlayer(player.id) : addPlayer(player); }}
                  disabled={!isAdded && !addable}
                  style={{
                    width: 26, height: 26, borderRadius: 8, border: 'none', cursor: isAdded || addable ? 'pointer' : 'default',
                    background: isAdded ? '#fef2f2' : addable ? col.bg : '#f8fafc',
                    color: isAdded ? '#f43f5e' : addable ? col.text : '#cbd5e1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.15s',
                    animation: justPop ? 'pulse-ring 0.5s ease' : 'none',
                  }}
                >
                  {isAdded ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Pagination footer */}
        {totalPages > 1 && (
          <div style={{
            padding: '8px 14px', borderTop: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fafafa',
          }}>
            <span style={{ fontSize: 10, color: '#94a3b8' }}>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: 3 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{
                  width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0',
                  background: safePage === 1 ? '#f8fafc' : '#fff',
                  color: safePage === 1 ? '#cbd5e1' : '#475569',
                  cursor: safePage === 1 ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                }}
              >‹</button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{
                  width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0',
                  background: safePage === totalPages ? '#f8fafc' : '#fff',
                  color: safePage === totalPages ? '#cbd5e1' : '#475569',
                  cursor: safePage === totalPages ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 600,
                }}
              >›</button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Cap & quota strip */}
        <div style={{
          padding: '10px 20px', flexShrink: 0,
          background: HUD_BG, borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', gap: 16,
          flexWrap: 'wrap',
        }}>
          {/* Welcome */}
          <div style={{ marginRight: 4 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              Welcome, {userName.split(' ')[0]}
            </div>
            <div style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em',
              color: '#fff', lineHeight: 1.2,
            }}>
              Build Your Team
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

          {/* Cap remaining */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cap Left</div>
            <div style={{
              fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em',
              color: capLeft < 20_000_000 ? '#f87171' : capLeft < 60_000_000 ? '#fbbf24' : '#34d399',
            }}>
              {formatPrice(capLeft)}
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 32, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

          {/* Quota badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <QuotaBadge label="QB"    current={qbCount}   max={QUOTA.QB}   color="#60a5fa" />
            <QuotaBadge label="RB"    current={rbCount}   max={QUOTA.RB}   color="#34d399" />
            <QuotaBadge label="WR/TE" current={flexCount} max={QUOTA.FLEX} color="#ff5900" />
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Finalize button */}
          <button
            onClick={() => isComplete && setShowModal(true)}
            disabled={!isComplete}
            style={{
              padding: '9px 22px', borderRadius: 12, border: 'none',
              background: isComplete
                ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                : 'rgba(255,255,255,0.07)',
              color: isComplete ? '#fff' : 'rgba(255,255,255,0.25)',
              fontSize: 13, fontWeight: 800, cursor: isComplete ? 'pointer' : 'default',
              transition: 'all 0.2s',
              boxShadow: isComplete ? '0 4px 16px rgba(16,185,129,0.4)' : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {isComplete ? '✓ Finalize Squad →' : `${TOTAL_SLOTS - selected.length} selections left`}
          </button>
        </div>

        {/* Bench/scoring reminder */}
        <div style={{
          padding: '6px 20px', flexShrink: 0,
          background: '#08170f', borderBottom: '1px solid rgba(255,255,255,0.06)',
          borderLeft: '3px solid #fbbf24',
          fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 600,
        }}>
           Only 6 of these 10 will start each week — you'll set your exact lineup from your team page once the season begins.
        </div>

        {/* Football field — pseudo-3D trapezoid, low camera behind our own
            goal tilted downward (FPL-pitch style). See the perspective helpers
            above FORMATION_SLOTS for the math. */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>

          {/* Stadium crowd — fills the blank margin above the field. Two
              tiers (upper deck far/dim, lower deck near/bright) separated by
              a concourse walkway, stadium lights along the top, a wall band
              right where the stands meet the turf. */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: `${FIELD_TOP_Y}%`,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #10131b 0%, #191f2c 28%, #222a3c 52%, #2a3247 76%, #333c53 100%)',
          }}>
            {/* Stadium lights */}
            {STADIUM_LIGHT_X.map((x, i) => (
              <div key={i} style={{
                position: 'absolute', top: '3%', left: `${x}%`, transform: 'translate(-50%, 0)',
                width: 12, height: 6, borderRadius: 3,
                background: 'radial-gradient(circle, #fffbeb 0%, #fef3c7 55%, transparent 100%)',
                boxShadow: '0 0 14px 5px rgba(254,243,199,0.45)',
              }} />
            ))}

            {/* Upper deck */}
            {UPPER_DECK_CROWD.map((d, i) => (
              <div key={`u${i}`} style={{
                position: 'absolute', top: `${d.y}%`, left: `${d.x}%`,
                width: d.w, height: d.h, borderRadius: '50%',
                background: d.color, opacity: d.opacity,
              }} />
            ))}

            {/* Concourse walkway between decks */}
            <div style={{
              position: 'absolute', top: '41%', left: 0, right: 0, height: '6%',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.15))',
            }} />

            {/* Lower deck */}
            {LOWER_DECK_CROWD.map((d, i) => (
              <div key={`l${i}`} style={{
                position: 'absolute', top: `${d.y}%`, left: `${d.x}%`,
                width: d.w, height: d.h, borderRadius: '50%',
                background: d.color, opacity: d.opacity,
              }} />
            ))}

            {/* Wall/tunnel level right above the turf */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '6%',
              background: 'linear-gradient(180deg, #3d4358, #20233a)',
              borderBottom: '2px solid rgba(255,255,255,0.15)',
            }} />
          </div>

          {/* Turf layer — clipped to the trapezoid, purely decorative */}
          <div style={{
            position: 'absolute', top: `${FIELD_TOP_Y}%`, left: 0, right: 0, bottom: 0,
            clipPath: `polygon(${50 - FIELD_TOP_WIDTH_PCT / 2}% 0%, ${50 + FIELD_TOP_WIDTH_PCT / 2}% 0%, ${100 + FIELD_BOTTOM_OVERFLOW_PCT}% 100%, ${-FIELD_BOTTOM_OVERFLOW_PCT}% 100%)`,
            background: `repeating-linear-gradient(180deg, #1a7a32 0px, #1a7a32 34px, #1e8838 34px, #1e8838 68px)`,
          }}>
            {/* Atmospheric haze — subtle, just enough to sell distance without
                hiding the opponent's end zone up there (we want that visible). */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 14%)',
            }} />

            {/* Their end zone — the scoring target, far away and small */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: `${THEIR_GOAL_Y}%`,
              background: 'rgba(0,0,0,0.25)', borderBottom: '1.5px solid rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 7, fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                END ZONE
              </div>
            </div>

            {/* Yard lines, converging with depth */}
            {YARD_LINES.map(({ key, y }) => (
              <div key={key} style={{ position: 'absolute', left: 0, right: 0, top: `${y}%`, height: 1.5, background: 'rgba(255,255,255,0.32)' }} />
            ))}

            {/* Hash marks — continuous ticks every yard, two inner rows like
                the inbounds lines on a real field, not just at the labeled lines */}
            {YARD_TICKS.map(({ key, y }) => (
              <div key={`hash-${key}`}>
                {[38, 62].map(nominalX => (
                  <div key={nominalX} style={{
                    position: 'absolute', top: `${y}%`, left: `${remapX(nominalX, y)}%`,
                    width: 8 * depthScale(y), height: 1.2,
                    background: 'rgba(255,255,255,0.3)', transform: 'translate(-50%, -50%)',
                  }} />
                ))}
              </div>
            ))}
          </div>

          {/* Player layer — not clipped, so cards never get sliced by the
              trapezoid edge, but positioned with the same perspective math. */}
          <div style={{ position: 'absolute', top: `${FIELD_TOP_Y}%`, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
            {/* Goalpost — back of the end zone, anchored at its base. Anchor
                (translate) and scale are kept on separate elements — combining
                a %-based translate with scale() in one transform list scales
                the translate distance too and the post ends up in the wrong
                place (or effectively invisible). */}
            <div style={{
              position: 'absolute',
              left: `${remapX(50, GOALPOST_Y)}%`,
              top: `${GOALPOST_Y}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: 1,
            }}>
              <svg
                width="90" height="130" viewBox="0 0 90 130"
                style={{ display: 'block', overflow: 'visible', transform: `scale(${depthScale(GOALPOST_Y)})`, transformOrigin: 'bottom center' }}
              >
                <line x1="45" y1="130" x2="45" y2="70" stroke="#f2c14e" strokeWidth="6" strokeLinecap="round" />
                <line x1="13" y1="70"  x2="77" y2="70" stroke="#f2c14e" strokeWidth="6" strokeLinecap="round" />
                <line x1="13" y1="70"  x2="13" y2="8"  stroke="#f2c14e" strokeWidth="6" strokeLinecap="round" />
                <line x1="77" y1="70"  x2="77" y2="8"  stroke="#f2c14e" strokeWidth="6" strokeLinecap="round" />
              </svg>
            </div>

            {FORMATION_SLOTS.map(slot => {
              const player = filledSlots[slot.id];
              const scale = depthScale(slot.y);
              return (
                <div
                  key={slot.id}
                  style={{
                    position: 'absolute',
                    left: `${remapX(slot.x, slot.y)}%`,
                    top: `${slot.y}%`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    zIndex: 10 + Math.round(slot.y),
                    pointerEvents: 'auto',
                  }}
                >
                  {player
                    ? <FilledSlot player={player} onRemove={() => removePlayer(player.id)} />
                    : <EmptySlot label={slot.label} group={slot.posGroup} onClick={() => setPos(slot.posGroup)} />
                  }
                </div>
              );
            })}

            {/* Center tip — floats in the big empty stretch of field between
                the camera and the formation up near the opponent's goal */}
            {selected.length === 0 && (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: '25%', transform: 'translateY(-50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
                  borderRadius: 16, padding: '12px 20px', textAlign: 'center',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🏈</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Select players from the left</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>They'll appear in formation here</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── LEAGUE MODAL ──────────────────────────────────────────────────────── */}
      {showModal && (
        <LeagueModal
          publicLeagues={publicLeagues}
          teamName={`${userName.split(' ')[0]}'s Squad`}
          playerIds={selected.map(p => p.id)}
          season={season}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* ── WELCOME MODAL ─────────────────────────────────────────────────────── */}
      {showWelcome && (
        <WelcomeModal
          userName={userName}
          onClose={() => setShowWelcome(false)}
        />
      )}

      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
