#!/usr/bin/env python3
"""
migrate_weekly_scores_v2.py
---------------------------
Adds kicker distance-tier columns and two_pt_conversions to player_weekly_scores
so that live-to-final game data can be stored with full fidelity.

New columns:
  - fg_0_39           DOUBLE DEFAULT 0
  - fg_40_49          DOUBLE DEFAULT 0
  - fg_50_plus        DOUBLE DEFAULT 0
  - two_pt_conversions DOUBLE DEFAULT 0

The existing `field_goals_made` column is kept as the aggregate (sum of tiers)
for backward compatibility with 2025 historical data.

Run once:
    python scripts/migrate_weekly_scores_v2.py
"""
import os
import sys
import pymysql
from dotenv import load_dotenv

load_dotenv()


MIGRATIONS = [
    ("fg_0_39",            "ALTER TABLE player_weekly_scores ADD COLUMN fg_0_39            DOUBLE NOT NULL DEFAULT 0 AFTER field_goals_made"),
    ("fg_40_49",           "ALTER TABLE player_weekly_scores ADD COLUMN fg_40_49           DOUBLE NOT NULL DEFAULT 0 AFTER fg_0_39"),
    ("fg_50_plus",         "ALTER TABLE player_weekly_scores ADD COLUMN fg_50_plus         DOUBLE NOT NULL DEFAULT 0 AFTER fg_40_49"),
    ("two_pt_conversions", "ALTER TABLE player_weekly_scores ADD COLUMN two_pt_conversions DOUBLE NOT NULL DEFAULT 0 AFTER extra_points_made"),
]


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (table, column),
    )
    return cursor.fetchone()["cnt"] > 0


def main() -> None:
    required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    conn = pymysql.connect(
        host=os.environ["MYSQL_HOST"],
        port=int(os.environ.get("MYSQL_PORT", 3306)),
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
        database=os.environ["MYSQL_DATABASE"],
        cursorclass=pymysql.cursors.DictCursor,
    )

    with conn:
        with conn.cursor() as cur:
            for col_name, sql in MIGRATIONS:
                if column_exists(cur, "player_weekly_scores", col_name):
                    print(f"  SKIP  {col_name} (already exists)")
                else:
                    print(f"  ADD   {col_name} ...", end=" ", flush=True)
                    cur.execute(sql)
                    print("OK")
        conn.commit()

    print("\nMigration complete.")


if __name__ == "__main__":
    main()
