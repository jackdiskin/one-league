import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/mysql';

function isAuthorized(request: NextRequest) {
  return request.headers.get('x-admin-secret') === process.env.ADMIN_SECRET;
}

interface PlayerScoreInput {
  player_id: number;
  fantasy_points: number;
  passing_yards?: number;
  passing_tds?: number;
  interceptions_thrown?: number;
  rushing_yards?: number;
  rushing_tds?: number;
  receptions?: number;
  receiving_yards?: number;
  receiving_tds?: number;
  fumbles_lost?: number;
  field_goals_made?: number;
  fg_0_39?: number;
  fg_40_49?: number;
  fg_50_plus?: number;
  extra_points_made?: number;
  two_pt_conversions?: number;
  sacks?: number;
  defensive_interceptions?: number;
  defensive_tds?: number;
  points_allowed?: number;
}

// POST /api/admin/scores
// Body: { season_year, week, scores: PlayerScoreInput[] }
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { season_year, week, scores } = await request.json() as {
    season_year: number;
    week: number;
    scores: PlayerScoreInput[];
  };

  if (!season_year || !week || !Array.isArray(scores) || scores.length === 0) {
    return NextResponse.json({ error: 'season_year, week, and scores[] are required' }, { status: 400 });
  }

  await withTransaction(async (conn) => {
    // 1. Upsert each player's score
    for (const s of scores) {
      await conn.execute(
        `INSERT INTO player_weekly_scores
           (player_id, season_year, week, fantasy_points,
            passing_yards, passing_tds, interceptions_thrown,
            rushing_yards, rushing_tds,
            receptions, receiving_yards, receiving_tds,
            fumbles_lost, field_goals_made, fg_0_39, fg_40_49, fg_50_plus,
            extra_points_made, two_pt_conversions,
            sacks, defensive_interceptions, defensive_tds, points_allowed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           fantasy_points          = VALUES(fantasy_points),
           passing_yards           = VALUES(passing_yards),
           passing_tds             = VALUES(passing_tds),
           interceptions_thrown    = VALUES(interceptions_thrown),
           rushing_yards           = VALUES(rushing_yards),
           rushing_tds             = VALUES(rushing_tds),
           receptions              = VALUES(receptions),
           receiving_yards         = VALUES(receiving_yards),
           receiving_tds           = VALUES(receiving_tds),
           fumbles_lost            = VALUES(fumbles_lost),
           field_goals_made        = VALUES(field_goals_made),
           fg_0_39                 = VALUES(fg_0_39),
           fg_40_49                = VALUES(fg_40_49),
           fg_50_plus              = VALUES(fg_50_plus),
           extra_points_made       = VALUES(extra_points_made),
           two_pt_conversions      = VALUES(two_pt_conversions),
           sacks                   = VALUES(sacks),
           defensive_interceptions = VALUES(defensive_interceptions),
           defensive_tds           = VALUES(defensive_tds),
           points_allowed          = VALUES(points_allowed)`,
        [
          s.player_id, season_year, week, s.fantasy_points,
          s.passing_yards ?? 0, s.passing_tds ?? 0, s.interceptions_thrown ?? 0,
          s.rushing_yards ?? 0, s.rushing_tds ?? 0,
          s.receptions ?? 0, s.receiving_yards ?? 0, s.receiving_tds ?? 0,
          s.fumbles_lost ?? 0, s.field_goals_made ?? 0,
          s.fg_0_39 ?? 0, s.fg_40_49 ?? 0, s.fg_50_plus ?? 0,
          s.extra_points_made ?? 0, s.two_pt_conversions ?? 0,
          s.sacks ?? 0, s.defensive_interceptions ?? 0, s.defensive_tds ?? 0, s.points_allowed ?? 0,
        ]
      );
    }

    // 2. Compute fantasy_team_weekly_scores for all teams that started these players
    //    A player counts for a team if they were on a non-BENCH slot during that week
    //    (acquired_week <= week) AND (still active OR sold_week > week)
    const playerIds = scores.map((s) => s.player_id);
    const placeholders = playerIds.map(() => '?').join(',');

    const [teamPoints] = await conn.execute<import('mysql2').RowDataPacket[]>(
      `SELECT ftr.fantasy_team_id, SUM(pws.fantasy_points) AS points
       FROM fantasy_team_roster ftr
       JOIN player_weekly_scores pws
         ON pws.player_id = ftr.player_id
        AND pws.season_year = ?
        AND pws.week = ?
       WHERE ftr.player_id IN (${placeholders})
         AND ftr.roster_slot != 'BENCH'
         AND ftr.acquired_week <= ?
         AND (ftr.is_active = TRUE OR ftr.sold_week > ?)
       GROUP BY ftr.fantasy_team_id`,
      [season_year, week, ...playerIds, week, week]
    ) as [import('mysql2').RowDataPacket[], unknown];

    // 3. Upsert team weekly scores and refresh total_points
    for (const row of teamPoints) {
      await conn.execute(
        `INSERT INTO fantasy_team_weekly_scores (fantasy_team_id, season_year, week, points)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE points = VALUES(points)`,
        [row.fantasy_team_id, season_year, week, row.points]
      );

      await conn.execute(
        `UPDATE fantasy_teams SET total_points = (
           SELECT COALESCE(SUM(points), 0)
           FROM fantasy_team_weekly_scores
           WHERE fantasy_team_id = ?
         ) WHERE id = ?`,
        [row.fantasy_team_id, row.fantasy_team_id]
      );
    }
  });

  return NextResponse.json({ data: { recorded: scores.length, season_year, week } });
}
