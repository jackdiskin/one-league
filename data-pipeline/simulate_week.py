#!/usr/bin/env python3
"""
simulate_week.py
----------------
Synthetic NFL week simulator for end-to-end pipeline testing.

Monkey-patches ESPNClient so the live pipeline consumes fake game data
without hitting the real ESPN API.  Uses real ESPN athlete IDs from the
DB so the finalize-games endpoint can resolve them back to DB player IDs.

Flow:
  • N games start at staggered offsets (default 4 games, 30 s apart)
  • Each game progresses pre → in → post within ~5 minutes total
  • On each poll tick the pipeline sees updated fake boxscore payloads
  • When a game flips in → post the pipeline calls /api/admin/finalize-games
    automatically (requires APP_URL + ADMIN_SECRET in .env)

Usage (from repo root):
    python data-pipeline/simulate_week.py
    python data-pipeline/simulate_week.py --games 3 --duration 240 --week 2
"""

from __future__ import annotations

import argparse
import importlib.util
import math
import os
import random
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Load pipeline module (filename has a hyphen → can't use normal import)
# ---------------------------------------------------------------------------

_PIPELINE_PATH = Path(__file__).parent / "espn_live_pipeline-5.py"
if not _PIPELINE_PATH.exists():
    sys.exit(f"ERROR: pipeline not found at {_PIPELINE_PATH}")

_spec = importlib.util.spec_from_file_location("pipeline", _PIPELINE_PATH)
_pl   = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pl)                               # type: ignore[union-attr]

PipelineConfig      = _pl.PipelineConfig
MySQLWriter         = _pl.MySQLWriter
DeltaTracker        = _pl.DeltaTracker
LiveIngestionPipeline = _pl.LiveIngestionPipeline


# ---------------------------------------------------------------------------
# Simulation data structures
# ---------------------------------------------------------------------------

@dataclass
class SimPlayer:
    espn_id:  str
    name:     str
    team_id:  str
    position: str          # QB | RB | WR | K
    # Pre-generated final stats (reached at game end)
    final:    Dict[str, Any] = field(default_factory=dict)


@dataclass
class FGEvent:
    kicker_name: str
    team_id:     str
    distance:    int        # yards
    progress:    float      # 0.0–1.0, fraction through game when this FG occurs


@dataclass
class SimGame:
    event_id:       str
    season:         int
    week_num:       int
    home_team_id:   str
    home_abbr:      str
    away_team_id:   str
    away_abbr:      str
    players:        List[SimPlayer]
    fg_events:      List[FGEvent]
    start_offset:   float   # seconds from sim_start before game goes "in"
    duration:       float   # seconds game stays "in" before going "post"
    _sim_start:     float   = field(default=0.0, init=False)

    def state(self, now: float) -> str:
        elapsed = now - self._sim_start
        if elapsed < self.start_offset:
            return "pre"
        if elapsed < self.start_offset + self.duration:
            return "in"
        return "post"

    def progress(self, now: float) -> float:
        """Fraction of game played, 0.0 → 1.0."""
        elapsed = now - self._sim_start - self.start_offset
        return max(0.0, min(1.0, elapsed / self.duration))


# ---------------------------------------------------------------------------
# Stat generators
# ---------------------------------------------------------------------------

def _gen_qb_stats() -> Dict[str, Any]:
    yards = random.randint(180, 340)
    tds   = random.randint(1, 3)
    ints  = random.randint(0, 1)
    comps = random.randint(15, 30)
    atts  = comps + random.randint(5, 12)
    return {"yards": yards, "tds": tds, "ints": ints, "comps": comps, "atts": atts}


def _gen_rb_stats() -> Dict[str, Any]:
    yards = random.randint(40, 140)
    tds   = random.randint(0, 1)
    carries = random.randint(10, 22)
    return {"yards": yards, "tds": tds, "carries": carries}


def _gen_wr_stats() -> Dict[str, Any]:
    yards = random.randint(30, 110)
    tds   = random.randint(0, 1)
    recs  = random.randint(3, 9)
    tgts  = recs + random.randint(1, 4)
    return {"yards": yards, "tds": tds, "recs": recs, "tgts": tgts}


def _gen_fg_events(kicker_name: str, team_id: str) -> List[FGEvent]:
    n_fgs = random.randint(1, 3)
    events = []
    used_progress: List[float] = []
    for _ in range(n_fgs):
        # Pick a progress point not too close to another FG
        for _ in range(10):
            p = random.uniform(0.05, 0.95)
            if all(abs(p - u) > 0.12 for u in used_progress):
                break
        used_progress.append(p)
        dist = random.choice([25, 28, 32, 36, 38, 41, 44, 47, 51, 54, 58])
        events.append(FGEvent(kicker_name, team_id, dist, p))
    return sorted(events, key=lambda e: e.progress)


# ---------------------------------------------------------------------------
# ESPN payload builders
# ---------------------------------------------------------------------------

def _status_payload(game: SimGame, now: float) -> Dict[str, Any]:
    state    = game.state(now)
    prog     = game.progress(now)
    period   = min(4, max(1, math.ceil(prog * 4))) if state == "in" else 4
    secs_in_quarter = max(0.0, (prog * 4 - (period - 1)) * 900)
    remaining = int(900 - secs_in_quarter)
    mins, secs = divmod(remaining, 60)

    if state == "pre":
        return {"type": {"id": "1", "name": "STATUS_SCHEDULED", "state": "pre",
                         "completed": False, "description": "Scheduled",
                         "detail": "Scheduled", "shortDetail": "Scheduled"},
                "period": 0, "displayClock": "0:00"}
    if state == "in":
        detail = f"{period}{'st' if period==1 else 'nd' if period==2 else 'rd' if period==3 else 'th'} Qtr {mins}:{secs:02d}"
        return {"type": {"id": "2", "name": "STATUS_IN_PROGRESS", "state": "in",
                         "completed": False, "description": "In Progress",
                         "detail": detail, "shortDetail": detail},
                "period": period, "displayClock": f"{mins}:{secs:02d}"}
    return {"type": {"id": "3", "name": "STATUS_FINAL", "state": "post",
                     "completed": True, "description": "Final",
                     "detail": "Final", "shortDetail": "Final"},
            "period": 4, "displayClock": "0:00"}


def _interp(final_val: float, progress: float) -> float:
    """Linearly interpolate a stat from 0 to final_val by progress."""
    return round(final_val * progress)


def _athlete_entry(player: SimPlayer) -> Dict[str, Any]:
    return {"id": player.espn_id, "displayName": player.name, "jersey": "1"}


def _passing_stats(player: SimPlayer, prog: float) -> List[str]:
    f = player.final
    comps = _interp(f["comps"], prog)
    atts  = _interp(f["atts"],  prog)
    yards = _interp(f["yards"], prog)
    tds   = _interp(f["tds"],   prog)
    ints  = _interp(f["ints"],  prog)
    avg   = round(yards / max(atts, 1), 1)
    return [f"{comps}/{atts}", str(yards), str(avg), str(tds), str(ints)]


def _rushing_stats(player: SimPlayer, prog: float) -> List[str]:
    f = player.final
    carries = _interp(f["carries"], prog)
    yards   = _interp(f["yards"],   prog)
    tds     = _interp(f["tds"],     prog)
    avg     = round(yards / max(carries, 1), 1)
    return [str(carries), str(yards), str(avg), str(tds), "0"]


def _receiving_stats(player: SimPlayer, prog: float) -> List[str]:
    f = player.final
    recs  = _interp(f["recs"],  prog)
    yards = _interp(f["yards"], prog)
    tds   = _interp(f["tds"],   prog)
    tgts  = _interp(f["tgts"],  prog)
    avg   = round(yards / max(recs, 1), 1)
    return [str(recs), str(yards), str(avg), str(tds), "0", str(tgts)]


def _kicking_stats(fg_events: List[FGEvent], team_id: str, prog: float) -> List[str]:
    """Kicking stats for a kicker based on FG events that have occurred so far."""
    occurred = [e for e in fg_events if e.team_id == team_id and e.progress <= prog]
    made = len(occurred)
    # XPs roughly match TDs scored by teammates (approx based on game progress)
    xp_made = max(0, random.randint(0, 2) if prog < 0.3 else made)
    xp_att  = xp_made
    long_fg = max((e.distance for e in occurred), default=0)
    pct     = "100.0" if made else "0.0"
    return [f"{made}/{made}", pct, str(long_fg), f"{xp_made}/{xp_att}", str(made * 3 + xp_made)]


def _team_boxscore_block(
    team_id: str, team_abbr: str, team_players: List[SimPlayer],
    fg_events: List[FGEvent], prog: float
) -> Dict[str, Any]:
    statistics = []

    qb_players = [p for p in team_players if p.position == "QB"]
    rb_players = [p for p in team_players if p.position == "RB"]
    wr_players = [p for p in team_players if p.position == "WR"]
    k_players  = [p for p in team_players if p.position == "K"]

    if qb_players:
        statistics.append({
            "name": "passing",
            "keys": ["completions/passingAttempts", "passingYards", "avgGain",
                     "passingTouchdowns", "interceptions"],
            "athletes": [
                {"athlete": _athlete_entry(p), "stats": _passing_stats(p, prog)}
                for p in qb_players
            ],
        })

    rushing_athletes = []
    for p in rb_players + qb_players:
        if p.position == "RB":
            rushing_athletes.append(
                {"athlete": _athlete_entry(p), "stats": _rushing_stats(p, prog)}
            )
        elif p.position == "QB":
            # QBs scramble a little
            carry = _interp(3, prog)
            yds   = _interp(12, prog)
            rushing_athletes.append(
                {"athlete": _athlete_entry(p),
                 "stats": [str(carry), str(yds), "4.0", "0", "0"]}
            )
    if rushing_athletes:
        statistics.append({
            "name": "rushing",
            "keys": ["rushingAttempts", "rushingYards", "avgRushingYards",
                     "rushingTouchdowns", "longRushing"],
            "athletes": rushing_athletes,
        })

    if wr_players:
        statistics.append({
            "name": "receiving",
            "keys": ["receptions", "receivingYards", "avgPerReception",
                     "receivingTouchdowns", "longReception", "receivingTargets"],
            "athletes": [
                {"athlete": _athlete_entry(p), "stats": _receiving_stats(p, prog)}
                for p in wr_players
            ],
        })

    for p in k_players:
        fg_occurred = [e for e in fg_events if e.team_id == team_id and e.progress <= prog]
        if fg_occurred:
            statistics.append({
                "name": "kicking",
                "keys": ["fieldGoalsMade/fieldGoalAttempts", "fieldGoalPct",
                         "longFieldGoalMade", "extraPointsMade/extraPointAttempts",
                         "totalKickingPoints"],
                "athletes": [
                    {"athlete": _athlete_entry(p),
                     "stats": _kicking_stats(fg_events, team_id, prog)}
                ],
            })

    return {
        "team": {"id": team_id, "abbreviation": team_abbr},
        "statistics": statistics,
    }


def _scoring_plays(game: SimGame, prog: float) -> List[Dict[str, Any]]:
    plays = []
    home_score = away_score = 0
    for ev in sorted(game.fg_events, key=lambda e: e.progress):
        if ev.progress > prog:
            break
        if ev.team_id == game.home_team_id:
            home_score += 3
        else:
            away_score += 3
        plays.append({
            "id": f"fg_{game.event_id}_{len(plays)}",
            "type": {"id": "59", "text": "Field Goal Good", "abbreviation": "FG"},
            "text": f"{ev.kicker_name} {ev.distance} Yd Field Goal",
            "awayScore": away_score,
            "homeScore": home_score,
            "period": {"number": min(4, max(1, int(ev.progress * 4) + 1))},
            "clock": {"value": 600.0, "displayValue": "10:00"},
            "team": {"id": ev.team_id},
        })
    return plays


def _build_scoreboard(games: List[SimGame], now: float) -> Dict[str, Any]:
    events = []
    for g in games:
        state = g.state(now)
        events.append({
            "id": g.event_id,
            "status": {"type": {"state": state}},
        })
    return {"events": events}


def _build_summary(game: SimGame, now: float) -> Dict[str, Any]:
    prog   = game.progress(now)
    state  = game.state(now)
    status = _status_payload(game, now)

    home_players = [p for p in game.players if p.team_id == game.home_team_id]
    away_players = [p for p in game.players if p.team_id == game.away_team_id]

    return {
        "header": {
            "id": game.event_id,
            "season": {"year": game.season, "current": True, "type": 2},
            "week": game.week_num,
            "competitions": [{
                "id": game.event_id,
                "status": status,
                "competitors": [
                    {"id": game.home_team_id, "homeAway": "home",
                     "team": {"id": game.home_team_id, "abbreviation": game.home_abbr},
                     "score": str(sum(3 for e in game.fg_events
                                     if e.team_id == game.home_team_id and e.progress <= prog))},
                    {"id": game.away_team_id, "homeAway": "away",
                     "team": {"id": game.away_team_id, "abbreviation": game.away_abbr},
                     "score": str(sum(3 for e in game.fg_events
                                     if e.team_id == game.away_team_id and e.progress <= prog))},
                ],
            }],
        },
        "boxscore": {
            "players": [
                _team_boxscore_block(
                    game.home_team_id, game.home_abbr, home_players,
                    game.fg_events, prog
                ),
                _team_boxscore_block(
                    game.away_team_id, game.away_abbr, away_players,
                    game.fg_events, prog
                ),
            ],
        },
        "scoringPlays": _scoring_plays(game, prog) if state in ("in", "post") else [],
        "drives": {},
        "leaders": [],
        "gameInfo": {},
    }


# ---------------------------------------------------------------------------
# DB player fetch — grouped by real team
# ---------------------------------------------------------------------------

def fetch_players_by_team(config: PipelineConfig) -> Dict[str, Dict[str, List[Dict]]]:
    """
    Returns {team_code: {position: [player, ...]}} for all players that have
    an ESPN athlete ID.  Only the four positions the simulator uses are kept.
    """
    import mysql.connector
    conn = mysql.connector.connect(
        host=config.mysql_host, port=config.mysql_port,
        user=config.mysql_user, password=config.mysql_password,
        database=config.mysql_database,
    )
    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT full_name, position, espn_athlete_id, team_code
        FROM players
        WHERE espn_athlete_id IS NOT NULL
          AND espn_athlete_id != ''
          AND team_code IS NOT NULL
          AND position IN ('QB', 'RB', 'WR', 'K')
        ORDER BY team_code, position
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    teams: Dict[str, Dict[str, List[Dict]]] = {}
    for p in rows:
        tc  = p["team_code"]
        pos = p["position"]
        teams.setdefault(tc, {"QB": [], "RB": [], "WR": [], "K": []})
        teams[tc][pos].append(p)
    return teams


# ---------------------------------------------------------------------------
# Game builder — real teams, real players
# ---------------------------------------------------------------------------

def build_games(
    teams_by_code: Dict[str, Dict[str, List[Dict]]],
    max_games: int,
    season: int,
    week_num: int,
    total_duration: float,
) -> List[SimGame]:
    # Shuffle teams and pair them into matchups
    team_codes = list(teams_by_code.keys())
    random.shuffle(team_codes)
    # Drop last team if odd count so every team has an opponent
    if len(team_codes) % 2 == 1:
        team_codes = team_codes[:-1]

    # Each pair = one game; cap at max_games
    pairs = [(team_codes[i], team_codes[i + 1]) for i in range(0, len(team_codes), 2)]
    pairs = pairs[:max_games]
    num_games = len(pairs)

    game_duration = (total_duration * 0.80) / num_games
    stagger       = (total_duration * 0.30) / max(num_games - 1, 1)

    games: List[SimGame] = []
    for i, (home_code, away_code) in enumerate(pairs):
        # team_code doubles as both team_id and abbreviation in our fake payloads
        home_team_id = home_code
        away_team_id = away_code

        players: List[SimPlayer] = []
        for team_id, team_code in ((home_team_id, home_code), (away_team_id, away_code)):
            roster = teams_by_code[team_code]
            for pos in ("QB", "RB", "WR", "K"):
                pos_players = roster.get(pos, [])
                if pos_players:
                    raw = pos_players[0]   # take the first (roster already ordered)
                    espn_id = str(raw["espn_athlete_id"])
                    name    = str(raw["full_name"])
                else:
                    # Team has no player at this position with an ESPN ID — use placeholder
                    espn_id = f"SIM_{team_code}_{pos}"
                    name    = f"{team_code} {pos}"

                if pos == "QB":
                    final = _gen_qb_stats()
                elif pos == "RB":
                    final = _gen_rb_stats()
                elif pos == "WR":
                    final = _gen_wr_stats()
                else:
                    final = {}  # kicker stats driven by fg_events

                players.append(SimPlayer(
                    espn_id=espn_id, name=name,
                    team_id=team_id, position=pos, final=final,
                ))

        # FG events keyed to real team IDs
        fg_events: List[FGEvent] = []
        for team_id in (home_team_id, away_team_id):
            kicker = next(p for p in players if p.team_id == team_id and p.position == "K")
            fg_events.extend(_gen_fg_events(kicker.name, team_id))

        event_id     = f"SIM{season}{week_num:02d}{i+1:02d}"
        start_offset = i * stagger
        games.append(SimGame(
            event_id=event_id,
            season=season,
            week_num=week_num,
            home_team_id=home_team_id,
            home_abbr=home_code,
            away_team_id=away_team_id,
            away_abbr=away_code,
            players=players,
            fg_events=fg_events,
            start_offset=start_offset,
            duration=game_duration,
        ))

    return games


# ---------------------------------------------------------------------------
# Simulator — patches ESPNClient and runs the pipeline
# ---------------------------------------------------------------------------

class Simulator:
    def __init__(self, games: List[SimGame]) -> None:
        self.games     = games
        self._start    = time.time()
        self._lock     = threading.Lock()
        for g in games:
            g._sim_start = self._start

    def get_scoreboard(self, dates: Optional[str] = None) -> Dict[str, Any]:
        return _build_scoreboard(self.games, time.time())

    def get_summary(self, event_id: str) -> Dict[str, Any]:
        game = next((g for g in self.games if g.event_id == event_id), None)
        if game is None:
            return {"header": {}, "boxscore": {"players": []}, "scoringPlays": []}
        return _build_summary(game, time.time())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate an NFL week through the live pipeline")
    parser.add_argument("--games",    type=int,   default=16,   help="Max games to simulate (default 16 — one full NFL week)")
    parser.add_argument("--duration", type=float, default=300,  help="Total sim duration in seconds (default 300)")
    parser.add_argument("--week",     type=int,   default=1,    help="Week number to write (default 1)")
    parser.add_argument("--season",   type=int,   default=2026, help="Season year (default 2026)")
    args = parser.parse_args()

    config = PipelineConfig(
        poll_seconds=15,
        app_url=os.getenv("APP_URL", ""),
        admin_secret=os.getenv("ADMIN_SECRET", ""),
    )

    print("[sim] Fetching players from DB grouped by team ...")
    try:
        teams_by_code = fetch_players_by_team(config)
    except Exception as exc:
        sys.exit(f"ERROR: could not connect to DB: {exc}")

    print(f"[sim] Found {len(teams_by_code)} teams with ESPN-linked players")
    if len(teams_by_code) < 2:
        sys.exit("ERROR: need at least 2 teams in DB to simulate a game")

    games = build_games(teams_by_code, args.games, args.season, args.week, args.duration)

    print(f"[sim] Built {len(games)} games for season={args.season} week={args.week}")
    for g in games:
        print(f"  {g.event_id}  {g.home_abbr} vs {g.away_abbr}  "
              f"starts in {g.start_offset:.0f}s  lasts {g.duration:.0f}s")

    sim = Simulator(games)

    # Monkey-patch ESPNClient on the loaded pipeline module
    _pl.ESPNClient.get_scoreboard = lambda self, dates=None: sim.get_scoreboard(dates)
    _pl.ESPNClient.get_summary    = lambda self, event_id:   sim.get_summary(event_id)

    writer        = MySQLWriter(config)
    writer.ensure_tables()
    delta_tracker = DeltaTracker()
    pipeline      = LiveIngestionPipeline(
        config,
        writer=writer,
        delta_tracker=delta_tracker,
    )

    print(f"\n[sim] Starting simulation — will run for {args.duration:.0f}s")
    print(f"[sim] Finalize hook: APP_URL={config.app_url or '(not set — finalize calls disabled)'}")
    print()

    poll_thread = threading.Thread(target=pipeline.run_forever, daemon=True)
    poll_thread.start()

    # Progress display
    try:
        deadline = time.time() + args.duration
        while time.time() < deadline:
            now      = time.time()
            elapsed  = now - sim._start
            statuses = "  ".join(
                f"{g.event_id}={g.state(now)}"
                for g in games
            )
            remaining = max(0, deadline - now)
            print(f"\r[sim] t={elapsed:5.0f}s  remaining={remaining:.0f}s  | {statuses}", end="", flush=True)
            time.sleep(5)
    except KeyboardInterrupt:
        print("\n[sim] Interrupted by user")

    print(f"\n[sim] Done. Check player_weekly_scores and fantasy_team_weekly_scores in the DB.")
    writer.close()


if __name__ == "__main__":
    main()
