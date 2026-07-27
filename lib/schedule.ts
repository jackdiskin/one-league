import { query } from '@/lib/mysql';

export interface Matchup {
  week: number;
  opponent: string;
  isHome: boolean;
  gameDate: string;
}

// SportsDataIO's schedule times are naive Eastern wall-clock values (e.g.
// "20:20" really means 8:20 PM ET) with no timezone info attached. mysql2
// would otherwise hand these back as JS Date objects built from the local
// process timezone — silently reinterpreting the ET wall clock as if it
// were UTC/local and shifting the displayed time by several hours. Every
// schedule query below forces DATE_FORMAT() so the driver returns a plain
// string instead, and display code parses that string's components
// directly (see parseNaiveDateTime in lib/format.ts — kept out of this
// file so client components can use it without bundling the mysql2 driver).

// One query for the whole page — every team's next upcoming/in-progress game,
// keyed by team code. Avoids an N+1 per player row across rosters/catalogs.
export async function getNextMatchupByTeam(season: number): Promise<Record<string, Matchup>> {
  const rows = await query<{ team: string; opponent: string; week: number; game_date: string; is_home: number }>(
    `SELECT team, opponent, week, DATE_FORMAT(game_date, '%Y-%m-%d %H:%i:%s') AS game_date, is_home FROM (
       SELECT team, opponent, week, game_date, is_home,
              ROW_NUMBER() OVER (PARTITION BY team ORDER BY game_date ASC) AS rn
       FROM (
         SELECT home_team AS team, away_team AS opponent, week, game_date, TRUE AS is_home
         FROM nfl_schedule WHERE season = ? AND game_date >= NOW()
         UNION ALL
         SELECT away_team AS team, home_team AS opponent, week, game_date, FALSE AS is_home
         FROM nfl_schedule WHERE season = ? AND game_date >= NOW()
       ) combined
     ) ranked
     WHERE rn = 1`,
    [season, season]
  );

  const map: Record<string, Matchup> = {};
  for (const r of rows) {
    map[r.team] = { week: r.week, opponent: r.opponent, isHome: !!r.is_home, gameDate: r.game_date };
  }
  return map;
}

// Next N matchups for one team — used by the player profile popup.
export async function getUpcomingMatchups(teamCode: string, season: number, limit = 5): Promise<Matchup[]> {
  const rows = await query<{ week: number; game_date: string; opponent: string; is_home: number }>(
    `SELECT week, DATE_FORMAT(game_date, '%Y-%m-%d %H:%i:%s') AS game_date,
            CASE WHEN home_team = ? THEN away_team ELSE home_team END AS opponent,
            (home_team = ?) AS is_home
     FROM nfl_schedule
     WHERE season = ? AND (home_team = ? OR away_team = ?) AND game_date >= NOW()
     ORDER BY game_date ASC
     LIMIT ?`,
    [teamCode, teamCode, season, teamCode, teamCode, limit]
  );

  return rows.map(r => ({ week: r.week, opponent: r.opponent, isHome: !!r.is_home, gameDate: r.game_date }));
}
