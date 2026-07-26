"""
set_espn_headshots.py
──────────────────────
One-off backfill: populates players.headshot_url with ESPN's public,
transparent-cutout headshot CDN URL, matched via espn_ids_fantasy.csv
(name -> ESPN PlayerID). No auth required — this is the workaround for
SportsDataIO's licensed (UsaToday/IMAGN) headshots not being accessible
on the current API key.

Matches by normalized full_name (strips Jr./Sr./II-IV suffixes and
punctuation); when multiple ESPN rows share a normalized name, prefers
the one matching the DB player's position.

Usage:
  python3 set_espn_headshots.py            # apply updates
  python3 set_espn_headshots.py --dry-run   # report matches only, no writes
"""

import csv
import os
import re
import sys
import mysql.connector

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

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'espn_ids_fantasy.csv')
HEADSHOT_TEMPLATE = 'https://a.espncdn.com/i/headshots/nfl/players/full/{espn_id}.png'
DRY_RUN = '--dry-run' in sys.argv


def normalize(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[.'’]", '', name)
    name = re.sub(r'\s+(jr|sr|ii|iii|iv|v)$', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name


# ── Load ESPN id map ──────────────────────────────────────────────────────────
by_norm_name: dict[str, list[dict]] = {}
with open(CSV_PATH, newline='') as f:
    for row in csv.DictReader(f):
        by_norm_name.setdefault(normalize(row['name']), []).append(row)

# ── Match against DB players ──────────────────────────────────────────────────
conn = mysql.connector.connect(**DB)
cur = conn.cursor(dictionary=True)
cur.execute("SELECT id, full_name, position, team_code FROM players")
db_players = cur.fetchall()

updates = []
unmatched = []

for p in db_players:
    candidates = by_norm_name.get(normalize(p['full_name']))
    if not candidates:
        unmatched.append(f"{p['full_name']} ({p['position']}, {p['team_code']})")
        continue

    chosen = candidates[0]
    if len(candidates) > 1:
        for c in candidates:
            if c['position'] == p['position']:
                chosen = c
                break

    url = HEADSHOT_TEMPLATE.format(espn_id=chosen['espn_id'])
    updates.append((url, p['id']))

print(f"Total players in DB: {len(db_players)}")
print(f"Matched:             {len(updates)}")
print(f"Unmatched:            {len(unmatched)}")
if unmatched:
    print("\nSample unmatched (first 25):")
    for name in unmatched[:25]:
        print(' -', name)

if DRY_RUN:
    print("\nDry run — no changes written.")
else:
    cur.executemany("UPDATE players SET headshot_url = %s WHERE id = %s", updates)
    conn.commit()
    print(f"\nUpdated headshot_url for {len(updates)} players.")

cur.close()
conn.close()
