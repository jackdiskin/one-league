'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { formatSeasonStatus } from '@/lib/format';

const PREV_SEASON = 2025;
const NEXT_SEASON = 2026;

interface Props {
  season: number;
  currentWeek: number;
}

export default function SeasonModeSwitcher({ season, currentWeek }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  async function handleForwardClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/teams/has-team?season=${NEXT_SEASON}`);
      const data = await res.json();
      if (data.hasTeam) {
        router.push(`${pathname}?season=${NEXT_SEASON}`);
      } else {
        router.push('/onboarding/draft');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleBackClick() {
    router.push(`${pathname}?season=${PREV_SEASON}`);
  }

  const statusText  = formatSeasonStatus(season, currentWeek);
  const isPostSeason = statusText.includes('Post-Season');
  // Viewing 2026 (or any future season) — offer a back button to 2025 post-season
  const isNextSeason = season >= NEXT_SEASON;
  // Dot colour: amber for 2025 post-season, green for active season
  const dotColor = isPostSeason ? '#f59e0b' : '#10b981';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      borderRadius: 20, background: '#f8fafc',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
    }}>
      {/* Back button — only shown when viewing 2026+ */}
      {isNextSeason && (
        <>
          <button
            onClick={handleBackClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 700,
              color: '#64748b',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#334155'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
            title="View 2025 post-season"
          >
            <span style={{ fontSize: 10 }}>←</span>
            <span>{PREV_SEASON} Post-Season</span>
          </button>
          <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        </>
      )}

      {/* Current status pill — always visible */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 12px',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: dotColor,
          display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
          {statusText}
        </span>
      </div>

      {/* Forward button — shown whenever viewing the previous season */}
      {!isNextSeason && (
        <>
          <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
          <button
            onClick={handleForwardClick}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px',
              background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer',
              fontSize: 11, fontWeight: 700,
              color: loading ? '#cbd5e1' : '#059669',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.color = '#047857'; }}
            onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.color = '#059669'; }}
            title="Go to 2026 season"
          >
            {loading ? (
              <span style={{ fontSize: 10, opacity: 0.5 }}>…</span>
            ) : (
              <>
                <span>{NEXT_SEASON} Season</span>
                <span style={{ fontSize: 10 }}>→</span>
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
