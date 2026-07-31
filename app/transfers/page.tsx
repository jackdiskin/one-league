import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPrice, formatWeekLong } from '@/lib/format';
import TopNav from '@/components/TopNav';
import TransferBoard, { type CatalogPlayer } from './_components/TransferBoard';
import { getNextMatchupByTeam } from '@/lib/schedule';
import StatCard from '@/components/ui/StatCard';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import { TOTAL_SLOTS } from '@/components/rosterRules';

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

async function fetchTeam(userId: string, season: number) {
  const [team] = await query<{ id: number; budget_remaining: number }>(
    `SELECT id, budget_remaining FROM fantasy_teams
     WHERE user_id = ? AND season_year = ? ORDER BY created_at DESC LIMIT 1`,
    [userId, season]
  );
  return team ?? null;
}

async function fetchPlayers(season: number, lastWeek: number, currentWeek: number, teamId: number | null): Promise<CatalogPlayer[]> {
  return query<CatalogPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            COALESCE(pms.current_price, 0)      AS current_price,
            COALESCE(pms.base_weekly_price, 0)  AS base_weekly_price,
            COALESCE(pms.net_order_flow, 0)     AS net_order_flow,
            pws.fantasy_points                  AS last_week_points,
            COALESCE(tot.season_points, 0)      AS season_points,
            COALESCE(lp.last_year_points, 0)    AS last_year_points,
            COALESCE(own.owner_count, 0)        AS owner_count,
            ROUND(COALESCE(own.owner_count, 0) /
                  NULLIF((SELECT COUNT(*) FROM fantasy_teams WHERE season_year = ?), 0) * 100, 1
            ) AS ownership_pct,
            COALESCE(tx.trades_in, 0)  AS trades_in,
            COALESCE(tx.trades_out, 0) AS trades_out,
            CASE WHEN ppw.opening_price IS NOT NULL AND ppw.opening_price > 0
                 THEN (COALESCE(pms.current_price, 0) - ppw.opening_price) / ppw.opening_price
                 ELSE 0 END AS price_pct_change,
            COALESCE(proj.expected_points, 0) AS projected_next_week,
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
     LEFT JOIN fantasy_team_roster my_ftr
       ON my_ftr.player_id = p.id AND my_ftr.fantasy_team_id = ? AND my_ftr.is_active = TRUE
     WHERE p.position IN ('QB','RB','WR','TE')
     ORDER BY COALESCE(pms.current_price, 0) DESC`,
    [season, season, season, lastWeek, season, season - 1, season, season, lastWeek, season, currentWeek + 1, teamId]
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

  const [currentWeek, lastScoreWeek, team, matchups] = await Promise.all([
    fetchCurrentWeek(SEASON),
    fetchLastScoreWeek(SEASON),
    fetchTeam(userId, SEASON),
    getNextMatchupByTeam(SCHEDULE_SEASON),
  ]);

  const players = await fetchPlayers(SEASON, lastScoreWeek, currentWeek, team?.id ?? null);

  const owned = players.filter(p => p.is_owned);
  const budgetRemaining = team?.budget_remaining ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-surface">

      <TopNav
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        season={SEASON} currentWeek={currentWeek}
        logoUri={String(process.env.LOGO_URI)}
      />

      <main className="flex flex-1 flex-col gap-6 px-6 py-7">

        {/* Page title */}
        <div>
          <p className="text-eyebrow uppercase text-emerald">Buy and sell</p>
          <h1 className="mt-1 text-display text-ink">Transfers</h1>
          <p className="mt-1 text-label text-ink-3">
            Pick a player on your squad to find a replacement · {formatWeekLong(currentWeek)} ·{' '}
            <span className="font-mono tabular-nums">{SEASON}</span> season
          </p>
        </div>

        {!team ? (
          <div className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={<Icon name="football" size={20} />}
              title="Draft a squad before you can make transfers."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-card border border-line bg-surface p-4">
              <StatCard bare label="Budget left" value={formatPrice(budgetRemaining)} size="display" tone="accent" />
              <StatCard bare align="right" label="Roster" value={`${owned.length}/${TOTAL_SLOTS}`} />
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
  );
}
