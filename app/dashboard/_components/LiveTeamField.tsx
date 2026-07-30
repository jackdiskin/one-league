'use client';

import Image from 'next/image';
import { useMemo, useState, useCallback, useTransition, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveStats, type LivePlayerStats } from '@/hooks/useLiveStats';
import { formatPrice, formatPoints, formatPlayerName } from '@/lib/format';
import TeamLogo from '@/components/TeamLogo';
import PlayerProfileModal from '@/components/PlayerProfileModal';

export interface FieldPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  current_price: number;
  headshot_url: string | null;
  external_player_id: string | null;
  roster_slot: string;
  projected_points?: number | null;
}

export interface FieldSlot {
  player: FieldPlayer | null;
  pos: string;
  x: number;
  y: number;
}

const SELECT_COLOR = '#f59e0b';

// ---------------------------------------------------------------------------
// Pseudo-3D perspective field — same treatment as the draft screen
// (app/onboarding/draft/_components/DraftBoard.tsx): a low camera behind our
// own goal, tilted down, looking toward the far/small end zone. Player x/y
// (0-100, tuned by MyTeamSummary's getPositions) get remapped through these
// so everything converges toward a vanishing point at the top.
// ---------------------------------------------------------------------------
const FIELD_TOP_WIDTH_PCT = 68;
const SCALE_AT_TOP    = 0.75;
const SCALE_AT_BOTTOM = 1.15;
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

const CAMERA_YARDS_TO_GOAL = 25;
const THEIR_GOAL_Y = 3;
const GOALPOST_Y   = 1;
function yardToY(yardsFromCamera: number): number {
  const t = Math.max(0, Math.min(1, yardsFromCamera / CAMERA_YARDS_TO_GOAL));
  const eased = 1 - Math.pow(1 - t, 1.25);
  return 96 - eased * (96 - THEIR_GOAL_Y);
}

// Visible yard lines (the 20 and the 10 — camera sits at the 25) paired with
// their real on-field number, so YARD_LINES doubles as the label source.
const YARD_LINES = [
  { yardsFromCamera: 5,  label: '20', y: yardToY(5) },
  { yardsFromCamera: 15, label: '10', y: yardToY(15) },
];
const YARD_TICKS = Array.from({ length: 24 }, (_, i) => i + 1).map(yardsFromCamera => ({
  key: yardsFromCamera, y: yardToY(yardsFromCamera),
}));

// ---------------------------------------------------------------------------
// Layout bands — fixed pixel heights so the pitch's own depth math (0-100)
// always resolves against a known height, which is what keeps every card
// placement below collision-free regardless of viewport width. The
// crowd:pitch ratio matches the draft screen's FIELD_TOP_Y (24%) exactly;
// the bench is an additional band appended below since the draft screen has
// no bench (all 11 players get an on-field slot there).
// ---------------------------------------------------------------------------
const PITCH_H = 640;
const FIELD_TOP_Y_PCT = 24;
const CROWD_H = Math.round(PITCH_H * FIELD_TOP_Y_PCT / (100 - FIELD_TOP_Y_PCT));
const BENCH_H = 200;
const FIELD_H = CROWD_H + PITCH_H + BENCH_H;

// One consistent box for every card on the field — starters and bench alike
// — matching the draft screen's FilledSlot dimensions/avatar size exactly.
const CARD_W = 119;
const CARD_H = 150;
const AVATAR_SIZE = 68;

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

const UPPER_DECK_CROWD = generateCrowd(1001, 240, 6, 40, 2, 3.6);
const LOWER_DECK_CROWD = generateCrowd(2002, 300, 50, 97, 3.2, 6);
const STADIUM_LIGHT_X = [12, 34, 66, 88];

// Named starter slots and which positions may occupy them — FLEX1 is the true
// FLEX slot (RB/WR/TE); everyone else is fixed to their own position.
const SLOT_ELIGIBLE_POSITIONS: Record<string, string[]> = {
  QB1: ['QB'], RB1: ['RB'], RB2: ['RB'],
  WR1: ['WR', 'TE'], WR2: ['WR', 'TE'], WR3: ['WR', 'TE'],
  FLEX1: ['RB', 'WR', 'TE'],
};

function isEligibleSwap(a: FieldPlayer, b: FieldPlayer): boolean {
  if (a.id === b.id) return false;
  const aBench = a.roster_slot === 'BENCH';
  const bBench = b.roster_slot === 'BENCH';
  if (aBench === bBench) return false; // one must be a starter, the other bench
  const starter = aBench ? b : a;
  const bench   = aBench ? a : b;
  const eligible = SLOT_ELIGIBLE_POSITIONS[starter.roster_slot] ?? [starter.position];
  return eligible.includes(bench.position);
}

// ---------------------------------------------------------------------------
// Position badge — same white pill shape/size as the draft screen's
// FilledSlot, but never color-coded by position (standing rule — matches the
// gray PosBadge used everywhere else in the app).
// ---------------------------------------------------------------------------
function PositionBadge({ position }: { position: string }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 800, color: '#64748b', background: '#fff',
      borderRadius: 20, padding: '1px 7px', letterSpacing: '0.04em', flexShrink: 0,
    }}>
      {position}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action menu — "Sub" / "View Profile", opened by clicking a card
// ---------------------------------------------------------------------------
function ActionMenu({ onSub, onProfile }: { onSub: () => void; onProfile: () => void }) {
  const rowStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    width: '100%', padding: '9px 14px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'left',
    whiteSpace: 'nowrap',
  };
  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: '#fff', borderRadius: 10, overflow: 'hidden',
        boxShadow: '0 10px 28px rgba(0,0,0,0.3)', border: '1px solid #e2e8f0',
        minWidth: 136,
      }}
    >
      <button onClick={onSub} style={rowStyle} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={SELECT_COLOR} strokeWidth="2.5" strokeLinecap="round">
          <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
        Sub
      </button>
      <div style={{ height: 1, background: '#f1f5f9' }} />
      <button onClick={onProfile} style={rowStyle} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
        </svg>
        View Profile
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live stats modal
// ---------------------------------------------------------------------------
function LiveStatsModal({
  player, stats, onClose, hidePrices = false,
}: {
  player: FieldPlayer;
  stats: LivePlayerStats;
  onClose: () => void;
  hidePrices?: boolean;
}) {
  const t = stats.totals;

  type StatRow = { label: string; value: string; highlight?: boolean };
  const rows: StatRow[] = [];

  if (t.passingYards   > 0) rows.push({ label: 'Passing yards',    value: String(t.passingYards) });
  if (t.passingTds     > 0) rows.push({ label: 'Passing TDs',      value: String(t.passingTds),   highlight: true });
  if (t.interceptions  > 0) rows.push({ label: 'Interceptions',    value: String(t.interceptions) });

  if (t.rushingYards   > 0) rows.push({ label: 'Rushing yards',    value: String(t.rushingYards) });
  if (t.rushingTds     > 0) rows.push({ label: 'Rushing TDs',      value: String(t.rushingTds),   highlight: true });

  if (t.receptions     > 0) rows.push({ label: 'Receptions',       value: String(t.receptions) });
  if (t.receivingYards > 0) rows.push({ label: 'Receiving yards',  value: String(t.receivingYards) });
  if (t.receivingTds   > 0) rows.push({ label: 'Receiving TDs',    value: String(t.receivingTds),  highlight: true });

  const fgMade = (t.fg0_39 ?? 0) + (t.fg40_49 ?? 0) + (t.fg50Plus ?? 0);
  const fgAtt  = fgMade + (t.fgMissed ?? 0);
  if (t.fg0_39    > 0) rows.push({ label: 'FG made (0–39 yd)',    value: String(t.fg0_39) });
  if (t.fg40_49   > 0) rows.push({ label: 'FG made (40–49 yd)',   value: String(t.fg40_49) });
  if (t.fg50Plus  > 0) rows.push({ label: 'FG made (50+ yd)',     value: String(t.fg50Plus) });
  if (t.fgMissed  > 0) rows.push({ label: 'FG missed',            value: String(t.fgMissed) });
  if (fgAtt       > 0) rows.push({ label: 'FG total',             value: `${fgMade}/${fgAtt}` });
  if (t.xpMade    > 0) rows.push({ label: 'Extra points',         value: String(t.xpMade) });
  if (t.xpMissed  > 0) rows.push({ label: 'Extra points missed',  value: String(t.xpMissed) });

  if (t.twoPtConversions > 0) rows.push({ label: '2-pt conversions', value: String(t.twoPtConversions), highlight: true });
  if (t.fumblesLost      > 0) rows.push({ label: 'Fumbles lost',     value: String(t.fumblesLost) });

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(7,10,22,0.65)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <style>{`
        @keyframes modal-in {
          from { transform: translateY(10px) scale(0.98); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes live-dot-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>

      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden',
        animation: 'modal-in 0.22s cubic-bezier(0.34,1.4,0.64,1) both',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {player.headshot_url ? (
              <Image
                src={player.headshot_url} alt={player.full_name}
                width={48} height={48} unoptimized
                style={{
                  width: 48, height: 48, objectFit: 'cover', display: 'block',
                  border: '2.5px solid #10b981', borderRadius: '50%',
                }}
              />
            ) : (
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#334155',
                border: '2.5px solid #10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, color: '#fff',
              }}>
                {player.full_name[0]}
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 8, fontWeight: 800, color: '#34d399',
                background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)',
                borderRadius: 20, padding: '1px 6px', letterSpacing: '0.06em',
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#10b981', flexShrink: 0,
                  animation: 'live-dot-pulse 1.4s ease-in-out infinite',
                }} />
                LIVE
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <TeamLogo code={player.team_code} size={12} />
                {player.team_code}
              </span>
            </div>
            <div style={{
              fontSize: 17, fontWeight: 900, color: '#fff',
              letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {formatPlayerName(player.full_name)}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(52,211,153,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              pts
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#34d399', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {formatPoints(t.fantasyPointsTotal)}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, border: 'none', flexShrink: 0,
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              alignSelf: 'flex-start',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '8px 0 4px' }}>
          {rows.length === 0 ? (
            <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
              No stats recorded yet
            </div>
          ) : (
            rows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 18px',
                  borderBottom: i < rows.length - 1 ? '1px solid #f1f5f9' : 'none',
                  background: row.highlight ? 'rgba(245,158,11,0.05)' : 'transparent',
                }}
              >
                <span style={{
                  fontSize: 13, fontWeight: 500,
                  color: row.highlight ? '#92400e' : '#475569',
                }}>
                  {row.label}
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 800,
                  color: row.highlight ? '#d97706' : '#0f172a',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {row.value}
                </span>
              </div>
            ))
          )}
        </div>

        {!hidePrices && (
          <div style={{
            padding: '10px 18px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: '1px solid #f1f5f9',
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>Market price</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
              {formatPrice(player.current_price)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Consolidated pitch card — one cohesive box (avatar + name + meta + an
// attached projected-points footer bar), draft-board style, instead of
// several independently-floating pieces stacked with their own shadows/
// margins. That consolidation is what keeps neighboring cards from visually
// colliding once the field gets crowded.
// ---------------------------------------------------------------------------
function Card({
  player, x, y, scale, hidePrices = false,
  interactive = false, selected = false, eligible = false, dimmed = false, isSwapping = false,
  onCardClick, onShowStats, livePoints,
}: {
  player: FieldPlayer; x: number; y: number; scale: number;
  hidePrices?: boolean;
  interactive?: boolean;
  selected?: boolean;
  eligible?: boolean;
  dimmed?: boolean;
  isSwapping?: boolean;
  onCardClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onShowStats?: () => void;
  livePoints: number | null;
}) {
  const displayName = formatPlayerName(player.full_name);
  const isLive = livePoints !== null;
  const clickable = interactive || isLive;
  const hasProj = player.projected_points != null;
  const stateBorder = selected
    ? `1.5px solid ${SELECT_COLOR}`
    : isLive
      ? '1.5px solid #10b981'
      : '1px solid rgba(255,255,255,0.25)';
  const stateGlow = selected
    ? '0 6px 18px rgba(0,0,0,0.35), 0 0 14px rgba(245,158,11,0.5)'
    : isLive
      ? '0 6px 18px rgba(0,0,0,0.35), 0 0 14px rgba(16,185,129,0.45)'
      : '0 6px 18px rgba(0,0,0,0.35)';

  return (
    <div
      onClick={clickable ? (interactive ? onCardClick : onShowStats) : undefined}
      style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        width: CARD_W, height: CARD_H,
        cursor: clickable ? 'pointer' : 'default',
        zIndex: selected ? 30 : 10 + Math.round(y),
        opacity: isSwapping ? 0.5 : dimmed ? 0.35 : 1,
        filter: dimmed ? 'grayscale(1)' : 'none',
        transition: 'opacity 0.15s, filter 0.15s',
      }}
    >
      <div style={{
        position: 'relative', width: '100%', height: '100%', borderRadius: 10,
        background: 'linear-gradient(160deg, rgba(15,23,42,0.82), rgba(15,23,42,0.62))',
        border: stateBorder, boxShadow: stateGlow, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 4,
          padding: '8px 6px 4px',
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {player.headshot_url ? (
              <Image
                src={player.headshot_url} alt={player.full_name}
                width={AVATAR_SIZE} height={AVATAR_SIZE} unoptimized
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, objectFit: 'contain', display: 'block' }}
              />
            ) : (
              <div style={{
                width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: '50%', background: '#334155',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, fontWeight: 800, color: '#fff',
              }}>
                {player.full_name[0]}
              </div>
            )}

            {eligible && (
              <div style={{
                position: 'absolute', inset: -4, borderRadius: '50%',
                border: `2.5px dashed ${SELECT_COLOR}`, pointerEvents: 'none',
              }} />
            )}

            {isLive && (
              <div
                onClick={e => { if (interactive) { e.stopPropagation(); onShowStats?.(); } }}
                style={{
                  position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(3,32,18,0.9)', color: '#34d399', fontSize: 9, fontWeight: 900,
                  padding: '1.5px 6px', borderRadius: 20, whiteSpace: 'nowrap',
                  border: '1px solid rgba(52,211,153,0.5)', letterSpacing: '-0.01em',
                  cursor: interactive ? 'pointer' : 'inherit',
                }}
              >
                {formatPoints(livePoints)}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.2,
              maxWidth: CARD_W - 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 1 }}>
              <TeamLogo code={player.team_code} size={10} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                {player.team_code}{!hidePrices ? ` · ${formatPrice(player.current_price)}` : ''}
              </span>
            </div>
            {isLive && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 3,
                fontSize: 7.5, fontWeight: 800, color: '#34d399',
                background: 'rgba(52,211,153,0.14)', borderRadius: 20,
                padding: '1px 5px', letterSpacing: '0.04em',
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: '50%', background: '#10b981', flexShrink: 0,
                  animation: 'live-dot-pulse 1.4s ease-in-out infinite',
                }} />
                LIVE
              </span>
            )}
          </div>

          <PositionBadge position={player.position} />
        </div>

        {hasProj && (
          <div style={{
            flexShrink: 0, width: '100%', textAlign: 'center',
            padding: '3px 4px', background: 'rgba(255,255,255,0.08)',
            borderTop: '1px solid rgba(255,255,255,0.14)',
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.02em' }}>
              Proj {formatPoints(player.projected_points as number)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptySlotCard
// ---------------------------------------------------------------------------
function EmptySlotCard({ pos, x, y, scale }: { pos: string; x: number; y: number; scale: number }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      width: CARD_W, height: CARD_H, zIndex: 10 + Math.round(y), opacity: 0.55,
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 12,
        border: '2px dashed rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.14)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 900, color: '#fff',
        }}>
          {pos}
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>Empty</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yard-line numbers — two digits straddling the actual yard-line stripe
// (which renders underneath, at the same y), mirrored on the left and right
// like a real broadcast field, instead of unlabeled lines.
// ---------------------------------------------------------------------------
function YardNumber({ y, label }: { y: number; label: string }) {
  const scale = depthScale(y);
  return (
    <>
      {[22, 78].map(nominalX => (
        <div
          key={nominalX}
          style={{
            position: 'absolute', top: `${y}%`, left: `${remapX(nominalX, y)}%`,
            transform: `translate(-50%, -50%) scale(${scale})`,
            display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: 'Arial Narrow, Arial, sans-serif', fontWeight: 900,
            fontSize: 24, color: 'rgba(255,255,255,0.55)',
            textShadow: '0 1px 3px rgba(0,0,0,0.35)',
            userSelect: 'none', pointerEvents: 'none',
          }}
        >
          {label.split('').map((digit, i) => <span key={i}>{digit}</span>)}
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main field component
// ---------------------------------------------------------------------------
export default function LiveTeamField({
  positions, hidePrices = false, bench = [], teamId, interactive = false, season,
}: {
  positions: FieldSlot[];
  hidePrices?: boolean;
  bench?: FieldPlayer[];
  teamId?: number;
  interactive?: boolean;
  season?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const starters = useMemo(() => positions.flatMap(s => s.player ? [s.player] : []), [positions]);
  const allPlayers = useMemo(() => [...starters, ...bench], [starters, bench]);

  const playerIds = useMemo(
    () => allPlayers.flatMap(p => p.external_player_id ? [p.external_player_id] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPlayers.map(p => p.external_player_id).join(',')],
  );
  const liveStats = useLiveStats(playerIds);

  const [modal, setModal] = useState<{ player: FieldPlayer; stats: LivePlayerStats } | null>(null);
  const [selected, setSelected] = useState<FieldPlayer | null>(null);
  const [swapping, setSwapping] = useState<Set<number>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<{ id: number; rect: DOMRect } | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  const executeSwap = useCallback(async (a: FieldPlayer, b: FieldPlayer) => {
    if (!teamId) return;
    setSwapping(new Set([a.id, b.id]));
    setSelected(null);
    try {
      const res = await fetch('/api/roster/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fantasy_team_id: teamId, player_a_id: a.id, player_b_id: b.id }),
      });
      if (!res.ok) throw new Error('Swap failed');
      startTransition(() => router.refresh());
    } catch {
      startTransition(() => router.refresh());
    } finally {
      setSwapping(new Set());
    }
  }, [teamId, router, startTransition]);

  const handleCardClick = useCallback((p: FieldPlayer, e: ReactMouseEvent<HTMLDivElement>) => {
    if (swapping.size > 0) return;
    if (selected) {
      if (selected.id === p.id) { setSelected(null); return; }
      if (isEligibleSwap(selected, p)) { executeSwap(selected, p); return; }
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor(prev => (prev?.id === p.id ? null : { id: p.id, rect }));
  }, [selected, swapping, executeSwap]);

  const handleSub = useCallback((p: FieldPlayer) => {
    setMenuAnchor(null);
    setSelected(prev => {
      if (!prev) return p;
      if (prev.id === p.id) return null;
      if (isEligibleSwap(prev, p)) { executeSwap(prev, p); return null; }
      return p;
    });
  }, [executeSwap]);

  const handleViewProfile = useCallback((p: FieldPlayer) => {
    setMenuAnchor(null);
    setProfileId(p.id);
  }, []);

  return (
    <>
      {menuAnchor != null && (
        <div onClick={() => setMenuAnchor(null)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      )}

      <div style={{ position: 'relative', height: FIELD_H, overflow: 'hidden', background: '#fff' }}>
        <style>{`
          @keyframes live-dot-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.4; transform: scale(0.75); }
          }
        `}</style>

        {/* Stadium crowd */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: CROWD_H,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #10131b 0%, #191f2c 28%, #222a3c 52%, #2a3247 76%, #333c53 100%)',
        }}>
          {STADIUM_LIGHT_X.map((x, i) => (
            <div key={i} style={{
              position: 'absolute', top: '3%', left: `${x}%`, transform: 'translate(-50%, 0)',
              width: 12, height: 6, borderRadius: 3,
              background: 'radial-gradient(circle, #fffbeb 0%, #fef3c7 55%, transparent 100%)',
              boxShadow: '0 0 14px 5px rgba(254,243,199,0.45)',
            }} />
          ))}
          {UPPER_DECK_CROWD.map((d, i) => (
            <div key={`u${i}`} style={{
              position: 'absolute', top: `${d.y}%`, left: `${d.x}%`,
              width: d.w, height: d.h, borderRadius: '50%',
              background: d.color, opacity: d.opacity,
            }} />
          ))}
          <div style={{
            position: 'absolute', top: '41%', left: 0, right: 0, height: '6%',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.15))',
          }} />
          {LOWER_DECK_CROWD.map((d, i) => (
            <div key={`l${i}`} style={{
              position: 'absolute', top: `${d.y}%`, left: `${d.x}%`,
              width: d.w, height: d.h, borderRadius: '50%',
              background: d.color, opacity: d.opacity,
            }} />
          ))}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '6%',
            background: 'linear-gradient(180deg, #3d4358, #20233a)',
            borderBottom: '2px solid rgba(255,255,255,0.15)',
          }} />
        </div>

        {/* Pitch — fixed-height band between the crowd and the bench strip */}
        <div style={{ position: 'absolute', top: CROWD_H, left: 0, right: 0, height: PITCH_H }}>
          {/* Turf, clipped to the trapezoid, purely decorative */}
          <div style={{
            position: 'absolute', inset: 0,
            clipPath: `polygon(${50 - FIELD_TOP_WIDTH_PCT / 2}% 0%, ${50 + FIELD_TOP_WIDTH_PCT / 2}% 0%, ${100 + FIELD_BOTTOM_OVERFLOW_PCT}% 100%, ${-FIELD_BOTTOM_OVERFLOW_PCT}% 100%)`,
            background: `repeating-linear-gradient(180deg, #1a7a32 0px, #1a7a32 34px, #1e8838 34px, #1e8838 68px)`,
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 14%)',
            }} />

            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: `${THEIR_GOAL_Y}%`,
              background: 'rgba(0,0,0,0.25)', borderBottom: '1.5px solid rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 7, fontWeight: 900, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                END ZONE
              </div>
            </div>

            {YARD_LINES.map(({ yardsFromCamera, y }) => (
              <div key={yardsFromCamera} style={{ position: 'absolute', left: 0, right: 0, top: `${y}%`, height: 1.5, background: 'rgba(255,255,255,0.32)' }} />
            ))}

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

            {YARD_LINES.map(({ yardsFromCamera, y, label }) => (
              <YardNumber key={yardsFromCamera} y={y} label={label} />
            ))}
          </div>

          {/* Player layer — not clipped, so cards never get sliced by the
              trapezoid edge, but positioned with the same perspective math. */}
          <div style={{ position: 'absolute', inset: 0 }}>
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

            {positions.map(({ player, pos, x, y }, i) => {
              const leftPct = remapX(x, y);
              const scale = depthScale(y);
              if (!player) return <EmptySlotCard key={`empty-${pos}-${i}`} pos={pos} x={leftPct} y={y} scale={scale} />;
              const liveData = liveStats.get(player.external_player_id ?? '');
              const livePoints = liveData?.totals.fantasyPointsTotal ?? null;
              const isSelected = selected?.id === player.id;
              const eligible = selected != null && !isSelected && isEligibleSwap(selected, player);
              const dimmed = selected != null && !isSelected && !eligible;
              return (
                <Card
                  key={player.id}
                  player={player} x={leftPct} y={y} scale={scale}
                  livePoints={livePoints}
                  hidePrices={hidePrices}
                  interactive={interactive}
                  selected={isSelected}
                  eligible={eligible}
                  dimmed={dimmed}
                  isSwapping={swapping.has(player.id)}
                  onCardClick={e => handleCardClick(player, e)}
                  onShowStats={liveData ? () => setModal({ player, stats: liveData }) : undefined}
                />
              );
            })}
          </div>
        </div>

        {/* Bench — sectioned off at the bottom of the field, on-turf, FPL style */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: BENCH_H,
          background: 'linear-gradient(180deg, #0d3d1c 0%, #0a3016 100%)',
          borderTop: '2px solid rgba(255,255,255,0.4)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px 4px', flexShrink: 0,
          }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              Bench
            </span>
            {selected && (
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: SELECT_COLOR }}>
                Tap a player to swap with {formatPlayerName(selected.full_name)}
              </span>
            )}
          </div>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            gap: 16, padding: '2px 16px 10px', overflowX: 'auto',
          }}>
            {bench.length === 0 && (
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: 'auto' }}>No bench players</div>
            )}
            {bench.map(player => {
              const liveData = liveStats.get(player.external_player_id ?? '');
              const livePoints = liveData?.totals.fantasyPointsTotal ?? null;
              const isSelected = selected?.id === player.id;
              const eligible = selected != null && !isSelected && isEligibleSwap(selected, player);
              const dimmed = selected != null && !isSelected && !eligible;
              return (
                <div key={player.id} style={{ position: 'relative', width: CARD_W, height: CARD_H, flexShrink: 0 }}>
                  <Card
                    player={player} x={50} y={50} scale={1}
                    livePoints={livePoints}
                    hidePrices={hidePrices}
                    interactive={interactive}
                    selected={isSelected}
                    eligible={eligible}
                    dimmed={dimmed}
                    isSwapping={swapping.has(player.id)}
                    onCardClick={e => handleCardClick(player, e)}
                    onShowStats={liveData ? () => setModal({ player, stats: liveData }) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {menuAnchor && (() => {
        const menuPlayer = allPlayers.find(p => p.id === menuAnchor.id);
        if (!menuPlayer) return null;
        const rect = menuAnchor.rect;
        const menuWidth = 136;
        const estHeight = 96;
        const flipUp = rect.bottom + estHeight + 12 > window.innerHeight;
        const left = Math.min(
          Math.max(rect.left + rect.width / 2, menuWidth / 2 + 8),
          window.innerWidth - menuWidth / 2 - 8,
        );
        const top = flipUp ? rect.top - 8 : rect.bottom + 8;
        return (
          <div style={{
            position: 'fixed', left, top, zIndex: 200,
            transform: flipUp ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}>
            <ActionMenu onSub={() => handleSub(menuPlayer)} onProfile={() => handleViewProfile(menuPlayer)} />
          </div>
        );
      })()}

      {modal && (
        <LiveStatsModal
          player={modal.player}
          stats={modal.stats}
          onClose={() => setModal(null)}
          hidePrices={hidePrices}
        />
      )}

      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </>
  );
}
