"""
set_schedule.py
────────────────
One-off sync: populates nfl_schedule with the regular-season (SeasonType 1)
schedule from SportsDataIO's Schedules endpoint. Separate from the live
scoring pipeline (live_game_states) — this exists so "next matchup" works
months before the season starts, since live_game_states only gets rows once
games actually kick off.

Usage:
  python3 set_schedule.py [season]   # defaults to 2026
"""

import os
import sys
import mysql.connector
import requests

env_path = os.path.join(os.path.dirname(__file__), '.env')
env = {}
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and '=' in line and not line.startswith('#'):
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip()

DB = dict(
    host=env['MYSQL_HOST'],
    port=int(env.get('MYSQL_PORT', 3306)),
    user=env['MYSQL_USER'],
    password=env['MYSQL_PASSWORD'],
    database=env['MYSQL_DATABASE'],
)

SEASON = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
API_KEY = env.get('SPORTSDATA_API_KEY') or os.environ.get('SPORTSDATA_API_KEY')
BASE_URL = env.get('SPORTSDATA_BASE_URL', 'https://api.sportsdata.io')

resp = requests.get(f'{BASE_URL}/v3/nfl/scores/json/Schedules/{SEASON}', params={'key': API_KEY}, timeout=30)
resp.raise_for_status()
games = resp.json()

regular_season = [
    g for g in games
    if g.get('SeasonType') == 1 and g.get('GameKey') and g.get('AwayTeam') != 'BYE' and g.get('HomeTeam') != 'BYE'
]
print(f'Fetched {len(games)} total games, {len(regular_season)} real regular-season games for {SEASON}')

rows = [
    (
        g['GameKey'],
        g['Season'],
        g['Week'],
        g['DateTime'],
        g['HomeTeam'],
        g['AwayTeam'],
        g.get('Status'),
    )
    for g in regular_season
]

conn = mysql.connector.connect(**DB)
cur = conn.cursor()
cur.executemany(
    """
    INSERT INTO nfl_schedule (game_key, season, week, game_date, home_team, away_team, status)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
      week = VALUES(week), game_date = VALUES(game_date),
      home_team = VALUES(home_team), away_team = VALUES(away_team), status = VALUES(status)
    """,
    rows,
)
conn.commit()
print(f'Upserted {len(rows)} rows into nfl_schedule.')

cur.execute('SELECT COUNT(*) FROM nfl_schedule WHERE season = %s', (SEASON,))
print(f'Total rows now in nfl_schedule for {SEASON}: {cur.fetchone()[0]}')

cur.close()
conn.close()
