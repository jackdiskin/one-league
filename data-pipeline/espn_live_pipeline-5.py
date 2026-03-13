"""
ESPN Live Pipeline v5
---------------------
Enhancements over v4:
  - Kicker stats: FG by distance tier (0-39 / 40-49 / 50+), missed FGs, XP made/missed
  - 2-point conversion tracking (best-effort name attribution from scoring plays)
  - In-memory delta tracking: only compute/emit changes between polls
  - Async WebSocket server: clients subscribe to player IDs and receive live stat deltas

WebSocket protocol (default port 8765):
  Client → Server:
    {"subscribe":   [playerId1, playerId2, ...]}
    {"unsubscribe": [playerId1, playerId2, ...]}

  Server → Client (on stat change):
    {
      "playerId":  "123",
      "name":      "Christian McCaffrey",
      "eventId":   "401547405",
      "teamAbbr":  "SF",
      "delta":  {"rushingYards": 11.0, "fantasyPointsTotal": 1.1},
      "totals": {"rushingYards": 152.0, ..., "fantasyPointsTotal": 18.2}
    }
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv

load_dotenv()

try:
    import mysql.connector as mysql_connector
except Exception:
    mysql_connector = None

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except Exception:
    websockets = None
    WebSocketServerProtocol = Any  # type: ignore


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
SUMMARY_URL    = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary"

DEFAULT_POLL_SECONDS = 15
DEFAULT_WS_HOST      = "0.0.0.0"
DEFAULT_WS_PORT      = 8765

# Camel-case names used in WebSocket messages for each stat field
STAT_FIELDS: List[Tuple[str, str]] = [
    ("passing_yards",       "passingYards"),
    ("passing_tds",         "passingTds"),
    ("interceptions",       "interceptions"),
    ("rushing_yards",       "rushingYards"),
    ("rushing_tds",         "rushingTds"),
    ("receptions",          "receptions"),
    ("receiving_yards",     "receivingYards"),
    ("receiving_tds",       "receivingTds"),
    ("fumbles_lost",        "fumblesLost"),
    ("fg_0_39",             "fg0_39"),
    ("fg_40_49",            "fg40_49"),
    ("fg_50_plus",          "fg50Plus"),
    ("fg_missed",           "fgMissed"),
    ("xp_made",             "xpMade"),
    ("xp_missed",           "xpMissed"),
    ("two_pt_conversions",  "twoPtConversions"),
    ("fantasy_points_total","fantasyPointsTotal"),
]

SNAKE_FIELDS = [s for s, _ in STAT_FIELDS]
CAMEL_FIELDS = [c for _, c in STAT_FIELDS]

ZERO_STATS: Dict[str, float] = {s: 0.0 for s in SNAKE_FIELDS}


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class PipelineConfig:
    mysql_host:     str   = os.getenv("MYSQL_HOST",     "127.0.0.1")
    mysql_port:     int   = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user:     str   = os.getenv("MYSQL_USER",     "root")
    mysql_password: str   = os.getenv("MYSQL_PASSWORD", "")
    mysql_database: str   = os.getenv("MYSQL_DATABASE", "one_league")
    poll_seconds:   int   = int(os.getenv("POLL_SECONDS",    str(DEFAULT_POLL_SECONDS)))
    request_timeout:int   = int(os.getenv("REQUEST_TIMEOUT", "15"))
    ws_host:        str   = os.getenv("WS_HOST", DEFAULT_WS_HOST)
    ws_port:        int   = int(os.getenv("WS_PORT", str(DEFAULT_WS_PORT)))
    # Scoring coefficients
    pts_pass_yd:    float = float(os.getenv("PTS_PASS_YD",     "0.04"))
    pts_pass_td:    float = float(os.getenv("PTS_PASS_TD",     "4"))
    pts_int:        float = float(os.getenv("PTS_INT",         "-2"))
    pts_rush_yd:    float = float(os.getenv("PTS_RUSH_YD",     "0.1"))
    pts_rush_td:    float = float(os.getenv("PTS_RUSH_TD",     "6"))
    pts_rec:        float = float(os.getenv("PTS_REC",         "1"))
    pts_rec_yd:     float = float(os.getenv("PTS_REC_YD",      "0.1"))
    pts_rec_td:     float = float(os.getenv("PTS_REC_TD",      "6"))
    pts_fumble_lost:float = float(os.getenv("PTS_FUMBLE_LOST", "-2"))
    pts_fg_0_39:    float = float(os.getenv("PTS_FG_0_39",     "3"))
    pts_fg_40_49:   float = float(os.getenv("PTS_FG_40_49",    "4"))
    pts_fg_50_plus: float = float(os.getenv("PTS_FG_50_PLUS",  "5"))
    pts_fg_missed:  float = float(os.getenv("PTS_FG_MISSED",   "-1"))
    pts_xp_made:    float = float(os.getenv("PTS_XP_MADE",     "1"))
    pts_xp_missed:  float = float(os.getenv("PTS_XP_MISSED",   "0"))
    pts_two_pt:     float = float(os.getenv("PTS_TWO_PT",      "2"))


# ---------------------------------------------------------------------------
# ESPN HTTP client
# ---------------------------------------------------------------------------

class ESPNClient:
    def __init__(self, config: PipelineConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "one-league-live-pipeline/5.0"})

    def get_scoreboard(self, dates: Optional[str] = None) -> Dict[str, Any]:
        params = {"dates": dates} if dates else None
        r = self.session.get(SCOREBOARD_URL, params=params, timeout=self.config.request_timeout)
        r.raise_for_status()
        return r.json()

    def get_summary(self, event_id: str) -> Dict[str, Any]:
        r = self.session.get(SUMMARY_URL, params={"event": event_id}, timeout=self.config.request_timeout)
        r.raise_for_status()
        return r.json()


# ---------------------------------------------------------------------------
# Fantasy scorer
# ---------------------------------------------------------------------------

class FantasyScorer:
    def __init__(self, config: PipelineConfig):
        self.config = config

    def score_player_row(self, row: Dict[str, Any]) -> float:
        c = self.config
        total = 0.0
        total += float(row.get("passing_yards",      0.0)) * c.pts_pass_yd
        total += float(row.get("passing_tds",        0.0)) * c.pts_pass_td
        total += float(row.get("interceptions",      0.0)) * c.pts_int
        total += float(row.get("rushing_yards",      0.0)) * c.pts_rush_yd
        total += float(row.get("rushing_tds",        0.0)) * c.pts_rush_td
        total += float(row.get("receptions",         0.0)) * c.pts_rec
        total += float(row.get("receiving_yards",    0.0)) * c.pts_rec_yd
        total += float(row.get("receiving_tds",      0.0)) * c.pts_rec_td
        total += float(row.get("fumbles_lost",       0.0)) * c.pts_fumble_lost
        total += float(row.get("fg_0_39",            0.0)) * c.pts_fg_0_39
        total += float(row.get("fg_40_49",           0.0)) * c.pts_fg_40_49
        total += float(row.get("fg_50_plus",         0.0)) * c.pts_fg_50_plus
        total += float(row.get("fg_missed",          0.0)) * c.pts_fg_missed
        total += float(row.get("xp_made",            0.0)) * c.pts_xp_made
        total += float(row.get("xp_missed",          0.0)) * c.pts_xp_missed
        total += float(row.get("two_pt_conversions", 0.0)) * c.pts_two_pt
        return round(total, 4)


# ---------------------------------------------------------------------------
# Summary parser
# ---------------------------------------------------------------------------

class SummaryParser:
    """
    Parses ESPN game summary JSON into game-level and player-level rows.

    Boxscore categories handled:
      passing / rushing / receiving / fumbles  — per v4
      kicking                                  — NEW: FG counts, XP counts

    Scoring plays parsed for:
      FG distances → FG tier buckets per kicker (by team)
      2PT conversions → best-effort attribution by player name
    """

    # Standard stat categories (key → normalized ESPN field → our DB column)
    _CATEGORY_MAP: Dict[str, Dict[str, str]] = {
        "passing": {
            "passingyards":      "passing_yards",
            "passingtouchdowns": "passing_tds",
            "interceptions":     "interceptions",
        },
        "rushing": {
            "rushingyards":      "rushing_yards",
            "rushingtouchdowns": "rushing_tds",
        },
        "receiving": {
            "receptions":          "receptions",
            "receivingyards":      "receiving_yards",
            "receivingtouchdowns": "receiving_tds",
        },
        "fumbles": {
            "fumbleslost": "fumbles_lost",
        },
    }

    # ------------------------------------------------------------------ #
    # Game row                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    def parse_game_row(summary_json: Dict[str, Any], snapshot_ts: datetime) -> Dict[str, Any]:
        header      = summary_json.get("header", {})
        competition = (header.get("competitions") or [{}])[0]
        competitors = competition.get("competitors") or []
        home        = next((c for c in competitors if c.get("homeAway") == "home"), {})
        away        = next((c for c in competitors if c.get("homeAway") == "away"), {})
        status      = competition.get("status", {})
        status_type = status.get("type", {})
        possession  = next((c for c in competitors if c.get("possession") is True), {})

        return {
            "event_id":            str(header.get("id") or ""),
            "snapshot_ts":         snapshot_ts,
            "season":              _safe_int((header.get("season") or {}).get("year")),
            "week_num":            _safe_int(header.get("week")),
            "game_status":         status_type.get("description") or status_type.get("detail"),
            "game_state":          status_type.get("state"),
            "game_clock":          status_type.get("shortDetail") or status.get("displayClock"),
            "period_num":          _safe_int(status.get("period")),
            "home_team_id":        _str_or_none((home.get("team") or {}).get("id") or home.get("id")),
            "away_team_id":        _str_or_none((away.get("team") or {}).get("id") or away.get("id")),
            "home_team_abbr":      (home.get("team") or {}).get("abbreviation"),
            "away_team_abbr":      (away.get("team") or {}).get("abbreviation"),
            "home_score":          _safe_int(home.get("score")),
            "away_score":          _safe_int(away.get("score")),
            "possession_team_id":  _str_or_none((possession.get("team") or {}).get("id") or possession.get("id")),
        }

    # ------------------------------------------------------------------ #
    # Player rows                                                         #
    # ------------------------------------------------------------------ #

    @staticmethod
    def parse_player_rows(
        summary_json: Dict[str, Any],
        snapshot_ts: datetime,
        scorer: FantasyScorer,
    ) -> List[Dict[str, Any]]:
        event_id = str((summary_json.get("header") or {}).get("id") or "")
        rows: List[Dict[str, Any]] = []

        # --- Build per-player stat dicts from boxscore ---
        for team_block in summary_json.get("boxscore", {}).get("players", []):
            team      = team_block.get("team", {})
            team_id   = str(team.get("id", ""))
            team_abbr = team.get("abbreviation")

            by_player: Dict[str, Dict[str, Any]] = {}

            for category in team_block.get("statistics", []):
                cat_name = str(category.get("name", "")).lower()
                raw_keys = category.get("keys") or []
                norm_keys = [_normalize_key(k) for k in raw_keys]

                if cat_name in SummaryParser._CATEGORY_MAP:
                    # Standard passing / rushing / receiving / fumbles
                    field_map = SummaryParser._CATEGORY_MAP[cat_name]
                    for athlete_row in (category.get("athletes") or []):
                        athlete   = athlete_row.get("athlete", {})
                        player_id = str(athlete.get("id", ""))
                        if not player_id:
                            continue
                        row = by_player.setdefault(player_id, _empty_player_row(
                            event_id, snapshot_ts, team_id, team_abbr, athlete
                        ))
                        stats = athlete_row.get("stats") or []
                        for idx, raw_value in enumerate(stats):
                            if idx >= len(norm_keys):
                                break
                            dest = field_map.get(norm_keys[idx])
                            if dest:
                                parsed = _safe_float(raw_value)
                                if parsed is not None:
                                    row[dest] = parsed

                elif cat_name == "kicking":
                    # Special handling: keys contain slashes (e.g. "fieldGoalsMade/fieldGoalAttempts")
                    for athlete_row in (category.get("athletes") or []):
                        athlete   = athlete_row.get("athlete", {})
                        player_id = str(athlete.get("id", ""))
                        if not player_id:
                            continue
                        row = by_player.setdefault(player_id, _empty_player_row(
                            event_id, snapshot_ts, team_id, team_abbr, athlete
                        ))
                        stats = athlete_row.get("stats") or []
                        SummaryParser._apply_kicking_stats(row, raw_keys, stats)

            # Attach to list (kicker FG tiers applied below after scoring plays)
            for row in by_player.values():
                rows.append(row)

        if not rows:
            return rows

        # --- Augment kicker rows with per-FG distance tiers from scoring plays ---
        scoring_plays = summary_json.get("scoringPlays") or []
        fg_tiers_by_team  = SummaryParser._parse_fg_tiers(scoring_plays)
        two_pt_by_name    = SummaryParser._parse_two_pt_conversions(scoring_plays)

        # Build a lookup: player_id → row (for name-based 2PT attribution)
        player_by_id: Dict[str, Dict[str, Any]] = {r["player_id"]: r for r in rows}
        # Also build last-name → player_id for 2PT attribution
        lastname_to_id: Dict[str, str] = {}
        for r in rows:
            name = r.get("player_name", "")
            parts = name.split()
            if parts:
                lastname_to_id[parts[-1].lower()] = r["player_id"]

        # Apply FG tiers: assign distances to kickers by team_id
        # Assumption: one active kicker per team per game (usually true)
        for row in rows:
            team_id = row["team_id"]
            # Only apply if this row already has kicking fields set (fg_attempted > 0 or xp_made > 0)
            if float(row.get("fg_attempted", 0) or 0) > 0 or float(row.get("xp_made", 0) or 0) > 0:
                distances = fg_tiers_by_team.get(team_id, [])
                fg_0_39  = sum(1 for d in distances if d < 40)
                fg_40_49 = sum(1 for d in distances if 40 <= d < 50)
                fg_50    = sum(1 for d in distances if d >= 50)
                row["fg_0_39"]   = float(fg_0_39)
                row["fg_40_49"]  = float(fg_40_49)
                row["fg_50_plus"]= float(fg_50)
                # missed = attempted - made (made = sum of all tiers)
                fg_made = fg_0_39 + fg_40_49 + fg_50
                fg_att  = int(float(row.get("fg_attempted", fg_made) or fg_made))
                row["fg_missed"] = float(max(fg_att - fg_made, 0))

        # Apply 2PT conversions by player name
        for name_lower, count in two_pt_by_name.items():
            pid = lastname_to_id.get(name_lower)
            if pid and pid in player_by_id:
                player_by_id[pid]["two_pt_conversions"] = float(count)

        # Compute fantasy points for all rows
        for row in rows:
            row["fantasy_points_total"] = scorer.score_player_row(row)

        # Remove internal-only fields not in DB schema
        for row in rows:
            row.pop("fg_attempted", None)

        return rows

    # ------------------------------------------------------------------ #
    # Kicking helper                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _apply_kicking_stats(row: Dict[str, Any], raw_keys: List[str], stats: List[Any]) -> None:
        """
        Parse kicking stats positionally. ESPN kicking keys:
          0: fieldGoalsMade/fieldGoalAttempts  (e.g. "3/3")
          1: fieldGoalPct
          2: longFieldGoalMade
          3: extraPointsMade/extraPointAttempts (e.g. "3/3")
          4: totalKickingPoints
        """
        for idx, raw in enumerate(stats):
            if idx >= len(raw_keys):
                break
            norm = _normalize_key(raw_keys[idx])
            if "fieldgoalsmade" in norm:
                made, attempted = _parse_fraction(str(raw))
                # Store fg_attempted temporarily (removed before DB insert)
                row["fg_attempted"] = float(attempted)
                # Tiers populated later from scoring plays; initialise to 0 for now
                row.setdefault("fg_0_39",    0.0)
                row.setdefault("fg_40_49",   0.0)
                row.setdefault("fg_50_plus", 0.0)
                row.setdefault("fg_missed",  0.0)
            elif "extrapointsmade" in norm:
                made, attempted = _parse_fraction(str(raw))
                row["xp_made"]   = float(made)
                row["xp_missed"] = float(max(attempted - made, 0))

    # ------------------------------------------------------------------ #
    # Scoring-plays helpers                                               #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _parse_fg_tiers(scoring_plays: List[Dict[str, Any]]) -> Dict[str, List[int]]:
        """
        Returns {team_id: [distance, ...]} for all made field goals in scoring plays.
        Distances are parsed from play text e.g. "Jake Moody 41 Yd Field Goal".
        """
        result: Dict[str, List[int]] = {}
        for play in scoring_plays:
            ptype_text = (play.get("type") or {}).get("text", "").lower()
            if "field goal" not in ptype_text:
                continue
            # scoringPlays only list scoring events, so every "Field Goal" entry is a made FG
            team_id = str((play.get("team") or {}).get("id") or "")
            if not team_id:
                continue
            text  = play.get("text", "")
            match = re.search(r"(\d+)\s*[Yy]d\s+[Ff]ield", text)
            if not match:
                match = re.search(r"(\d+)\s*yard\s+field", text, re.IGNORECASE)
            if match:
                distance = int(match.group(1))
                result.setdefault(team_id, []).append(distance)
        return result

    @staticmethod
    def _parse_two_pt_conversions(scoring_plays: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        Returns {last_name_lower: count} for 2-point conversions detected in scoring plays.

        ESPN may represent 2PT events as:
          - A distinct scoring play with type text containing "Two-Point"
          - Implicit: a TD scoring play where the score increased by 8 (TD + 2PT) vs 7 (TD + XP)
        We handle both. Player attribution is best-effort via last name extracted from play text.
        """
        counts: Dict[str, int] = {}

        # Pass 1: explicit Two-Point type entries
        for play in scoring_plays:
            ptype_text = (play.get("type") or {}).get("text", "").lower()
            if "two-point" not in ptype_text and "two point" not in ptype_text:
                continue
            name = _extract_player_name_from_play_text(play.get("text", ""), ptype_text)
            if name:
                counts[name] = counts.get(name, 0) + 1

        # Pass 2: implicit 2PT detection via score delta
        # Sort plays by sequence/period/clock to compute score deltas
        sorted_plays = sorted(
            scoring_plays,
            key=lambda p: (
                (p.get("period") or {}).get("number", 0),
                -(p.get("clock") or {}).get("value", 0),  # descending clock = ascending game time
            )
        )
        prev_home = prev_away = 0
        for play in sorted_plays:
            home_score = _safe_int(play.get("homeScore")) or 0
            away_score = _safe_int(play.get("awayScore")) or 0
            dh = home_score - prev_home
            da = away_score - prev_away
            delta = dh + da  # points added this play
            ptype_text = (play.get("type") or {}).get("text", "").lower()
            # 2PT conversion makes a TD worth 8 (6 TD + 2 conversion, no PAT)
            if delta == 8 and "field goal" not in ptype_text:
                name = _extract_player_name_from_play_text(play.get("text", ""), ptype_text)
                if name:
                    counts[name] = counts.get(name, 0) + 1
            prev_home = home_score
            prev_away = away_score

        return counts


# ---------------------------------------------------------------------------
# Delta tracker
# ---------------------------------------------------------------------------

class DeltaTracker:
    """
    Tracks the last-seen stats for each (event_id, player_id) pair.
    Call compute_and_update() each poll cycle; it returns WebSocket-ready
    delta messages for players whose stats changed.
    """

    def __init__(self) -> None:
        self._state: Dict[Tuple[str, str], Dict[str, float]] = {}

    def compute_and_update(self, player_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        For each player row, compare with previous state.
        Returns a list of delta messages (camelCase keys) for changed players.
        First appearance of a player is stored silently (no delta emitted).
        """
        delta_messages: List[Dict[str, Any]] = []

        for row in player_rows:
            key = (str(row.get("event_id", "")), str(row.get("player_id", "")))
            new_stats = {s: float(row.get(s, 0.0) or 0.0) for s in SNAKE_FIELDS}
            prev_stats = self._state.get(key)

            if prev_stats is None:
                # First sighting — store and move on
                self._state[key] = new_stats
                continue

            changed_snake: Dict[str, float] = {}
            for snake in SNAKE_FIELDS:
                diff = new_stats[snake] - prev_stats[snake]
                if abs(diff) > 1e-9:
                    changed_snake[snake] = diff

            if changed_snake:
                self._state[key] = new_stats
                # Convert to camelCase for WebSocket payload
                delta_camel  = {_to_camel(k): v for k, v in changed_snake.items()}
                totals_camel = {_to_camel(s): new_stats[s] for s in SNAKE_FIELDS}
                delta_messages.append({
                    "playerId":  str(row.get("player_id", "")),
                    "name":      row.get("player_name", ""),
                    "eventId":   str(row.get("event_id", "")),
                    "teamAbbr":  row.get("team_abbr", ""),
                    "delta":     delta_camel,
                    "totals":    totals_camel,
                })

        return delta_messages


# ---------------------------------------------------------------------------
# WebSocket server
# ---------------------------------------------------------------------------

class WebSocketServer:
    """
    Asyncio WebSocket server.  Runs in the main event loop.

    Clients send:
      {"subscribe":   [playerId, ...]}
      {"unsubscribe": [playerId, ...]}

    The pipeline polling thread calls broadcast_delta() via
    asyncio.run_coroutine_threadsafe() whenever stats change.
    """

    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        # player_id → set of connected WebSocket objects
        self._subs: Dict[str, Set[Any]] = {}
        self._conns: Set[Any] = set()

    async def handler(self, ws: Any) -> None:
        self._conns.add(ws)
        subscribed: Set[str] = set()
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if "subscribe" in msg:
                    for pid in (msg["subscribe"] or []):
                        pid = str(pid)
                        subscribed.add(pid)
                        self._subs.setdefault(pid, set()).add(ws)
                if "unsubscribe" in msg:
                    for pid in (msg["unsubscribe"] or []):
                        pid = str(pid)
                        subscribed.discard(pid)
                        if pid in self._subs:
                            self._subs[pid].discard(ws)
        except Exception:
            pass
        finally:
            self._conns.discard(ws)
            for pid in subscribed:
                if pid in self._subs:
                    self._subs[pid].discard(ws)

    async def broadcast_delta(self, delta_msg: Dict[str, Any]) -> None:
        """Send a single delta message to all clients subscribed to that player."""
        pid    = str(delta_msg.get("playerId", ""))
        targets = set(self._subs.get(pid, set()))  # copy to avoid mutation during iteration
        if not targets:
            return
        payload = json.dumps(delta_msg)
        results = await asyncio.gather(*(t.send(payload) for t in targets), return_exceptions=True)
        # Clean up dead connections
        for t, res in zip(targets, results):
            if isinstance(res, Exception):
                self._conns.discard(t)
                if pid in self._subs:
                    self._subs[pid].discard(t)

    async def serve(self) -> None:
        if websockets is None:
            raise RuntimeError("Install the 'websockets' package to run the WebSocket server.")
        print(f"[ws] listening on ws://{self.host}:{self.port}")
        async with websockets.serve(self.handler, self.host, self.port):
            await asyncio.Future()  # run forever


# ---------------------------------------------------------------------------
# MySQL writer
# ---------------------------------------------------------------------------

class MySQLWriter:
    def __init__(self, config: PipelineConfig) -> None:
        if mysql_connector is None:
            raise RuntimeError("Install mysql-connector-python to use DB writes.")
        self.config = config
        self.conn   = mysql_connector.connect(
            host=config.mysql_host,
            port=config.mysql_port,
            user=config.mysql_user,
            password=config.mysql_password,
            database=config.mysql_database,
        )
        self.conn.autocommit = False

    def close(self) -> None:
        self.conn.close()

    def ensure_tables(self) -> None:
        cur = self.conn.cursor()
        try:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS live_game_states (
                    event_id             VARCHAR(32)  NOT NULL PRIMARY KEY,
                    snapshot_ts          DATETIME(6)  NOT NULL,
                    season               INT          NULL,
                    week_num             INT          NULL,
                    game_status          VARCHAR(64)  NULL,
                    game_state           VARCHAR(32)  NULL,
                    game_clock           VARCHAR(32)  NULL,
                    period_num           INT          NULL,
                    home_team_id         VARCHAR(32)  NULL,
                    away_team_id         VARCHAR(32)  NULL,
                    home_team_abbr       VARCHAR(16)  NULL,
                    away_team_abbr       VARCHAR(16)  NULL,
                    home_score           INT          NULL,
                    away_score           INT          NULL,
                    possession_team_id   VARCHAR(32)  NULL,
                    updated_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                         ON UPDATE CURRENT_TIMESTAMP(6)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS live_player_stats (
                    event_id             VARCHAR(32)  NOT NULL,
                    player_id            VARCHAR(32)  NOT NULL,
                    snapshot_ts          DATETIME(6)  NOT NULL,
                    team_id              VARCHAR(32)  NOT NULL,
                    team_abbr            VARCHAR(16)  NULL,
                    player_name          VARCHAR(255) NOT NULL,
                    jersey               VARCHAR(16)  NULL,
                    passing_yards        DOUBLE       NOT NULL DEFAULT 0,
                    passing_tds          DOUBLE       NOT NULL DEFAULT 0,
                    interceptions        DOUBLE       NOT NULL DEFAULT 0,
                    rushing_yards        DOUBLE       NOT NULL DEFAULT 0,
                    rushing_tds          DOUBLE       NOT NULL DEFAULT 0,
                    receptions           DOUBLE       NOT NULL DEFAULT 0,
                    receiving_yards      DOUBLE       NOT NULL DEFAULT 0,
                    receiving_tds        DOUBLE       NOT NULL DEFAULT 0,
                    fumbles_lost         DOUBLE       NOT NULL DEFAULT 0,
                    fg_0_39              DOUBLE       NOT NULL DEFAULT 0,
                    fg_40_49             DOUBLE       NOT NULL DEFAULT 0,
                    fg_50_plus           DOUBLE       NOT NULL DEFAULT 0,
                    fg_missed            DOUBLE       NOT NULL DEFAULT 0,
                    xp_made              DOUBLE       NOT NULL DEFAULT 0,
                    xp_missed            DOUBLE       NOT NULL DEFAULT 0,
                    two_pt_conversions   DOUBLE       NOT NULL DEFAULT 0,
                    fantasy_points_total DOUBLE       NOT NULL DEFAULT 0,
                    updated_at           DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                         ON UPDATE CURRENT_TIMESTAMP(6),
                    PRIMARY KEY (event_id, player_id),
                    KEY idx_player_id (player_id),
                    KEY idx_team_id   (team_id)
                )
            """)
            self.conn.commit()
        finally:
            cur.close()

        # Add new columns if upgrading from v4 (safe to run repeatedly on new installs too)
        self._add_column_if_missing("live_player_stats", "fg_0_39",            "DOUBLE NOT NULL DEFAULT 0")
        self._add_column_if_missing("live_player_stats", "fg_40_49",           "DOUBLE NOT NULL DEFAULT 0")
        self._add_column_if_missing("live_player_stats", "fg_50_plus",         "DOUBLE NOT NULL DEFAULT 0")
        self._add_column_if_missing("live_player_stats", "fg_missed",          "DOUBLE NOT NULL DEFAULT 0")
        self._add_column_if_missing("live_player_stats", "xp_made",            "DOUBLE NOT NULL DEFAULT 0")
        self._add_column_if_missing("live_player_stats", "xp_missed",          "DOUBLE NOT NULL DEFAULT 0")
        self._add_column_if_missing("live_player_stats", "two_pt_conversions", "DOUBLE NOT NULL DEFAULT 0")

    def _add_column_if_missing(self, table: str, column: str, definition: str) -> None:
        cur = self.conn.cursor()
        try:
            cur.execute(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s",
                (self.config.mysql_database, table, column),
            )
            if cur.fetchone()[0] == 0:
                cur.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition}")
                self.conn.commit()
                print(f"[db] added column {table}.{column}")
        finally:
            cur.close()

    def upsert_game_state(self, row: Dict[str, Any]) -> None:
        sql = """
        INSERT INTO live_game_states (
            event_id, snapshot_ts, season, week_num, game_status, game_state, game_clock,
            period_num, home_team_id, away_team_id, home_team_abbr, away_team_abbr,
            home_score, away_score, possession_team_id
        ) VALUES (
            %(event_id)s, %(snapshot_ts)s, %(season)s, %(week_num)s,
            %(game_status)s, %(game_state)s, %(game_clock)s, %(period_num)s,
            %(home_team_id)s, %(away_team_id)s, %(home_team_abbr)s, %(away_team_abbr)s,
            %(home_score)s, %(away_score)s, %(possession_team_id)s
        )
        ON DUPLICATE KEY UPDATE
            snapshot_ts        = VALUES(snapshot_ts),
            season             = VALUES(season),
            week_num           = VALUES(week_num),
            game_status        = VALUES(game_status),
            game_state         = VALUES(game_state),
            game_clock         = VALUES(game_clock),
            period_num         = VALUES(period_num),
            home_team_id       = VALUES(home_team_id),
            away_team_id       = VALUES(away_team_id),
            home_team_abbr     = VALUES(home_team_abbr),
            away_team_abbr     = VALUES(away_team_abbr),
            home_score         = VALUES(home_score),
            away_score         = VALUES(away_score),
            possession_team_id = VALUES(possession_team_id)
        """
        cur = self.conn.cursor()
        try:
            cur.execute(sql, row)
            self.conn.commit()
        finally:
            cur.close()

    def upsert_player_rows(self, rows: Iterable[Dict[str, Any]]) -> None:
        rows = list(rows)
        if not rows:
            return
        sql = """
        INSERT INTO live_player_stats (
            event_id, player_id, snapshot_ts, team_id, team_abbr, player_name, jersey,
            passing_yards, passing_tds, interceptions,
            rushing_yards, rushing_tds,
            receptions, receiving_yards, receiving_tds,
            fumbles_lost,
            fg_0_39, fg_40_49, fg_50_plus, fg_missed,
            xp_made, xp_missed, two_pt_conversions,
            fantasy_points_total
        ) VALUES (
            %(event_id)s, %(player_id)s, %(snapshot_ts)s, %(team_id)s, %(team_abbr)s,
            %(player_name)s, %(jersey)s,
            %(passing_yards)s, %(passing_tds)s, %(interceptions)s,
            %(rushing_yards)s, %(rushing_tds)s,
            %(receptions)s, %(receiving_yards)s, %(receiving_tds)s,
            %(fumbles_lost)s,
            %(fg_0_39)s, %(fg_40_49)s, %(fg_50_plus)s, %(fg_missed)s,
            %(xp_made)s, %(xp_missed)s, %(two_pt_conversions)s,
            %(fantasy_points_total)s
        )
        ON DUPLICATE KEY UPDATE
            snapshot_ts          = VALUES(snapshot_ts),
            team_id              = VALUES(team_id),
            team_abbr            = VALUES(team_abbr),
            player_name          = VALUES(player_name),
            jersey               = VALUES(jersey),
            passing_yards        = VALUES(passing_yards),
            passing_tds          = VALUES(passing_tds),
            interceptions        = VALUES(interceptions),
            rushing_yards        = VALUES(rushing_yards),
            rushing_tds          = VALUES(rushing_tds),
            receptions           = VALUES(receptions),
            receiving_yards      = VALUES(receiving_yards),
            receiving_tds        = VALUES(receiving_tds),
            fumbles_lost         = VALUES(fumbles_lost),
            fg_0_39              = VALUES(fg_0_39),
            fg_40_49             = VALUES(fg_40_49),
            fg_50_plus           = VALUES(fg_50_plus),
            fg_missed            = VALUES(fg_missed),
            xp_made              = VALUES(xp_made),
            xp_missed            = VALUES(xp_missed),
            two_pt_conversions   = VALUES(two_pt_conversions),
            fantasy_points_total = VALUES(fantasy_points_total)
        """
        cur = self.conn.cursor()
        try:
            cur.executemany(sql, rows)
            self.conn.commit()
        finally:
            cur.close()


# ---------------------------------------------------------------------------
# Ingestion pipeline (synchronous, runs in background thread)
# ---------------------------------------------------------------------------

class LiveIngestionPipeline:
    def __init__(
        self,
        config: PipelineConfig,
        writer: Optional[MySQLWriter] = None,
        delta_tracker: Optional[DeltaTracker] = None,
        on_deltas=None,  # Callable[[list], None] — called with delta messages each cycle
    ) -> None:
        self.config        = config
        self.client        = ESPNClient(config)
        self.scorer        = FantasyScorer(config)
        self.writer        = writer
        self.delta_tracker = delta_tracker
        self.on_deltas     = on_deltas

    def extract_active_event_ids(self, scoreboard: Dict[str, Any]) -> List[str]:
        event_ids: List[str] = []
        for event in scoreboard.get("events", []):
            state    = str((event.get("status") or {}).get("type", {}).get("state", "")).lower()
            event_id = str(event.get("id", ""))
            if event_id and state in {"pre", "in", "post"}:
                event_ids.append(event_id)
        return event_ids

    def process_summary(self, summary_json: Dict[str, Any]) -> Dict[str, Any]:
        snapshot_ts  = datetime.now(timezone.utc).replace(tzinfo=None)
        game_row     = SummaryParser.parse_game_row(summary_json, snapshot_ts)
        player_rows  = SummaryParser.parse_player_rows(summary_json, snapshot_ts, self.scorer)

        if self.writer:
            self.writer.upsert_game_state(game_row)
            self.writer.upsert_player_rows(player_rows)

        if self.delta_tracker and player_rows:
            deltas = self.delta_tracker.compute_and_update(player_rows)
            if deltas and self.on_deltas:
                self.on_deltas(deltas)

        return {"game_row": game_row, "player_rows": player_rows}

    def run_once(
        self,
        event_ids: Optional[List[str]] = None,
        scoreboard_dates: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if event_ids is None:
            scoreboard = self.client.get_scoreboard(dates=scoreboard_dates)
            event_ids  = self.extract_active_event_ids(scoreboard)

        outputs: List[Dict[str, Any]] = []
        for event_id in event_ids:
            try:
                summary_json = self.client.get_summary(event_id)
                outputs.append(self.process_summary(summary_json))
            except requests.RequestException as exc:
                print(f"[warn] ESPN request failed event={event_id}: {exc}")
        return outputs

    def run_forever(self, scoreboard_dates: Optional[str] = None) -> None:
        """Blocking poll loop. Designed to run in a daemon thread."""
        while True:
            started = time.time()
            try:
                outputs = self.run_once(scoreboard_dates=scoreboard_dates)
                print(f"[poll] {datetime.utcnow().isoformat()} — {len(outputs)} games processed")
            except Exception as exc:
                print(f"[error] poll cycle failed: {exc}")
            elapsed = time.time() - started
            time.sleep(max(self.config.poll_seconds - elapsed, 1))


# ---------------------------------------------------------------------------
# Entry point — async main (polling thread + WebSocket server)
# ---------------------------------------------------------------------------

async def run(config: PipelineConfig) -> None:
    """
    Starts two concurrent tasks:
      1. Synchronous ESPN polling in a daemon thread
      2. Async WebSocket server in the current event loop

    Deltas computed by the polling thread are forwarded to WebSocket clients
    via asyncio.run_coroutine_threadsafe().
    """
    loop      = asyncio.get_running_loop()
    ws_server = WebSocketServer(config.ws_host, config.ws_port)

    def on_deltas(deltas: List[Dict[str, Any]]) -> None:
        """Called from the polling thread; schedules broadcasts on the event loop."""
        for delta in deltas:
            asyncio.run_coroutine_threadsafe(ws_server.broadcast_delta(delta), loop)

    writer        = MySQLWriter(config)
    writer.ensure_tables()
    delta_tracker = DeltaTracker()
    pipeline      = LiveIngestionPipeline(
        config,
        writer=writer,
        delta_tracker=delta_tracker,
        on_deltas=on_deltas,
    )

    poll_thread = threading.Thread(target=pipeline.run_forever, daemon=True)
    poll_thread.start()
    print(f"[poll] started background polling thread (interval={config.poll_seconds}s)")

    try:
        await ws_server.serve()
    finally:
        writer.close()


# ---------------------------------------------------------------------------
# Demo mode (no DB, no WS — just parse a local JSON file and print output)
# ---------------------------------------------------------------------------

def demo_from_file(path: str) -> None:
    config   = PipelineConfig()
    pipeline = LiveIngestionPipeline(config, delta_tracker=DeltaTracker())
    with open(path, "r", encoding="utf-8") as f:
        sample = json.load(f)

    result = pipeline.process_summary(sample)
    print("=== Game Row ===")
    print(json.dumps(result["game_row"], default=str, indent=2))
    print(f"\n=== Player Rows ({len(result['player_rows'])}) ===")
    for row in result["player_rows"]:
        pts = row.get("fantasy_points_total", 0)
        if pts or row.get("fg_0_39") or row.get("fg_40_49") or row.get("fg_50_plus") or row.get("xp_made"):
            print(json.dumps({k: v for k, v in row.items() if k not in ("snapshot_ts", "event_id")}, default=str))

    # Second pass to show delta tracking in action
    print("\n=== Second pass (simulated stat change) ===")
    result2 = pipeline.process_summary(sample)
    print("(All stats identical → no deltas expected)")


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def _empty_player_row(
    event_id: str,
    snapshot_ts: datetime,
    team_id: str,
    team_abbr: Optional[str],
    athlete: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "event_id":    event_id,
        "snapshot_ts": snapshot_ts,
        "team_id":     team_id,
        "team_abbr":   team_abbr,
        "player_id":   str(athlete.get("id", "")),
        "player_name": athlete.get("displayName", "Unknown Player"),
        "jersey":      athlete.get("jersey"),
        **ZERO_STATS,
    }


def _parse_fraction(text: str) -> Tuple[int, int]:
    """Parse 'X/Y' → (X, Y). Returns (0, 0) on failure."""
    parts = text.strip().split("/")
    if len(parts) == 2:
        try:
            return int(parts[0]), int(parts[1])
        except ValueError:
            pass
    # Maybe it's just a plain integer (e.g. "3")
    try:
        v = int(text.strip())
        return v, v
    except ValueError:
        return 0, 0


def _extract_player_name_from_play_text(text: str, ptype_lower: str) -> Optional[str]:
    """
    Best-effort: extract a player's last name from a 2PT play text.
    ESPN formats observed:
      "B.Purdy Two-Point Pass (K.Jennings)"
      "C.McCaffrey Two-Point Rush"
    Returns the last name in lower-case, or None.
    """
    # Strip known noise keywords
    clean = re.sub(
        r"\b(two-point|two point|pass|rush|conversion|from|by|run|yards?|yd)\b",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()
    # Take the first token that looks like a name (contains a letter, not a number)
    tokens = [t for t in clean.split() if re.search(r"[A-Za-z]", t)]
    if not tokens:
        return None
    # Token may be "B.Purdy" — take the part after the dot as the last name
    first_token = tokens[0]
    if "." in first_token:
        last = first_token.split(".")[-1]
    else:
        last = first_token
    return last.lower() if last else None


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text in {"", "-", "--", "N/A"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _str_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value)
    return text if text else None


def _normalize_key(value: Any) -> str:
    return str(value or "").replace("/", "").replace("-", "").replace("_", "").lower()


_SNAKE_TO_CAMEL: Dict[str, str] = {s: c for s, c in STAT_FIELDS}


def _to_camel(snake: str) -> str:
    return _SNAKE_TO_CAMEL.get(snake, snake)


# ---------------------------------------------------------------------------
# __main__
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mode = os.getenv("PIPELINE_MODE", "demo")

    if mode == "demo":
        demo_from_file(os.getenv("SAMPLE_JSON", "example_api_res.json"))

    elif mode == "ws_only":
        # WebSocket server only — no polling, no DB. Useful for local UI testing.
        config    = PipelineConfig()
        ws_server = WebSocketServer(config.ws_host, config.ws_port)
        asyncio.run(ws_server.serve())

    else:
        # Full live mode: polling + WebSocket server
        config = PipelineConfig()
        asyncio.run(run(config))
