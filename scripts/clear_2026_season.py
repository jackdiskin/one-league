#!/usr/bin/env python3
"""
clear_2026_season.py
────────────────────────────────────────────────────────────────────────────────
Clears all simulated 2026 season data, restoring the DB to the state where
only full 2025 season data exists and no 2026 season has started.

Tables cleared (WHERE season_year = 2026 or season = 2026):
  League/Team data (FK order):
    fantasy_team_roster      → via fantasy_teams.season_year = 2026
    fantasy_team_weekly_scores
    player_transactions
    fantasy_teams
    league_members           → via leagues.season_year = 2026
    leagues

  Player market/price data:
    player_price_ticks
    player_price_weeks
    player_market_state
    player_weekly_projections

  Live pipeline data:
    live_player_stats        → via live_game_states.season = 2026
    live_game_states

  Recap flags:
    weekly_recap_flags

Safety:
  • Dry-run by default — pass --confirm to actually delete.
  • 2025 data is never touched.
  • Shows row counts before deletion for review.

Usage:
  python scripts/clear_2026_season.py           # dry run
  python scripts/clear_2026_season.py --confirm  # actually delete
"""

import sys
import mysql.connector

# ── DB connection ──────────────────────────────────────────────────────────────
DB = {
    'host':     'one-league.cu9am8gksf0d.us-east-1.rds.amazonaws.com',
    'user':     'jackdiskin',
    'password': 'maddie33',
    'database': 'oneleague_db',
    'port':     3306,
}

CONFIRM = '--confirm' in sys.argv

# ── Deletion steps (order matters for FK constraints) ─────────────────────────
# Each step: (label, count_sql, delete_sql)
# count_sql   → SELECT COUNT(*) to show before deleting
# delete_sql  → the actual DELETE statement

STEPS = [
    (
        "fantasy_team_roster (2026 teams)",
        """
        SELECT COUNT(*) FROM fantasy_team_roster ftr
        JOIN fantasy_teams ft ON ftr.fantasy_team_id = ft.id
        WHERE ft.season_year = 2026
        """,
        """
        DELETE ftr FROM fantasy_team_roster ftr
        JOIN fantasy_teams ft ON ftr.fantasy_team_id = ft.id
        WHERE ft.season_year = 2026
        """,
    ),
    (
        "fantasy_team_weekly_scores (2026)",
        "SELECT COUNT(*) FROM fantasy_team_weekly_scores WHERE season_year = 2026",
        "DELETE FROM fantasy_team_weekly_scores WHERE season_year = 2026",
    ),
    (
        "player_transactions (2026)",
        "SELECT COUNT(*) FROM player_transactions WHERE season_year = 2026",
        "DELETE FROM player_transactions WHERE season_year = 2026",
    ),
    (
        "fantasy_teams (2026)",
        "SELECT COUNT(*) FROM fantasy_teams WHERE season_year = 2026",
        "DELETE FROM fantasy_teams WHERE season_year = 2026",
    ),
    (
        "league_members (2026 leagues)",
        """
        SELECT COUNT(*) FROM league_members lm
        JOIN leagues l ON lm.league_id = l.id
        WHERE l.season_year = 2026
        """,
        """
        DELETE lm FROM league_members lm
        JOIN leagues l ON lm.league_id = l.id
        WHERE l.season_year = 2026
        """,
    ),
    (
        "leagues (2026)",
        "SELECT COUNT(*) FROM leagues WHERE season_year = 2026",
        "DELETE FROM leagues WHERE season_year = 2026",
    ),
    (
        "player_price_ticks (2026)",
        "SELECT COUNT(*) FROM player_price_ticks WHERE season_year = 2026",
        "DELETE FROM player_price_ticks WHERE season_year = 2026",
    ),
    (
        "player_price_weeks (2026)",
        "SELECT COUNT(*) FROM player_price_weeks WHERE season_year = 2026",
        "DELETE FROM player_price_weeks WHERE season_year = 2026",
    ),
    (
        "player_market_state (2026)",
        "SELECT COUNT(*) FROM player_market_state WHERE season_year = 2026",
        "DELETE FROM player_market_state WHERE season_year = 2026",
    ),
    (
        "player_weekly_projections (2026)",
        "SELECT COUNT(*) FROM player_weekly_projections WHERE season_year = 2026",
        "DELETE FROM player_weekly_projections WHERE season_year = 2026",
    ),
    (
        "live_player_stats (2026 games)",
        """
        SELECT COUNT(*) FROM live_player_stats lps
        JOIN live_game_states lgs ON lps.event_id = lgs.event_id
        WHERE lgs.season = 2026
        """,
        """
        DELETE lps FROM live_player_stats lps
        JOIN live_game_states lgs ON lps.event_id = lgs.event_id
        WHERE lgs.season = 2026
        """,
    ),
    (
        "live_game_states (2026)",
        "SELECT COUNT(*) FROM live_game_states WHERE season = 2026",
        "DELETE FROM live_game_states WHERE season = 2026",
    ),
    (
        "weekly_recap_flags (2026)",
        "SELECT COUNT(*) FROM weekly_recap_flags WHERE season_year = 2026",
        "DELETE FROM weekly_recap_flags WHERE season_year = 2026",
    ),
]


def main():
    print("=" * 60)
    print("  clear_2026_season.py")
    print(f"  Mode: {'LIVE DELETE' if CONFIRM else 'DRY RUN (pass --confirm to delete)'}")
    print("=" * 60)

    conn = mysql.connector.connect(**DB)
    cursor = conn.cursor()

    total_rows = 0

    # ── Count phase ──────────────────────────────────────────────────────────
    print("\nRow counts to be deleted:\n")
    counts = []
    for label, count_sql, _ in STEPS:
        try:
            cursor.execute(count_sql)
            count = cursor.fetchone()[0]
        except mysql.connector.Error as e:
            # Table might not exist yet (e.g. live tables)
            count = f"(error: {e.msg})"
        counts.append(count)
        print(f"  {label}: {count}")
        if isinstance(count, int):
            total_rows += count

    print(f"\n  Total rows: {total_rows}")

    if not CONFIRM:
        print("\nDry run complete. No data was deleted.")
        print("Run with --confirm to actually delete.")
        cursor.close()
        conn.close()
        return

    # ── Confirm ──────────────────────────────────────────────────────────────
    print(f"\nAbout to delete {total_rows} rows of 2026 data.")
    answer = input("Type YES to proceed: ").strip()
    if answer != "YES":
        print("Aborted.")
        cursor.close()
        conn.close()
        return

    # ── Delete phase ─────────────────────────────────────────────────────────
    print("\nDeleting...\n")
    for (label, _, delete_sql), count in zip(STEPS, counts):
        if isinstance(count, str):
            print(f"  SKIP  {label} {count}")
            continue
        if count == 0:
            print(f"  SKIP  {label} (0 rows)")
            continue
        try:
            cursor.execute(delete_sql)
            deleted = cursor.rowcount
            conn.commit()
            print(f"  OK    {label}: deleted {deleted} rows")
        except mysql.connector.Error as e:
            conn.rollback()
            print(f"  ERROR {label}: {e.msg}")
            print("  Rolling back and aborting.")
            cursor.close()
            conn.close()
            sys.exit(1)

    print("\nDone. DB is back to 2025-only state.")
    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()
