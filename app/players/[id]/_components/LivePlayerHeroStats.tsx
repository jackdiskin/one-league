'use client';

import { useLiveStats, type LiveStatDelta } from '@/hooks/useLiveStats';
import { formatPoints } from '@/lib/format';

// Position-specific stats to surface, mapped to LiveStatDelta keys
const POS_STATS: Record<string, Array<{ key: keyof LiveStatDelta; label: string }>> = {
  QB: [
    { key: 'passingYards',   label: 'Pass Yds' },
    { key: 'passingTds',     label: 'Pass TD'  },
    { key: 'interceptions',  label: 'INT'      },
    { key: 'rushingYards',   label: 'Rush Yds' },
    { key: 'rushingTds',     label: 'Rush TD'  },
  ],
  RB: [
    { key: 'rushingYards',   label: 'Rush Yds' },
    { key: 'rushingTds',     label: 'Rush TD'  },
    { key: 'receptions',     label: 'Rec'      },
    { key: 'receivingYards', label: 'Rec Yds'  },
    { key: 'receivingTds',   label: 'Rec TD'   },
  ],
  WR: [
    { key: 'receptions',     label: 'Rec'      },
    { key: 'receivingYards', label: 'Rec Yds'  },
    { key: 'receivingTds',   label: 'Rec TD'   },
    { key: 'rushingYards',   label: 'Rush Yds' },
    { key: 'rushingTds',     label: 'Rush TD'  },
  ],
  TE: [
    { key: 'receptions',     label: 'Rec'      },
    { key: 'receivingYards', label: 'Rec Yds'  },
    { key: 'receivingTds',   label: 'Rec TD'   },
  ],
  K: [
    { key: 'fg0_39',   label: '0–39 yd' },
    { key: 'fg40_49',  label: '40–49 yd' },
    { key: 'fg50Plus', label: '50+ yd'  },
    { key: 'xpMade',   label: 'XP'      },
  ],
};

export default function LivePlayerHeroStats({
  espnAthleteId,
  position,
}: {
  espnAthleteId: string | null;
  position: string;
}) {
  const liveStats = useLiveStats(espnAthleteId ? [espnAthleteId] : []);
  const data = espnAthleteId ? liveStats.get(espnAthleteId) : undefined;

  if (!data) return null;

  const t = data.totals;
  const statDefs = POS_STATS[position] ?? POS_STATS.WR;
  // Only show stats with a non-zero value
  const visibleStats = statDefs.filter(s => (t[s.key] ?? 0) > 0);

  // Kicker: also build FG total
  const fgMade = (t.fg0_39 ?? 0) + (t.fg40_49 ?? 0) + (t.fg50Plus ?? 0);
  const fgAtt  = fgMade + (t.fgMissed ?? 0);

  return (
    <div style={{
      marginTop: 20,
      paddingTop: 18,
      borderTop: '1px solid #f1f5f9',
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      flexWrap: 'wrap',
    }}>
      <style>{`
        @keyframes hero-live-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.7); }
        }
      `}</style>

      {/* LIVE badge + points */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.28)',
          fontSize: 9, fontWeight: 800, color: '#059669',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0,
            animation: 'hero-live-pulse 1.4s ease-in-out infinite',
          }} />
          Live
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Fantasy pts
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#059669', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {formatPoints(t.fantasyPointsTotal)}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 40, background: '#e2e8f0', flexShrink: 0 }} />

      {/* Stat grid */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {position === 'K' ? (
          // Kicker: show FG total + XP
          <>
            {fgAtt > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>FG</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{fgMade}/{fgAtt}</div>
              </div>
            )}
            {t.xpMade > 0 && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>XP</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{t.xpMade}</div>
              </div>
            )}
          </>
        ) : (
          visibleStats.map(s => {
            const val = t[s.key] ?? 0;
            const isTd = s.key.endsWith('Tds') || s.key === 'twoPtConversions';
            const isNeg = s.key === 'interceptions' || s.key === 'fumblesLost';
            return (
              <div key={s.key}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {s.label}
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800,
                  color: isTd ? '#d97706' : isNeg ? '#e11d48' : '#0f172a',
                }}>
                  {val}
                </div>
              </div>
            );
          })
        )}
        {visibleStats.length === 0 && position !== 'K' && (
          <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No stats yet this game</div>
        )}
      </div>
    </div>
  );
}
