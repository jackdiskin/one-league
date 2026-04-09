"""
Clears all user data from the DB, including BetterAuth tables and all associated
fantasy app data (teams, leagues, transactions, etc.).

Tables cleared (in FK-safe order):
  fantasy_team_roster, fantasy_team_weekly_scores, player_transactions,
  fantasy_teams, league_members, leagues,
  account, session, verification, user

Also resets buy/sell counters and net_order_flow on player_market_state,
since those are driven by user transactions.

Player data (players, prices, scores, projections, live stats) is untouched.
"""

import mysql.connector
import os

# Load env
env_path = os.path.join(os.path.dirname(__file__), '.env')
env = {}
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and '=' in line and not line.startswith('#'):
            key, _, val = line.partition('=')
            env[key.strip()] = val.strip()

DB_CONFIG = {
    'host': env['MYSQL_HOST'],
    'port': int(env.get('MYSQL_PORT', 3306)),
    'user': env['MYSQL_USER'],
    'password': env['MYSQL_PASSWORD'],
    'database': env['MYSQL_DATABASE'],
}

# Tables to clear in dependency order, with a human label
CLEAR_STEPS = [
    ('fantasy_team_roster',        'Fantasy team rosters'),
    ('fantasy_team_weekly_scores', 'Fantasy team weekly scores'),
    ('player_transactions',        'Player transactions'),
    ('fantasy_teams',              'Fantasy teams'),
    ('league_members',             'League members'),
    ('leagues',                    'Leagues'),
    ('account',                    'BetterAuth accounts'),
    ('session',                    'BetterAuth sessions'),
    ('verification',               'BetterAuth verifications'),
    ('user',                       'Users'),
]

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor()

# --- Preview row counts ---
print("Current row counts:")
for table, label in CLEAR_STEPS:
    cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
    count = cursor.fetchone()[0]
    print(f"  {label:<35} {count:>6} rows")

cursor.execute("SELECT COUNT(*) FROM player_market_state WHERE (buy_orders_count + sell_orders_count) > 0")
active_market_rows = cursor.fetchone()[0]
print(f"  {'Market state rows with activity':<35} {active_market_rows:>6} rows")

print()
print("This will permanently delete all user accounts, teams, leagues, and transactions.")
print("Player catalog, prices, scores, projections, and live data will NOT be touched.")
resp = input("Type YES to confirm: ").strip()
if resp != 'YES':
    print("Aborting.")
    cursor.close()
    conn.close()
    exit(0)

# --- Clear tables ---
print()
cursor.execute("SET FOREIGN_KEY_CHECKS=0")

for table, label in CLEAR_STEPS:
    cursor.execute(f"DELETE FROM `{table}`")
    print(f"  Cleared {label} ({cursor.rowcount} rows deleted)")

# Reset market state activity counters
cursor.execute("""
    UPDATE player_market_state SET
        buy_orders_count  = 0,
        sell_orders_count = 0,
        buy_volume        = 0,
        sell_volume       = 0,
        net_order_flow    = 0,
        last_trade_at     = NULL
""")
print(f"  Reset market state counters ({cursor.rowcount} rows updated)")

cursor.execute("SET FOREIGN_KEY_CHECKS=1")
conn.commit()

print("\nDone. All user data cleared.")
cursor.close()
conn.close()
