import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPrice, formatWeekLong } from '@/lib/format';
import SeasonModeSwitcher from '@/app/dashboard/_components/SeasonModeSwitcher';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import TransferBoard, { type CatalogPlayer } from './_components/TransferBoard';
import { getNextMatchupByTeam } from '@/lib/schedule';

const PREV_SEASON = 2025;
const SCHEDULE_SEASON = 2026;

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
            RANK() OVER (PARTITION BY l.id ORDER BY ft.total_points DESC) AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.league_id = l.id AND ft.user_id = ? AND ft.season_year = l.season_year
     WHERE lm.user_id = ?
     ORDER BY l.created_at DESC`,
    [userId, userId]
  );
}

async function fetchTeam(userId: string, season: number) {
  const [team] = await query<{ id: number; budget_remaining: number }>(
    `SELECT id, budget_remaining FROM fantasy_teams
     WHERE user_id = ? AND season_year = ? ORDER BY created_at DESC LIMIT 1`,
    [userId, season]
  );
  return team ?? null;
}

async function fetchPlayers(season: number, lastWeek: number, teamId: number | null): Promise<CatalogPlayer[]> {
  return query<CatalogPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            COALESCE(pms.current_price, 0)      AS current_price,
            COALESCE(pms.base_weekly_price, 0)  AS base_weekly_price,
            COALESCE(pms.net_order_flow, 0)     AS net_order_flow,
            pws.fantasy_points                  AS last_week_points,
            COALESCE(tot.season_points, 0)      AS season_points,
            COALESCE(own.owner_count, 0)        AS owner_count,
            (my_ftr.id IS NOT NULL)             AS is_owned,
            my_ftr.purchase_price                AS purchase_price,
            my_ftr.acquired_week                 AS acquired_week
     FROM players p
     LEFT JOIN player_market_state pms
       ON pms.player_id = p.id AND pms.season_year = ?
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = p.id AND pws.season_year = ? AND pws.week = ?
     LEFT JOIN (
       SELECT player_id, SUM(fantasy_points) AS season_points
       FROM player_weekly_scores WHERE season_year = ? GROUP BY player_id
     ) tot ON tot.player_id = p.id
     LEFT JOIN (
       SELECT player_id, COUNT(DISTINCT fantasy_team_id) AS owner_count
       FROM fantasy_team_roster WHERE is_active = TRUE GROUP BY player_id
     ) own ON own.player_id = p.id
     LEFT JOIN fantasy_team_roster my_ftr
       ON my_ftr.player_id = p.id AND my_ftr.fantasy_team_id = ? AND my_ftr.is_active = TRUE
     WHERE p.position IN ('QB','RB','WR','TE','K')
     ORDER BY COALESCE(pms.current_price, 0) DESC`,
    [season, season, lastWeek, season, teamId]
  );
}

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;
  const { season: seasonParam } = await searchParams;
  const SEASON = seasonParam ? parseInt(seasonParam, 10) : await detectUserSeason(userId);

  const [currentWeek, lastScoreWeek, userLeagues, team, matchups] = await Promise.all([
    fetchCurrentWeek(SEASON),
    fetchLastScoreWeek(SEASON),
    fetchUserLeagues(userId),
    fetchTeam(userId, SEASON),
    getNextMatchupByTeam(SCHEDULE_SEASON),
  ]);

  const players = await fetchPlayers(SEASON, lastScoreWeek, team?.id ?? null);

  const owned = players.filter(p => p.is_owned);
  const budgetRemaining = team?.budget_remaining ?? 0;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Background blobs */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -128, left: '50%', transform: 'translateX(-50%)', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(14,165,233,0.08) 50%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: 0, right: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px' }}>
            <SeasonModeSwitcher season={SEASON} currentWeek={currentWeek} />
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#0f172a', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
            }}>
              {session.user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Page title */}
          <div style={{ paddingLeft: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Buy &amp; Sell
            </div>
            <h1 style={{
              fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em',
              backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block',
            }}>
              Transfers
            </h1>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Tap a player on your squad to find a replacement · {formatWeekLong(currentWeek)} · {SEASON} season
            </p>
          </div>

          {!team ? (
            <div style={{
              borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0',
              padding: '32px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏈</div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>No team found</p>
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Join a league and create a team to start making transfers.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Budget Left</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#059669', letterSpacing: '-0.02em' }}>{formatPrice(budgetRemaining)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, textAlign: 'right' }}>Roster</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', textAlign: 'right' }}>{owned.length}/11</p>
                </div>
              </div>

              <TransferBoard
                players={players}
                season={SEASON}
                fantasyTeamId={team.id}
                currentWeek={currentWeek}
                budgetRemaining={Number(budgetRemaining)}
                matchups={matchups}
              />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
