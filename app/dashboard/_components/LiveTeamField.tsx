'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useLiveStats, type LivePlayerStats } from '@/hooks/useLiveStats';
import { formatPrice, formatPoints } from '@/lib/format';

export interface FieldPlayer {
  full_name: string;
  position: string;
  team_code: string;
  current_price: number;
  headshot_url: string | null;
  espn_athlete_id: string | null;
}

export interface FieldSlot {
  player: FieldPlayer | null;
  pos: string;
  x: number;
  y: number;
}

const POS_COLOR: Record<string, string> = {
  QB: '#3b82f6', RB: '#10b981', WR: '#f59e0b', TE: '#a855f7', K: '#cbd5e1',
};

// ---------------------------------------------------------------------------
// Live stats modal
// ---------------------------------------------------------------------------
function LiveStatsModal({
  player, stats, onClose,
}: {
  player: FieldPlayer;
  stats: LivePlayerStats;
  onClose: () => void;
}) {
  const t = stats.totals;
  const color = POS_COLOR[player.position] ?? '#94a3b8';

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
                  width: 48, height: 48, borderRadius: '50%', objectFit: 'cover',
                  border: '2.5px solid #10b981', display: 'block',
                  boxShadow: '0 0 12px rgba(16,185,129,0.4)',
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
            <div style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 18, height: 18, borderRadius: '50%',
              background: color, border: '2px solid #0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 6.5, fontWeight: 900, color: '#fff',
            }}>
              {player.position}
            </div>
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
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                {player.team_code}
              </span>
            </div>
            <div style={{
              fontSize: 17, fontWeight: 900, color: '#fff',
              letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {player.full_name}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlayerCard
// ---------------------------------------------------------------------------
function PlayerCard({
  player, x, y, livePoints, onClick,
}: {
  player: FieldPlayer; x: number; y: number; livePoints: number | null;
  onClick?: () => void;
}) {
  const lastName = player.full_name.split(' ').slice(1).join(' ') || player.full_name;
  const color  = POS_COLOR[player.position] ?? '#94a3b8';
  const isLive = livePoints !== null;

  return (
    <div
      onClick={isLive ? onClick : undefined}
      style={{
        position: 'absolute',
        left: `${x}%`, top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 5, cursor: isLive ? 'pointer' : 'default', zIndex: 10,
      }}
    >
      {/* Price chip */}
      <div style={{
        background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(8px)',
        borderRadius: 20, padding: '3px 9px',
        fontSize: 11, fontWeight: 700, color: '#fff',
        border: '1px solid rgba(255,255,255,0.2)',
        whiteSpace: 'nowrap', letterSpacing: '-0.01em',
      }}>
        {formatPrice(player.current_price)}
      </div>

      {/* Avatar */}
      <div style={{ position: 'relative' }}>
        {player.headshot_url ? (
          <Image
            src={player.headshot_url} alt={player.full_name}
            width={72} height={72} unoptimized
            style={{
              width: 72, height: 72, borderRadius: '50%', objectFit: 'cover',
              border: isLive ? '3px solid #10b981' : '3px solid #fff',
              boxShadow: isLive
                ? '0 4px 18px rgba(0,0,0,0.45), 0 0 16px rgba(16,185,129,0.45)'
                : '0 4px 18px rgba(0,0,0,0.45)',
              display: 'block', transition: 'border-color 0.3s, box-shadow 0.3s',
            }}
          />
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: '#334155',
            border: isLive ? '3px solid #10b981' : '3px solid #fff',
            boxShadow: isLive
              ? '0 4px 18px rgba(0,0,0,0.45), 0 0 16px rgba(16,185,129,0.45)'
              : '0 4px 18px rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700, color: '#fff',
          }}>
            {player.full_name[0]}
          </div>
        )}

        {/* Position badge */}
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 22, height: 22, borderRadius: '50%',
          background: color, border: '2.5px solid #fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 900, color: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        }}>
          {player.position}
        </div>

        {/* Live points overlay */}
        {isLive && (
          <div style={{
            position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(3,32,18,0.85)', backdropFilter: 'blur(6px)',
            color: '#34d399', fontSize: 10, fontWeight: 900,
            padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap',
            border: '1px solid rgba(52,211,153,0.45)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.5)',
            letterSpacing: '-0.01em', zIndex: 2,
          }}>
            {formatPoints(livePoints)}
          </div>
        )}
      </div>

      {/* Name card */}
      <div style={{
        background: 'rgba(255,255,255,0.97)', borderRadius: 10, padding: '5px 10px',
        textAlign: 'center', boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
        minWidth: 66, maxWidth: 94,
        outline: isLive ? '1.5px solid rgba(16,185,129,0.45)' : 'none',
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lastName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 1 }}>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptySlotCard
// ---------------------------------------------------------------------------
function EmptySlotCard({ pos, x, y }: { pos: string; x: number; y: number }) {
  const color = POS_COLOR[pos] ?? '#94a3b8';
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
          width: 22, height: 22, borderRadius: '50%', background: color,
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
export default function LiveTeamField({ positions, losY }: {
  positions: FieldSlot[];
  losY: number;
}) {
  const espnIds = useMemo(
    () => positions.flatMap(s => s.player?.espn_athlete_id ? [s.player.espn_athlete_id] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positions.map(s => s.player?.espn_athlete_id).join(',')],
  );
  const liveStats = useLiveStats(espnIds);

  const [modal, setModal] = useState<{ player: FieldPlayer; stats: LivePlayerStats } | null>(null);

  return (
    <>
      <div style={{
        position: 'relative', height: 580, overflow: 'hidden',
        background: `repeating-linear-gradient(180deg, #1a7a32 0px, #1a7a32 48px, #1e8838 48px, #1e8838 96px)`,
      }}>
        <style>{`
          @keyframes live-dot-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.4; transform: scale(0.75); }
          }
        `}</style>

        {/* End zones */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '9%', background: 'rgba(0,0,0,0.18)', borderBottom: '2px solid rgba(255,255,255,0.5)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '9%', background: 'rgba(0,0,0,0.18)', borderTop: '2px solid rgba(255,255,255,0.5)' }} />

        {/* Sidelines */}
        <div style={{ position: 'absolute', top: '9%', bottom: '9%', left: 36, width: 2, background: 'rgba(255,255,255,0.55)' }} />
        <div style={{ position: 'absolute', top: '9%', bottom: '9%', right: 36, width: 2, background: 'rgba(255,255,255,0.55)' }} />

        {/* 5-yard lines */}
        {[9+(91-9)*0.5/9, 9+(91-9)*1.5/9, 9+(91-9)*2.5/9, 9+(91-9)*3.5/9,
          9+(91-9)*4.5/9, 9+(91-9)*5.5/9, 9+(91-9)*6.5/9, 9+(91-9)*7.5/9].map(pct => (
          <div key={pct} style={{ position: 'absolute', left: 36, right: 36, top: `${pct}%`, height: 1, background: 'rgba(255,255,255,0.10)' }} />
        ))}

        {/* Hash marks */}
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', top: `${10 + i * (80/18)}%`,
            left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 100px',
          }}>
            <div style={{ width: 14, height: 1, background: 'rgba(255,255,255,0.25)' }} />
            <div style={{ width: 14, height: 1, background: 'rgba(255,255,255,0.25)' }} />
          </div>
        ))}

        {/* Line of scrimmage */}
        <div style={{ position: 'absolute', left: 36, right: 36, top: `${losY}%`, height: 2, background: 'rgba(96,165,250,0.7)', boxShadow: '0 0 10px rgba(96,165,250,0.5)' }} />
        <div style={{ position: 'absolute', right: 40, top: `calc(${losY}% - 14px)`, fontSize: 8, fontWeight: 800, color: 'rgba(147,197,253,0.85)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Line of Scrimmage
        </div>

        {/* Goal posts */}
        <svg style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1 }} width="80" height="52" viewBox="0 0 60 52">
          <rect x="29" y="2" width="2" height="50" fill="rgba(251,191,36,0.7)" rx="1" />
          <rect x="8" y="22" width="44" height="2" fill="rgba(251,191,36,0.7)" rx="1" />
          <rect x="8" y="2" width="2" height="22" fill="rgba(251,191,36,0.7)" rx="1" />
          <rect x="50" y="2" width="2" height="22" fill="rgba(251,191,36,0.7)" rx="1" />
        </svg>

        {/* Players */}
        {positions.map(({ player, pos, x, y }, i) => {
          if (!player) return <EmptySlotCard key={`empty-${pos}-${i}`} pos={pos} x={x} y={y} />;
          const espnId = player.espn_athlete_id ?? '';
          const liveData = liveStats.get(espnId);
          const livePoints = liveData?.totals.fantasyPointsTotal ?? null;
          return (
            <PlayerCard
              key={`${player.full_name}-${i}`}
              player={player} x={x} y={y}
              livePoints={livePoints}
              onClick={liveData ? () => setModal({ player, stats: liveData }) : undefined}
            />
          );
        })}
      </div>

      {/* Modal */}
      {modal && (
        <LiveStatsModal
          player={modal.player}
          stats={modal.stats}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
