#!/usr/bin/env python3
"""
simulate_2026_season.py
────────────────────────────────────────────────────────────────────────────────
Real-time simulation of the 2026 NFL season for Liam Connor's fantasy roster.

Each week takes ~3 minutes:
  • Games split into 3 kickoff offset groups (early 0s / late 15s / night 30s)
  • 18 ticks × 10 seconds = 3-minute game window per group
  • Stats accumulate tick-by-tick; game_state transitions pre → in → post
  • Stat deltas broadcast via WebSocket on port 8765 (identical protocol to
    the live ESPN pipeline — the UI sees no difference)
  • Writes: live_game_states, live_player_stats (each tick),
            player_weekly_scores, fantasy_team_weekly_scores (on final whistle)

Usage:
  python scripts/simulate_2026_season.py              # all 18 weeks
  python scripts/simulate_2026_season.py --week 3     # single week
  python scripts/simulate_2026_season.py --weeks 1-4  # week range
"""
from __future__ import annotations

import asyncio
import json
import math
import random
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Set, Tuple

import mysql.connector
import mysql.connector.pooling

try:
    import websockets
    HAS_WS = True
except ImportError:
    HAS_WS = False
    print("WARNING: websockets not installed — run: pip install websockets")

# ── DB ─────────────────────────────────────────────────────────────────────────
_DB_KWARGS = dict(
    host     = 'one-league.cu9am8gksf0d.us-east-1.rds.amazonaws.com',
    user     = 'jackdiskin',
    password = 'maddie33',
    database = 'oneleague_db',
    port     = 3306,
)
_pool = mysql.connector.pooling.MySQLConnectionPool(
    pool_name = 'sim_pool',
    pool_size = 10,
    **_DB_KWARGS,
)

def _pool_conn():
    """Borrow a connection from the pool (auto-returned on .close())."""
    return _pool.get_connection()

# ── Simulation parameters ───────────────────────────────────────────────────────
SEASON         = 2026
TOTAL_WEEKS    = 18
BYE_RANGE      = (5, 14)
TICK_INTERVAL  = 10           # real seconds between ticks
TICKS_PER_GAME = 18           # 18 × 10s = 3 min per game
GAME_OFFSETS   = [0, 15, 30]  # seconds: early / late / night kickoff stagger
WS_HOST        = '0.0.0.0'
WS_PORT        = 8765

# Parse --week N / --weeks N-M
WEEK_START, WEEK_END = 1, TOTAL_WEEKS
_args = sys.argv[1:]
for i, arg in enumerate(_args):
    if arg == '--week' and i + 1 < len(_args):
        WEEK_START = WEEK_END = int(_args[i + 1])
    elif arg == '--weeks' and i + 1 < len(_args):
        m = re.match(r'^(\d+)(?:-(\d+))?$', _args[i + 1])
        if m:
            WEEK_START = int(m.group(1))
            WEEK_END   = int(m.group(2)) if m.group(2) else WEEK_START

# ── Stat field definitions (must match the live pipeline exactly) ───────────────
# (snake_db_col, camelCase_ws_key)
STAT_FIELDS: List[Tuple[str, str]] = [
    ('passing_yards',       'passingYards'),
    ('passing_tds',         'passingTds'),
    ('interceptions',       'interceptions'),
    ('rushing_yards',       'rushingYards'),
    ('rushing_tds',         'rushingTds'),
    ('receptions',          'receptions'),
    ('receiving_yards',     'receivingYards'),
    ('receiving_tds',       'receivingTds'),
    ('fumbles_lost',        'fumblesLost'),
    ('fg_0_39',             'fg0_39'),
    ('fg_40_49',            'fg40_49'),
    ('fg_50_plus',          'fg50Plus'),
    ('fg_missed',           'fgMissed'),
    ('xp_made',             'xpMade'),
    ('xp_missed',           'xpMissed'),
    ('two_pt_conversions',  'twoPtConversions'),
    ('fantasy_points_total','fantasyPointsTotal'),
]
SNAKE  = [s for s, _ in STAT_FIELDS]
TO_WS  = {s: c for s, c in STAT_FIELDS}

# Stats accumulated as continuous fractions vs discrete whole-number events
_CONTINUOUS = {'passing_yards', 'rushing_yards', 'receiving_yards'}

ZERO: Dict[str, float] = {s: 0.0 for s in SNAKE}

# ── PPR scoring (matches pipeline coefficients) ─────────────────────────────────
def _pts(s: dict) -> float:
    return round(
        s.get('passing_yards',      0) * 0.04 +
        s.get('passing_tds',        0) * 4.0  +
        s.get('interceptions',      0) * -2.0 +
        s.get('rushing_yards',      0) * 0.1  +
        s.get('rushing_tds',        0) * 6.0  +
        s.get('receptions',         0) * 1.0  +
        s.get('receiving_yards',    0) * 0.1  +
        s.get('receiving_tds',      0) * 6.0  +
        s.get('fumbles_lost',       0) * -2.0 +
        s.get('fg_0_39',            0) * 3.0  +
        s.get('fg_40_49',           0) * 4.0  +
        s.get('fg_50_plus',         0) * 5.0  +
        s.get('fg_missed',          0) * -1.0 +
        s.get('xp_made',            0) * 1.0  +
        s.get('two_pt_conversions', 0) * 2.0,
        2,
    )

# ── Per-position stat simulators ────────────────────────────────────────────────
def _ni(mu, sig, lo=0):  return max(lo, round(random.gauss(mu, sig)))
def _poi(lam):           return max(0,  round(random.gauss(lam, math.sqrt(max(lam, 0.1)))))
def _ber(p):             return 1 if random.random() < p else 0
def _h(hist, key, default):
    v = (hist or {}).get(key)
    return float(v) if v is not None else default

def sim_qb(hist):
    s = dict(passing_yards=_ni(_h(hist,'passing_yards',258), 65, 60),
             passing_tds=_poi(_h(hist,'passing_tds',1.8)),
             interceptions=_poi(_h(hist,'interceptions',0.85)),
             rushing_yards=_ni(_h(hist,'rushing_yards',18), 22),
             rushing_tds=_ber(0.12), fumbles_lost=_ber(0.05),
             two_pt_conversions=_ber(0.04))
    s['fantasy_points_total'] = _pts(s); return s

def sim_rb(hist):
    s = dict(rushing_yards=_ni(_h(hist,'rushing_yards',68), 35),
             rushing_tds=_poi(_h(hist,'rushing_tds',0.45)),
             receptions=_ni(_h(hist,'receptions',3.4), 2.4),
             receiving_yards=_ni(_h(hist,'receiving_yards',28), 20),
             receiving_tds=_ber(0.11), fumbles_lost=_ber(0.035),
             two_pt_conversions=_ber(0.03))
    s['fantasy_points_total'] = _pts(s); return s

def sim_wr(hist):
    s = dict(receptions=_ni(_h(hist,'receptions',4.8), 3.0),
             receiving_yards=_ni(_h(hist,'receiving_yards',62), 38),
             receiving_tds=_poi(_h(hist,'receiving_tds',0.38)),
             fumbles_lost=_ber(0.02), two_pt_conversions=_ber(0.03))
    s['fantasy_points_total'] = _pts(s); return s

def sim_te(hist):
    s = dict(receptions=_ni(_h(hist,'receptions',3.8), 2.5),
             receiving_yards=_ni(_h(hist,'receiving_yards',44), 28),
             receiving_tds=_poi(_h(hist,'receiving_tds',0.28)),
             fumbles_lost=_ber(0.015), two_pt_conversions=_ber(0.02))
    s['fantasy_points_total'] = _pts(s); return s

def sim_k(hist):
    fg_att = _poi(2.2)
    xp = _poi(_h(hist, 'xp_made', 2.1))
    fg_0_39 = fg_40_49 = fg_50_plus = fg_miss = 0
    for _ in range(fg_att):
        r = random.random()
        if   r < 0.55: (fg_0_39,  fg_miss) = (fg_0_39+1,  fg_miss) if random.random()<0.93 else (fg_0_39,  fg_miss+1)
        elif r < 0.85: (fg_40_49, fg_miss) = (fg_40_49+1, fg_miss) if random.random()<0.82 else (fg_40_49, fg_miss+1)
        else:          (fg_50_plus,fg_miss) = (fg_50_plus+1,fg_miss)if random.random()<0.62 else (fg_50_plus,fg_miss+1)
    s = dict(fg_0_39=fg_0_39, fg_40_49=fg_40_49, fg_50_plus=fg_50_plus,
             fg_missed=fg_miss, xp_made=xp)
    s['fantasy_points_total'] = _pts(s); return s

SIMULATORS = {'QB': sim_qb, 'RB': sim_rb, 'WR': sim_wr, 'TE': sim_te, 'K': sim_k}

# ── Tick schedule builder ───────────────────────────────────────────────────────
def build_schedule(final: dict, n: int) -> List[Dict[str, float]]:
    """
    Distribute `final` stats across `n` ticks.
    Returns list of n dicts; summing all ticks recovers final stats.
    Continuous stats spread smoothly; discrete stats snap to random ticks.
    """
    ticks = [{s: 0.0 for s in SNAKE} for _ in range(n)]
    for col in SNAKE:
        if col == 'fantasy_points_total':
            continue
        total = float(final.get(col, 0))
        if total <= 0:
            continue
        if col in _CONTINUOUS:
            weights = [random.random() for _ in range(n)]
            wsum = sum(weights) or 1.0
            for i, w in enumerate(weights):
                ticks[i][col] = round(total * w / wsum, 1)
        else:
            for _ in range(int(round(total))):
                ticks[random.randint(0, n - 1)][col] += 1.0
    # Recompute incremental fantasy_points_total per tick
    for t in ticks:
        t['fantasy_points_total'] = _pts(t)
    return ticks

# ── Game clock ──────────────────────────────────────────────────────────────────
def game_clock(tick_idx: int, n: int) -> Tuple[int, str]:
    """Maps tick_idx (0-based, during play) to (period, 'MM:SS') remaining."""
    elapsed_min = (tick_idx / n) * 60.0
    period      = min(4, int(elapsed_min / 15) + 1)
    remaining   = 15.0 - (elapsed_min % 15.0)
    m = int(remaining)
    s = int((remaining - m) * 60)
    return period, f"{m}:{s:02d}"

# ── WebSocket server ────────────────────────────────────────────────────────────
class WsServer:
    """
    Minimal WebSocket server with the same subscribe/unsubscribe protocol
    as the live ESPN pipeline. Clients cannot tell the difference.
    """
    def __init__(self):
        self._subs: Dict[str, Set[Any]] = {}   # espn_id → set of ws clients
        self._conns: Set[Any] = set()

    async def handler(self, ws: Any) -> None:
        self._conns.add(ws)
        my_subs: Set[str] = set()
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if 'subscribe' in msg:
                    for pid in (msg['subscribe'] or []):
                        pid = str(pid)
                        self._subs.setdefault(pid, set()).add(ws)
                        my_subs.add(pid)
                if 'unsubscribe' in msg:
                    for pid in (msg['unsubscribe'] or []):
                        pid = str(pid)
                        self._subs.get(pid, set()).discard(ws)
                        my_subs.discard(pid)
        except Exception:
            pass
        finally:
            self._conns.discard(ws)
            for pid in my_subs:
                self._subs.get(pid, set()).discard(ws)

    async def broadcast(self, espn_id: str, payload: dict) -> None:
        targets = list(self._subs.get(espn_id, set()))
        if not targets:
            return
        raw = json.dumps(payload)
        await asyncio.gather(*[ws.send(raw) for ws in targets],
                             return_exceptions=True)

# ── DB write helpers (synchronous — called via asyncio.to_thread) ───────────────
def _db_upsert_game(event_id, season, week, game_state, period, clock,
                    home_abbr, away_abbr, home_score, away_score):
    status_map = {'pre': 'Scheduled', 'in': 'In Progress', 'post': 'Final'}
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
    conn = _pool_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO live_game_states
              (event_id, snapshot_ts, season, week_num, game_status, game_state,
               game_clock, period_num, home_team_id, away_team_id,
               home_team_abbr, away_team_abbr, home_score, away_score,
               possession_team_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
              snapshot_ts=VALUES(snapshot_ts), game_status=VALUES(game_status),
              game_state=VALUES(game_state),   game_clock=VALUES(game_clock),
              period_num=VALUES(period_num),   home_score=VALUES(home_score),
              away_score=VALUES(away_score)
        """, (event_id, ts, season, week, status_map[game_state], game_state,
              clock, period, home_abbr, away_abbr, home_abbr, away_abbr,
              home_score, away_score, home_abbr))
        conn.commit()
        cur.close()
    finally:
        conn.close()

def _db_upsert_player(event_id, espn_id, name, team_abbr, cumulative: dict):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S.%f')
    conn = _pool_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO live_player_stats
              (event_id, player_id, snapshot_ts, team_id, team_abbr, player_name, jersey,
               passing_yards, passing_tds, interceptions,
               rushing_yards, rushing_tds,
               receptions, receiving_yards, receiving_tds,
               fumbles_lost, fg_0_39, fg_40_49, fg_50_plus,
               fg_missed, xp_made, xp_missed, two_pt_conversions,
               fantasy_points_total)
            VALUES (%s,%s,%s,%s,%s,%s,%s, %s,%s,%s, %s,%s, %s,%s,%s,
                    %s,%s,%s,%s, %s,%s,%s,%s, %s)
            ON DUPLICATE KEY UPDATE
              snapshot_ts=VALUES(snapshot_ts),
              passing_yards=VALUES(passing_yards),   passing_tds=VALUES(passing_tds),
              interceptions=VALUES(interceptions),
              rushing_yards=VALUES(rushing_yards),   rushing_tds=VALUES(rushing_tds),
              receptions=VALUES(receptions),         receiving_yards=VALUES(receiving_yards),
              receiving_tds=VALUES(receiving_tds),   fumbles_lost=VALUES(fumbles_lost),
              fg_0_39=VALUES(fg_0_39),               fg_40_49=VALUES(fg_40_49),
              fg_50_plus=VALUES(fg_50_plus),         fg_missed=VALUES(fg_missed),
              xp_made=VALUES(xp_made),               xp_missed=VALUES(xp_missed),
              two_pt_conversions=VALUES(two_pt_conversions),
              fantasy_points_total=VALUES(fantasy_points_total)
        """, (event_id, espn_id, ts, team_abbr, team_abbr, name, None,
              cumulative.get('passing_yards', 0),  cumulative.get('passing_tds', 0),
              cumulative.get('interceptions', 0),
              cumulative.get('rushing_yards', 0),  cumulative.get('rushing_tds', 0),
              cumulative.get('receptions', 0),      cumulative.get('receiving_yards', 0),
              cumulative.get('receiving_tds', 0),
              cumulative.get('fumbles_lost', 0),
              cumulative.get('fg_0_39', 0),         cumulative.get('fg_40_49', 0),
              cumulative.get('fg_50_plus', 0),      cumulative.get('fg_missed', 0),
              cumulative.get('xp_made', 0),         cumulative.get('xp_missed', 0),
              cumulative.get('two_pt_conversions', 0),
              cumulative.get('fantasy_points_total', 0)))
        conn.commit()
        cur.close()
    finally:
        conn.close()

def _db_write_weekly_score(player_id, season, week, final: dict):
    conn = _pool_conn()
    try:
        cur = conn.cursor()
        fgm = final.get('fg_0_39',0) + final.get('fg_40_49',0) + final.get('fg_50_plus',0)
        cur.execute("""
            INSERT INTO player_weekly_scores
              (player_id, season_year, week, fantasy_points,
               passing_yards, passing_tds, interceptions_thrown,
               rushing_yards, rushing_tds,
               receptions, receiving_yards, receiving_tds,
               fumbles_lost, field_goals_made,
               fg_0_39, fg_40_49, fg_50_plus,
               extra_points_made, two_pt_conversions)
            VALUES (%s,%s,%s,%s, %s,%s,%s, %s,%s, %s,%s,%s,
                    %s,%s, %s,%s,%s, %s,%s)
            ON DUPLICATE KEY UPDATE
              fantasy_points=VALUES(fantasy_points),
              passing_yards=VALUES(passing_yards),   passing_tds=VALUES(passing_tds),
              interceptions_thrown=VALUES(interceptions_thrown),
              rushing_yards=VALUES(rushing_yards),   rushing_tds=VALUES(rushing_tds),
              receptions=VALUES(receptions),         receiving_yards=VALUES(receiving_yards),
              receiving_tds=VALUES(receiving_tds),   fumbles_lost=VALUES(fumbles_lost),
              field_goals_made=VALUES(field_goals_made),
              fg_0_39=VALUES(fg_0_39), fg_40_49=VALUES(fg_40_49),
              fg_50_plus=VALUES(fg_50_plus),
              extra_points_made=VALUES(extra_points_made),
              two_pt_conversions=VALUES(two_pt_conversions)
        """, (player_id, season, week, final.get('fantasy_points_total', 0),
              final.get('passing_yards', 0),  final.get('passing_tds', 0),
              final.get('interceptions', 0),
              final.get('rushing_yards', 0),  final.get('rushing_tds', 0),
              final.get('receptions', 0),     final.get('receiving_yards', 0),
              final.get('receiving_tds', 0),  final.get('fumbles_lost', 0),
              fgm,
              final.get('fg_0_39', 0),        final.get('fg_40_49', 0),
              final.get('fg_50_plus', 0),     final.get('xp_made', 0),
              final.get('two_pt_conversions', 0)))
        conn.commit()
        cur.close()
    finally:
        conn.close()

def _db_upsert_team_score(team_id, season, week, pts):
    conn = _pool_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO fantasy_team_weekly_scores (fantasy_team_id, season_year, week, points)
            VALUES (%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE points=VALUES(points)
        """, (team_id, season, week, pts))
        conn.commit()
        cur.close()
    finally:
        conn.close()

# ── Opponent name pool ──────────────────────────────────────────────────────────
_OPP_POOL = ['KC','BUF','PHI','DAL','SF','DET','BAL','CIN','MIA','LAR',
             'GB','MIN','SEA','LV','NO','JAX','NYG','WAS','TEN','PIT',
             'CLE','IND','ARI','ATL','CAR','CHI','DEN','HOU','LAC','NE']
def _opp(home: str) -> str:
    choices = [t for t in _OPP_POOL if t != home] or _OPP_POOL
    return random.choice(choices)

# ── Game simulation ─────────────────────────────────────────────────────────────
async def simulate_game(
    *,
    event_id: str,
    home_abbr: str,
    away_abbr: str,
    week: int,
    players: List[dict],        # each has player_id, espn_id, full_name, position, final_stats
    team_id: int,
    score_acc: dict,            # {week: float} shared accumulator
    ws: WsServer,
    start_offset: float,
):
    n = TICKS_PER_GAME

    # Pre-build tick schedules for every player in this game
    schedules = [(p, build_schedule(p['final_stats'], n)) for p in players]

    # Per-player cumulative stat tracker
    cum = {p['player_id']: dict(ZERO) for p in players}

    # Opponent score: revealed at post (we'll increment it gradually)
    away_final  = random.randint(10, 38)
    home_score  = 0
    away_score  = 0

    # ── PRE ───────────────────────────────────────────────────────────────────
    if start_offset > 0:
        await asyncio.sleep(start_offset)

    print(f"  [W{week:02d}] ⏐ {home_abbr} vs {away_abbr}  kickoff  ({len(players)} players)")
    await asyncio.to_thread(_db_upsert_game,
        event_id, SEASON, week, 'pre', 1, '15:00',
        home_abbr, away_abbr, 0, 0)

    # ── IN — tick loop ─────────────────────────────────────────────────────────
    for tick_idx in range(n):
        await asyncio.sleep(TICK_INTERVAL)

        period, clock = game_clock(tick_idx + 1, n)

        # Advance away score gradually
        away_score = int(away_final * (tick_idx + 1) / n)

        scoring_events: List[str] = []

        for player, sched in schedules:
            pid   = player['player_id']
            espn  = player['espn_id']
            name  = player['full_name']
            team  = player['team_abbr']
            inc   = sched[tick_idx]

            # ── Accumulate ────────────────────────────────────────────────────
            for col in SNAKE:
                if col != 'fantasy_points_total':
                    cum[pid][col] = round(cum[pid][col] + inc[col], 2)
            cum[pid]['fantasy_points_total'] = _pts(cum[pid])

            # ── Track home score from this tick's scoring events ──────────────
            tds = int(inc.get('passing_tds',0) + inc.get('rushing_tds',0) +
                      inc.get('receiving_tds',0))
            fgs = (int(inc.get('fg_0_39',0)) * 3 +
                   int(inc.get('fg_40_49',0)) * 4 +
                   int(inc.get('fg_50_plus',0)) * 5)
            xps = int(inc.get('xp_made', 0))
            home_score += tds * 7 + fgs + xps  # rough score (TD=6+XP)

            for _ in range(tds):
                scoring_events.append(f"{name} TD")
            for _ in range(int(inc.get('fg_0_39',0) + inc.get('fg_40_49',0) + inc.get('fg_50_plus',0))):
                scoring_events.append(f"{name} FG")

            # ── WebSocket broadcast ───────────────────────────────────────────
            if espn:
                delta_ws  = {TO_WS[col]: inc[col]
                             for col in SNAKE if abs(inc.get(col, 0)) > 1e-9}
                totals_ws = {TO_WS[col]: round(cum[pid][col], 2)
                             for col in SNAKE}
                if delta_ws:
                    await ws.broadcast(str(espn), {
                        'playerId': str(espn),
                        'name':     name,
                        'eventId':  event_id,
                        'teamAbbr': team,
                        'delta':    delta_ws,
                        'totals':   totals_ws,
                    })

        # ── Update game state in DB ────────────────────────────────────────────
        await asyncio.to_thread(_db_upsert_game,
            event_id, SEASON, week, 'in', period, clock,
            home_abbr, away_abbr, home_score, away_score)

        # ── Write all player live stats to DB ─────────────────────────────────
        for player, _ in schedules:
            if player['espn_id']:
                await asyncio.to_thread(
                    _db_upsert_player,
                    event_id, str(player['espn_id']),
                    player['full_name'], player['team_abbr'], cum[player['player_id']])

        if scoring_events:
            print(f"  [W{week:02d}] Q{period} {clock}  {home_abbr} {home_score}–{away_score} {away_abbr}"
                  f"  ›  {', '.join(scoring_events)}")

    # ── POST — final whistle ────────────────────────────────────────────────────
    await asyncio.to_thread(_db_upsert_game,
        event_id, SEASON, week, 'post', 4, '0:00',
        home_abbr, away_abbr, home_score, away_final)

    week_pts = 0.0
    for player, _ in schedules:
        pid   = player['player_id']
        final = cum[pid]
        pts   = final['fantasy_points_total']
        week_pts += pts
        await asyncio.to_thread(_db_write_weekly_score, pid, SEASON, week, final)

    score_acc[week] = round(score_acc.get(week, 0.0) + week_pts, 2)

    print(f"  [W{week:02d}] FINAL  {home_abbr} {home_score}–{away_final} {away_abbr}"
          f"  |  roster pts this game: {week_pts:.1f}")
    for player, _ in schedules:
        pid = player['player_id']
        print(f"           {player['full_name']:<26} {cum[pid]['fantasy_points_total']:>6.2f} pts")

# ── Week simulation ─────────────────────────────────────────────────────────────
async def simulate_week(week: int, roster: List[dict], hist_map: dict,
                        bye_map: dict, team_id: int, score_acc: dict, ws: WsServer):
    print(f"\n{'═' * 60}")
    print(f"  WEEK {week}")
    print(f"{'═' * 60}")

    on_bye = [p for p in roster if bye_map[p['player_id']] == week]
    active  = [p for p in roster if bye_map[p['player_id']] != week]

    if on_bye:
        print(f"  BYE: {', '.join(p['full_name'] for p in on_bye)}")
        for p in on_bye:
            await asyncio.to_thread(_db_write_weekly_score,
                                    p['player_id'], SEASON, week, dict(ZERO))

    if not active:
        print("  All players on bye — nothing to simulate.")
        return

    # Simulate final stats for this week
    for p in active:
        sim = SIMULATORS.get(p['position'])
        p['final_stats'] = sim(hist_map.get(p['player_id'])) if sim else dict(ZERO)

    # Group by team → one game per team
    teams: Dict[str, List[dict]] = {}
    for p in active:
        abbr = (p['team_code'] or 'UNK').upper()
        p['team_abbr'] = abbr
        p['espn_id']   = p.get('espn_athlete_id')
        teams.setdefault(abbr, []).append(p)

    # Assign offset groups round-robin by sorted team name
    tasks = []
    for i, abbr in enumerate(sorted(teams)):
        offset = GAME_OFFSETS[i % len(GAME_OFFSETS)]
        eid    = f"SIM{SEASON}W{week:02d}_{abbr}"
        tasks.append(asyncio.create_task(simulate_game(
            event_id     = eid,
            home_abbr    = abbr,
            away_abbr    = _opp(abbr),
            week         = week,
            players      = teams[abbr],
            team_id      = team_id,
            score_acc    = score_acc,
            ws           = ws,
            start_offset = float(offset),
        )))

    await asyncio.gather(*tasks)

    week_pts = score_acc.get(week, 0.0)
    await asyncio.to_thread(_db_upsert_team_score, team_id, SEASON, week, week_pts)
    print(f"\n  Week {week} team total: {week_pts:.1f} pts")

# ── Main ─────────────────────────────────────────────────────────────────────────
async def main():
    print('=' * 60)
    print('  simulate_2026_season.py')
    print(f'  Season {SEASON}  |  Weeks {WEEK_START}–{WEEK_END}')
    print(f'  {TICKS_PER_GAME} ticks × {TICK_INTERVAL}s = '
          f'{TICKS_PER_GAME * TICK_INTERVAL}s per game  |  offsets: {GAME_OFFSETS}s')
    print('=' * 60)

    # ── Load roster from DB ──────────────────────────────────────────────────
    conn   = mysql.connector.connect(**_DB_KWARGS)
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT id, name FROM `user` WHERE name = 'Liam Connor' LIMIT 1")
    user_row = cursor.fetchone()
    if not user_row:
        print("ERROR: No user 'Liam Connor' found."); return
    user_id = user_row['id']
    print(f"\nUser : {user_row['name']}  (id={user_id})")

    cursor.execute(
        "SELECT id, team_name FROM fantasy_teams WHERE user_id=%s AND season_year=%s LIMIT 1",
        (user_id, SEASON))
    team_row = cursor.fetchone()
    if not team_row:
        print(f"ERROR: No {SEASON} fantasy team for this user."); return
    team_id = team_row['id']
    print(f"Team : {team_row['team_name']}  (id={team_id})")

    cursor.execute("""
        SELECT ftr.player_id, ftr.roster_slot,
               p.full_name, p.position, p.team_code, p.espn_athlete_id
        FROM fantasy_team_roster ftr
        JOIN players p ON p.id = ftr.player_id
        WHERE ftr.fantasy_team_id = %s AND ftr.is_active = 1
        ORDER BY p.position, p.full_name
    """, (team_id,))
    roster = cursor.fetchall()
    if not roster:
        print("ERROR: Roster is empty."); return

    print(f"\nRoster ({len(roster)} players):")
    for r in roster:
        print(f"  {r['position']:<3} {r['full_name']:<26} {r['team_code'] or '?':<5}"
              f"  ESPN:{r['espn_athlete_id'] or 'N/A'}")

    # ── Load 2025 historical averages ────────────────────────────────────────
    pids = [r['player_id'] for r in roster]
    ph   = ','.join(['%s'] * len(pids))
    cursor.execute(f"""
        SELECT player_id,
               AVG(passing_yards)        AS passing_yards,
               AVG(passing_tds)          AS passing_tds,
               AVG(interceptions_thrown) AS interceptions,
               AVG(rushing_yards)        AS rushing_yards,
               AVG(rushing_tds)          AS rushing_tds,
               AVG(receptions)           AS receptions,
               AVG(receiving_yards)      AS receiving_yards,
               AVG(receiving_tds)        AS receiving_tds,
               AVG(extra_points_made)    AS xp_made
        FROM player_weekly_scores
        WHERE season_year = 2025 AND player_id IN ({ph})
        GROUP BY player_id
    """, pids)
    hist_map = {
        row['player_id']: {k: float(v) if v is not None else None
                           for k, v in row.items()}
        for row in cursor.fetchall()
    }
    cursor.close()
    conn.close()

    # ── Assign bye weeks (deterministic) ────────────────────────────────────
    random.seed(42)
    bye_map = {r['player_id']: random.randint(*BYE_RANGE) for r in roster}
    random.seed()   # reset so game randomness is not deterministic

    # ── Start WebSocket server ───────────────────────────────────────────────
    ws = WsServer()
    if HAS_WS:
        server = await websockets.serve(ws.handler, WS_HOST, WS_PORT)
        print(f"\nWebSocket  ws://{WS_HOST}:{WS_PORT}  (same protocol as live pipeline)\n")
    else:
        server = None
        print("\nWebSocket disabled — install websockets for live UI updates.\n")

    # ── Run weeks ────────────────────────────────────────────────────────────
    score_acc: Dict[int, float] = {}
    for week in range(WEEK_START, WEEK_END + 1):
        await simulate_week(week, roster, hist_map, bye_map, team_id, score_acc, ws)

    # ── Summary ──────────────────────────────────────────────────────────────
    total = sum(score_acc.values())
    print(f"\n{'=' * 60}")
    print(f"  Simulation complete.")
    print(f"  Weeks {WEEK_START}–{WEEK_END}  |  Season total: {total:.1f} pts")
    print('=' * 60)

    if server:
        server.close()
        await server.wait_closed()


if __name__ == '__main__':
    asyncio.run(main())
