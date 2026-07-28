import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import SeasonModeSwitcher from '@/app/dashboard/_components/SeasonModeSwitcher';
import LeaguesClient, { type MyLeague } from './_components/LeaguesClient';

const PREV_SEASON = 2025;
const SEASON = 2026;

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

// Sidebar's own "My Leagues" quick-list — kept consistent with every other page.
async function fetchUserLeagues(userId: string): Promise<SidebarLeague[]> {
  return query<SidebarLeague>(
    `SELECT l.id, l.name, l.season_year,
            ft.team_name,
            CASE WHEN ft.id IS NOT NULL THEN
              (SELECT COUNT(*) + 1
               FROM fantasy_teams ft2
               JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
               WHERE ft2.season_year = l.season_year AND ft2.total_points > ft.total_points)
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

  const [currentWeek, userLeagues, myLeagues, hasTeam] = await Promise.all([
    fetchCurrentWeek(SEASON_YEAR),
    fetchUserLeagues(userId),
    fetchMyLeagues(userId, SEASON_YEAR),
    query<{ id: number }>(`SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`, [userId, SEASON_YEAR])
      .then(rows => rows.length > 0),
  ]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON_YEAR}
        logoUri={String(process.env.LOGO_URI)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-3">
            <SeasonModeSwitcher season={SEASON_YEAR} currentWeek={currentWeek} />
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>
          <div style={{ paddingLeft: 4 }}>
            <h1 style={{
              fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a',
            }}>
              Leagues
            </h1>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              Every OneLeague manager competes on the same Global Leaderboard — create or join a private league to also compete with friends.
            </p>
          </div>

          {!hasTeam ? (
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
              <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center text-2xl">🏈</div>
              <p className="font-semibold text-slate-900">Draft your team first</p>
              <p className="text-sm text-slate-500 mt-1">You're auto-enrolled in the Global Leaderboard the moment you draft — private leagues can wait until after.</p>
            </div>
          ) : (
            <LeaguesClient initialLeagues={myLeagues} season={SEASON_YEAR} />
          )}
        </main>
      </div>
    </div>
  );
}
