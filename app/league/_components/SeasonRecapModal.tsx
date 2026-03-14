'use client';

import { useState, useEffect, useRef } from 'react';

/* ── Shared types (re-exported so page.tsx can reference them) ── */
export interface StandingRow {
  rank: number; fantasy_team_id: number; team_name: string;
  user_name: string; user_id: string; total_points: number;
  budget_remaining: number; roster_value: number;
  last_week_points: number; trade_count: number;
}
export interface TeamWeekScore {
  fantasy_team_id: number; team_name: string;
  user_name: string; user_id: string; week: number; points: number;
}
export interface WeeklyWinnerRow {
  week: number; team_name: string; user_name: string; points: number;
}

interface Props {
  myStanding: StandingRow;
  weeklyScores: TeamWeekScore[];
  weeklyWinners: WeeklyWinnerRow[];
  standings: StandingRow[];
  onClose: () => void;
}

/* ── Helpers ── */
function accent(rank: number) {
  if (rank === 1) return '#f59e0b';
  if (rank === 2) return '#94a3b8';
  if (rank === 3) return '#cd7f32';
  if (rank <= 6)  return '#38bdf8';
  return '#4b5563';
}
function ordinal(n: number) {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${{ 1:'st', 2:'nd', 3:'rd' }[n % 10] ?? 'th'}`;
}
function fmt(n: number, decimals = 1) {
  return Number(n).toFixed(decimals);
}

function computeStats(s: StandingRow, ws: TeamWeekScore[], ww: WeeklyWinnerRow[], all: StandingRow[]) {
  const myWeeks = ws.filter(w => w.fantasy_team_id === s.fantasy_team_id).sort((a, b) => a.week - b.week);
  const pts     = myWeeks.map(w => Number(w.points));
  const best    = myWeeks.reduce((b, w) => Number(w.points) > Number(b.points) ? w : b, myWeeks[0] ?? { week: 0, points: 0 });
  const worst   = myWeeks.reduce((b, w) => Number(w.points) < Number(b.points) ? w : b, myWeeks[0] ?? { week: 0, points: 0 });
  const weeksWon = ww.filter(w => w.team_name === s.team_name).length;
  let streak = 0, maxStreak = 0;
  for (let i = 1; i < pts.length; i++) {
    streak = pts[i] > pts[i - 1] ? streak + 1 : 0;
    maxStreak = Math.max(maxStreak, streak);
  }
  const leader = all[0];
  const gap = leader && leader.user_id !== s.user_id ? Number(leader.total_points) - Number(s.total_points) : 0;
  return { myWeeks, pts, best, worst, weeksWon, maxStreak, gap };
}

function summary(s: StandingRow, stats: ReturnType<typeof computeStats>, total: number): string {
  if (s.rank === 1) return 'Undisputed. You outscored every squad in the league — wire to wire.';
  if (s.rank === 2) return `${fmt(stats.gap)} points. That's all that stood between you and a championship ring.`;
  if (s.rank === 3) return 'The podium. You showed up when the margins were thinnest.';
  if (stats.weeksWon >= 4) return `${stats.weeksWon} weekly titles. You owned the weekly scoreboard.`;
  if (stats.maxStreak >= 4) return `That ${stats.maxStreak}-week hot streak was the season highlight. Remember it.`;
  if (s.rank <= Math.ceil(total / 2)) return 'Top half. Every week counted and you finished where it matters.';
  return 'The 2026 rebuild starts now. Every dynasty begins from a slow season.';
}

/* ── Counter hook ── */
function useCounter(target: number, active: boolean, delay = 0, ms = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    let t = setTimeout(() => {
      const steps = 32;
      const inc   = target / steps;
      const iv    = ms / steps;
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

/* ── Confetti particles (rank 1 only) ── */
const CONF_COLS = ['#f59e0b','#fbbf24','#fde68a','#10b981','#34d399','#fff'];
function Confetti() {
  const particles = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left:     Math.random() * 100,
      delay:    Math.random() * 1.8,
      dur:      2.2 + Math.random() * 1.4,
      color:    CONF_COLS[i % CONF_COLS.length],
      size:     4 + Math.random() * 5,
      isRect:   Math.random() > 0.5,
      drift:    (Math.random() - 0.5) * 90,
    }))
  ).current;

  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:1 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position:'absolute', top:'10%', left:`${p.left}%`,
          width: p.size, height: p.size * (p.isRect ? 2 : 1),
          borderRadius: p.isRect ? 2 : '50%',
          background: p.color,
          opacity: 0,
          transform: `translateX(${p.drift}px)`,
          animation: `conf-fall ${p.dur}s ${p.delay}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

/* ── Slide: Intro ── */
function SlideIntro({ standing, ac }: { standing: StandingRow; ac: string }) {
  const words = standing.team_name.split(' ');
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'32px 28px', textAlign:'center', position:'relative' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.25em', color: ac,
        textTransform: 'uppercase', marginBottom: 28,
        fontFamily: "'IBM Plex Mono', monospace",
        animation: 'fade-up 0.5s 0.1s both',
      }}>
        One League · 2025 Season
      </div>

      <div style={{ marginBottom: 24, overflow:'hidden' }}>
        {words.map((w, i) => (
          <div key={i} style={{
            display: 'block',
            fontSize: Math.min(72, 72 - Math.max(0, (standing.team_name.length - 10) * 1.8)),
            fontWeight: 900, lineHeight: 0.95,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            color: '#f0f4ff',
            fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
            animation: `fade-up 0.55s ${0.3 + i * 0.1}s cubic-bezier(0.16,1,0.3,1) both`,
          }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{
        height: 1, width: 64, background: ac, marginBottom: 20,
        animation: 'widen 0.6s 0.7s both',
      }} />

      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: '0.18em',
        color: 'rgba(240,244,255,0.4)', textTransform: 'uppercase',
        fontFamily: "'IBM Plex Mono', monospace",
        animation: 'fade-up 0.5s 0.8s both',
      }}>
        Your Season in Review
      </div>
    </div>
  );
}

/* ── Slide: Rank reveal ── */
function SlideRank({ standing, ac, stats }: { standing: StandingRow; ac: string; stats: ReturnType<typeof computeStats> }) {
  const [display, setDisplay] = useState(() => Math.min(standing.rank + 28 + Math.floor(Math.random() * 18), 99));
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const target = standing.rank;
    let cur = display;

    const step = () => {
      if (cur <= target) { setDone(true); return; }
      cur--;
      setDisplay(cur);
      const dist = cur - target;
      const delay = dist > 14 ? 45 : dist > 7 ? 90 : dist > 3 ? 180 : 320;
      timerRef.current = setTimeout(step, delay);
    };

    timerRef.current = setTimeout(step, 700);
    return () => clearTimeout(timerRef.current);
  }, []);

  const isChamp = standing.rank === 1;
  const isPod   = standing.rank <= 3;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'24px 28px', textAlign:'center', position:'relative' }}>
      {isChamp && <Confetti />}

      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: 'rgba(240,244,255,0.35)', textTransform:'uppercase',
        fontFamily: "'IBM Plex Mono', monospace",
        marginBottom: 12,
        animation: 'fade-up 0.4s 0.1s both',
        zIndex: 2,
      }}>
        Final Standing
      </div>

      {/* Big rank number */}
      <div style={{ position:'relative', zIndex: 2, lineHeight: 0.85 }}>
        <div style={{
          fontSize: 148, fontWeight: 900,
          fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
          letterSpacing: '-0.04em',
          color: done ? ac : 'rgba(240,244,255,0.15)',
          transition: done ? 'color 0.4s ease' : 'none',
          textShadow: done && isChamp ? `0 0 60px ${ac}80, 0 0 120px ${ac}40` : 'none',
          animation: done && isChamp ? 'champ-pulse 2s 0.2s ease-in-out infinite' : undefined,
        }}>
          {display}
        </div>
      </div>

      <div style={{ zIndex: 2, marginTop: 4 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
          color: done ? 'rgba(240,244,255,0.5)' : 'transparent',
          textTransform: 'uppercase',
          fontFamily: "'IBM Plex Mono', monospace",
          transition: 'color 0.4s 0.2s',
        }}>
          out of {standing.rank === 1
            ? `${(stats.myWeeks.length > 0 ? Math.max(standing.rank, 4) : 4)} teams`
            : `${standing.rank + Math.floor(Math.random() * 4 + 2)} teams`}
        </div>
      </div>

      {/* Champion stamp */}
      {isChamp && done && (
        <div style={{
          position: 'absolute', top: 20, right: 24, zIndex: 10,
          border: `3px solid ${ac}`, borderRadius: 6,
          padding: '4px 10px',
          transform: 'rotate(10deg)',
          animation: 'stamp-in 0.3s 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 900, letterSpacing: '0.2em',
            color: ac, textTransform: 'uppercase',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>Champion</span>
        </div>
      )}

      {/* Medal */}
      {done && isPod && (
        <div style={{
          fontSize: 44, marginTop: 12, zIndex: 2,
          animation: 'fade-up 0.5s 0.4s both',
        }}>
          {standing.rank === 1 ? '🏆' : standing.rank === 2 ? '🥈' : '🥉'}
        </div>
      )}
    </div>
  );
}

/* ── Slide: Stats grid ── */
function SlideStats({ standing, stats }: { standing: StandingRow; stats: ReturnType<typeof computeStats> }) {
  const totalPts  = useCounter(Number(standing.total_points), true, 150,  1000);
  const bestPts   = useCounter(Number(stats.best.points),     true, 350,  900);
  const weeksWon  = useCounter(stats.weeksWon,                true, 550,  700);
  const tradesCnt = useCounter(standing.trade_count,          true, 750,  600);

  const tiles = [
    { label: 'Season Total', value: fmt(totalPts), sub: 'fantasy points', delay: 0.1 },
    { label: 'Best Week',    value: fmt(bestPts),  sub: `Week ${stats.best.week}`,   delay: 0.2 },
    { label: 'Weeks Won',    value: Math.round(weeksWon).toString(),  sub: 'weekly titles',  delay: 0.3 },
    { label: 'Trades Made',  value: Math.round(tradesCnt).toString(), sub: 'buy & sell moves', delay: 0.4 },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 24px' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: 'rgba(240,244,255,0.35)', textTransform:'uppercase',
        fontFamily: "'IBM Plex Mono', monospace", marginBottom: 20,
        animation: 'fade-up 0.4s 0.05s both',
        textAlign: 'center',
      }}>
        Your Numbers
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
        {tiles.map((t, i) => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14, padding: '18px 16px',
            animation: `fade-up 0.5s ${t.delay}s cubic-bezier(0.16,1,0.3,1) both`,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
              color: 'rgba(240,244,255,0.3)', textTransform: 'uppercase',
              fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8,
            }}>
              {t.label}
            </div>
            <div style={{
              fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1,
              color: '#f0f4ff',
              fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
            }}>
              {t.value}
            </div>
            <div style={{
              fontSize: 10, color: 'rgba(240,244,255,0.3)',
              fontFamily: "'IBM Plex Mono', monospace", marginTop: 5,
            }}>
              {t.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Slide: Season arc chart ── */
function SlideArc({ stats, ac }: { stats: ReturnType<typeof computeStats>; ac: string }) {
  const maxPts = Math.max(...stats.pts, 1);
  const BAR_H  = 110;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'20px 24px' }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: 'rgba(240,244,255,0.35)', textTransform:'uppercase',
        fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8,
        animation: 'fade-up 0.4s 0.05s both', textAlign:'center',
      }}>
        Season Arc
      </div>
      <div style={{
        fontSize: 10, color: 'rgba(240,244,255,0.2)',
        fontFamily: "'IBM Plex Mono', monospace", marginBottom: 20,
        animation: 'fade-up 0.4s 0.15s both', textAlign:'center',
      }}>
        weekly fantasy points · weeks 1–18
      </div>

      {/* Chart */}
      <div style={{ position:'relative' }}>
        {/* League average reference line */}
        {stats.pts.length > 0 && (() => {
          const avg = stats.pts.reduce((a, b) => a + b, 0) / stats.pts.length;
          const avgPct = (avg / maxPts) * BAR_H;
          return (
            <div style={{
              position:'absolute', left: 0, right: 0,
              bottom: 20 + avgPct,
              height: 1, background: 'rgba(255,255,255,0.1)',
              zIndex: 1,
            }}>
              <span style={{
                position:'absolute', right: 0,
                fontSize: 8, color: 'rgba(255,255,255,0.2)',
                fontFamily: "'IBM Plex Mono', monospace",
                transform: 'translateY(-100%)', paddingBottom: 2,
              }}>
                avg
              </span>
            </div>
          );
        })()}

        {/* Bars */}
        <div style={{ display:'flex', alignItems:'flex-end', gap: 3, height: BAR_H + 20 }}>
          {stats.myWeeks.map((w, i) => {
            const h    = Math.max(4, (Number(w.points) / maxPts) * BAR_H);
            const isBest = w.week === stats.best.week;
            return (
              <div key={w.week} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
                <div style={{
                  width: '100%', height: h,
                  background: isBest ? ac : 'rgba(255,255,255,0.12)',
                  borderRadius: '3px 3px 0 0',
                  transformOrigin: 'bottom',
                  transform: 'scaleY(0)',
                  animation: `bar-grow 0.5s ${0.05 + i * 0.035}s cubic-bezier(0.16,1,0.3,1) forwards`,
                  boxShadow: isBest ? `0 0 10px ${ac}80` : 'none',
                }} />
                {(i === 0 || (i + 1) % 3 === 0) && (
                  <div style={{
                    fontSize: 7, color: 'rgba(240,244,255,0.2)',
                    fontFamily: "'IBM Plex Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>
                    {i + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {stats.pts.length === 0 && (
          <div style={{ textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:12, paddingTop: 40 }}>
            No weekly data
          </div>
        )}
      </div>

      {/* Best week callout */}
      {stats.best.week > 0 && (
        <div style={{
          marginTop: 16, display:'flex', justifyContent:'center', gap: 20,
          animation: 'fade-up 0.5s 1s both',
        }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize: 8, letterSpacing: '0.15em', color: ac, textTransform:'uppercase', fontFamily:"'IBM Plex Mono',monospace" }}>Best</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f0f4ff', fontFamily:"'Barlow Condensed',sans-serif" }}>
              {fmt(stats.best.points)} <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>Wk {stats.best.week}</span>
            </div>
          </div>
          <div style={{ width:1, background:'rgba(255,255,255,0.08)' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize: 8, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform:'uppercase', fontFamily:"'IBM Plex Mono',monospace" }}>Worst</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(240,244,255,0.4)', fontFamily:"'Barlow Condensed',sans-serif" }}>
              {fmt(stats.worst.points)} <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>Wk {stats.worst.week}</span>
            </div>
          </div>
          <div style={{ width:1, background:'rgba(255,255,255,0.08)' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize: 8, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', textTransform:'uppercase', fontFamily:"'IBM Plex Mono',monospace" }}>Hot streak</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(240,244,255,0.4)', fontFamily:"'Barlow Condensed',sans-serif" }}>
              {stats.maxStreak} <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>wks</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Slide: Outro ── */
function SlideOutro({ standing, stats, ac, onClose, totalTeams }: {
  standing: StandingRow; stats: ReturnType<typeof computeStats>;
  ac: string; onClose: () => void; totalTeams: number;
}) {
  const line = summary(standing, stats, totalTeams);

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'32px 32px', textAlign:'center' }}>
      <div style={{
        width: 48, height: 2, background: ac, marginBottom: 32,
        animation: 'widen 0.6s 0.1s both',
      }} />

      <div style={{
        fontSize: 20, fontWeight: 900, lineHeight: 1.3,
        color: '#f0f4ff', letterSpacing: '-0.01em',
        fontFamily: "'Barlow Condensed', 'Impact', sans-serif",
        marginBottom: 32,
        animation: 'fade-up 0.6s 0.3s cubic-bezier(0.16,1,0.3,1) both',
        maxWidth: 340,
      }}>
        {line}
      </div>

      <div style={{
        display:'flex', alignItems:'center', gap: 10, marginBottom: 36,
        animation: 'fade-up 0.5s 0.55s both',
      }}>
        <div style={{
          fontSize: 13, fontWeight: 900, color: ac,
          fontFamily: "'Barlow Condensed', sans-serif",
          letterSpacing: '0.05em',
          background: `${ac}18`,
          border: `1px solid ${ac}40`,
          borderRadius: 8, padding: '4px 12px',
        }}>
          {ordinal(standing.rank)}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(240,244,255,0.4)', fontFamily:"'IBM Plex Mono',monospace" }}>
          {standing.team_name}
        </div>
      </div>

      <button
        onClick={e => { e.stopPropagation(); onClose(); }}
        style={{
          padding: '12px 28px', borderRadius: 10,
          background: ac, border: 'none', cursor:'pointer',
          fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
          color: standing.rank === 1 ? '#000' : '#fff',
          textTransform: 'uppercase',
          fontFamily: "'IBM Plex Mono', monospace",
          animation: 'fade-up 0.5s 0.75s both',
          transition: 'opacity 0.15s, transform 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        See Full Standings
      </button>
    </div>
  );
}

/* ── Main modal ── */
export default function SeasonRecapModal({ myStanding, weeklyScores, weeklyWinners, standings, onClose }: Props) {
  const [slide, setSlide] = useState(0);
  const TOTAL = 5;
  const stats  = computeStats(myStanding, weeklyScores, weeklyWinners, standings);
  const ac     = accent(myStanding.rank);
  const isChamp = myStanding.rank === 1;

  // Global keyboard nav
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

  const slideLabels = ['Intro', 'Ranking', 'Stats', 'Season Arc', 'Summary'];

  return (
    <>
      {/* Fonts */}
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
          from { opacity: 0; transform: scale(0.92) translateY(20px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes bar-grow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @keyframes conf-fall {
          0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(320px) rotate(360deg); }
        }
        @keyframes stamp-in {
          from { opacity: 0; transform: rotate(10deg) scale(0.4); }
          to   { opacity: 1; transform: rotate(10deg) scale(1); }
        }
        @keyframes champ-pulse {
          0%, 100% { text-shadow: 0 0 40px #f59e0b60, 0 0 80px #f59e0b30; }
          50%       { text-shadow: 0 0 80px #f59e0baa, 0 0 160px #f59e0b50; }
        }
        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(245,158,11,0.25), 0 0 80px rgba(245,158,11,0.12); }
          50%       { box-shadow: 0 0 70px rgba(245,158,11,0.45), 0 0 140px rgba(245,158,11,0.22); }
        }
        @keyframes scanline-drift {
          from { background-position: 0 0; }
          to   { background-position: 0 4px; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={advance}
        style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,8,0.88)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
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
            background: '#050a14',
            borderRadius: 20, overflow: 'hidden',
            position: 'relative',
            display: 'flex', flexDirection: 'column',
            minHeight: 520,
            animation: 'modal-in 0.45s cubic-bezier(0.16,1,0.3,1) both',
            border: `1px solid ${isChamp ? 'rgba(245,158,11,0.35)' : 'rgba(255,255,255,0.07)'}`,
            boxShadow: isChamp
              ? '0 0 60px rgba(245,158,11,0.22), 0 30px 80px rgba(0,0,0,0.8)'
              : '0 30px 80px rgba(0,0,0,0.8)',
            ...(isChamp ? { animation: 'modal-in 0.45s cubic-bezier(0.16,1,0.3,1) both, border-glow 3s 1s ease-in-out infinite' } : {}),
            cursor: 'default',
          }}
        >
          {/* Scanline overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.012) 2px, rgba(255,255,255,0.012) 4px)',
          }} />

          {/* Accent top bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${ac}, transparent)` }} />

          {/* Top meta bar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 18px 0',
            position: 'relative', zIndex: 2,
          }}>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: 'rgba(240,244,255,0.2)',
              textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace",
            }}>
              {slideLabels[slide]}
            </span>
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
            {slide === 0 && <SlideIntro  standing={myStanding} ac={ac} />}
            {slide === 1 && <SlideRank   standing={myStanding} ac={ac} stats={stats} />}
            {slide === 2 && <SlideStats  standing={myStanding} stats={stats} />}
            {slide === 3 && <SlideArc    stats={stats} ac={ac} />}
            {slide === 4 && <SlideOutro  standing={myStanding} stats={stats} ac={ac} onClose={onClose} totalTeams={standings.length} />}
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
                    background: i === slide ? ac : 'rgba(255,255,255,0.12)',
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
