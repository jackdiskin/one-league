'use client';

import { useState, useEffect, useRef } from 'react';

/* ── Types ── */
export interface Badge {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

export interface WeeklyRecapProps {
  week: number;
  season: number;
  myTeamName: string;
  myPoints: number;
  avgPoints: number;
  currentRank: number;
  previousRank: number;
  totalTeams: number;
  badges: Badge[];
  weeklyLeader: { team_name: string; points: number };
  myStanding: {
    rank: number;
    total_points: number;
    roster_value: number;
    trade_count: number;
    team_name: string;
  };
  onClose: () => void;
}

/* ── Helpers ── */
function perfAccent(myPoints: number, avgPoints: number): string {
  if (avgPoints <= 0) return '#10b981';
  if (myPoints > avgPoints * 1.1) return '#10b981';
  if (myPoints >= avgPoints * 0.9) return '#f59e0b';
  return '#f43f5e';
}

function rankAccent(current: number, previous: number): string {
  if (previous === 0 || current === previous) return '#94a3b8';
  return current < previous ? '#10b981' : '#f43f5e';
}

function fmt(n: number, decimals = 1) {
  return Number(n).toFixed(decimals);
}

function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

function weekSummary(
  myPoints: number, avgPoints: number,
  currentRank: number, previousRank: number,
  totalTeams: number, badges: Badge[]
): string {
  const rankChange = previousRank - currentRank;
  if (badges.some(b => b.id === 'HIGHEST_SCORER')) return `You owned Week — nobody else came close.`;
  if (badges.some(b => b.id === 'DOMINANT')) return `${fmt(myPoints)} points. A statement week.`;
  if (rankChange >= 3) return `Up ${rankChange} spots. The league noticed.`;
  if (currentRank === 1) return `Sitting on top. Stay there.`;
  if (currentRank <= Math.ceil(totalTeams / 2)) return `Top half. Keep the momentum going.`;
  if (myPoints < avgPoints * 0.9) return `Rough week. Regroup, recalibrate, reload.`;
  return `Week ${myPoints > avgPoints ? 'above' : 'below'} the line. Every point matters.`;
}

/* ── Counter hook ── */
function useCounter(target: number, active: boolean, delay = 0, ms = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const t = setTimeout(() => {
      const steps = 32;
      const inc = target / steps;
      const iv = ms / steps;
      let cur = 0;
      const it = setInterval(() => {
        cur = Math.min(cur + inc, target);
        setVal(cur);
        if (cur >= target) clearInterval(it);
      }, iv);
    }, delay);
    return () => clearTimeout(t);
  }, [active, target]);
  return val;
}

/* ── Slide 0: Intro ── */
function SlideIntro({ week, teamName, ac }: { week: number; teamName: string; ac: string }) {
  const words = teamName.split(' ');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px 28px', textAlign: 'center' }}>
      {/* Week pill */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: `${ac}18`, border: `1px solid ${ac}40`,
        borderRadius: 100, padding: '5px 14px', marginBottom: 28,
        animation: 'fade-up 0.4s 0.1s both',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: ac, boxShadow: `0 0 6px ${ac}` }} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
          color: ac, textTransform: 'uppercase',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          Week {week} · {new Date().getFullYear()}
        </span>
      </div>

      {/* Team name */}
      <div style={{ marginBottom: 24, overflow: 'hidden' }}>
        {words.map((w, i) => (
          <div key={i} style={{
            display: 'block',
            fontSize: Math.min(68, 68 - Math.max(0, (teamName.length - 10) * 1.6)),
            fontWeight: 900, lineHeight: 0.93,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            color: '#f0f4ff',
            fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
            animation: `fade-up 0.55s ${0.25 + i * 0.1}s cubic-bezier(0.16,1,0.3,1) both`,
          }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{
        height: 1, width: 48, background: `linear-gradient(90deg, transparent, ${ac}, transparent)`,
        marginBottom: 18, animation: 'widen 0.6s 0.6s both',
      }} />

      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.2em',
        color: 'rgba(240,244,255,0.35)', textTransform: 'uppercase',
        fontFamily: "'IBM Plex Mono', monospace",
        animation: 'fade-up 0.5s 0.75s both',
      }}>
        Your Week in Review
      </div>
    </div>
  );
}

/* ── Slide 1: Score vs League ── */
function SlideScore({ myPoints, avgPoints, weeklyLeader, ac }: {
  myPoints: number; avgPoints: number;
  weeklyLeader: { team_name: string; points: number }; ac: string;
}) {
  const displayed = useCounter(myPoints, true, 200, 1000);
  const diff = myPoints - avgPoints;
  const isAbove = diff >= 0;
  const maxVal = Math.max(myPoints, avgPoints, weeklyLeader.points, 1);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 26px' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: 'rgba(240,244,255,0.3)', textTransform: 'uppercase',
        fontFamily: "'IBM Plex Mono', monospace", marginBottom: 6,
        textAlign: 'center', animation: 'fade-up 0.4s 0.05s both',
      }}>Your Score</div>

      {/* Big points display */}
      <div style={{ textAlign: 'center', marginBottom: 24, animation: 'fade-up 0.5s 0.15s both' }}>
        <div style={{
          fontSize: 80, fontWeight: 900, lineHeight: 1,
          letterSpacing: '-0.04em',
          color: ac,
          fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
          textShadow: `0 0 40px ${ac}50`,
        }}>
          {fmt(displayed)}
        </div>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
          color: 'rgba(240,244,255,0.25)', textTransform: 'uppercase',
          fontFamily: "'IBM Plex Mono', monospace", marginTop: 2,
        }}>
          fantasy points
        </div>
      </div>

      {/* Comparison bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'You', val: myPoints, color: ac, isUser: true },
          { label: 'Avg', val: avgPoints, color: 'rgba(255,255,255,0.2)', isUser: false },
        ].map((row, i) => (
          <div key={row.label} style={{ animation: `fade-up 0.5s ${0.3 + i * 0.12}s both` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                color: row.isUser ? ac : 'rgba(240,244,255,0.3)',
                textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace",
              }}>{row.label}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: row.isUser ? ac : 'rgba(240,244,255,0.3)',
                fontFamily: "'IBM Plex Mono', monospace",
              }}>{fmt(row.val)}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${(row.val / maxVal) * 100}%`,
                background: row.isUser
                  ? `linear-gradient(90deg, ${ac}cc, ${ac})`
                  : 'rgba(255,255,255,0.15)',
                transformOrigin: 'left',
                transform: 'scaleX(0)',
                animation: `bar-grow 0.7s ${0.4 + i * 0.15}s cubic-bezier(0.16,1,0.3,1) forwards`,
                boxShadow: row.isUser ? `0 0 8px ${ac}60` : 'none',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Delta callout */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        animation: 'fade-up 0.5s 0.65s both',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: isAbove ? '#10b981' : '#f43f5e',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          {isAbove ? '+' : ''}{fmt(diff)}
        </span>
        <span style={{
          fontSize: 10, color: 'rgba(240,244,255,0.3)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          vs league average
        </span>
      </div>
    </div>
  );
}

/* ── Slide 2: Rank Movement ── */
function SlideRank({ currentRank, previousRank, totalTeams, ac }: {
  currentRank: number; previousRank: number; totalTeams: number; ac: string;
}) {
  const rAc = rankAccent(currentRank, previousRank);
  const rankChange = previousRank > 0 ? previousRank - currentRank : 0;
  const improved = rankChange > 0;
  const dropped = rankChange < 0;
  const unchanged = rankChange === 0 || previousRank === 0;

  /* Animate the new rank counting down */
  const [display, setDisplay] = useState(() => Math.min(currentRank + 20 + Math.floor(Math.random() * 10), totalTeams));
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const target = currentRank;
    let cur = display;
    const step = () => {
      if (cur <= target) { setDone(true); return; }
      cur--;
      setDisplay(cur);
      const dist = cur - target;
      const delay = dist > 10 ? 50 : dist > 5 ? 100 : dist > 2 ? 200 : 350;
      timerRef.current = setTimeout(step, delay);
    };
    timerRef.current = setTimeout(step, 600);
    return () => clearTimeout(timerRef.current);
  }, []);

  const moveLabel = improved ? 'Climbed' : dropped ? 'Dropped' : 'Holding';
  const moveColor = improved ? '#10b981' : dropped ? '#f43f5e' : '#94a3b8';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px 28px', textAlign: 'center' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: 'rgba(240,244,255,0.3)', textTransform: 'uppercase',
        fontFamily: "'IBM Plex Mono', monospace", marginBottom: 20,
        animation: 'fade-up 0.4s 0.1s both',
      }}>
        Rank This Week
      </div>

      {/* Rank display row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        {/* Previous rank (muted, strikethrough when done) */}
        {previousRank > 0 && (
          <div style={{ position: 'relative' }}>
            <div style={{
              fontSize: 72, fontWeight: 900, lineHeight: 1,
              fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
              letterSpacing: '-0.04em',
              color: 'rgba(240,244,255,0.12)',
              transition: 'color 0.4s',
            }}>
              {previousRank}
            </div>
            {done && (
              <div style={{
                position: 'absolute', top: '50%', left: '-4px', right: '-4px',
                height: 2, background: 'rgba(240,244,255,0.25)',
                animation: 'widen 0.4s 0.1s both',
                transformOrigin: 'left',
              }} />
            )}
          </div>
        )}

        {/* Arrow */}
        {previousRank > 0 && (
          <div style={{
            fontSize: 22, color: moveColor,
            opacity: done ? 1 : 0, transition: 'opacity 0.3s 0.3s',
            animation: done ? 'fade-up 0.3s 0.2s both' : 'none',
          }}>
            {improved ? '↑' : dropped ? '↓' : '→'}
          </div>
        )}

        {/* New rank */}
        <div style={{
          fontSize: previousRank > 0 ? 100 : 128, fontWeight: 900, lineHeight: 1,
          fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
          letterSpacing: '-0.04em',
          color: done ? rAc : 'rgba(240,244,255,0.12)',
          transition: done ? 'color 0.4s' : 'none',
          textShadow: done ? `0 0 40px ${rAc}60` : 'none',
        }}>
          {display}
        </div>
      </div>

      {/* Move badge */}
      {done && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: `${moveColor}18`, border: `1px solid ${moveColor}40`,
            borderRadius: 100, padding: '5px 14px',
            animation: 'fade-up 0.4s 0.3s both',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
              color: moveColor, textTransform: 'uppercase',
              fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {moveLabel}
              {!unchanged && ` · ${Math.abs(rankChange)} spot${Math.abs(rankChange) !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div style={{
            fontSize: 10, color: 'rgba(240,244,255,0.25)',
            fontFamily: "'IBM Plex Mono', monospace",
            animation: 'fade-up 0.4s 0.45s both',
          }}>
            {ordinal(currentRank)} of {totalTeams} teams
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Slide 3: Badges ── */
function SlideBadges({ badges, ac }: { badges: Badge[]; ac: string }) {
  const hasBadges = badges.length > 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 22px' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: 'rgba(240,244,255,0.3)', textTransform: 'uppercase',
        fontFamily: "'IBM Plex Mono', monospace", marginBottom: 20,
        textAlign: 'center', animation: 'fade-up 0.4s 0.05s both',
      }}>
        Earned This Week
      </div>

      {hasBadges ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: badges.length === 1 ? '1fr' : '1fr 1fr',
          gap: 10,
        }}>
          {badges.map((badge, i) => (
            <div key={badge.id} style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${ac}30`,
              borderRadius: 14,
              padding: '16px 14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center', gap: 8,
              animation: `fade-up 0.5s ${0.1 + i * 0.1}s cubic-bezier(0.16,1,0.3,1) both`,
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Glow bg */}
              <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(circle at 50% 30%, ${ac}0a 0%, transparent 70%)`,
                pointerEvents: 'none',
              }} />
              <div style={{ fontSize: 28, lineHeight: 1, position: 'relative', zIndex: 1 }}>
                {badge.icon}
              </div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
                  color: ac, textTransform: 'uppercase',
                  fontFamily: "'IBM Plex Mono', monospace", marginBottom: 3,
                }}>
                  {badge.name}
                </div>
                <div style={{
                  fontSize: 10, color: 'rgba(240,244,255,0.35)',
                  fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.4,
                }}>
                  {badge.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          animation: 'fade-up 0.5s 0.1s both',
          padding: '20px 0',
        }}>
          <div style={{ fontSize: 40 }}>📊</div>
          <div style={{
            fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em',
            color: '#f0f4ff',
            fontFamily: "'Barlow Condensed', sans-serif",
            textAlign: 'center',
          }}>
            Solid week.
          </div>
          <div style={{
            fontSize: 11, color: 'rgba(240,244,255,0.3)',
            fontFamily: "'IBM Plex Mono', monospace", textAlign: 'center',
            lineHeight: 1.5,
          }}>
            Build on it.
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Slide 4: Outro ── */
function SlideOutro({ myPoints, avgPoints, currentRank, previousRank, totalTeams, badges, myTeamName, ac, onClose }: {
  myPoints: number; avgPoints: number; currentRank: number; previousRank: number;
  totalTeams: number; badges: Badge[]; myTeamName: string; ac: string; onClose: () => void;
}) {
  const line = weekSummary(myPoints, avgPoints, currentRank, previousRank, totalTeams, badges);

  const rankColor = currentRank === 1 ? '#f59e0b'
    : currentRank === 2 ? '#94a3b8'
    : currentRank === 3 ? '#cd7f32'
    : currentRank <= 6 ? '#38bdf8'
    : '#4b5563';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '32px 32px', textAlign: 'center' }}>
      <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, transparent, ${ac}, transparent)`, marginBottom: 28, animation: 'widen 0.6s 0.1s both' }} />

      <div style={{
        fontSize: 20, fontWeight: 900, lineHeight: 1.3, letterSpacing: '-0.01em',
        color: '#f0f4ff',
        fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
        marginBottom: 28, maxWidth: 320,
        animation: 'fade-up 0.6s 0.3s cubic-bezier(0.16,1,0.3,1) both',
      }}>
        {line}
      </div>

      {/* Rank + team chip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32,
        animation: 'fade-up 0.5s 0.5s both',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 900, color: rankColor,
          fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: '0.05em',
          background: `${rankColor}18`,
          border: `1px solid ${rankColor}40`,
          borderRadius: 8, padding: '4px 12px',
        }}>
          {ordinal(currentRank)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,244,255,0.3)', fontFamily: "'IBM Plex Mono',monospace" }}>
          {myTeamName}
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        style={{
          padding: '12px 28px', borderRadius: 10,
          background: `linear-gradient(135deg, ${ac}, ${ac}cc)`,
          border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
          color: ac === '#10b981' ? '#fff' : '#000',
          textTransform: 'uppercase',
          fontFamily: "'IBM Plex Mono', monospace",
          animation: 'fade-up 0.5s 0.7s both',
          transition: 'opacity 0.15s, transform 0.15s',
          boxShadow: `0 4px 20px ${ac}40`,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        Next Week
      </button>
    </div>
  );
}

/* ── Main Modal ── */
export default function WeeklyRecapModal({
  week, season, myTeamName, myPoints, avgPoints,
  currentRank, previousRank, totalTeams,
  badges, weeklyLeader, myStanding, onClose,
}: WeeklyRecapProps) {
  const [slide, setSlide] = useState(0);
  const TOTAL = 5;
  const ac = perfAccent(myPoints, avgPoints);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === ' ') advance();
      if (e.key === 'ArrowLeft') setSlide(s => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slide]);

  function advance() {
    if (slide < TOTAL - 1) setSlide(s => s + 1);
    else onClose();
  }

  const slideLabels = ['This Week', 'Score', 'Rank', 'Badges', 'Summary'];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=IBM+Plex+Mono:wght@400;500;700&display=swap');

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes widen {
          from { transform: scaleX(0); opacity: 0; }
          to   { transform: scaleX(1); opacity: 1; }
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.92) translateY(24px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bar-grow {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes weekly-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.06); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={advance}
        style={{
          position: 'fixed', inset: 0, zIndex: 9100,
          background: 'rgba(0,0,8,0.9)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {/* Card */}
        <div
          key={slide}
          onClick={e => e.stopPropagation()}
          style={{
            width: 440, maxWidth: '93vw',
            background: 'linear-gradient(160deg, #070d1a 0%, #050a14 60%, #070d1a 100%)',
            borderRadius: 22, overflow: 'hidden',
            position: 'relative',
            display: 'flex', flexDirection: 'column',
            minHeight: 520,
            animation: 'modal-in 0.4s cubic-bezier(0.16,1,0.3,1) both',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 32px 80px rgba(0,0,0,0.85), 0 0 60px ${ac}15`,
            cursor: 'default',
          }}
        >
          {/* Scanline overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)',
          }} />

          {/* Gradient accent top bar */}
          <div style={{
            height: 3,
            background: `linear-gradient(90deg, transparent 0%, ${ac}80 20%, ${ac} 50%, ${ac}80 80%, transparent 100%)`,
          }} />

          {/* Top meta bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px 0',
            position: 'relative', zIndex: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: ac,
                boxShadow: `0 0 6px ${ac}`,
                animation: 'weekly-pulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.2em',
                color: 'rgba(240,244,255,0.25)', textTransform: 'uppercase',
                fontFamily: "'IBM Plex Mono', monospace",
              }}>
                {slideLabels[slide]}
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.2)', fontSize: 18, lineHeight: 1,
                padding: '2px 4px', borderRadius: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)'; }}
            >
              ×
            </button>
          </div>

          {/* Slide content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 2 }}>
            {slide === 0 && <SlideIntro week={week} teamName={myTeamName} ac={ac} />}
            {slide === 1 && <SlideScore myPoints={myPoints} avgPoints={avgPoints} weeklyLeader={weeklyLeader} ac={ac} />}
            {slide === 2 && <SlideRank currentRank={currentRank} previousRank={previousRank} totalTeams={totalTeams} ac={ac} />}
            {slide === 3 && <SlideBadges badges={badges} ac={ac} />}
            {slide === 4 && (
              <SlideOutro
                myPoints={myPoints} avgPoints={avgPoints}
                currentRank={currentRank} previousRank={previousRank}
                totalTeams={totalTeams} badges={badges}
                myTeamName={myTeamName} ac={ac} onClose={onClose}
              />
            )}
          </div>

          {/* Footer: dots + hint */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px 18px',
            position: 'relative', zIndex: 2,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: TOTAL }, (_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setSlide(i); }}
                  style={{
                    width: i === slide ? 20 : 6, height: 6,
                    borderRadius: 3, border: 'none', cursor: 'pointer',
                    background: i === slide ? ac : 'rgba(255,255,255,0.1)',
                    transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <span
              onClick={advance}
              style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '0.12em',
                color: 'rgba(240,244,255,0.2)', textTransform: 'uppercase',
                fontFamily: "'IBM Plex Mono', monospace",
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              {slide < TOTAL - 1 ? 'tap to continue →' : 'close'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
