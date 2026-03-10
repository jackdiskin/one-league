#!/usr/bin/env python3
"""
seed_dummy.py — Populate leagues, teams, rosters, transactions, price history,
                and projections with realistic dummy data.

Requires at least 2 existing users in the `user` table (sign up via the app first).

Requirements:
    pip install pymysql python-dotenv

Usage:
    python scripts/seed_dummy.py
"""

import os
import sys
import random
from datetime import datetime, timedelta

import pymysql
from pymysql.cursors import DictCursor
from dotenv import load_dotenv

load_dotenv()

SEASON = 2025
CURRENT_WEEK = 10   # Simulated current week
PAST_WEEKS = list(range(1, CURRENT_WEEK))  # Weeks 1-9 already played

# Roster slots to assign when building a team (one per slot)
STARTING_SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "K", "BENCH", "BENCH"]

random.seed(42)


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
# Fetch seed data from DB
# ---------------------------------------------------------------------------

def fetch_users(cursor):
    cursor.execute("SELECT id, name, email FROM `user` LIMIT 4")
    users = cursor.fetchall()
    if len(users) < 2:
        print("ERROR: Need at least 2 users in the database.")
        print("Sign up via the app, then re-run this script.")
        sys.exit(1)
    return users


def fetch_players_by_position(cursor, position, limit):
    """Fetch top players by 2025 fantasy points for a given position."""
    cursor.execute(
        """
        SELECT p.id, p.full_name, p.position,
               pms.current_price
        FROM players p
        JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = %s
        LEFT JOIN player_weekly_scores pws ON pws.player_id = p.id AND pws.season_year = %s
        WHERE p.position = %s
        GROUP BY p.id
        ORDER BY SUM(pws.fantasy_points) DESC
        LIMIT %s
        """,
        (SEASON, SEASON, position, limit),
    )
    return cursor.fetchall()


# ---------------------------------------------------------------------------
# 1. League + members
# ---------------------------------------------------------------------------

def seed_league(cursor, users):
    owner = users[0]
    cursor.execute(
        """
        INSERT INTO leagues (name, owner_user_id, season_year, salary_cap,
                             is_public, max_members)
        VALUES (%s, %s, %s, 200000000.00, TRUE, 12)
        """,
        ("OneLeague Alpha", owner["id"], SEASON),
    )
    league_id = cursor.lastrowid
    print(f"  Created league id={league_id}")

    for i, user in enumerate(users):
        role = "owner" if i == 0 else "member"
        cursor.execute(
            "INSERT INTO league_members (league_id, user_id, role) VALUES (%s, %s, %s)",
            (league_id, user["id"], role),
        )

    print(f"  Added {len(users)} members")
    return league_id


# ---------------------------------------------------------------------------
# 2. Fantasy teams
# ---------------------------------------------------------------------------

def seed_fantasy_teams(cursor, league_id, users):
    team_names = [
        "Mahomes Maniacs", "Gridlock Gang", "Blitz Brigade", "End Zone Elites"
    ]
    teams = []
    for i, user in enumerate(users):
        name = team_names[i % len(team_names)]
        cursor.execute(
            """
            INSERT INTO fantasy_teams
                (league_id, user_id, team_name, season_year, budget_remaining)
            VALUES (%s, %s, %s, %s, 200000000.00)
            """,
            (league_id, user["id"], name, SEASON),
        )
        team_id = cursor.lastrowid
        teams.append({"id": team_id, "user_id": user["id"], "name": name})
        print(f"  Created team '{name}' id={team_id}")
    return teams


# ---------------------------------------------------------------------------
# 3. Rosters + transactions + price ticks
# ---------------------------------------------------------------------------

def seed_roster_and_transactions(cursor, teams):
    # Fetch a pool of top players by position
    player_pool = {
        "QB":  fetch_players_by_position(cursor, "QB",  8),
        "RB":  fetch_players_by_position(cursor, "RB",  16),
        "WR":  fetch_players_by_position(cursor, "WR",  24),
        "TE":  fetch_players_by_position(cursor, "TE",  8),
        "K":   fetch_players_by_position(cursor, "K",   8),
    }

    slots_by_position = {
        "QB": ["QB"],
        "RB": ["RB", "RB", "BENCH"],
        "WR": ["WR", "WR", "WR", "BENCH"],
        "TE": ["TE"],
        "K":  ["K"],
    }

    used_players = set()  # prevent two teams owning same player

    for team in teams:
        team_id = team["id"]
        total_spent = 0
        roster_entries = []

        for position, slots in slots_by_position.items():
            pool = [p for p in player_pool[position] if p["id"] not in used_players]
            picks = pool[:len(slots)]
            if not picks:
                continue

            for player, slot in zip(picks, slots):
                used_players.add(player["id"])
                price = float(player["current_price"])
                acquired_week = random.randint(1, 3)

                roster_entries.append({
                    "player_id": player["id"],
                    "slot": slot,
                    "price": price,
                    "week": acquired_week,
                })
                total_spent += price

        # Insert transactions, ticks, and roster entries
        for entry in roster_entries:
            pid = entry["player_id"]
            price = entry["price"]
            week = entry["week"]
            acquired_at = datetime(2025, 9, 7) + timedelta(weeks=week - 1,
                                                            hours=random.randint(0, 48))

            # Transaction
            cursor.execute(
                """
                INSERT INTO player_transactions
                    (fantasy_team_id, player_id, transaction_type, season_year, week,
                     price, price_before, price_after, created_at)
                VALUES (%s, %s, 'buy', %s, %s, %s, %s, %s, %s)
                """,
                (team_id, pid, SEASON, week,
                 price, price, round(price * 1.005, 2), acquired_at),
            )
            tx_id = cursor.lastrowid

            # Price tick
            cursor.execute(
                """
                INSERT INTO player_price_ticks
                    (player_id, season_year, week, price, trigger_type,
                     reference_transaction_id, created_at)
                VALUES (%s, %s, %s, %s, 'buy', %s, %s)
                """,
                (pid, SEASON, week, round(price * 1.005, 2), tx_id, acquired_at),
            )

            # Roster entry
            cursor.execute(
                """
                INSERT INTO fantasy_team_roster
                    (fantasy_team_id, player_id, roster_slot, acquisition_type,
                     purchase_price, acquired_week, is_active)
                VALUES (%s, %s, %s, 'market_buy', %s, %s, TRUE)
                """,
                (team_id, pid, entry["slot"], price, week),
            )

        # Update team budget
        cursor.execute(
            "UPDATE fantasy_teams SET budget_remaining = budget_remaining - %s, "
            "total_spent = %s WHERE id = %s",
            (total_spent, total_spent, team_id),
        )
        print(f"  Team {team['name']}: {len(roster_entries)} players, "
              f"${total_spent:,.0f} spent")


# ---------------------------------------------------------------------------
# 4. Player price weeks (weeks 1–current for owned players)
# ---------------------------------------------------------------------------

def seed_price_weeks(cursor):
    cursor.execute(
        """
        SELECT DISTINCT ftr.player_id, pms.current_price
        FROM fantasy_team_roster ftr
        JOIN player_market_state pms
          ON pms.player_id = ftr.player_id AND pms.season_year = %s
        WHERE ftr.is_active = TRUE
        """,
        (SEASON,),
    )
    players = cursor.fetchall()

    for p in players:
        pid = p["player_id"]
        price = float(p["current_price"])

        for week in PAST_WEEKS:
            # Simulate some price drift week-over-week
            drift = random.uniform(-0.05, 0.08)
            open_price  = round(price * (1 + drift * (week / CURRENT_WEEK)), 2)
            close_price = round(open_price * random.uniform(0.97, 1.03), 2)
            base_price  = round((open_price + close_price) / 2, 2)

            cursor.execute(
                """
                INSERT INTO player_price_weeks
                    (player_id, season_year, week,
                     opening_price, base_price, closing_price,
                     total_buy_orders, total_sell_orders,
                     total_buy_volume, total_sell_volume)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE closing_price = VALUES(closing_price)
                """,
                (
                    pid, SEASON, week,
                    open_price, base_price, close_price,
                    random.randint(1, 8), random.randint(0, 4),
                    random.randint(1, 8), random.randint(0, 4),
                ),
            )

    print(f"  Price weeks seeded for {len(players)} players × {len(PAST_WEEKS)} weeks")


# ---------------------------------------------------------------------------
# 5. Fantasy team weekly scores
# ---------------------------------------------------------------------------

def seed_team_weekly_scores(cursor, teams):
    for team in teams:
        total = 0.0
        for week in PAST_WEEKS:
            # Sum actual player scores for this team's active starters that week
            cursor.execute(
                """
                SELECT COALESCE(SUM(pws.fantasy_points), 0) AS pts
                FROM fantasy_team_roster ftr
                JOIN player_weekly_scores pws
                  ON pws.player_id = ftr.player_id
                 AND pws.season_year = %s
                 AND pws.week = %s
                WHERE ftr.fantasy_team_id = %s
                  AND ftr.roster_slot != 'BENCH'
                  AND ftr.acquired_week <= %s
                  AND (ftr.is_active = TRUE OR ftr.sold_week > %s)
                """,
                (SEASON, week, team["id"], week, week),
            )
            pts = float(cursor.fetchone()["pts"])
            total += pts

            cursor.execute(
                """
                INSERT INTO fantasy_team_weekly_scores
                    (fantasy_team_id, season_year, week, points)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE points = VALUES(points)
                """,
                (team["id"], SEASON, week, round(pts, 2)),
            )

        cursor.execute(
            "UPDATE fantasy_teams SET total_points = %s WHERE id = %s",
            (round(total, 2), team["id"]),
        )
        print(f"  {team['name']}: {round(total, 1)} total pts across {len(PAST_WEEKS)} weeks")


# ---------------------------------------------------------------------------
# 6. Player weekly projections (next week)
# ---------------------------------------------------------------------------

def seed_projections(cursor):
    cursor.execute(
        """
        SELECT p.id, p.position
        FROM players p
        JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = %s
        """,
        (SEASON,),
    )
    players = cursor.fetchall()

    avg_pts = {"QB": 20.0, "RB": 12.0, "WR": 11.0, "TE": 8.0, "K": 8.0}

    for p in players:
        base = avg_pts.get(p["position"], 10.0)
        expected = round(base * random.uniform(0.6, 1.6), 2)
        floor    = round(expected * random.uniform(0.4, 0.7), 2)
        ceiling  = round(expected * random.uniform(1.3, 2.0), 2)
        conf     = round(random.uniform(55.0, 92.0), 2)

        cursor.execute(
            """
            INSERT INTO player_weekly_projections
                (player_id, season_year, week, expected_points,
                 floor_points, ceiling_points, confidence_score, projection_source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'internal_model')
            ON DUPLICATE KEY UPDATE
                expected_points  = VALUES(expected_points),
                floor_points     = VALUES(floor_points),
                ceiling_points   = VALUES(ceiling_points),
                confidence_score = VALUES(confidence_score)
            """,
            (p["id"], SEASON, CURRENT_WEEK, expected, floor, ceiling, conf),
        )

    print(f"  Projections seeded for {len(players)} players (week {CURRENT_WEEK})")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"Starting dummy seed — season {SEASON}, current week {CURRENT_WEEK}\n")
    conn = get_conn()
    try:
        with conn.cursor() as cursor:
            users = fetch_users(cursor)
            print(f"Found {len(users)} users: {[u['name'] for u in users]}\n")

            print("Creating league...")
            league_id = seed_league(cursor, users)
            conn.commit()
            print("  ✓ Committed\n")

            print("Creating fantasy teams...")
            teams = seed_fantasy_teams(cursor, league_id, users)
            conn.commit()
            print("  ✓ Committed\n")

            print("Building rosters + transactions...")
            seed_roster_and_transactions(cursor, teams)
            conn.commit()
            print("  ✓ Committed\n")

            print("Seeding price weeks...")
            seed_price_weeks(cursor)
            conn.commit()
            print("  ✓ Committed\n")

            print("Computing team weekly scores...")
            seed_team_weekly_scores(cursor, teams)
            conn.commit()
            print("  ✓ Committed\n")

            print("Seeding projections...")
            seed_projections(cursor)
            conn.commit()
            print("  ✓ Committed\n")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR — rolled back: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()

    print("Dummy seed complete.")


if __name__ == "__main__":
    main()
