#!/usr/bin/env python3
"""
migrate_espn_ids.py
-------------------
One-time migration that:
  1. Adds espn_athlete_id column to the players table (if not present)
  2. Backfills ESPN athlete IDs from nflverse roster data (2024/2025 seasons)

Run once after deploying the live pipeline feature:
    python scripts/migrate_espn_ids.py

Requirements: same as seed_players.py (nflreadpy, polars, pymysql, python-dotenv)
"""
import os
import sys

import polars as pl
import nflreadpy as nfl
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv

load_dotenv()

SEASONS = [2024, 2025]

TEAM_CODE_ALIASES = {
    "JAC": "JAX", "WSH": "WAS", "LVR": "LV",
    "GNB": "GB",  "KAN": "KC",  "NOR": "NO",
    "NWE": "NE",  "SFO": "SF",  "TAM": "TB",
}


def get_conn():
    return pymysql.connect(
        host=os.environ["MYSQL_HOST"],
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
        database=os.environ["MYSQL_DATABASE"],
        port=int(os.environ.get("MYSQL_PORT", 3306)),
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=False,
    )


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (table, column),
    )
    return cursor.fetchone()["cnt"] > 0


def main():
    conn = get_conn()
    cur  = conn.cursor()

    # 1. Add column if missing
    if not column_exists(cur, "players", "espn_athlete_id"):
        print("Adding espn_athlete_id column to players...")
        cur.execute("ALTER TABLE players ADD COLUMN espn_athlete_id VARCHAR(32) NULL DEFAULT NULL")
        cur.execute("CREATE INDEX idx_players_espn_id ON players (espn_athlete_id)")
        conn.commit()
        print("  Column added.")
    else:
        print("espn_athlete_id column already exists — skipping ALTER TABLE.")

    # 2. Backfill from nflverse
    print("Loading roster data from nflverse...")
    rosters = nfl.load_rosters(seasons=SEASONS)
    rosters = (
        rosters
        .filter(pl.col("gsis_id").is_not_null() & pl.col("espn_id").is_not_null())
        .sort("season", descending=True)
        .unique(subset=["gsis_id"], keep="first")
    )
    rows = rosters.select(["gsis_id", "espn_id"]).to_dicts()
    print(f"  {len(rows)} gsis_id→espn_id mappings found.")

    updated = 0
    for row in rows:
        gsis   = str(row["gsis_id"])
        espn   = str(row["espn_id"])
        cur.execute(
            "UPDATE players SET espn_athlete_id = %s WHERE external_player_id = %s AND espn_athlete_id IS NULL",
            (espn, gsis),
        )
        updated += cur.rowcount

    conn.commit()
    cur.close()
    conn.close()
    print(f"  Updated {updated} players with ESPN athlete IDs.")
    print("Done.")


if __name__ == "__main__":
    main()
