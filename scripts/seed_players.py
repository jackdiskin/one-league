#!/usr/bin/env python3
"""
seed_players.py — Ingest NFL player data and weekly scores for 2024 and 2025.

Uses nflreadpy (official nfl_data_py replacement) to pull nflverse data.

Populates:
  - players                (QB, RB, WR, TE, K)
  - player_weekly_scores   (PPR scoring)
  - player_market_state    (initial prices derived from season total points)

Requirements:
    pip install nflreadpy polars pymysql python-dotenv

Usage:
    python scripts/seed_players.py
"""

import os
import sys

import polars as pl
import nflreadpy as nfl
import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEASONS = [2024, 2025]
SEED_SEASON = 2025   # Season used to compute initial market prices
MARKET_WEEK = 1      # Starting current_week in player_market_state

VALID_POSITIONS = {"QB", "RB", "WR", "TE", "K"}

# Prices in dollars (contract-value scale, $200M salary cap)
# base = price for a player at the position average
# season_avg = expected PPR points for an average starter over a full season
PRICE_CONFIG = {
    "QB": {"base": 20_000_000, "season_avg": 320, "min": 2_000_000, "max": 55_000_000},
    "RB": {"base": 10_000_000, "season_avg": 160, "min":   500_000, "max": 25_000_000},
    "WR": {"base": 10_000_000, "season_avg": 150, "min":   500_000, "max": 30_000_000},
    "TE": {"base":  7_000_000, "season_avg": 110, "min":   500_000, "max": 20_000_000},
    "K":  {"base":  4_000_000, "season_avg": 120, "min":   500_000, "max":  8_000_000},
}

TEAM_NAMES = {
    "ARI": "Arizona Cardinals",      "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",       "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",      "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",     "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",         "DEN": "Denver Broncos",
    "DET": "Detroit Lions",          "GB":  "Green Bay Packers",
    "HOU": "Houston Texans",         "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",   "KC":  "Kansas City Chiefs",
    "LA":  "Los Angeles Rams",       "LAC": "Los Angeles Chargers",
    "LV":  "Las Vegas Raiders",      "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",      "NE":  "New England Patriots",
    "NO":  "New Orleans Saints",     "NYG": "New York Giants",
    "NYJ": "New York Jets",          "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",    "SEA": "Seattle Seahawks",
    "SF":  "San Francisco 49ers",    "TB":  "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",       "WAS": "Washington Commanders",
}

TEAM_CODE_ALIASES = {
    "JAC": "JAX", "WSH": "WAS", "LVR": "LV",
    "GNB": "GB",  "KAN": "KC",  "NOR": "NO",
    "NWE": "NE",  "SFO": "SF",  "TAM": "TB",
}

ROSTER_STATUS_MAP = {
    "ACT": "active",  "RSN": "active",
    "IR":  "injured", "PUP": "injured", "NFI": "injured",
    "SUS": "inactive", "INA": "inactive", "RET": "inactive",
    "EXE": "inactive", "UFA": "inactive",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def norm_team(code) -> str:
    code = str(code or "").strip().upper()
    return TEAM_CODE_ALIASES.get(code, code)


def safe_int(val, default=0):
    try:
        return int(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (TypeError, ValueError):
        return default


def compute_initial_price(season_total_pts: float, position: str) -> float:
    cfg = PRICE_CONFIG.get(position, {"base": 5.0, "season_avg": 150, "min": 0.5, "max": 20.0})
    ratio = season_total_pts / cfg["season_avg"] if cfg["season_avg"] else 1.0
    price = round(cfg["base"] * ratio, 2)
    return max(cfg["min"], min(cfg["max"], price))


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


# ---------------------------------------------------------------------------
# Step 1: Players  (from roster data — richer metadata than stats)
# ---------------------------------------------------------------------------

def seed_players(cursor):
    print("  Fetching rosters...")
    rosters = nfl.load_rosters(seasons=SEASONS)
    rosters = (
        rosters
        .filter(pl.col("position").is_in(list(VALID_POSITIONS)))
        .sort("season", descending=True)
        .unique(subset=["gsis_id"], keep="first")
    )
    rows = rosters.to_dicts()
    print(f"  {len(rows)} players found")

    inserted = updated = 0
    for row in rows:
        team_code  = norm_team(row.get("team") or row.get("latest_team") or "")
        status_raw = str(row.get("status") or "ACT").strip().upper()
        status     = ROSTER_STATUS_MAP.get(status_raw, "active")
        full_name  = str(row.get("full_name") or row.get("player_name") or "").strip()
        short_name = str(row.get("short_name") or full_name).strip()
        jersey     = safe_int(row.get("jersey_number"), None)

        espn_id = str(row["espn_id"]) if row.get("espn_id") else None

        cursor.execute(
            """
            INSERT INTO players
                (external_player_id, full_name, short_name, team_code, team_name,
                 position, status, headshot_url, jersey_number, espn_athlete_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                full_name        = VALUES(full_name),
                short_name       = VALUES(short_name),
                team_code        = VALUES(team_code),
                team_name        = VALUES(team_name),
                status           = VALUES(status),
                headshot_url     = VALUES(headshot_url),
                jersey_number    = VALUES(jersey_number),
                espn_athlete_id  = VALUES(espn_athlete_id)
            """,
            (
                str(row["gsis_id"]),
                full_name,
                short_name,
                team_code,
                TEAM_NAMES.get(team_code, team_code),
                str(row["position"]),
                status,
                row.get("headshot_url") or None,
                jersey,
                espn_id,
            ),
        )
        inserted += cursor.rowcount == 1
        updated  += cursor.rowcount != 1

    print(f"  Players: {inserted} inserted, {updated} updated")


# ---------------------------------------------------------------------------
# Step 2: Weekly scores
# ---------------------------------------------------------------------------

def seed_weekly_scores(cursor):
    print("  Fetching weekly player stats...")
    stats = nfl.load_player_stats(seasons=SEASONS)
    stats = stats.filter(
        pl.col("position").is_in(list(VALID_POSITIONS)) &
        pl.col("fantasy_points_ppr").is_not_null()
    )
    rows = stats.to_dicts()
    print(f"  {len(rows)} player-week rows")

    cursor.execute(
        "SELECT id, external_player_id FROM players WHERE external_player_id IS NOT NULL"
    )
    id_map = {r["external_player_id"]: r["id"] for r in cursor.fetchall()}

    inserted = updated = skipped = 0
    for row in rows:
        db_id = id_map.get(str(row.get("player_id") or ""))
        if db_id is None:
            skipped += 1
            continue

        fumbles_lost = (
            safe_int(row.get("rushing_fumbles_lost"))
            + safe_int(row.get("receiving_fumbles_lost"))
            + safe_int(row.get("sack_fumbles_lost"))
        )

        cursor.execute(
            """
            INSERT INTO player_weekly_scores
                (player_id, season_year, week, fantasy_points,
                 passing_yards, passing_tds, interceptions_thrown,
                 rushing_yards, rushing_tds,
                 receptions, receiving_yards, receiving_tds,
                 fumbles_lost,
                 field_goals_made, extra_points_made,
                 sacks, defensive_interceptions, defensive_tds, points_allowed)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, 0, 0, 0, 0, 0)
            ON DUPLICATE KEY UPDATE
                fantasy_points       = VALUES(fantasy_points),
                passing_yards        = VALUES(passing_yards),
                passing_tds          = VALUES(passing_tds),
                interceptions_thrown = VALUES(interceptions_thrown),
                rushing_yards        = VALUES(rushing_yards),
                rushing_tds          = VALUES(rushing_tds),
                receptions           = VALUES(receptions),
                receiving_yards      = VALUES(receiving_yards),
                receiving_tds        = VALUES(receiving_tds),
                fumbles_lost         = VALUES(fumbles_lost)
            """,
            (
                db_id,
                safe_int(row.get("season")),
                safe_int(row.get("week")),
                safe_float(row.get("fantasy_points_ppr")),
                safe_int(row.get("passing_yards")),
                safe_int(row.get("passing_tds")),
                safe_int(row.get("interceptions")),
                safe_int(row.get("rushing_yards")),
                safe_int(row.get("rushing_tds")),
                safe_int(row.get("receptions")),
                safe_int(row.get("receiving_yards")),
                safe_int(row.get("receiving_tds")),
                fumbles_lost,
            ),
        )
        inserted += cursor.rowcount == 1
        updated  += cursor.rowcount != 1

    print(f"  Scores: {inserted} inserted, {updated} updated, {skipped} skipped")


# ---------------------------------------------------------------------------
# Step 3: Market state
# ---------------------------------------------------------------------------

def seed_market_state(cursor):
    print(f"  Computing initial prices from {SEED_SEASON} totals...")
    cursor.execute(
        """
        SELECT p.id, p.position,
               COALESCE(SUM(pws.fantasy_points), 0) AS season_pts
        FROM players p
        LEFT JOIN player_weekly_scores pws
               ON pws.player_id = p.id AND pws.season_year = %s
        GROUP BY p.id, p.position
        """,
        (SEED_SEASON,),
    )

    inserted = updated = 0
    for p in cursor.fetchall():
        price = compute_initial_price(float(p["season_pts"]), p["position"])
        cursor.execute(
            """
            INSERT INTO player_market_state
                (player_id, season_year, current_week,
                 base_weekly_price, current_price,
                 intraday_high, intraday_low)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                base_weekly_price = VALUES(base_weekly_price),
                current_price     = VALUES(current_price),
                intraday_high     = VALUES(intraday_high),
                intraday_low      = VALUES(intraday_low)
            """,
            (p["id"], SEED_SEASON, MARKET_WEEK, price, price, price, price),
        )
        inserted += cursor.rowcount == 1
        updated  += cursor.rowcount != 1

    print(f"  Market state: {inserted} inserted, {updated} updated")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"Starting seed — seasons: {SEASONS}\n")
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            print("Seeding players...")
            seed_players(cursor)
            conn.commit()
            print("  ✓ Committed\n")

            print("Seeding weekly scores...")
            seed_weekly_scores(cursor)
            conn.commit()
            print("  ✓ Committed\n")

            print("Seeding market state...")
            seed_market_state(cursor)
            conn.commit()
            print("  ✓ Committed\n")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR — rolled back: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

    print("Seed complete.")


if __name__ == "__main__":
    main()
