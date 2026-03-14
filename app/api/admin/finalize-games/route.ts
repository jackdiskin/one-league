import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, query } from '@/lib/mysql';

function isAuthorized(request: NextRequest) {
  return request.headers.get('x-admin-secret') === process.env.ADMIN_SECRET;
}

interface LiveRow {
  player_id: number;
  passing_yards: number;
  passing_tds: number;
  interceptions_thrown: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  receiving_yards: number;
  receiving_tds: number;
  fumbles_lost: number;
  fg_0_39: number;
  fg_40_49: number;
  fg_50_plus: number;
  field_goals_made: number;
  extra_points_made: number;
  two_pt_conversions: number;
  fantasy_points: number;
}

/**
 * POST /api/admin/finalize-games
 *
 * Reads final stats from live_player_stats for all "post" games in the given
 * season_year + week_num, then:
 *   1. Upserts rows into player_weekly_scores
 *   2. Recomputes fantasy_team_weekly_scores and fantasy_teams.total_points
 *
 * This is idempotent — safe to call multiple times for the same week.
 *
 * Body: { season_year: number, week_num: number }
 * Headers: x-admin-secret
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { season_year, week_num } = await request.json() as {
    season_year: number;
    week_num: number;
  };

  if (!season_year || !week_num) {
    return NextResponse.json(
      { error: 'season_year and week_num are required' },
      { status: 400 },
    );
  }

  // Aggregate final stats per DB player from all "post" games this week.
  // live_player_stats.player_id is an ESPN athlete ID; bridge via players.espn_athlete_id.
  const liveRows = await query<LiveRow>(
    `SELECT p.id                                              AS player_id,
            SUM(lps.passing_yards)                           AS passing_yards,
            SUM(lps.passing_tds)                             AS passing_tds,
            SUM(lps.interceptions)                           AS interceptions_thrown,
            SUM(lps.rushing_yards)                           AS rushing_yards,
            SUM(lps.rushing_tds)                             AS rushing_tds,
            SUM(lps.receptions)                              AS receptions,
            SUM(lps.receiving_yards)                         AS receiving_yards,
            SUM(lps.receiving_tds)                           AS receiving_tds,
            SUM(lps.fumbles_lost)                            AS fumbles_lost,
            SUM(lps.fg_0_39)                                 AS fg_0_39,
            SUM(lps.fg_40_49)                                AS fg_40_49,
            SUM(lps.fg_50_plus)                              AS fg_50_plus,
            SUM(lps.fg_0_39 + lps.fg_40_49 + lps.fg_50_plus) AS field_goals_made,
            SUM(lps.xp_made)                                 AS extra_points_made,
            SUM(lps.two_pt_conversions)                      AS two_pt_conversions,
            SUM(lps.fantasy_points_total)                    AS fantasy_points
     FROM live_game_states lgs
     JOIN live_player_stats lps ON lps.event_id = lgs.event_id
     JOIN players p              ON p.espn_athlete_id = lps.player_id
     WHERE lgs.game_state = 'post'
       AND lgs.season    = ?
       AND lgs.week_num  = ?
     GROUP BY p.id`,
    [season_year, week_num],
  );

  if (liveRows.length === 0) {
    return NextResponse.json(
      { error: 'No finalized (post) games found for the given season_year and week_num' },
      { status: 404 },
    );
  }

  await withTransaction(async (conn) => {
    // 1. Upsert each player's final score
    for (const r of liveRows) {
      await conn.execute(
        `INSERT INTO player_weekly_scores
           (player_id, season_year, week, fantasy_points,
            passing_yards, passing_tds, interceptions_thrown,
            rushing_yards, rushing_tds,
            receptions, receiving_yards, receiving_tds,
            fumbles_lost, field_goals_made, fg_0_39, fg_40_49, fg_50_plus,
            extra_points_made, two_pt_conversions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           fantasy_points       = VALUES(fantasy_points),
           passing_yards        = VALUES(passing_yards),
           passing_tds          = VALUES(passing_tds),
           interceptions_thrown = VALUES(interceptions_thrown),
           rushing_yards        = VALUES(rushing_yards),
           rushing_tds          = VALUES(rushing_tds),
           receptions           = VALUES(receptions),
           receiving_yards      = VALUES(receiving_yards),
           receiving_tds        = VALUES(receiving_tds),
           fumbles_lost         = VALUES(fumbles_lost),
           field_goals_made     = VALUES(field_goals_made),
           fg_0_39              = VALUES(fg_0_39),
           fg_40_49             = VALUES(fg_40_49),
           fg_50_plus           = VALUES(fg_50_plus),
           extra_points_made    = VALUES(extra_points_made),
           two_pt_conversions   = VALUES(two_pt_conversions)`,
        [
          r.player_id, season_year, week_num, r.fantasy_points,
          r.passing_yards, r.passing_tds, r.interceptions_thrown,
          r.rushing_yards, r.rushing_tds,
          r.receptions, r.receiving_yards, r.receiving_tds,
          r.fumbles_lost, r.field_goals_made, r.fg_0_39, r.fg_40_49, r.fg_50_plus,
          r.extra_points_made, r.two_pt_conversions,
        ],
      );
    }

    // 2. Recompute fantasy_team_weekly_scores for all teams that started these players
    const playerIds = liveRows.map((r) => r.player_id);
    const placeholders = playerIds.map(() => '?').join(',');

    const [teamPoints] = await conn.execute<import('mysql2').RowDataPacket[]>(
      `SELECT ftr.fantasy_team_id, SUM(pws.fantasy_points) AS points
       FROM fantasy_team_roster ftr
       JOIN player_weekly_scores pws
         ON pws.player_id   = ftr.player_id
        AND pws.season_year = ?
        AND pws.week        = ?
       WHERE ftr.player_id IN (${placeholders})
         AND ftr.roster_slot != 'BENCH'
         AND ftr.acquired_week <= ?
         AND (ftr.is_active = TRUE OR ftr.sold_week > ?)
       GROUP BY ftr.fantasy_team_id`,
      [season_year, week_num, ...playerIds, week_num, week_num],
    ) as [import('mysql2').RowDataPacket[], unknown];

    // 3. Upsert team weekly scores and refresh total_points
    for (const row of teamPoints) {
      await conn.execute(
        `INSERT INTO fantasy_team_weekly_scores (fantasy_team_id, season_year, week, points)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE points = VALUES(points)`,
        [row.fantasy_team_id, season_year, week_num, row.points],
      );

      await conn.execute(
        `UPDATE fantasy_teams SET total_points = (
           SELECT COALESCE(SUM(points), 0)
           FROM fantasy_team_weekly_scores
           WHERE fantasy_team_id = ?
         ) WHERE id = ?`,
        [row.fantasy_team_id, row.fantasy_team_id],
      );
    }
  });

  return NextResponse.json({
    data: { finalized: liveRows.length, season_year, week_num },
  });
}
