-- Migrates fantasy_teams from "one team per league" to "one team per season,
-- shared across every league" (the actual FPL model), and adds a flag for
-- the mandatory Global Leaderboard every user is auto-enrolled in.
--
-- Run this once against production. Assumes no user currently has more than
-- one fantasy_teams row for the same season_year (true as of this writing —
-- verify with the query below before running the ALTERs if in doubt):
--
--   SELECT user_id, season_year, COUNT(*) c FROM fantasy_teams
--   GROUP BY user_id, season_year HAVING c > 1;

ALTER TABLE leagues ADD COLUMN is_global TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE fantasy_teams DROP FOREIGN KEY fantasy_teams_ibfk_1;
ALTER TABLE fantasy_teams DROP KEY uq_league_user;
ALTER TABLE fantasy_teams DROP COLUMN league_id;
ALTER TABLE fantasy_teams ADD UNIQUE KEY uq_user_season (user_id, season_year);

-- Create the Global Leaderboard for the live season if it doesn't exist yet.
-- (App code also does this lazily on first draft, so this is just a
-- convenience for seeding it up front — owner_user_id must be a real user,
-- so pick any existing user; ownership is inconsequential for this league.)
