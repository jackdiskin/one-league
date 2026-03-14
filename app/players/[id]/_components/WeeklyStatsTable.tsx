'use client';

import { useState } from 'react';
import { formatPoints, formatWeek } from '@/lib/format';

export interface WeekScore {
  week: number;
  fantasy_points: number;
  projected_points: number;
  [key: string]: number;
}

export interface StatCol {
  key: string;
  label: string;
}

interface Props {
  historicalScores: WeekScore[];
  currentScores: WeekScore[];
  statCols: StatCol[];
  historicalSeason: number;
  currentSeason: number;
}

function StatsRows({
  scores,
  statCols,
}: {
  scores: WeekScore[];
  statCols: StatCol[];
}) {
  const seasonPts = scores.reduce((s, w) => s + Number(w.fantasy_points ?? 0), 0);

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: 'flex', padding: '7px 20px',
        background: '#f8fafc', borderBottom: '1px solid #f1f5f9',
        fontSize: 9, fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <div style={{ width: 80, flexShrink: 0 }}>Week</div>
        <div style={{ width: 80, textAlign: 'right' }}>Pts</div>
        <div style={{ width: 80, textAlign: 'right' }}>Proj</div>
        <div style={{ width: 72, textAlign: 'right' }}>Diff</div>
        {statCols.map(c => (
          <div key={c.key} style={{ flex: 1, textAlign: 'right' }}>{c.label}</div>
        ))}
      </div>

      {/* Rows */}
      {scores.map((row, i) => {
        const actual = Number(row.fantasy_points ?? 0);
        const proj   = Number(row.projected_points ?? 0);
        const diff   = proj > 0 ? actual - proj : null;
        return (
          <div key={row.week} style={{
            display: 'flex', padding: '10px 20px', alignItems: 'center',
            borderBottom: i < scores.length - 1 ? '1px solid #f8fafc' : 'none',
            background: i % 2 === 0 ? 'transparent' : '#fafafa',
          }}>
            <div style={{ width: 80, flexShrink: 0 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                background: '#f1f5f9', color: '#475569',
                borderRadius: 6, padding: '2px 7px',
                whiteSpace: 'nowrap', display: 'inline-block',
              }}>
                {formatWeek(row.week)}
              </span>
            </div>
            <div style={{ width: 80, textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {formatPoints(actual)}
            </div>
            <div style={{ width: 80, textAlign: 'right', fontSize: 12, color: '#94a3b8' }}>
              {proj > 0 ? formatPoints(proj) : '—'}
            </div>
            <div style={{ width: 72, textAlign: 'right', fontSize: 12, fontWeight: 700, color: diff != null ? (diff >= 0 ? '#10b981' : '#f43f5e') : '#cbd5e1' }}>
              {diff != null ? `${diff >= 0 ? '+' : ''}${formatPoints(diff)}` : '—'}
            </div>
            {statCols.map(c => (
              <div key={c.key} style={{ flex: 1, textAlign: 'right', fontSize: 12, color: '#475569' }}>
                {Number(row[c.key] ?? 0) || '—'}
              </div>
            ))}
          </div>
        );
      })}

      {/* Season average footer */}
      {scores.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'flex-end',
          padding: '8px 20px',
          borderTop: '1px solid #f1f5f9',
          fontSize: 10, fontWeight: 700, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Season avg: {formatPoints(seasonPts / scores.length)} / wk
        </div>
      )}
    </div>
  );
}

export default function WeeklyStatsTable({
  historicalScores,
  currentScores,
  statCols,
  historicalSeason,
  currentSeason,
}: Props) {
  const hasTabs = currentScores.length > 0;
  const [activeTab, setActiveTab] = useState<'current' | 'historical'>('current');

  const activeScores = !hasTabs
    ? historicalScores
    : activeTab === 'current'
      ? currentScores
      : historicalScores;

  const totalWeeks = activeScores.length;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Weekly Stats</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
            {hasTabs
              ? activeTab === 'current'
                ? `${currentSeason} season · ${currentScores.length} weeks`
                : `${historicalSeason} season · ${historicalScores.length} weeks`
              : `${historicalSeason} season · ${historicalScores.length} weeks`}
          </p>
        </div>

        {/* Tabs — only rendered when 2026 data exists */}
        {hasTabs && (
          <div style={{
            display: 'flex', gap: 2,
            background: '#f1f5f9', borderRadius: 10, padding: 3,
          }}>
            {(['current', 'historical'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  fontSize: 11, fontWeight: 700,
                  padding: '4px 12px', borderRadius: 8,
                  border: 'none', cursor: 'pointer',
                  background: activeTab === tab ? '#fff' : 'transparent',
                  color: activeTab === tab ? '#0f172a' : '#94a3b8',
                  boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {tab === 'current' ? currentSeason : historicalSeason}
              </button>
            ))}
          </div>
        )}
      </div>

      <StatsRows scores={activeScores} statCols={statCols} />
    </div>
  );
}
