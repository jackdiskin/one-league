import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';

/**
 * GET /api/leagues/[id]/live-week-scores
 *
 * Returns per-team current-week point totals, combining:
 *   - live_player_stats (for games currently game_state = 'in')
 *   - player_weekly_scores (for games already finalized, game_state = 'post')
 *
 * Priority per player:
 *   1. If the player has an in-progress game row in live_player_stats → use that
 *   2. Otherwise → use player_weekly_scores for the current week (written at post)
 *   3. No game yet / bye → 0
 *
 * Designed to be polled every ~12 seconds by the standings UI.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const leagueId = Number(id);
  if (!leagueId || isNaN(leagueId)) {
    return NextResponse.json({ error: 'Invalid league id' }, { status: 400 });
  }

  // Detect active season from the league record
  const [leagueRow] = await query<{ season_year: number }>(
    `SELECT season_year FROM leagues WHERE id = ? LIMIT 1`,
    [leagueId],
  );
  const season = leagueRow?.season_year ?? 2026;

  // Detect current week:
  // Prefer live_game_states (most current) → fall back to MAX(week) in player_weekly_scores
  const [liveWeekRow] = await query<{ week_num: number }>(
    `SELECT week_num FROM live_game_states
     WHERE game_state IN ('pre','in','post') AND season = ?
     ORDER BY week_num DESC LIMIT 1`,
    [season],
  );
  const [scoredWeekRow] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`,
    [season],
  );
  const currentWeek = liveWeekRow?.week_num ?? scoredWeekRow?.w ?? 1;

  // Any game currently in-progress?
  const [liveCheckRow] = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM live_game_states WHERE game_state = 'in' AND season = ?`,
    [season],
  );
  const isAnythingLive = Number(liveCheckRow?.cnt ?? 0) > 0;

  // Per-team current-week score:
  // For each rostered player, pick live_player_stats if their game is 'in',
  // else fall back to player_weekly_scores for this week.
  const rows = await query<{
    fantasy_team_id: number;
    team_name: string;
    current_week_pts: number;
    has_live: number;
  }>(
    `SELECT
       ft.id   AS fantasy_team_id,
       ft.team_name,
       COALESCE(SUM(
         CASE
           WHEN live.game_state = 'in' THEN COALESCE(live.fantasy_points_total, 0)
           ELSE COALESCE(pws.fantasy_points, 0)
         END
       ), 0) AS current_week_pts,
       MAX(CASE WHEN live.game_state = 'in' THEN 1 ELSE 0 END) AS has_live
     FROM fantasy_teams ft
     JOIN league_members lm ON lm.user_id = ft.user_id AND lm.league_id = ?
     LEFT JOIN fantasy_team_roster ftr
       ON ftr.fantasy_team_id = ft.id AND ftr.is_active = TRUE
     LEFT JOIN players p ON p.id = ftr.player_id
     LEFT JOIN (
       SELECT lps.player_id, lps.fantasy_points_total, lgs.game_state
       FROM live_player_stats lps
       JOIN live_game_states lgs
         ON lgs.event_id = lps.event_id AND lgs.week_num = ? AND lgs.season = ?
       WHERE lgs.game_state = 'in'
     ) live ON live.player_id = p.espn_athlete_id
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = ftr.player_id
      AND pws.season_year = ?
      AND pws.week = ?
     WHERE ft.season_year = ?
     GROUP BY ft.id, ft.team_name
     ORDER BY current_week_pts DESC`,
    [leagueId, currentWeek, season, season, currentWeek, season],
  );

  return NextResponse.json({
    week:           currentWeek,
    season,
    isAnythingLive,
    teams: rows.map(r => ({
      teamId:   r.fantasy_team_id,
      teamName: r.team_name,
      weekPts:  Number(r.current_week_pts),
      hasLive:  r.has_live === 1,
    })),
  });
}
