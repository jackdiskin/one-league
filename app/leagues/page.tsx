import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import Icon from '@/components/ui/Icon';
import EmptyState from '@/components/ui/EmptyState';
import TopNav from '@/components/TopNav';
import LeaguesClient, { type MyLeague } from './_components/LeaguesClient';
import LeaderboardCard from './_components/LeaderboardCard';

const PREV_SEASON = 2025;

async function detectUserSeason(userId: string): Promise<number> {
  const [row] = await query<{ season_year: number }>(
    `SELECT MAX(season_year) AS season_year FROM fantasy_teams WHERE user_id = ?`,
    [userId]
  );
  return row?.season_year ?? PREV_SEASON;
}

async function fetchCurrentWeek(season: number): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [season]
  );
  return row?.w ?? 1;
}

async function fetchMyLeagues(userId: string, season: number): Promise<MyLeague[]> {
  return query<MyLeague>(
    `SELECT l.id, l.name, l.is_global, l.invite_code, l.max_members, lm.role,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count,
            CASE WHEN ft.id IS NOT NULL THEN
              (SELECT COUNT(*) + 1
               FROM fantasy_teams ft2
               JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
               WHERE ft2.season_year = ft.season_year AND ft2.total_points > ft.total_points)
            ELSE NULL END AS \`rank\`
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.user_id = ? AND ft.season_year = l.season_year
     WHERE lm.user_id = ? AND l.season_year = ?
     ORDER BY l.is_global DESC, l.created_at DESC`,
    [userId, userId, season]
  );
}

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;
  const { season: seasonParam } = await searchParams;
  const SEASON_YEAR = seasonParam ? parseInt(seasonParam, 10) : await detectUserSeason(userId);

  const [currentWeek, myLeagues, hasTeam] = await Promise.all([
    fetchCurrentWeek(SEASON_YEAR),
    fetchMyLeagues(userId, SEASON_YEAR),
    query<{ id: number }>(`SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`, [userId, SEASON_YEAR])
      .then(rows => rows.length > 0),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <TopNav
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        season={SEASON_YEAR} currentWeek={currentWeek}
        logoUri={String(process.env.LOGO_URI)}
      />

      <main className="flex max-w-3xl flex-1 flex-col gap-6 px-6 py-7">
        <div>
          <h1 className="text-display text-ink">Leagues</h1>
          <p className="mt-1 max-w-xl text-label text-ink-3">
            Every OneLeague manager competes on the same global leaderboard. Create or join a
            private league to also compete with friends.
          </p>
        </div>

        {!hasTeam ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={<Icon name="football" size={20} />}
              title="Draft your squad first. You join the global leaderboard the moment you do."
            />
          </div>
        ) : (
          <>
            <div className="max-w-xs">
              <Suspense fallback={<div className="h-32 animate-pulse rounded-card bg-surface-sunken" />}>
                <LeaderboardCard userId={userId} seasonYear={SEASON_YEAR} />
              </Suspense>
            </div>
            <LeaguesClient initialLeagues={myLeagues} />
          </>
        )}
      </main>
    </div>
  );
}
