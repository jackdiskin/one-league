import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import MyTeamSummary   from './_components/MyTeamSummary';
import WeekScoreSection from './_components/WeekScoreSection';
import TopMovers       from './_components/TopMovers';
import StandingsCard, { type LeagueStanding } from './_components/StandingsCard';
import JoinPrivateLeague from './_components/JoinPrivateLeague';
import MatchupsCard    from './_components/MatchupsCard';
import TopNav from '@/components/TopNav';
import { formatWeekLong } from '@/lib/format';

const SCHEDULE_SEASON = 2026;

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-line ${className}`} />;
}

async function fetchCurrentWeek(season: number): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [season]
  );
  return row?.w ?? 1;
}

async function detectUserSeason(userId: string): Promise<number> {
  const [row] = await query<{ season_year: number }>(
    `SELECT MAX(season_year) AS season_year FROM fantasy_teams WHERE user_id = ?`,
    [userId]
  );
  return row?.season_year ?? 2025;
}

async function fetchUserLeagues(userId: string): Promise<LeagueStanding[]> {
  return query<LeagueStanding>(
    `SELECT l.id, l.name, l.season_year,
            ft.team_name,
            CASE WHEN ft.id IS NOT NULL THEN
              (SELECT COUNT(*) + 1
               FROM fantasy_teams ft2
               JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
               LEFT JOIN (
                 SELECT ftr2.fantasy_team_id, SUM(pms2.current_price) AS rv
                 FROM fantasy_team_roster ftr2
                 JOIN player_market_state pms2 ON pms2.player_id = ftr2.player_id AND pms2.season_year = l.season_year
                 WHERE ftr2.is_active = TRUE GROUP BY ftr2.fantasy_team_id
               ) rv2 ON rv2.fantasy_team_id = ft2.id
               WHERE ft2.season_year = l.season_year
                 AND (ft2.total_points > ft.total_points
                      OR (ft2.total_points = ft.total_points
                          AND COALESCE(rv2.rv, 0) > (
                            SELECT COALESCE(SUM(pms3.current_price), 0)
                            FROM fantasy_team_roster ftr3
                            JOIN player_market_state pms3 ON pms3.player_id = ftr3.player_id AND pms3.season_year = l.season_year
                            WHERE ftr3.fantasy_team_id = ft.id AND ftr3.is_active = TRUE
                          ))))
            ELSE NULL END AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.user_id = ? AND ft.season_year = l.season_year
     WHERE lm.user_id = ?
     ORDER BY l.created_at DESC`,
    [userId, userId]
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId    = session.user.id;
  const firstName = session.user.name?.split(' ')[0] ?? 'there';

  // Resolve season: explicit param → user's latest team → 2025 fallback
  const params = await searchParams;
  const requestedSeason = params.season ? parseInt(params.season, 10) : null;
  const SEASON = requestedSeason ?? await detectUserSeason(userId);

  // New users with no team yet → onboarding
  const [teamCheck] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, SEASON]
  );
  if (!teamCheck) redirect('/onboarding/draft');

  const [currentWeek, userLeagues] = await Promise.all([
    fetchCurrentWeek(SEASON),
    fetchUserLeagues(userId),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">

      <TopNav
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        currentWeek={currentWeek}
        logoUri={String(process.env.LOGO_URI)}
      />

      <main className="flex flex-1 flex-col gap-6 px-6 py-8">

        {/* Greeting */}
        <div>
          <h1 className="text-display text-ink">
            Welcome back, <span className="text-emerald">{firstName}</span>
          </h1>
          <p className="mt-1 text-label text-ink-3">
            {formatWeekLong(currentWeek)} · <span className="font-mono tabular-nums">{SEASON}</span> NFL season
          </p>
        </div>

        {/* Current week score — live once games kick off, projected until then */}
        <Suspense fallback={<Skeleton className="h-40" />}>
          <WeekScoreSection teamId={teamCheck.id} season={SEASON} currentWeek={currentWeek} />
        </Suspense>

        {/* Field, same grid-cols-team split as My Team so the field renders
            at the exact same size there — then the second track (1fr) splits
            again into standings+join-league on the left and matchups on the
            right. min-w-0 keeps the field's internal min-width (see
            FieldPanel) from inflating its track past its 1.1fr share; it
            scrolls internally instead. */}
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-team">
          <div className="min-w-0">
            <Suspense fallback={<Skeleton className="h-[580px]" />}>
              <MyTeamSummary userId={userId} seasonYear={SEASON} hidePrices interactive />
            </Suspense>
          </div>

          <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-5">
              <StandingsCard leagues={userLeagues} />
              <JoinPrivateLeague />
            </div>
            <Suspense fallback={<Skeleton className="h-64" />}>
              <MatchupsCard season={SCHEDULE_SEASON} week={currentWeek} />
            </Suspense>
          </div>
        </div>

        {/* Top Movers */}
        <Suspense fallback={
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        }>
          <TopMovers seasonYear={SEASON} />
        </Suspense>

      </main>
    </div>
  );
}
