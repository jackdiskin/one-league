-- Regular-season NFL schedule, synced once from SportsDataIO's Schedules
-- endpoint via data-pipeline/set_schedule.py. Separate from live_game_states
-- (live_pipeline_schema.sql), which only holds rows for weeks that have
-- actually kicked off — this table exists so "next matchup" works months
-- before the season starts.

create table nfl_schedule (
  game_key    varchar(20) not null primary key,
  season      smallint not null,
  week        tinyint unsigned not null,
  game_date   datetime not null,
  home_team   varchar(4) not null,
  away_team   varchar(4) not null,
  status      varchar(20),
  updated_at  datetime not null default current_timestamp on update current_timestamp,
  key idx_season_week (season, week),
  key idx_home_team (season, home_team),
  key idx_away_team (season, away_team)
) engine=InnoDB default charset=utf8mb4;
