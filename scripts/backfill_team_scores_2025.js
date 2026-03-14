/**
 * backfill_team_scores_2025.js
 *
 * Backfills fantasy_team_weekly_scores for the full 2025 season (weeks 1–22)
 * based on each team's CURRENT active roster, then recomputes fantasy_teams.total_points.
 *
 * Note: uses the current active roster as a proxy for historical roster state.
 * This is intentional for seeding purposes — it gives each team a coherent
 * full-season score as if they had held their current squad all year.
 *
 * Usage:
 *   node scripts/backfill_team_scores_2025.js
 */

const mysql = require('mysql2/promise');

const DB = {
  host:     'one-league.cu9am8gksf0d.us-east-1.rds.amazonaws.com',
  user:     'jackdiskin',
  password: 'maddie33',
  database: 'oneleague_db',
  port:     3306,
};

const SEASON = 2025;

async function run() {
  const conn = await mysql.createConnection(DB);
  console.log('Connected.');

  try {
    // 1. Find all regular-season weeks (1–18) that have player score data.
    //    Playoff weeks (19+) are excluded: fantasy scoring ends after the regular season.
    const [weekRows] = await conn.execute(
      `SELECT DISTINCT week FROM player_weekly_scores
       WHERE season_year = ? AND week <= 18 ORDER BY week`,
      [SEASON]
    );
    const weeks = weekRows.map(r => r.week);
    console.log(`Found ${weeks.length} scored weeks: ${weeks.join(', ')}`);

    // 2. Find all fantasy teams for this season
    const [teams] = await conn.execute(
      `SELECT id, team_name FROM fantasy_teams WHERE season_year = ?`,
      [SEASON]
    );
    console.log(`Found ${teams.length} fantasy teams.`);

    let totalUpserted = 0;

    for (const team of teams) {
      // 3. Get this team's currently active roster
      const [roster] = await conn.execute(
        `SELECT player_id FROM fantasy_team_roster
         WHERE fantasy_team_id = ? AND is_active = TRUE`,
        [team.id]
      );
      const playerIds = roster.map(r => r.player_id);

      if (playerIds.length === 0) {
        console.log(`  Team ${team.team_name} (${team.id}): no active players, skipping.`);
        continue;
      }

      console.log(`  Team ${team.team_name} (${team.id}): ${playerIds.length} players`);

      // 4. For each week, sum up points for this team's players
      for (const week of weeks) {
        const placeholders = playerIds.map(() => '?').join(', ');
        const [scoreRows] = await conn.execute(
          `SELECT COALESCE(SUM(fantasy_points), 0) AS week_points
           FROM player_weekly_scores
           WHERE season_year = ? AND week = ? AND player_id IN (${placeholders})`,
          [SEASON, week, ...playerIds]
        );
        const weekPoints = Number(scoreRows[0].week_points);

        // Upsert into fantasy_team_weekly_scores
        await conn.execute(
          `INSERT INTO fantasy_team_weekly_scores (fantasy_team_id, season_year, week, points)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE points = VALUES(points)`,
          [team.id, SEASON, week, weekPoints]
        );
        totalUpserted++;
      }
    }

    console.log(`\nUpserted ${totalUpserted} weekly score rows.`);

    // 5. Recompute total_points for each team from the weekly scores table
    const [updateResult] = await conn.execute(
      `UPDATE fantasy_teams ft
       JOIN (
         SELECT fantasy_team_id, SUM(points) AS season_total
         FROM fantasy_team_weekly_scores
         WHERE season_year = ?
         GROUP BY fantasy_team_id
       ) agg ON agg.fantasy_team_id = ft.id
       SET ft.total_points = agg.season_total
       WHERE ft.season_year = ?`,
      [SEASON, SEASON]
    );
    console.log(`Updated total_points for ${updateResult.affectedRows} teams.`);

    // 6. Print a summary
    const [summary] = await conn.execute(
      `SELECT ft.team_name, ft.total_points,
              COUNT(ftws.week) AS weeks_scored
       FROM fantasy_teams ft
       LEFT JOIN fantasy_team_weekly_scores ftws
         ON ftws.fantasy_team_id = ft.id AND ftws.season_year = ?
       WHERE ft.season_year = ?
       GROUP BY ft.id
       ORDER BY ft.total_points DESC`,
      [SEASON, SEASON]
    );

    console.log('\n── Final standings ────────────────────────────────');
    for (const row of summary) {
      console.log(
        `  ${row.team_name.padEnd(25)} ${String(Number(row.total_points).toFixed(1)).padStart(8)} pts  (${row.weeks_scored} wks)`
      );
    }
    console.log('────────────────────────────────────────────────────');

  } finally {
    await conn.end();
    console.log('Done.');
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
