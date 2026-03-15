-- Weekly recap flags: controls when the end-of-week recap modal is shown to users.
-- Enabled manually by admin (POST /api/admin/weekly-recap) or via Tuesday cron job.
-- Disabled when the next week's first game kicks off (DELETE /api/admin/weekly-recap).

CREATE TABLE IF NOT EXISTS weekly_recap_flags (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  league_id     INT UNSIGNED    NOT NULL,
  season_year   SMALLINT        NOT NULL,
  week          TINYINT         NOT NULL,
  is_active     BOOLEAN         NOT NULL DEFAULT TRUE,
  triggered_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_league_season_week (league_id, season_year, week),
  KEY idx_active (league_id, season_year, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
