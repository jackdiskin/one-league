'use client';

import { useState, useMemo } from 'react';
import { formatPoints, formatWeekLong } from '@/lib/format';

export type TeamWeekScore = {
  fantasy_team_id: number;
  team_name: string;
  user_name: string;
  user_id: string;
  week: number;
  points: number;
};

const W = 820, H = 180;
const PAD = { top: 16, right: 56, bottom: 36, left: 48 };

const PALETTE = [
  '#10b981', '#60a5fa', '#f59e0b', '#f87171',
  '#a78bfa', '#34d399', '#fb923c', '#38bdf8',
  '#e879f9', '#84cc16',
];

const MEDALS = ['🥇', '🥈', '🥉'];

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${cpx} ${pts[i - 1].y} ${cpx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

export default function LeagueChart({
  scores,
  userId,
  weeks,
}: {
  scores: TeamWeekScore[];
  userId: string;
  weeks: number;
}) {
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  const [hoveredTeam, setHoveredTeam] = useState<number | null>(null);

  const teams = useMemo(() => {
    const map = new Map<number, { id: number; name: string; userName: string; isMe: boolean; weeklyPts: Map<number, number> }>();
    for (const s of scores) {
      if (!map.has(s.fantasy_team_id)) {
        map.set(s.fantasy_team_id, {
          id: s.fantasy_team_id, name: s.team_name, userName: s.user_name,
          isMe: s.user_id === userId, weeklyPts: new Map(),
        });
      }
      map.get(s.fantasy_team_id)!.weeklyPts.set(s.week, s.points);
    }
    return Array.from(map.values()).sort((a, b) => a.isMe ? -1 : b.isMe ? 1 : 0);
  }, [scores, userId]);

  const allWeeks = useMemo(() => Array.from({ length: weeks }, (_, i) => i + 1), [weeks]);

  const series = useMemo(() => teams.map(team => {
    let cum = 0;
    const pts = allWeeks.map(w => {
      cum += Number(team.weeklyPts.get(w) ?? 0);
      return { week: w, pts: cum };
    });
    return [{ week: 0, pts: 0 }, ...pts];
  }), [teams, allWeeks]);

  // Determine medal positions: rank teams by their final cumulative total
  const finalRanks = useMemo(() => {
    return teams
      .map((team, i) => ({ teamId: team.id, finalPts: series[i][series[i].length - 1]?.pts ?? 0, seriesIdx: i }))
      .sort((a, b) => b.finalPts - a.finalPts)
      .slice(0, 3);
  }, [teams, series]);

  const medalByTeam = useMemo(() => {
    const m = new Map<number, number>(); // teamId → medal rank (0=gold,1=silver,2=bronze)
    finalRanks.forEach((r, rank) => m.set(r.teamId, rank));
    return m;
  }, [finalRanks]);

  const allPts = series.flatMap(s => s.map(p => p.pts));
  const maxPts = Math.max(...allPts, 1);

  const xScale = (w: number) =>
    PAD.left + (w / Math.max(weeks, 1)) * (W - PAD.left - PAD.right);
  const yScale = (p: number) =>
    PAD.top + (1 - p / maxPts) * (H - PAD.top - PAD.bottom);

  const yTicks = [...new Set([0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxPts * f / 100) * 100))];

  const tooltipData = hoveredWeek !== null
    ? teams.map((t, i) => ({ team: t, pts: series[i][hoveredWeek]?.pts ?? 0, color: PALETTE[i % PALETTE.length] }))
        .sort((a, b) => b.pts - a.pts)
    : null;

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      <svg
        width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => { setHoveredWeek(null); setHoveredTeam(null); }}
      >
        {/* Y grid lines */}
        {yTicks.map((tick, i) => (
          <g key={`ytick-${i}`}>
            <line
              x1={PAD.left} y1={yScale(tick)} x2={W - PAD.right} y2={yScale(tick)}
              stroke="rgba(255,255,255,0.08)" strokeWidth="1"
            />
            <text x={PAD.left - 6} y={yScale(tick)} textAnchor="end" dominantBaseline="middle"
              fontSize="9" fill="rgba(255,255,255,0.35)" fontWeight="600"
            >
              {tick > 0 ? `${tick}` : '0'}
            </text>
          </g>
        ))}

        {/* X axis week ticks */}
        {allWeeks.map(w => (
          <text key={w} x={xScale(w)} y={H - PAD.bottom + 14}
            textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.3)" fontWeight="600"
          >
            {w}
          </text>
        ))}
        <text x={PAD.left - 2} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)">
          Wk
        </text>

        {/* Hover vertical line */}
        {hoveredWeek !== null && (
          <line
            x1={xScale(hoveredWeek)} y1={PAD.top} x2={xScale(hoveredWeek)} y2={H - PAD.bottom}
            stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="4 3"
          />
        )}

        {/* Team lines */}
        {teams.map((team, i) => {
          const color = PALETTE[i % PALETTE.length];
          const pts = series[i];
          const svgPts = pts.map(p => ({ x: xScale(p.week), y: yScale(p.pts) }));
          const path = smoothPath(svgPts);
          const isMe = team.isMe;
          const isDimmed = hoveredTeam !== null && hoveredTeam !== team.id;
          const medalRank = medalByTeam.get(team.id);
          const lastPt = svgPts[svgPts.length - 1];

          return (
            <g key={team.id} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredTeam(team.id)}
              onMouseLeave={() => setHoveredTeam(null)}
            >
              <path
                d={path} fill="none" stroke={color}
                strokeWidth={isMe ? 2.5 : 1.5}
                strokeOpacity={isDimmed ? 0.15 : isMe ? 1 : 0.65}
                style={{ transition: 'stroke-opacity 0.2s' }}
              />
              {/* Last point dot */}
              {lastPt && medalRank === undefined && (
                <circle
                  cx={lastPt.x} cy={lastPt.y}
                  r={isMe ? 4 : 3}
                  fill={color} fillOpacity={isDimmed ? 0.15 : 1}
                  style={{ transition: 'fill-opacity 0.2s' }}
                />
              )}
              {/* Medal emoji at end of top-3 lines */}
              {lastPt && medalRank !== undefined && (
                <>
                  <circle
                    cx={lastPt.x} cy={lastPt.y}
                    r={isMe ? 4 : 3}
                    fill={color} fillOpacity={isDimmed ? 0.15 : 1}
                    style={{ transition: 'fill-opacity 0.2s' }}
                  />
                  <text
                    x={lastPt.x + 10} y={lastPt.y + 5}
                    fontSize="14" textAnchor="start" dominantBaseline="middle"
                    style={{ opacity: isDimmed ? 0.2 : 1, transition: 'opacity 0.2s' }}
                  >
                    {MEDALS[medalRank]}
                  </text>
                </>
              )}
              {/* Hover dots */}
              {hoveredWeek !== null && svgPts[hoveredWeek] && (
                <circle
                  cx={svgPts[hoveredWeek].x} cy={svgPts[hoveredWeek].y}
                  r={4} fill={color} stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"
                  fillOpacity={isDimmed ? 0.15 : 1}
                />
              )}
            </g>
          );
        })}

        {/* Hover hit areas */}
        {allWeeks.map(w => (
          <rect key={w}
            x={xScale(w) - (W - PAD.left - PAD.right) / (weeks * 2)}
            y={PAD.top}
            width={(W - PAD.left - PAD.right) / weeks}
            height={H - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHoveredWeek(w)}
          />
        ))}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 4, paddingLeft: PAD.left }}>
        {teams.map((team, i) => {
          const color = PALETTE[i % PALETTE.length];
          const medalRank = medalByTeam.get(team.id);
          return (
            <div key={team.id} style={{
              display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              opacity: hoveredTeam !== null && hoveredTeam !== team.id ? 0.3 : 1,
              transition: 'opacity 0.2s',
            }}
              onMouseEnter={() => setHoveredTeam(team.id)}
              onMouseLeave={() => setHoveredTeam(null)}
            >
              <div style={{ width: team.isMe ? 14 : 10, height: team.isMe ? 3 : 2, borderRadius: 99, background: color }} />
              <span style={{ fontSize: 10, fontWeight: team.isMe ? 800 : 500, color: team.isMe ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                {medalRank !== undefined && <span style={{ marginRight: 3 }}>{MEDALS[medalRank]}</span>}
                {team.name}
                {team.isMe && <span style={{ marginLeft: 4, fontSize: 8, color: '#34d399', fontWeight: 800 }}>YOU</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {tooltipData && hoveredWeek !== null && (
        <div style={{
          position: 'absolute', top: 0,
          left: `${Math.min(xScale(hoveredWeek) / W * 100, 58)}%`,
          transform: 'translateX(-50%)',
          background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: '8px 12px',
          pointerEvents: 'none', zIndex: 20, minWidth: 150,
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            {formatWeekLong(hoveredWeek)}
          </div>
          {tooltipData.map(({ team, pts, color }, rank) => (
            <div key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 10, width: 14 }}>{rank < 3 ? MEDALS[rank] : ''}</span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: team.isMe ? '#fff' : 'rgba(255,255,255,0.7)', fontWeight: team.isMe ? 700 : 400, flex: 1 }}>
                {team.name}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{formatPoints(pts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
