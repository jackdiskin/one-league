-- Tables written by data-pipeline/sportsdata_live_pipeline.py (MySQLWriter) and
-- read by the Next.js app (app/players/[id]/page.tsx, app/api/leagues/[id]/live-week-scores,
-- app/api/admin/finalize-games). Out of scope for core_game_schema.sql since that was
-- reconstructed only from app/** — these are the live-scoring bridge tables, columns
-- taken directly from MySQLWriter's INSERT statements.

create table live_game_states (
  event_id             varchar(20) not null primary key,
  snapshot_ts          datetime,
  season               smallint,
  week_num             tinyint unsigned,
  game_status          varchar(20),
  game_state           varchar(10),
  game_clock           varchar(20),
  period_num           tinyint,
  home_team_id         int,
  away_team_id         int,
  home_team_abbr       varchar(4),
  away_team_abbr       varchar(4),
  home_score           int,
  away_score           int,
  possession_team_id   int,
  updated_at           datetime not null default current_timestamp on update current_timestamp,
  key idx_season_week (season, week_num),
  key idx_game_state (game_state)
) engine=InnoDB default charset=utf8mb4;

create table live_player_stats (
  event_id               varchar(20) not null,
  player_id              varchar(20) not null,
  snapshot_ts            datetime,
  team_id                int,
  team_abbr              varchar(4),
  player_name            varchar(255),
  jersey                 int,
  passing_yards          double not null default 0,
  passing_tds            double not null default 0,
  interceptions          double not null default 0,
  rushing_yards          double not null default 0,
  rushing_tds            double not null default 0,
  receptions             double not null default 0,
  receiving_yards        double not null default 0,
  receiving_tds          double not null default 0,
  fumbles_lost           double not null default 0,
  fg_0_39                double not null default 0,
  fg_40_49               double not null default 0,
  fg_50_plus             double not null default 0,
  fg_missed              double not null default 0,
  xp_made                double not null default 0,
  xp_missed              double not null default 0,
  two_pt_conversions     double not null default 0,
  long_td_bonus_count    double not null default 0,
  return_tds             double not null default 0,
  fantasy_points_total   double not null default 0,
  primary key (event_id, player_id),
  key idx_player (player_id),
  foreign key (event_id) references live_game_states (event_id) on delete cascade
) engine=InnoDB default charset=utf8mb4;
