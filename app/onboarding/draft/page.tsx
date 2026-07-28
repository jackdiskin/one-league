import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import DraftBoard, { type DraftPlayer, type PublicLeague } from './_components/DraftBoard';
import { getNextMatchupByTeam } from '@/lib/schedule';

const SEASON = 2026;

async function fetchCurrentWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`,
    [SEASON]
  );
  return row?.w ?? 1;
}

async function fetchPlayers(currentWeek: number): Promise<DraftPlayer[]> {
  return query<DraftPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            COALESCE(pms.current_price, 20000000) AS current_price,
            COALESCE(sp.season_points, 0) AS season_points,
            COALESCE(lp.last_year_points, 0) AS last_year_points,
            ROUND(COALESCE(own.owner_count, 0) /
                  NULLIF((SELECT COUNT(*) FROM fantasy_teams WHERE season_year = ?), 0) * 100, 1
            ) AS ownership_pct,
            COALESCE(tx.trades_in, 0) AS trades_in,
            COALESCE(tx.trades_out, 0) AS trades_out,
            CASE WHEN ppw.opening_price IS NOT NULL AND ppw.opening_price > 0
                 THEN (COALESCE(pms.current_price, 20000000) - ppw.opening_price) / ppw.opening_price
                 ELSE 0 END AS price_pct_change,
            COALESCE(proj.expected_points, 0) AS projected_next_week
     FROM players p
     LEFT JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     LEFT JOIN (
       SELECT player_id, SUM(fantasy_points) AS season_points
       FROM player_weekly_scores WHERE season_year = ? GROUP BY player_id
     ) sp ON sp.player_id = p.id
     LEFT JOIN (
       SELECT player_id, SUM(fantasy_points) AS last_year_points
       FROM player_weekly_scores WHERE season_year = ? GROUP BY player_id
     ) lp ON lp.player_id = p.id
     LEFT JOIN (
       SELECT player_id, COUNT(DISTINCT fantasy_team_id) AS owner_count
       FROM fantasy_team_roster WHERE is_active = TRUE GROUP BY player_id
     ) own ON own.player_id = p.id
     LEFT JOIN (
       SELECT player_id,
              SUM(transaction_type = 'buy')  AS trades_in,
              SUM(transaction_type = 'sell') AS trades_out
       FROM player_transactions WHERE season_year = ? GROUP BY player_id
     ) tx ON tx.player_id = p.id
     LEFT JOIN player_price_weeks ppw ON ppw.player_id = p.id AND ppw.season_year = ? AND ppw.week = ?
     LEFT JOIN player_weekly_projections proj ON proj.player_id = p.id AND proj.season_year = ?
       AND proj.week = ? AND proj.projection_source = 'internal_model'
     WHERE p.position IN ('QB','RB','WR','TE','K')
     ORDER BY COALESCE(pms.current_price, 20000000) DESC`,
    [SEASON, SEASON, SEASON, SEASON - 1, SEASON, SEASON, currentWeek, SEASON, currentWeek + 1]
  );
}

async function fetchPublicLeagues(): Promise<PublicLeague[]> {
  return query<PublicLeague>(
    `SELECT l.id, l.name, l.season_year, l.salary_cap, l.max_members,
            COUNT(lm.id) AS member_count
     FROM leagues l
     LEFT JOIN league_members lm ON lm.league_id = l.id
     WHERE l.is_public = TRUE
     GROUP BY l.id
     HAVING member_count < l.max_members
     ORDER BY member_count DESC
     LIMIT 8`,
    []
  );
}

export default async function OnboardingDraftPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;

  // If user already has a team, skip onboarding
  const [existing] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, SEASON]
  );
  if (existing) redirect('/dashboard');

  const currentWeek = await fetchCurrentWeek();
  const [players, publicLeagues, matchups] = await Promise.all([
    fetchPlayers(currentWeek),
    fetchPublicLeagues(),
    getNextMatchupByTeam(SEASON),
  ]);

  return (
    <DraftBoard
      players={players}
      publicLeagues={publicLeagues}
      userName={session.user.name ?? 'Manager'}
      season={SEASON}
      matchups={matchups}
    />
  );
}
