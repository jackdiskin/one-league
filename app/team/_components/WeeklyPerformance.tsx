'use client';

import Image from 'next/image';
import { formatPoints, formatWeekLong, formatPlayerName } from '@/lib/format';
import SectionHeader from '@/components/ui/SectionHeader';
import StatCard from '@/components/ui/StatCard';
import ClickablePlayerRow from '@/components/ClickablePlayerRow';
import TeamLogo from '@/components/TeamLogo';
import MatchupBadge from '@/components/MatchupBadge';
import type { Matchup } from '@/lib/schedule';

export interface PerfPlayer {
  id: number;
  full_name: string;
  position: string;
  team_code: string;
  headshot_url: string | null;
  roster_slot: string;
  last_week_points: number | null;
  projected_points: number | null;
}

export default function WeeklyPerformance({ players, week, season, matchups }: {
  players: PerfPlayer[]; week: number; season?: number; matchups: Record<string, Matchup>;
}) {
  // Bench points never count toward the score (only starters do — see
  // api/admin/scores and api/admin/finalize-games, which apply the same
  // roster_slot != 'BENCH' filter when computing the official total_points),
  // so the header totals below only sum starters even though every rostered
  // player (bench included) still gets its own row for visibility.
  const starters = players.filter(p => p.roster_slot !== 'BENCH');
  const startersPlayed = starters.filter(p => p.last_week_points != null).length;
  const totalActual   = starters.reduce((s, p) => s + Number(p.last_week_points ?? 0), 0);
  const totalExpected = starters.reduce((s, p) => s + Number(p.projected_points ?? 0), 0);
  const teamDiff = totalActual - totalExpected;
  const teamUp = teamDiff >= 0;

  return (
    <div className="@container overflow-hidden rounded-card border border-line bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-3 pt-4">
        <SectionHeader
          title={`${formatWeekLong(week)} performance`}
          sub={`${startersPlayed} of ${starters.length} starters scored`}
        />
        <div className="flex items-center gap-3">
          <StatCard bare align="right" label="Projected" value={formatPoints(totalExpected)} tone="muted" />
          <div className="h-8 w-px bg-line" />
          <StatCard bare align="right" label="Actual" value={formatPoints(totalActual)} />
          <span className={[
            'rounded-pill px-2.5 py-1 font-mono tabular-nums text-label',
            teamUp ? 'bg-emerald-tint text-up' : 'bg-surface-sunken text-down',
          ].join(' ')}>
            {teamUp ? '+' : ''}{formatPoints(teamDiff)}
          </span>
        </div>
      </div>

      {/* Column labels — Diff and the vs-projection bar are the first to
          drop as the row narrows; Player/Projected/Actual never do. */}
      <div className="sticky top-0 z-10 flex items-center border-y border-line bg-surface-sunken px-5 py-2 text-eyebrow uppercase text-ink-3">
        <div className="flex-1">Player</div>
        <div className="w-[120px] text-right">Projected</div>
        <div className="w-20 text-right">Actual</div>
        <div className="hidden w-20 text-right @lg:block">Diff</div>
        <div className="hidden w-40 pr-1 text-right @2xl:block">vs projection</div>
      </div>

      {/* Player rows */}
      <div>
        {players
          .slice()
          .sort((a, b) => (b.last_week_points ?? -1) - (a.last_week_points ?? -1))
          .map(p => {
            const actual = p.last_week_points != null ? Number(p.last_week_points) : null;
            const proj   = p.projected_points  != null ? Number(p.projected_points)  : null;
            const diff   = actual != null && proj != null ? actual - proj : null;
            const up     = diff != null ? diff >= 0 : null;
            const barPct = actual != null && proj != null && proj > 0
              ? Math.min(160, (actual / proj) * 100)
              : null;

            return (
              <ClickablePlayerRow
                key={p.id}
                playerId={p.id}
                season={season}
                className="flex items-center border-b border-line px-5 py-2.5 transition-colors duration-150 ease-out-quart hover:bg-surface-sunken"
              >
                {/* Avatar */}
                <div className="relative mr-3 shrink-0">
                  {p.headshot_url ? (
                    <Image src={p.headshot_url} alt={p.full_name} width={38} height={38} unoptimized
                      className="block h-[38px] w-[38px] object-contain"
                    />
                  ) : (
                    <div className="flex h-[38px] w-[38px] items-center justify-center rounded-pill bg-emerald-tint text-label text-emerald">
                      {p.full_name[0]}
                    </div>
                  )}
                </div>

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-body font-medium text-ink">
                      {formatPlayerName(p.full_name)}
                    </span>
                    <TeamLogo code={p.team_code} size={11} />
                    <span className="shrink-0 text-label text-ink-3">{p.team_code}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-label text-ink-3">
                    <MatchupBadge matchup={matchups[p.team_code]} />
                  </div>
                </div>

                {/* Projected */}
                <div className="w-[120px] text-right font-mono tabular-nums text-label text-ink-2">
                  {proj != null ? formatPoints(proj) : '0.0'}
                </div>

                {/* Actual */}
                <div className={[
                  'w-20 text-right font-mono tabular-nums text-body',
                  actual != null ? 'text-ink' : 'text-ink-3',
                ].join(' ')}>
                  {actual != null ? formatPoints(actual) : 'DNP'}
                </div>

                {/* Diff */}
                <div className="hidden w-20 text-right font-mono tabular-nums text-label @lg:block">
                  {diff != null ? (
                    <span className={up ? 'text-up' : 'text-down'}>
                      {up ? '+' : ''}{formatPoints(diff)}
                    </span>
                  ) : <span className="text-ink-3">--</span>}
                </div>

                {/* Visual bar */}
                <div className="hidden w-40 items-center gap-1.5 pl-3 @2xl:flex">
                  {barPct != null ? (
                    <>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-line">
                        {/* Projection baseline at 100% */}
                        <div aria-hidden="true" className="absolute inset-y-0 z-10 w-px bg-line-strong" style={{ left: `${(100 / 160) * 100}%` }} />
                        <div
                          className={`h-full rounded-pill ${up ? 'bg-up' : 'bg-down'}`}
                          style={{ width: `${(barPct / 160) * 100}%` }}
                        />
                      </div>
                      <span className={[
                        'w-8 shrink-0 text-right font-mono tabular-nums text-eyebrow',
                        up ? 'text-up' : 'text-down',
                      ].join(' ')}>
                        {barPct.toFixed(0)}%
                      </span>
                    </>
                  ) : (
                    <span className="text-eyebrow text-ink-3">No data</span>
                  )}
                </div>
              </ClickablePlayerRow>
            );
          })}
      </div>
    </div>
  );
}
