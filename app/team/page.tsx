import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatWeekLong } from '@/lib/format';
import SeasonModeSwitcher from '@/app/dashboard/_components/SeasonModeSwitcher';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import MyTeamSummary from '@/app/dashboard/_components/MyTeamSummary';
import RosterList,   { type RosterPlayer }   from './_components/RosterList';
import LiveTotalPointsTile from './_components/LiveTotalPointsTile';
import WeeklyPerformance, { type PerfPlayer } from './_components/WeeklyPerformance';
import { getNextMatchupByTeam } from '@/lib/schedule';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';

const PREV_SEASON = 2025;
const SCHEDULE_SEASON = 2026;

function Skeleton({ h = 200 }: { h?: number }) {
  return <div className="animate-pulse rounded-card bg-line" style={{ height: h }} />;
}

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

async function fetchLastScoreWeek(season: number): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [season]
  );
  return row?.w ?? 1;
}

async function fetchUserLeagues(userId: string): Promise<SidebarLeague[]> {
  return query<SidebarLeague>(
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

async function fetchTeam(userId: string, season: number) {
  const [team] = await query<{
    id: number; team_name: string; total_points: number;
    budget_remaining: number; league_name: string; rank: number; league_size: number;
  }>(
    `SELECT ft.id, ft.team_name, ft.total_points, ft.budget_remaining,
            l.name AS league_name,
            (SELECT COUNT(*) + 1
             FROM fantasy_teams ft2
             JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
             LEFT JOIN (
               SELECT ftr2.fantasy_team_id, SUM(pms2.current_price) AS rv
               FROM fantasy_team_roster ftr2
               JOIN player_market_state pms2 ON pms2.player_id = ftr2.player_id AND pms2.season_year = ft.season_year
               WHERE ftr2.is_active = TRUE GROUP BY ftr2.fantasy_team_id
             ) rv2 ON rv2.fantasy_team_id = ft2.id
             WHERE ft2.season_year = ft.season_year
               AND (ft2.total_points > ft.total_points
                    OR (ft2.total_points = ft.total_points
                        AND COALESCE(rv2.rv, 0) > (
                          SELECT COALESCE(SUM(pms3.current_price), 0)
                          FROM fantasy_team_roster ftr3
                          JOIN player_market_state pms3 ON pms3.player_id = ftr3.player_id AND pms3.season_year = ft.season_year
                          WHERE ftr3.fantasy_team_id = ft.id AND ftr3.is_active = TRUE
                        )))) AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS league_size
     FROM fantasy_teams ft
     JOIN leagues l ON l.season_year = ft.season_year AND l.is_global = 1
     WHERE ft.user_id = ? AND ft.season_year = ?
     LIMIT 1`,
    [userId, season]
  );
  return team ?? null;
}

async function fetchRoster(season: number, teamId: number, lastWeek: number): Promise<RosterPlayer[]> {
  return query<RosterPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            p.external_player_id,
            pms.current_price, ftr.purchase_price, ftr.acquired_week, ftr.roster_slot,
            pws.fantasy_points           AS last_week_points,
            pwp.expected_points          AS projected_points,
            tot.season_points,
            ranked.pos_rank              AS position_rank
     FROM fantasy_team_roster ftr
     JOIN players p          ON p.id = ftr.player_id
     JOIN player_market_state pms
       ON pms.player_id = ftr.player_id AND pms.season_year = ?
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = ftr.player_id AND pws.season_year = ? AND pws.week = ?
     LEFT JOIN player_weekly_projections pwp
       ON pwp.player_id = ftr.player_id AND pwp.season_year = ? AND pwp.week = ?
          AND pwp.projection_source = 'internal_model'
     LEFT JOIN (
       SELECT player_id, SUM(fantasy_points) AS season_points
       FROM player_weekly_scores WHERE season_year = ? GROUP BY player_id
     ) tot ON tot.player_id = ftr.player_id
     LEFT JOIN (
       SELECT p2.id AS player_id,
              RANK() OVER (PARTITION BY p2.position ORDER BY COALESCE(SUM(pws2.fantasy_points),0) DESC) AS pos_rank
       FROM players p2
       LEFT JOIN player_weekly_scores pws2 ON pws2.player_id = p2.id AND pws2.season_year = ?
       GROUP BY p2.id, p2.position
     ) ranked ON ranked.player_id = ftr.player_id
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE
     ORDER BY FIELD(p.position,'QB','RB','WR','TE'), pms.current_price DESC`,
    [season, season, lastWeek, season, lastWeek, season, season, teamId]
  );
}

async function fetchWeeklyPerf(season: number, teamId: number, lastWeek: number): Promise<PerfPlayer[]> {
  return query<PerfPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url, ftr.roster_slot,
            pws.fantasy_points   AS last_week_points,
            pwp.expected_points  AS projected_points
     FROM fantasy_team_roster ftr
     JOIN players p ON p.id = ftr.player_id
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = ftr.player_id AND pws.season_year = ? AND pws.week = ?
     LEFT JOIN player_weekly_projections pwp
       ON pwp.player_id = ftr.player_id AND pwp.season_year = ? AND pwp.week = ?
          AND pwp.projection_source = 'internal_model'
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE`,
    [season, lastWeek, season, lastWeek, teamId]
  );
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;
  const { season: seasonParam } = await searchParams;
  const SEASON = seasonParam ? parseInt(seasonParam, 10) : await detectUserSeason(userId);

  const [currentWeek, lastScoreWeek, userLeagues, team] = await Promise.all([
    fetchCurrentWeek(SEASON),
    fetchLastScoreWeek(SEASON),
    fetchUserLeagues(userId),
    fetchTeam(userId, SEASON),
  ]);


  if (!team) {
    return (
      <div className="flex min-h-screen flex-col bg-surface md:flex-row">
        <Sidebar
          user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
          leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
          logoUri={String(process.env.LOGO_URI)}
        />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<Icon name="football" size={20} />}
            title="Draft a squad to start managing your lineup."
          />
        </div>
      </div>
    );
  }

  const [roster, weeklyPerf, matchups] = await Promise.all([
    fetchRoster(SEASON, team.id, lastScoreWeek),
    fetchWeeklyPerf(SEASON, team.id, lastScoreWeek),
    getNextMatchupByTeam(SCHEDULE_SEASON),
  ]);

  const rankLabel = team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : team.rank === 3 ? '3rd' : `${team.rank}th`;

  return (
    <div className="flex min-h-screen flex-col bg-surface md:flex-row">

      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-3">
            <SeasonModeSwitcher season={SEASON} currentWeek={currentWeek} />
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-ink text-eyebrow text-surface">
                {session.user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-6 py-7">

          {/* Page title */}
          <div>
            <h1 className="text-display text-emerald">{team.team_name}</h1>
            <p className="mt-1 text-label text-ink-3">
              {formatWeekLong(currentWeek)} · <span className="font-mono tabular-nums">{SEASON}</span> NFL season
            </p>
          </div>

          {/* Quick stat tiles */}
          <div className="grid grid-cols-2 gap-4">
            <LiveTotalPointsTile roster={roster} seasonBasePoints={team.total_points} />
            <StatCard
              label="League rank"
              value={rankLabel}
              sub={`of ${team.league_size} teams`}
              tone={team.rank <= 3 ? 'accent' : 'default'}
            />
          </div>

          {/* Formation */}
          <Suspense fallback={<Skeleton h={580} />}>
            <MyTeamSummary userId={userId} seasonYear={SEASON} hidePrices interactive />
          </Suspense>

          {/* Roster list — starters/bench lineup management only */}
          <RosterList
            roster={roster}
            teamId={team.id}
            matchups={matchups}
            season={SEASON}
          />

          {/* Weekly performance */}
          <WeeklyPerformance players={weeklyPerf} week={lastScoreWeek} season={SEASON} matchups={matchups} />

        </main>
      </div>
    </div>
  );
}
