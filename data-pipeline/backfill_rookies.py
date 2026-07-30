"""
backfill_rookies.py
────────────────────
Backfills rookie player records and headshots from nflverse's actively-updated
players.csv (https://github.com/nflverse/nflverse-data/releases/download/players/players.csv),
which is far more current than the static SportsDataIO snapshot
(data-pipeline/players.json) or the static ESPN headshot CSV
(espn_ids_fantasy.csv) this app was originally seeded from — both predate
this year's rookie class.

Two cohorts (fantasy positions QB/RB/WR/TE only):
  1. draft_year == 2025 — this year's real NFL Draft class. Matched against
     existing `players` by normalized name; backfills headshot_url where
     missing. Not expected to insert anyone new (verified during planning:
     all 84 already exist in the DB under a name variant).
  2. rookie_season == 2026 — the broader incoming-2026 cohort (mostly UDFAs,
     since no actual "2026 draft" exists in any available data source yet).
     Matched the same way; existing matches get the same headshot backfill,
     non-matches get INSERTed as new players with a fresh player_market_state
     row (season 2026, week 1, $4.5M default price — same default every
     other unmatched-in-pricing-sheet player gets).

Dumps `players` and this season's `player_market_state` rows to a timestamped
JSON backup before writing anything (same convention as set_2026_prices_v2.py).

Usage:
  python3 backfill_rookies.py local   # against local dev (../.env.local)
  python3 backfill_rookies.py aiven   # against production (.env)
"""

import io
import json
import os
import re
import sys
from datetime import datetime
from decimal import Decimal

import requests
import mysql.connector

SEASON_YEAR    = 2026
WEEK           = 1
DEFAULT_PRICE  = Decimal('4500000')
FANTASY_POS    = {'QB', 'RB', 'WR', 'TE'}
NFLVERSE_URL   = 'https://github.com/nflverse/nflverse-data/releases/download/players/players.csv'

# nflverse's `latest_team` uses a couple of team codes that differ from this
# app's convention (confirmed by diffing the two team-code sets directly).
TEAM_CODE_ALIASES = {
    'AZ': 'ARI',
    'LA': 'LAR',
}

# Reuse the same alias table as set_2026_prices_v2.py — same kind of
# Jr./Sr./suffix mismatches show up between any two independent name sources.
NAME_ALIASES = {
    'Cam Ward':              'Cameron Ward',
    'Stetson Bennett':       'Stetson Bennett IV',
    'Joe Milton':            'Joe Milton III',
    'Travis Etienne':        'Travis Etienne Jr.',
    'Aaron Jones':           'Aaron Jones Sr.',
    'Brian Robinson':        'Brian Robinson Jr.',
    'Tyrone Tracy':          'Tyrone Tracy Jr.',
    'Chris Rodriguez':       'Chris Rodriguez Jr.',
    'LeQuint Allen':         'LeQuint Allen Jr.',
    'Ollie Gordon':          'Ollie Gordon II',
    'Michael Pittman':       'Michael Pittman Jr.',
    'D.J. Moore':            'DJ Moore',
    'Luther Burden':         'Luther Burden III',
    'Chris Godwin':          'Chris Godwin Jr.',
    'Tre Harris':            "Tre' Harris",
    'Demario Douglas':       'DeMario Douglas',
    'Theo Wease':            'Theo Wease Jr.',
    'Marvin Mims':           'Marvin Mims Jr.',
    'KeAndre Lambert-Smith': 'Keandre Lambert-Smith',
    'Kevin Austin':          'Kevin Austin Jr.',
    "Dont'e Thornton":       "Dont'e Thornton Jr.",
    'Terrace Marshall':      'Terrace Marshall Jr.',
    'Jimmy Horn':            'Jimmy Horn Jr.',
    'Efton Chism':           'Efton Chism III',
    'Harold Fannin':         'Harold Fannin Jr.',
    'Kyle Pitts':            'Kyle Pitts Sr.',
    'Chigoziem Okonkwo':     'Chig Okonkwo',
    'Erick All':             'Erick All Jr.',
    'Andrew Ogletree':       'Drew Ogletree',
}


def normalize(name: str) -> str:
    """Loose match key: lowercase, strip punctuation and generational suffixes."""
    n = name.strip().lower()
    n = re.sub(r"[.'']", '', n)
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


def load_env(path: str) -> dict:
    env = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and '=' in line and not line.startswith('#'):
                k, _, v = line.partition('=')
                env[k.strip()] = v.strip()
    return env


def db_config(target: str) -> dict:
    here = os.path.dirname(__file__)
    if target == 'aiven':
        env = load_env(os.path.join(here, '.env'))
    elif target == 'local':
        env = load_env(os.path.join(here, '..', '.env.local'))
    else:
        raise SystemExit(f'Unknown target: {target!r} (expected "local" or "aiven")')
    return dict(
        host=env['MYSQL_HOST'],
        port=int(env.get('MYSQL_PORT', 3306)),
        user=env['MYSQL_USER'],
        password=env.get('MYSQL_PASSWORD', ''),
        database=env['MYSQL_DATABASE'],
    )


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('local', 'aiven'):
        raise SystemExit('Usage: python3 backfill_rookies.py [local|aiven]')
    target = sys.argv[1]

    # ── Pull the live nflverse player file ─────────────────────────────────
    print('Downloading nflverse players.csv...')
    resp = requests.get(NFLVERSE_URL, timeout=60)
    resp.raise_for_status()
    import csv
    reader = csv.DictReader(io.StringIO(resp.text))
    all_rows = list(reader)
    print(f'  {len(all_rows)} total rows')

    draft_2025 = [r for r in all_rows if r.get('position') in FANTASY_POS and r.get('draft_year') == '2025']
    rookie_2026 = [r for r in all_rows if r.get('position') in FANTASY_POS and r.get('rookie_season') == '2026']
    print(f'  {len(draft_2025)} in 2025 draft class (fantasy positions)')
    print(f'  {len(rookie_2026)} in incoming 2026 rookie cohort (fantasy positions)')

    # ── Connect + backup ────────────────────────────────────────────────────
    conn = mysql.connector.connect(**db_config(target))
    cursor = conn.cursor(dictionary=True)

    cursor.execute('SELECT * FROM players')
    players_backup = cursor.fetchall()
    cursor.execute('SELECT * FROM player_market_state WHERE season_year = %s', (SEASON_YEAR,))
    market_backup = cursor.fetchall()

    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%dT%H%M%S')
    backup_path = os.path.join(backup_dir, f'{target}_pre_rookie_backfill_{stamp}.json')
    with open(backup_path, 'w') as f:
        json.dump({'players': players_backup, 'player_market_state': market_backup}, f, default=str)
    print(f'Backed up {len(players_backup)} players + {len(market_backup)} market_state rows -> {backup_path}')

    # ── Build a normalized-name index of existing players ──────────────────
    cursor.execute('SELECT id, full_name, headshot_url FROM players')
    db_players = cursor.fetchall()
    by_norm = {}
    for p in db_players:
        by_norm.setdefault(normalize(p['full_name']), []).append(p)

    def find_existing(source_name: str):
        candidates = by_norm.get(normalize(source_name))
        if not candidates:
            aliased = NAME_ALIASES.get(source_name.strip())
            if aliased:
                candidates = by_norm.get(normalize(aliased))
        return candidates[0] if candidates else None

    write_cursor = conn.cursor()

    def backfill_headshot(db_id: int, current_headshot, new_headshot: str) -> bool:
        if current_headshot or not new_headshot:
            return False
        write_cursor.execute('UPDATE players SET headshot_url = %s WHERE id = %s', (new_headshot, db_id))
        return True

    # ── Cohort 1: 2025 draft class — headshot backfill only ────────────────
    headshots_2025 = 0
    for r in draft_2025:
        existing = find_existing(r['display_name'])
        if existing and backfill_headshot(existing['id'], existing['headshot_url'], r.get('headshot')):
            headshots_2025 += 1
    conn.commit()
    print(f'\n2025 draft class: backfilled {headshots_2025} headshot(s)')

    # ── Cohort 2: incoming 2026 rookies — headshot backfill + new inserts ──
    headshots_2026 = 0
    inserted = 0
    inserted_no_headshot = 0
    skipped_no_team = []

    for r in rookie_2026:
        existing = find_existing(r['display_name'])
        if existing:
            if backfill_headshot(existing['id'], existing['headshot_url'], r.get('headshot')):
                headshots_2026 += 1
            continue

        team_code = r.get('latest_team') or ''
        team_code = TEAM_CODE_ALIASES.get(team_code, team_code)
        if not team_code:
            skipped_no_team.append(r['display_name'])
            continue

        headshot = r.get('headshot') or None
        jersey = r.get('jersey_number') or None

        write_cursor.execute(
            """
            INSERT INTO players
                (full_name, short_name, team_code, team_name, position, status, headshot_url, jersey_number)
            VALUES (%s, %s, %s, %s, %s, 'active', %s, %s)
            """,
            (r['display_name'], r.get('short_name') or None, team_code, team_code, r['position'], headshot, jersey),
        )
        new_id = write_cursor.lastrowid

        write_cursor.execute(
            """
            INSERT INTO player_market_state
                (player_id, season_year, current_week, base_weekly_price, current_price, intraday_high, intraday_low)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (new_id, SEASON_YEAR, WEEK, DEFAULT_PRICE, DEFAULT_PRICE, DEFAULT_PRICE, DEFAULT_PRICE),
        )
        write_cursor.execute(
            """
            INSERT INTO player_price_weeks
                (player_id, season_year, week, opening_price, base_price, closing_price)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (new_id, SEASON_YEAR, WEEK, DEFAULT_PRICE, DEFAULT_PRICE, DEFAULT_PRICE),
        )
        inserted += 1
        if not headshot:
            inserted_no_headshot += 1

    conn.commit()

    print(f'2026 incoming rookie cohort:')
    print(f'  Already existed, backfilled {headshots_2026} headshot(s)')
    print(f'  Newly inserted: {inserted} (priced at $4.5M default)')
    print(f'    of which missing a headshot (initials-avatar fallback): {inserted_no_headshot}')
    if skipped_no_team:
        print(f'  Skipped (no team assigned yet): {len(skipped_no_team)}')
        for n in skipped_no_team:
            print(f'    - {n}')

    cursor.close()
    write_cursor.close()
    conn.close()


if __name__ == '__main__':
    main()
