import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { getUpcomingMatchups } from '@/lib/schedule';

const DEFAULT_SEASON = 2025;
// The schedule is always for the live/upcoming NFL season, independent of
// whichever season's market/stats data is being viewed (2025 is the "last
// completed season" default used throughout the app for price/stats history).
const SCHEDULE_SEASON = 2026;

// GET /api/players/[id]?season=2025 — lightweight profile summary for the
// PlayerProfileModal popup (not the full page: no price history / weekly table).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const playerId = parseInt(id, 10);
    if (isNaN(playerId)) return NextResponse.json({ error: 'Invalid player id' }, { status: 400 });

    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : DEFAULT_SEASON;

    const [player] = await query<{
      id: number; full_name: string; position: string; team_code: string;
      headshot_url: string | null;
      current_price: number; base_weekly_price: number;
    }>(
      `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
              COALESCE(pms.current_price, 0)     AS current_price,
              COALESCE(pms.base_weekly_price, 0) AS base_weekly_price
       FROM players p
       LEFT JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
       WHERE p.id = ?`,
      [season, playerId]
    );
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const [weekRow] = await query<{ w: number }>(
      `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [season]
    );
    const lastWeek = weekRow?.w ?? 1;

    const [lastWeekRow] = await query<{ fantasy_points: number | null }>(
      `SELECT fantasy_points FROM player_weekly_scores
       WHERE player_id = ? AND season_year = ? AND week = ?`,
      [playerId, season, lastWeek]
    );

    const [seasonRow] = await query<{ total: number | null; weeks: number }>(
      `SELECT SUM(fantasy_points) AS total, COUNT(*) AS weeks
       FROM player_weekly_scores WHERE player_id = ? AND season_year = ?`,
      [playerId, season]
    );

    const nextMatchups = await getUpcomingMatchups(player.team_code, SCHEDULE_SEASON, 5);

    return NextResponse.json({
      data: {
        id: player.id,
        full_name: player.full_name,
        position: player.position,
        team_code: player.team_code,
        headshot_url: player.headshot_url,
        current_price: Number(player.current_price),
        price_delta: Number(player.current_price) - Number(player.base_weekly_price),
        last_week_points: lastWeekRow?.fantasy_points != null ? Number(lastWeekRow.fantasy_points) : null,
        season_points: Number(seasonRow?.total ?? 0),
        weeks_played: Number(seasonRow?.weeks ?? 0),
        season,
        next_matchups: nextMatchups,
      },
    });
  } catch (e) {
    console.error('GET /api/players/[id] failed:', e);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
