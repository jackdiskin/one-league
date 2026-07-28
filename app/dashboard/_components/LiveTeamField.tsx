'use client';

import Image from 'next/image';
import { useMemo, useState, useCallback, useTransition, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveStats, type LivePlayerStats } from '@/hooks/useLiveStats';
import { formatPrice, formatPoints, formatPlayerName } from '@/lib/format';
import TeamLogo from '@/components/TeamLogo';
import PlayerProfileModal from '@/components/PlayerProfileModal';
import type { Matchup } from '@/lib/schedule';

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

function isEligibleSwap(a: FieldPlayer, b: FieldPlayer): boolean {
  if (a.id === b.id) return false;
  const flex = ['WR', 'TE'];
  const sameGroup = (x: string, y: string) => (flex.includes(x) && flex.includes(y)) || x === y;
  if (!sameGroup(a.position, b.position)) return false;
  return (a.roster_slot === 'BENCH') !== (b.roster_slot === 'BENCH');
}

// ---------------------------------------------------------------------------
// Position badge — neutral gray pill, sits inline next to the team code
// (matches the PosBadge style used everywhere else in the app — never
// color-coded by position)
// ---------------------------------------------------------------------------
function PositionBadge({ position }: { position: string }) {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 700, color: '#64748b', background: '#f1f5f9',
      borderRadius: 20, padding: '1px 5px', flexShrink: 0, lineHeight: 1.4,
    }}>
      {position}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Action menu — "Sub" / "View Profile", opened by clicking a card
// ---------------------------------------------------------------------------
// Pure visual menu box — the caller positions it (fixed, viewport-relative)
// so it's never clipped by a scrolling/overflow-hidden ancestor.
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

  // Passing
  if (t.passingYards   > 0) rows.push({ label: 'Passing yards',    value: String(t.passingYards) });
  if (t.passingTds     > 0) rows.push({ label: 'Passing TDs',      value: String(t.passingTds),   highlight: true });
  if (t.interceptions  > 0) rows.push({ label: 'Interceptions',    value: String(t.interceptions) });

  // Rushing
  if (t.rushingYards   > 0) rows.push({ label: 'Rushing yards',    value: String(t.rushingYards) });
  if (t.rushingTds     > 0) rows.push({ label: 'Rushing TDs',      value: String(t.rushingTds),   highlight: true });

  // Receiving
  if (t.receptions     > 0) rows.push({ label: 'Receptions',       value: String(t.receptions) });
  if (t.receivingYards > 0) rows.push({ label: 'Receiving yards',  value: String(t.receivingYards) });
  if (t.receivingTds   > 0) rows.push({ label: 'Receiving TDs',    value: String(t.receivingTds),  highlight: true });

  // Special teams / kicker
  const fgMade = (t.fg0_39 ?? 0) + (t.fg40_49 ?? 0) + (t.fg50Plus ?? 0);
  const fgAtt  = fgMade + (t.fgMissed ?? 0);
  if (t.fg0_39    > 0) rows.push({ label: 'FG made (0–39 yd)',    value: String(t.fg0_39) });
  if (t.fg40_49   > 0) rows.push({ label: 'FG made (40–49 yd)',   value: String(t.fg40_49) });
  if (t.fg50Plus  > 0) rows.push({ label: 'FG made (50+ yd)',     value: String(t.fg50Plus) });
  if (t.fgMissed  > 0) rows.push({ label: 'FG missed',            value: String(t.fgMissed) });
  if (fgAtt       > 0) rows.push({ label: 'FG total',             value: `${fgMade}/${fgAtt}` });
  if (t.xpMade    > 0) rows.push({ label: 'Extra points',         value: String(t.xpMade) });
  if (t.xpMissed  > 0) rows.push({ label: 'Extra points missed',  value: String(t.xpMissed) });

  // Misc
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

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: '16px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {/* Avatar */}
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

          {/* Name + meta */}
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

          {/* Total points */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(52,211,153,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              pts
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#34d399', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {formatPoints(t.fantasyPointsTotal)}
            </div>
          </div>

          {/* Close */}
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

        {/* Stat rows */}
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

        {/* Footer — price */}
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
// PlayerCard (on the pitch)
// ---------------------------------------------------------------------------
function PlayerCard({
  player, x, y, livePoints, hidePrices = false, matchup,
  interactive = false, selected = false, eligible = false, dimmed = false, isSwapping = false,
  onCardClick, onShowStats,
}: {
  player: FieldPlayer; x: number; y: number; livePoints: number | null;
  hidePrices?: boolean;
  matchup?: Matchup;
  interactive?: boolean;
  selected?: boolean;
  eligible?: boolean;
  dimmed?: boolean;
  isSwapping?: boolean;
  onCardClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onShowStats?: () => void;
}) {
  const displayName = formatPlayerName(player.full_name);
  const isLive = livePoints !== null;
  const clickable = interactive || isLive;
  const hasProj = player.projected_points != null;

  return (
    <div
      onClick={clickable ? (interactive ? onCardClick : onShowStats) : undefined}
      style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 5, cursor: clickable ? 'pointer' : 'default', zIndex: selected ? 12 : 10,
        opacity: isSwapping ? 0.5 : dimmed ? 0.35 : 1,
        filter: dimmed ? 'grayscale(1)' : 'none',
        transition: 'opacity 0.15s, filter 0.15s',
      }}
    >
      {/* Price chip */}
      {!hidePrices && (
        <div style={{
          background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
          borderRadius: 20, padding: '3px 9px',
          fontSize: 11, fontWeight: 700, color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          whiteSpace: 'nowrap', letterSpacing: '-0.01em',
        }}>
          {formatPrice(player.current_price)}
        </div>
      )}

      {/* Avatar */}
      <div style={{ position: 'relative' }}>
        {player.headshot_url ? (
          <Image
            src={player.headshot_url} alt={player.full_name}
            width={72} height={72} unoptimized
            style={{
              width: 72, height: 72, objectFit: 'cover', display: 'block',
              border: selected ? `3px solid ${SELECT_COLOR}` : isLive ? '3px solid #10b981' : '3px solid #fff',
              borderRadius: '50%',
              boxShadow: selected
                ? `0 4px 18px rgba(0,0,0,0.45), 0 0 16px rgba(245,158,11,0.5)`
                : isLive
                  ? '0 4px 18px rgba(0,0,0,0.45), 0 0 16px rgba(16,185,129,0.45)'
                  : '0 4px 18px rgba(0,0,0,0.45)',
            }}
          />
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: '#334155',
            border: selected ? `3px solid ${SELECT_COLOR}` : isLive ? '3px solid #10b981' : '3px solid #fff',
            boxShadow: selected
              ? '0 4px 18px rgba(0,0,0,0.45), 0 0 16px rgba(245,158,11,0.5)'
              : isLive
                ? '0 4px 18px rgba(0,0,0,0.45), 0 0 16px rgba(16,185,129,0.45)'
                : '0 4px 18px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700, color: '#fff',
          }}>
            {player.full_name[0]}
          </div>
        )}

        {/* Eligible-target ring */}
        {eligible && (
          <div style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            border: `2.5px dashed ${SELECT_COLOR}`, pointerEvents: 'none',
          }} />
        )}

        {/* Live points overlay */}
        {isLive && (
          <div
            onClick={e => { if (interactive) { e.stopPropagation(); onShowStats?.(); } }}
            style={{
              position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(3,32,18,0.85)', backdropFilter: 'blur(6px)',
              color: '#34d399', fontSize: 10, fontWeight: 900,
              padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
              border: '1px solid rgba(52,211,153,0.45)',
              boxShadow: '0 1px 6px rgba(0,0,0,0.5)',
              letterSpacing: '-0.01em', zIndex: 2,
              cursor: interactive ? 'pointer' : 'inherit',
            }}
          >
            {formatPoints(livePoints)}
          </div>
        )}
      </div>

      {/* Name card (+ projected points, hanging off the bottom as a small tag) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '5px 10px',
          textAlign: 'center', boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
          minWidth: 66, maxWidth: 108,
          outline: selected ? `1.5px solid ${SELECT_COLOR}` : isLive ? '1.5px solid rgba(16,185,129,0.45)' : 'none',
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
            <PositionBadge position={player.position} />
            <TeamLogo code={player.team_code} size={10} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{player.team_code}</span>
            {isLive && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                fontSize: 7.5, fontWeight: 800, color: '#059669',
                background: 'rgba(5,150,105,0.09)', borderRadius: 20,
                padding: '1px 4px', letterSpacing: '0.04em',
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: '50%', background: '#10b981', flexShrink: 0,
                  animation: 'live-dot-pulse 1.4s ease-in-out infinite',
                }} />
                LIVE
              </span>
            )}
          </div>
        </div>
        {hasProj && (
          <div style={{
            background: '#1e293b', borderRadius: 8, padding: '2px 9px',
            marginTop: 1, boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              Proj {formatPoints(player.projected_points as number)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BenchCard (below the pitch)
// ---------------------------------------------------------------------------
function BenchCard({
  player, livePoints, matchup,
  selected = false, eligible = false, dimmed = false, isSwapping = false,
  onCardClick, onShowStats,
}: {
  player: FieldPlayer; livePoints: number | null;
  matchup?: Matchup;
  selected?: boolean;
  eligible?: boolean;
  dimmed?: boolean;
  isSwapping?: boolean;
  onCardClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onShowStats?: () => void;
}) {
  const displayName = formatPlayerName(player.full_name);
  const isLive = livePoints !== null;
  const hasProj = player.projected_points != null;

  return (
    <div
      onClick={onCardClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        width: 78, flexShrink: 0, cursor: 'pointer',
        opacity: isSwapping ? 0.5 : dimmed ? 0.35 : 1,
        filter: dimmed ? 'grayscale(1)' : 'none',
        transition: 'opacity 0.15s, filter 0.15s',
      }}
    >
      <div style={{ position: 'relative' }}>
        {player.headshot_url ? (
          <Image
            src={player.headshot_url} alt={player.full_name}
            width={52} height={52} unoptimized
            style={{
              width: 52, height: 52, objectFit: 'cover', display: 'block', borderRadius: '50%',
              border: selected ? `2.5px solid ${SELECT_COLOR}` : isLive ? '2.5px solid #10b981' : '2.5px solid #e2e8f0',
            }}
          />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: '#e2e8f0',
            border: selected ? `2.5px solid ${SELECT_COLOR}` : isLive ? '2.5px solid #10b981' : '2.5px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 700, color: '#64748b',
          }}>
            {player.full_name[0]}
          </div>
        )}
        {eligible && (
          <div style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            border: `2px dashed ${SELECT_COLOR}`, pointerEvents: 'none',
          }} />
        )}
        {isLive && (
          <div
            onClick={e => { e.stopPropagation(); onShowStats?.(); }}
            style={{
              position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)',
              background: '#065f46', color: '#d1fae5', fontSize: 8.5, fontWeight: 900,
              padding: '1px 5px', borderRadius: 20, whiteSpace: 'nowrap',
              border: '1px solid #10b981', cursor: 'pointer',
            }}
          >
            {formatPoints(livePoints)}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
          <PositionBadge position={player.position} />
          <TeamLogo code={player.team_code} size={9} />
          <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{player.team_code}</span>
        </div>
        {hasProj && (
          <div style={{
            background: '#1e293b', borderRadius: 6, padding: '1.5px 7px',
            display: 'inline-block', marginTop: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.02em' }}>
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
function EmptySlotCard({ pos, x, y }: { pos: string; x: number; y: number }) {
  return (
    <div style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 5, zIndex: 10, opacity: 0.55,
    }}>
      <div style={{
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)',
        borderRadius: 20, padding: '3px 9px',
        fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)',
        border: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap',
      }}>
        Empty
      </div>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        border: '3px dashed rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 900, color: '#fff', opacity: 0.7,
        }}>
          {pos}
        </div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.12)', borderRadius: 10,
        padding: '5px 10px', textAlign: 'center', minWidth: 66,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{pos} Slot</div>
        <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>open</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main field component
// ---------------------------------------------------------------------------
export default function LiveTeamField({
  positions, hidePrices = false, matchups = {}, bench = [], teamId, interactive = false, season,
}: {
  positions: FieldSlot[];
  hidePrices?: boolean;
  matchups?: Record<string, Matchup>;
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

  // Clicking a card: if a swap is already pending, clicking the same player
  // cancels it and clicking an eligible teammate completes the swap
  // immediately (no menu). Otherwise, open the Sub / View Profile menu.
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
      {/* Click-away layer to close an open action menu */}
      {menuAnchor != null && (
        <div onClick={() => setMenuAnchor(null)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      )}

      <div style={{
        position: 'relative', height: 400, overflow: 'hidden',
        boxShadow: 'inset 0 0 70px rgba(0,0,0,0.28)',
        background: `
          radial-gradient(ellipse 90% 45% at 50% 0%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 60%),
          radial-gradient(ellipse 150% 100% at 50% 50%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.4) 100%),
          linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 14%),
          repeating-linear-gradient(180deg, #1e9a44 0px, #1e9a44 48px, #147333 48px, #147333 96px)
        `,
      }}>
        <style>{`
          @keyframes live-dot-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.4; transform: scale(0.75); }
          }
        `}</style>

        {/* O-line — a branded block marking the line of scrimmage, sized to
            roughly the tackle-box width. Every skill player lines up even
            with this line or behind it, never ahead of it. */}
        <div style={{
          position: 'absolute', left: '31%', right: '31%', top: '11%', height: 30,
          transform: 'translateY(-50%)', zIndex: 2, borderRadius: 7,
          background: 'linear-gradient(180deg, #f4f4f3 0%, #d9d9d7 100%)',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', padding: '0 8px',
        }}>
          <span style={{
            fontSize: 12, fontWeight: 900, color: '#475569',
            letterSpacing: '0.08em', whiteSpace: 'nowrap',
          }}>
            ONELEAGUE
          </span>
        </div>

        {/* Players */}
        {positions.map(({ player, pos, x, y }, i) => {
          if (!player) return <EmptySlotCard key={`empty-${pos}-${i}`} pos={pos} x={x} y={y} />;
          const liveData = liveStats.get(player.external_player_id ?? '');
          const livePoints = liveData?.totals.fantasyPointsTotal ?? null;
          const isSelected = selected?.id === player.id;
          const eligible = selected != null && !isSelected && isEligibleSwap(selected, player);
          const dimmed = selected != null && !isSelected && !eligible;
          return (
            <PlayerCard
              key={player.id}
              player={player} x={x} y={y}
              livePoints={livePoints}
              hidePrices={hidePrices}
              matchup={matchups[player.team_code]}
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

      {/* Bench — only on interactive (My Team) usage */}
      {interactive && (
        <div style={{ background: '#fff', borderTop: '1px solid #f1f5f9', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Bench
            </span>
            <span style={{ fontSize: 11, color: '#cbd5e1' }}>· {bench.length} players</span>
            {selected && (
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: SELECT_COLOR }}>
                Tap a player to swap with {formatPlayerName(selected.full_name)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {bench.length === 0 && (
              <div style={{ fontSize: 12, color: '#cbd5e1', fontStyle: 'italic', padding: '8px 0' }}>No bench players</div>
            )}
            {bench.map(player => {
              const liveData = liveStats.get(player.external_player_id ?? '');
              const livePoints = liveData?.totals.fantasyPointsTotal ?? null;
              const isSelected = selected?.id === player.id;
              const eligible = selected != null && !isSelected && isEligibleSwap(selected, player);
              const dimmed = selected != null && !isSelected && !eligible;
              return (
                <BenchCard
                  key={player.id}
                  player={player}
                  livePoints={livePoints}
                  matchup={matchups[player.team_code]}
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
      )}

      {/* Sub / View Profile menu — fixed to the viewport from the clicked
          card's on-screen position, so it's never clipped by the pitch's
          overflow:hidden or the bench row's horizontal scroll. */}
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

      {/* Live stats modal */}
      {modal && (
        <LiveStatsModal
          player={modal.player}
          stats={modal.stats}
          onClose={() => setModal(null)}
          hidePrices={hidePrices}
        />
      )}

      {/* Player profile modal */}
      {profileId != null && (
        <PlayerProfileModal playerId={profileId} season={season} onClose={() => setProfileId(null)} />
      )}
    </>
  );
}
