'use client';

import Image from 'next/image';
import { formatPoints, formatWeekLong } from '@/lib/format';

export interface PerfPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  last_week_points: number | null;
  projected_points: number | null;
}

const POS_COLORS: Record<string, string> = {
  QB: '#3b82f6', RB: '#10b981', WR: '#f59e0b', TE: '#a855f7', K: '#94a3b8',
};

export default function WeeklyPerformance({ players, week }: { players: PerfPlayer[]; week: number }) {
  const played = players.filter(p => p.last_week_points != null);
  const totalActual   = played.reduce((s, p) => s + Number(p.last_week_points ?? 0), 0);
  const totalExpected = played.reduce((s, p) => s + Number(p.projected_points ?? 0), 0);
  const teamDiff = totalActual - totalExpected;
  const teamUp = teamDiff >= 0;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{formatWeekLong(week)} Performance</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{played.length} players scored</p>
        </div>
        {/* Team totals */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projected</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8' }}>{formatPoints(totalExpected)}</div>
          </div>
          <div style={{ width: 1, height: 32, background: '#e2e8f0' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Actual</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>{formatPoints(totalActual)}</div>
          </div>
          <div style={{
            padding: '5px 10px', borderRadius: 20,
            background: teamUp ? '#f0fdf4' : '#fff1f2',
            border: `1px solid ${teamUp ? '#bbf7d0' : '#fecdd3'}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: teamUp ? '#059669' : '#f43f5e' }}>
              {teamUp ? '+' : ''}{formatPoints(teamDiff)}
            </span>
          </div>
        </div>
      </div>

      {/* Column labels */}
      <div style={{
        padding: '6px 20px',
        background: '#f8fafc',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center',
        fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <div style={{ flex: 1 }}>Player</div>
        <div style={{ width: 120, textAlign: 'right' }}>Projected</div>
        <div style={{ width: 80, textAlign: 'right' }}>Actual</div>
        <div style={{ width: 80, textAlign: 'right' }}>Diff</div>
        <div style={{ width: 160, textAlign: 'right', paddingRight: 4 }}>vs Projection</div>
      </div>

      {/* Player rows */}
      <div>
        {players
          .slice()
          .sort((a, b) => (b.last_week_points ?? -1) - (a.last_week_points ?? -1))
          .map((p, i) => {
            const actual = p.last_week_points != null ? Number(p.last_week_points) : null;
            const proj   = p.projected_points  != null ? Number(p.projected_points)  : null;
            const diff   = actual != null && proj != null ? actual - proj : null;
            const up     = diff != null ? diff >= 0 : null;
            const barPct = actual != null && proj != null && proj > 0
              ? Math.min(160, (actual / proj) * 100)
              : null;
            const posColor = POS_COLORS[p.position] ?? '#94a3b8';

            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center',
                padding: '10px 20px',
                borderBottom: '1px solid #f8fafc',
                cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                {/* Avatar */}
                <div style={{ position: 'relative', flexShrink: 0, marginRight: 12 }}>
                  {p.headshot_url ? (
                    <Image src={p.headshot_url} alt={p.full_name} width={38} height={38} unoptimized
                      style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f1f5f9', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#64748b' }}>
                      {p.full_name[0]}
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: -1, right: -1,
                    width: 14, height: 14, borderRadius: '50%',
                    background: posColor, border: '2px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 6, fontWeight: 900, color: '#fff',
                  }}>
                    {p.position[0]}
                  </div>
                </div>

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.full_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{p.team_code}</div>
                </div>

                {/* Projected */}
                <div style={{ width: 120, textAlign: 'right', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                  {proj != null ? formatPoints(proj) : '—'}
                </div>

                {/* Actual */}
                <div style={{ width: 80, textAlign: 'right', fontSize: 14, fontWeight: 800, color: actual != null ? '#0f172a' : '#cbd5e1' }}>
                  {actual != null ? formatPoints(actual) : '—'}
                </div>

                {/* Diff */}
                <div style={{ width: 80, textAlign: 'right' }}>
                  {diff != null ? (
                    <span style={{ fontSize: 12, fontWeight: 700, color: up ? '#10b981' : '#f43f5e' }}>
                      {up ? '+' : ''}{formatPoints(diff)}
                    </span>
                  ) : <span style={{ color: '#e2e8f0' }}>—</span>}
                </div>

                {/* Visual bar */}
                <div style={{ width: 160, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {barPct != null ? (
                    <>
                      <div style={{ flex: 1, height: 6, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden', position: 'relative' }}>
                        {/* Projection baseline at 100% */}
                        <div style={{
                          position: 'absolute', left: `${Math.min(100, (100 / 160) * 100)}%`,
                          top: 0, bottom: 0, width: 1, background: '#cbd5e1', zIndex: 1,
                        }} />
                        <div style={{
                          height: '100%', borderRadius: 4,
                          background: up ? '#10b981' : '#f43f5e',
                          width: `${(barPct / 160) * 100}%`,
                          opacity: 0.75,
                        }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, color: up ? '#10b981' : '#f43f5e', width: 32, textAlign: 'right', flexShrink: 0 }}>
                        {barPct.toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 10, color: '#e2e8f0' }}>No data</span>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
