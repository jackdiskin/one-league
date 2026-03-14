import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPrice, formatPoints, formatWeekLong } from '@/lib/format';
import SeasonModeSwitcher from '@/app/dashboard/_components/SeasonModeSwitcher';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import MyTeamSummary from '@/app/dashboard/_components/MyTeamSummary';
import RosterList,   { type RosterPlayer }   from './_components/RosterList';
import CapBreakdown  from './_components/CapBreakdown';
import WeeklyPerformance, { type PerfPlayer } from './_components/WeeklyPerformance';
import AvailablePlayers, { type AvailablePlayer } from './_components/AvailablePlayers';

const SEASON = 2025;

function Skeleton({ h = 200 }: { h?: number }) {
  return <div className="rounded-2xl bg-slate-100 animate-pulse" style={{ height: h }} />;
}

async function fetchCurrentWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [SEASON]
  );
  return row?.w ?? 1;
}

async function fetchLastScoreWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [SEASON]
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

async function fetchTeam(userId: string) {
  const [team] = await query<{
    id: number; team_name: string; total_points: number;
    budget_remaining: number; league_name: string; rank: number; league_size: number;
  }>(
    `SELECT ft.id, ft.team_name, ft.total_points, ft.budget_remaining,
            l.name AS league_name,
            (SELECT COUNT(*) + 1
             FROM fantasy_teams ft2
             JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = ft.league_id
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
            (SELECT COUNT(*) FROM league_members WHERE league_id = ft.league_id) AS league_size
     FROM fantasy_teams ft
     JOIN leagues l ON l.id = ft.league_id
     WHERE ft.user_id = ? AND ft.season_year = ?
     ORDER BY ft.created_at DESC LIMIT 1`,
    [userId, SEASON]
  );
  return team ?? null;
}

async function fetchRoster(teamId: number, lastWeek: number): Promise<RosterPlayer[]> {
  return query<RosterPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            p.espn_athlete_id,
            pms.current_price, ftr.purchase_price, ftr.acquired_week, ftr.roster_slot,
            pws.fantasy_points           AS last_week_points,
            tot.season_points
     FROM fantasy_team_roster ftr
     JOIN players p          ON p.id = ftr.player_id
     JOIN player_market_state pms
       ON pms.player_id = ftr.player_id AND pms.season_year = ?
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = ftr.player_id AND pws.season_year = ? AND pws.week = ?
     LEFT JOIN (
       SELECT player_id, SUM(fantasy_points) AS season_points
       FROM player_weekly_scores WHERE season_year = ? GROUP BY player_id
     ) tot ON tot.player_id = ftr.player_id
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE
     ORDER BY FIELD(p.position,'QB','RB','WR','TE','K'), pms.current_price DESC`,
    [SEASON, SEASON, lastWeek, SEASON, teamId]
  );
}

async function fetchWeeklyPerf(teamId: number, lastWeek: number): Promise<PerfPlayer[]> {
  return query<PerfPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
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
    [SEASON, lastWeek, SEASON, lastWeek, teamId]
  );
}

async function fetchAvailable(teamId: number, lastWeek: number): Promise<AvailablePlayer[]> {
  return query<AvailablePlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            COALESCE(pms.current_price, 0) AS current_price,
            pws.fantasy_points AS last_week_points
     FROM players p
     LEFT JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = p.id AND pws.season_year = ? AND pws.week = ?
     WHERE p.id NOT IN (
       SELECT player_id FROM fantasy_team_roster
       WHERE fantasy_team_id = ? AND is_active = TRUE
     )
     AND p.position IN ('QB','RB','WR','TE','K')
     ORDER BY COALESCE(pms.current_price, 0) DESC`,
    [SEASON, SEASON, lastWeek, teamId]
  );
}

export default async function TeamPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;

  const [currentWeek, lastScoreWeek, userLeagues, team] = await Promise.all([
    fetchCurrentWeek(),
    fetchLastScoreWeek(),
    fetchUserLeagues(userId),
    fetchTeam(userId),
  ]);


  if (!team) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
        <Sidebar
          user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
          leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
          logoUri={String(process.env.LOGO_URI)}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏈</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>No team found</p>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Join a league and create a team first.</p>
          </div>
        </div>
      </div>
    );
  }

  const [roster, weeklyPerf, available] = await Promise.all([
    fetchRoster(team.id, lastScoreWeek),
    fetchWeeklyPerf(team.id, lastScoreWeek),
    fetchAvailable(team.id, lastScoreWeek),
  ]);

  const rankLabel = team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : team.rank === 3 ? '3rd' : `${team.rank}th`;
  const totalValue = roster.reduce((s, p) => s + Number(p.current_price), 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-200/40 via-sky-200/30 to-indigo-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-[-80px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-sky-200/40 via-indigo-200/25 to-emerald-200/20 blur-3xl" />
      </div>

      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-3">
            <SeasonModeSwitcher season={SEASON} currentWeek={currentWeek} />
            <div className="flex items-center gap-3 ml-auto">
              <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-slate-700 transition-colors">
                {session.user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Page title */}
          <div style={{ paddingLeft: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              {team.league_name}
            </div>
            <h1 style={{
              fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em',
              backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              display: 'inline-block',
            }}>
              {team.team_name}
            </h1>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {formatWeekLong(currentWeek)} · {SEASON} NFL season
            </p>
          </div>

          {/* Quick stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Total Points',   value: formatPoints(team.total_points),   sub: 'season total',      accent: false },
              { label: 'League Rank',    value: rankLabel,                          sub: `of ${team.league_size} teams`, accent: team.rank <= 3 },
              { label: 'Roster Value',   value: formatPrice(totalValue),            sub: 'at market price',   accent: false },
              { label: 'Budget Left',    value: formatPrice(team.budget_remaining), sub: 'cap space',         accent: true  },
            ].map(tile => (
              <div key={tile.label} className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm" style={{ padding: '14px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{tile.label}</p>
                <p style={{
                  fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1,
                  color: tile.accent ? '#059669' : '#0f172a',
                }}>
                  {tile.value}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{tile.sub}</p>
              </div>
            ))}
          </div>

          {/* Formation + Cap side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'stretch' }}>
            <Suspense fallback={<Skeleton h={580} />}>
              <MyTeamSummary userId={userId} seasonYear={SEASON} />
            </Suspense>
            <CapBreakdown roster={roster} budgetRemaining={team.budget_remaining} />
          </div>

          {/* Roster list */}
          <RosterList
            roster={roster}
            teamId={team.id}
            currentWeek={currentWeek}
            budgetRemaining={team.budget_remaining}
          />

          {/* Weekly performance */}
          <WeeklyPerformance players={weeklyPerf} week={lastScoreWeek} />

          {/* Available players */}
          <AvailablePlayers players={available} budgetRemaining={team.budget_remaining} />

        </main>
      </div>
    </div>
  );
}
