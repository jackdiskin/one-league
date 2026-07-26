-- Core game schema, reconstructed from application query code after the
-- production database was lost with no saved schema. Column names/types/
-- constraints are inferred from every SELECT/INSERT/UPDATE across app/** —
-- there is no earlier source of truth. Typing conventions (INT UNSIGNED PKs,
-- SMALLINT season_year, TINYINT UNSIGNED week, BOOLEAN flags, DATETIME
-- DEFAULT CURRENT_TIMESTAMP, InnoDB/utf8mb4) match weekly_recap_flags.sql,
-- the one table that survived.
--
-- Money columns (salary_cap, current_price, budget_remaining, etc.) are
-- stored as raw dollars (e.g. 18_500_000 = $18.5M), matching lib/pricing.ts's
-- floor/ceiling constants (500,000 / 55,000,000) and formatPrice() dividing
-- by 1,000,000 for display. app/api/leagues/create/route.ts currently inserts
-- salary_cap as a literal 100.00 instead of 100_000_000 — that looks like a
-- pre-existing bug in that endpoint, not a different unit convention; flagged
-- here rather than silently worked around.

create table players (
  id                  int unsigned auto_increment primary key,
  full_name           varchar(255) not null,
  short_name          varchar(255),
  position            varchar(10) not null,
  team_code           varchar(4),
  headshot_url        varchar(500),
  external_player_id  varchar(64),
  status              varchar(20),
  created_at          datetime not null default current_timestamp,
  updated_at          datetime not null default current_timestamp on update current_timestamp,
  key idx_position (position),
  unique key uq_external_player_id (external_player_id)
) engine=InnoDB default charset=utf8mb4;

create table leagues (
  id              int unsigned auto_increment primary key,
  name            varchar(255) not null,
  owner_user_id   varchar(36) not null,
  season_year     smallint not null,
  salary_cap      decimal(14,2) not null default 100000000.00,
  is_public       boolean not null default false,
  invite_code     varchar(6),
  max_members     int not null default 12,
  created_at      datetime not null default current_timestamp,
  key idx_public_season (is_public, season_year),
  unique key uq_invite_code (invite_code),
  foreign key (owner_user_id) references `user` (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table league_members (
  id          int unsigned auto_increment primary key,
  league_id   int unsigned not null,
  user_id     varchar(36) not null,
  role        varchar(20) not null default 'member',
  created_at  datetime not null default current_timestamp,
  unique key uq_league_user (league_id, user_id),
  foreign key (league_id) references leagues (id) on delete cascade,
  foreign key (user_id) references `user` (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table fantasy_teams (
  id                 int unsigned auto_increment primary key,
  league_id          int unsigned not null,
  user_id            varchar(36) not null,
  team_name          varchar(255) not null,
  season_year        smallint not null,
  budget_remaining   decimal(14,2) not null,
  total_points       decimal(10,2) not null default 0,
  total_spent        decimal(14,2) not null default 0,
  created_at         datetime not null default current_timestamp,
  key idx_user_season (user_id, season_year),
  unique key uq_league_user (league_id, user_id),
  foreign key (league_id) references leagues (id) on delete cascade,
  foreign key (user_id) references `user` (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table fantasy_team_roster (
  id                 int unsigned auto_increment primary key,
  fantasy_team_id    int unsigned not null,
  player_id          int unsigned not null,
  roster_slot        varchar(10) not null,
  acquisition_type   varchar(20) not null,
  purchase_price     decimal(14,2) not null,
  acquired_week      tinyint unsigned not null,
  is_active          boolean not null default true,
  sold_week          tinyint unsigned,
  sold_price         decimal(14,2),
  key idx_team_player_active (fantasy_team_id, player_id, is_active),
  key idx_team_slot_active (fantasy_team_id, roster_slot, is_active),
  key idx_player (player_id),
  foreign key (fantasy_team_id) references fantasy_teams (id) on delete cascade,
  foreign key (player_id) references players (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table fantasy_team_weekly_scores (
  id                int unsigned auto_increment primary key,
  fantasy_team_id   int unsigned not null,
  season_year       smallint not null,
  week              tinyint unsigned not null,
  points            decimal(8,2) not null default 0,
  unique key uq_team_season_week (fantasy_team_id, season_year, week),
  foreign key (fantasy_team_id) references fantasy_teams (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table player_market_state (
  player_id          int unsigned not null,
  season_year        smallint not null,
  current_week       tinyint unsigned not null,
  base_weekly_price  decimal(14,2) not null,
  current_price      decimal(14,2) not null,
  buy_orders_count   int unsigned not null default 0,
  sell_orders_count  int unsigned not null default 0,
  buy_volume         int unsigned not null default 0,
  sell_volume        int unsigned not null default 0,
  net_order_flow     int not null default 0,
  intraday_high      decimal(14,2),
  intraday_low       decimal(14,2),
  last_trade_at      datetime,
  primary key (player_id, season_year),
  foreign key (player_id) references players (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table player_price_weeks (
  player_id                int unsigned not null,
  season_year              smallint not null,
  week                     tinyint unsigned not null,
  opening_price            decimal(14,2) not null,
  base_price               decimal(14,2) not null,
  closing_price            decimal(14,2) not null,
  performance_adjustment   decimal(6,4) not null default 0,
  market_adjustment        decimal(6,4) not null default 0,
  total_buy_orders         int unsigned not null default 0,
  total_sell_orders        int unsigned not null default 0,
  total_buy_volume         int unsigned not null default 0,
  total_sell_volume        int unsigned not null default 0,
  primary key (player_id, season_year, week),
  foreign key (player_id) references players (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table player_transactions (
  id                 int unsigned auto_increment primary key,
  fantasy_team_id    int unsigned not null,
  player_id          int unsigned not null,
  transaction_type   varchar(10) not null,
  season_year        smallint not null,
  week               tinyint unsigned not null,
  price              decimal(14,2) not null,
  price_before       decimal(14,2) not null,
  price_after        decimal(14,2) not null,
  created_at         datetime not null default current_timestamp,
  key idx_season_team (season_year, fantasy_team_id),
  key idx_season_created (season_year, created_at, id),
  key idx_player (player_id),
  foreign key (fantasy_team_id) references fantasy_teams (id) on delete cascade,
  foreign key (player_id) references players (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table player_price_ticks (
  id                         int unsigned auto_increment primary key,
  player_id                  int unsigned not null,
  season_year                smallint not null,
  week                       tinyint unsigned not null,
  price                      decimal(14,2) not null,
  trigger_type               varchar(20) not null,
  reference_transaction_id   int unsigned,
  created_at                 datetime not null default current_timestamp,
  key idx_player_season_week (player_id, season_year, week),
  key idx_created (created_at),
  foreign key (player_id) references players (id) on delete cascade,
  foreign key (reference_transaction_id) references player_transactions (id) on delete set null
) engine=InnoDB default charset=utf8mb4;

create table player_weekly_scores (
  player_id                  int unsigned not null,
  season_year                smallint not null,
  week                       tinyint unsigned not null,
  fantasy_points             decimal(6,2) not null default 0,
  passing_yards              int not null default 0,
  passing_tds                int not null default 0,
  interceptions_thrown       int not null default 0,
  rushing_yards              int not null default 0,
  rushing_tds                int not null default 0,
  receptions                 int not null default 0,
  receiving_yards            int not null default 0,
  receiving_tds              int not null default 0,
  fumbles_lost               int not null default 0,
  field_goals_made           int not null default 0,
  fg_0_39                    int not null default 0,
  fg_40_49                   int not null default 0,
  fg_50_plus                 int not null default 0,
  extra_points_made          int not null default 0,
  two_pt_conversions         int not null default 0,
  sacks                      int default 0,
  defensive_interceptions    int default 0,
  defensive_tds              int default 0,
  points_allowed             int default 0,
  primary key (player_id, season_year, week),
  foreign key (player_id) references players (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table player_weekly_projections (
  player_id          int unsigned not null,
  season_year        smallint not null,
  week               tinyint unsigned not null,
  projection_source  varchar(50) not null default 'internal_model',
  expected_points     decimal(6,2) not null default 0,
  primary key (player_id, season_year, week, projection_source),
  foreign key (player_id) references players (id) on delete cascade
) engine=InnoDB default charset=utf8mb4;
