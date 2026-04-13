"""
SportsDataIO Live Pipeline v1
─────────────────────────────
Polls SportsDataIO NFL endpoints to maintain live game and player stats.

Poll cycle (every POLL_SECONDS):
  1. GET /scores/json/scoresbydate/{date}
       → discover today's games + states; extract current season/week
  2. GET /stats/json/boxscoresdeltav3/{season}/{week}/fantasy/{delta_minutes}
       → player stat changes across all live games in one call
  3. Upsert live_game_states + live_player_stats
  4. Emit WebSocket deltas to subscribed clients
  5. On game state in→post transition: POST /api/admin/finalize-games

WebSocket protocol (default port 8765):
  Client → Server:
    {"subscribe":   [playerId1, playerId2, ...]}   # SportsDataIO PlayerID strings
    {"unsubscribe": [playerId1, playerId2, ...]}

  Server → Client (on stat change):
    {
      "playerId":  "23189",
      "name":      "Bijan Robinson",
      "scoreId":   "19055",
      "teamAbbr":  "ATL",
      "delta":  {"rushingYards": 5.0, "fantasyPointsTotal": 0.5},
      "totals": {"rushingYards": 67.0, ..., "fantasyPointsTotal": 11.2}
    }

Environment variables:
  SPORTSDATA_API_KEY   — required
  SPORTSDATA_BASE_URL  — default https://api.sportsdata.io
                         (set to https://replay.sportsdata.io for replay mode)
  SCORES_DATE          — date for scoresbydate in YYYY-MM-DD (default: today UTC)
  DELTA_MINUTES        — minutes window for delta endpoint; "all" returns full week (default: all)
  POLL_SECONDS         — poll interval in seconds (default: 15)
  WS_HOST / WS_PORT    — WebSocket bind address (default: 0.0.0.0:8765)
  APP_URL              — Next.js app URL for finalize-games hook
  ADMIN_SECRET         — x-admin-secret header for finalize hook
  MYSQL_HOST/PORT/USER/PASSWORD/DATABASE
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from dotenv import load_dotenv

load_dotenv()

try:
    import mysql.connector as mysql_connector
except Exception:
    mysql_connector = None

try:
    import websockets
except Exception:
    websockets = None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_POLL_SECONDS = 15
DEFAULT_WS_HOST      = "0.0.0.0"
DEFAULT_WS_PORT      = 8765
DEFAULT_BASE_URL     = "https://api.sportsdata.io"

# SeasonType int → URL suffix
_SEASON_TYPE_SUFFIX = {1: "reg", 2: "pre", 3: "post"}

# (snake_name, camelName) pairs — identical to ESPN pipeline for WS compatibility
STAT_FIELDS: List[Tuple[str, str]] = [
    ("passing_yards",        "passingYards"),
    ("passing_tds",          "passingTds"),
    ("interceptions",        "interceptions"),
    ("rushing_yards",        "rushingYards"),
    ("rushing_tds",          "rushingTds"),
    ("receptions",           "receptions"),
    ("receiving_yards",      "receivingYards"),
    ("receiving_tds",        "receivingTds"),
    ("fumbles_lost",         "fumblesLost"),
    ("fg_0_39",              "fg0_39"),
    ("fg_40_49",             "fg40_49"),
    ("fg_50_plus",           "fg50Plus"),
    ("fg_missed",            "fgMissed"),
    ("xp_made",              "xpMade"),
    ("xp_missed",            "xpMissed"),
    ("two_pt_conversions",   "twoPtConversions"),
    ("fantasy_points_total", "fantasyPointsTotal"),
]

SNAKE_FIELDS                      = [s for s, _ in STAT_FIELDS]
ZERO_STATS: Dict[str, float]      = {s: 0.0 for s in SNAKE_FIELDS}
_SNAKE_TO_CAMEL: Dict[str, str]   = {s: c for s, c in STAT_FIELDS}


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@dataclass
class PipelineConfig:
    api_key:         str   = os.getenv("SPORTSDATA_API_KEY", "")
    base_url:        str   = os.getenv("SPORTSDATA_BASE_URL", DEFAULT_BASE_URL)
    scores_date:     str   = os.getenv("SCORES_DATE", "")  # YYYY-MM-DD; blank = today
    season:          str   = os.getenv("SEASON", "")       # e.g. "2025reg"; derived from scores if blank
    week:            str   = os.getenv("WEEK", "")         # e.g. "1"; derived from scores if blank
    mysql_host:      str   = os.getenv("MYSQL_HOST",     "127.0.0.1")
    mysql_port:      int   = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user:      str   = os.getenv("MYSQL_USER",     "root")
    mysql_password:  str   = os.getenv("MYSQL_PASSWORD", "")
    mysql_database:  str   = os.getenv("MYSQL_DATABASE", "oneleague_db")
    poll_seconds:    int   = int(os.getenv("POLL_SECONDS",     str(DEFAULT_POLL_SECONDS)))
    request_timeout: int   = int(os.getenv("REQUEST_TIMEOUT",  "15"))
    ws_host:         str   = os.getenv("WS_HOST", DEFAULT_WS_HOST)
    ws_port:         int   = int(os.getenv("WS_PORT", str(DEFAULT_WS_PORT)))
    app_url:         str   = os.getenv("APP_URL",      "")
    admin_secret:    str   = os.getenv("ADMIN_SECRET", "")
    # Fantasy scoring coefficients (PPR)
    pts_pass_yd:     float = float(os.getenv("PTS_PASS_YD",     "0.04"))
    pts_pass_td:     float = float(os.getenv("PTS_PASS_TD",     "4"))
    pts_int:         float = float(os.getenv("PTS_INT",         "-2"))
    pts_rush_yd:     float = float(os.getenv("PTS_RUSH_YD",     "0.1"))
    pts_rush_td:     float = float(os.getenv("PTS_RUSH_TD",     "6"))
    pts_rec:         float = float(os.getenv("PTS_REC",         "1"))
    pts_rec_yd:      float = float(os.getenv("PTS_REC_YD",      "0.1"))
    pts_rec_td:      float = float(os.getenv("PTS_REC_TD",      "6"))
    pts_fumble_lost: float = float(os.getenv("PTS_FUMBLE_LOST", "-2"))
    pts_fg_0_39:     float = float(os.getenv("PTS_FG_0_39",     "3"))
    pts_fg_40_49:    float = float(os.getenv("PTS_FG_40_49",    "4"))
    pts_fg_50_plus:  float = float(os.getenv("PTS_FG_50_PLUS",  "5"))
    pts_fg_missed:   float = float(os.getenv("PTS_FG_MISSED",   "-1"))
    pts_xp_made:     float = float(os.getenv("PTS_XP_MADE",     "1"))
    pts_xp_missed:   float = float(os.getenv("PTS_XP_MISSED",   "0"))
    pts_two_pt:      float = float(os.getenv("PTS_TWO_PT",      "2"))

    def get_scores_date(self) -> str:
        return self.scores_date or date.today().strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# SportsDataIO HTTP client
# ---------------------------------------------------------------------------

class SportsDataClient:
    def __init__(self, config: PipelineConfig) -> None:
        self.config  = config
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "one-league-live-pipeline/1.0"})

    def _get(self, path: str) -> Any:
        url = f"{self.config.base_url.rstrip('/')}{path}"
        r   = self.session.get(
            url,
            params={"key": self.config.api_key},
            timeout=self.config.request_timeout,
        )
        r.raise_for_status()
        return r.json()

    def get_scores_by_date(self, scores_date: str) -> List[Dict[str, Any]]:
        """GET /v3/nfl/scores/json/scoresbydate/{date} — all games on a date."""
        return self._get(f"/v3/nfl/scores/json/scoresbydate/{scores_date}")

    def get_box_scores_delta(self, season: str, week: int) -> List[Dict[str, Any]]:
        """GET /v3/nfl/stats/json/boxscoresdeltav3/{season}/{week}/fantasy/all"""
        return self._get(f"/v3/nfl/stats/json/boxscoresdeltav3/{season}/{week}/fantasy/all")


# ---------------------------------------------------------------------------
# Fantasy scorer
# ---------------------------------------------------------------------------

class FantasyScorer:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config

    def score(self, row: Dict[str, Any]) -> float:
        c = self.config
        total  = 0.0
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
# Box score parser
# ---------------------------------------------------------------------------

class BoxScoreParser:
    """
    Converts SportsDataIO Score and PlayerGame dicts into our DB row format.

    SportsDataIO advantages over ESPN:
      - FG tiers are direct fields (FieldGoalsMade0to19/20to29/30to39/40to49/50Plus)
      - 2PT splits are direct fields (TwoPointConversionPasses/Runs/Receptions)
      - No play-text parsing required
    """

    @staticmethod
    def parse_game_row(score: Dict[str, Any], snapshot_ts: datetime) -> Dict[str, Any]:
        season_type = score.get("SeasonType", 1)
        season_str  = f"{score.get('Season', '')}{_SEASON_TYPE_SUFFIX.get(season_type, 'reg')}"

        return {
            "event_id":           str(score["ScoreID"]),
            "snapshot_ts":        snapshot_ts,
            "season":             score.get("Season"),
            "week_num":           score.get("Week"),
            "game_status":        score.get("Status"),
            "game_state":         _derive_game_state(score),
            "game_clock":         _derive_game_clock(score),
            "period_num":         _parse_quarter(score.get("Quarter")),
            "home_team_id":       _str_or_none(score.get("HomeTeamID")),
            "away_team_id":       _str_or_none(score.get("AwayTeamID")),
            "home_team_abbr":     score.get("HomeTeam"),
            "away_team_abbr":     score.get("AwayTeam"),
            "home_score":         _safe_int(score.get("HomeScore")),
            "away_score":         _safe_int(score.get("AwayScore")),
            "possession_team_id": _str_or_none(score.get("Possession")),  # team abbr, not ID
            # Carry through for season/week lookup in pipeline
            "_season_str":        season_str,
            "_week":              score.get("Week"),
        }

    @staticmethod
    def parse_player_rows(
        score: Dict[str, Any],
        player_games: List[Dict[str, Any]],
        snapshot_ts: datetime,
        scorer: FantasyScorer,
    ) -> List[Dict[str, Any]]:
        event_id = str(score["ScoreID"])
        rows: List[Dict[str, Any]] = []

        for pg in player_games:
            player_id = pg.get("PlayerID")
            if not player_id:
                continue

            # FG tiers: 0-39 buckets = 0-19 + 20-29 + 30-39
            fg_0_39   = _f(pg, "FieldGoalsMade0to19") + _f(pg, "FieldGoalsMade20to29") + _f(pg, "FieldGoalsMade30to39")
            fg_40_49  = _f(pg, "FieldGoalsMade40to49")
            fg_50_plus = _f(pg, "FieldGoalsMade50Plus")
            fg_made   = fg_0_39 + fg_40_49 + fg_50_plus
            fg_att    = _f(pg, "FieldGoalsAttempted")
            fg_missed = max(fg_att - fg_made, 0.0)

            xp_made   = _f(pg, "ExtraPointsMade")
            xp_att    = _f(pg, "ExtraPointsAttempted")
            xp_missed = max(xp_att - xp_made, 0.0)

            two_pt = (
                _f(pg, "TwoPointConversionPasses")
                + _f(pg, "TwoPointConversionRuns")
                + _f(pg, "TwoPointConversionReceptions")
            )

            row: Dict[str, Any] = {
                "event_id":    event_id,
                "snapshot_ts": snapshot_ts,
                "player_id":   str(player_id),
                "team_id":     str(pg.get("TeamID", "")),
                "team_abbr":   pg.get("Team"),
                "player_name": pg.get("Name", "Unknown"),
                "jersey":      str(pg["Number"]) if pg.get("Number") is not None else None,
                # Offense
                "passing_yards":       _f(pg, "PassingYards"),
                "passing_tds":         _f(pg, "PassingTouchdowns"),
                "interceptions":       _f(pg, "PassingInterceptions"),
                "rushing_yards":       _f(pg, "RushingYards"),
                "rushing_tds":         _f(pg, "RushingTouchdowns"),
                "receptions":          _f(pg, "Receptions"),
                "receiving_yards":     _f(pg, "ReceivingYards"),
                "receiving_tds":       _f(pg, "ReceivingTouchdowns"),
                "fumbles_lost":        _f(pg, "FumblesLost"),
                # Kicker
                "fg_0_39":             fg_0_39,
                "fg_40_49":            fg_40_49,
                "fg_50_plus":          fg_50_plus,
                "fg_missed":           fg_missed,
                "xp_made":             xp_made,
                "xp_missed":           xp_missed,
                # 2PT
                "two_pt_conversions":  two_pt,
                # Fantasy points — computed from our own scoring coefficients
                "fantasy_points_total": 0.0,
            }
            row["fantasy_points_total"] = scorer.score(row)
            rows.append(row)

        return rows


# ---------------------------------------------------------------------------
# Delta tracker  (identical to ESPN pipeline)
# ---------------------------------------------------------------------------

class DeltaTracker:
    def __init__(self) -> None:
        self._state: Dict[Tuple[str, str], Dict[str, float]] = {}

    def compute_and_update(self, player_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        delta_messages: List[Dict[str, Any]] = []

        for row in player_rows:
            key       = (str(row.get("event_id", "")), str(row.get("player_id", "")))
            new_stats = {s: float(row.get(s, 0.0) or 0.0) for s in SNAKE_FIELDS}
            prev      = self._state.get(key)

            if prev is None:
                self._state[key] = new_stats
                continue

            changed: Dict[str, float] = {}
            for snake in SNAKE_FIELDS:
                diff = new_stats[snake] - prev[snake]
                if abs(diff) > 1e-9:
                    changed[snake] = diff

            if changed:
                self._state[key] = new_stats
                delta_messages.append({
                    "playerId": str(row.get("player_id", "")),
                    "name":     row.get("player_name", ""),
                    "eventId":  str(row.get("event_id", "")),
                    "teamAbbr": row.get("team_abbr", ""),
                    "delta":    {_SNAKE_TO_CAMEL[k]: v for k, v in changed.items()},
                    "totals":   {_SNAKE_TO_CAMEL[s]: new_stats[s] for s in SNAKE_FIELDS},
                })

        return delta_messages


# ---------------------------------------------------------------------------
# WebSocket server  (identical to ESPN pipeline)
# ---------------------------------------------------------------------------

class WebSocketServer:
    def __init__(self, host: str, port: int) -> None:
        self.host  = host
        self.port  = port
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
                for pid in msg.get("subscribe", []):
                    pid = str(pid)
                    subscribed.add(pid)
                    self._subs.setdefault(pid, set()).add(ws)
                for pid in msg.get("unsubscribe", []):
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
        pid     = str(delta_msg.get("playerId", ""))
        targets = set(self._subs.get(pid, set()))
        if not targets:
            return
        payload = json.dumps(delta_msg)
        results = await asyncio.gather(*(t.send(payload) for t in targets), return_exceptions=True)
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
            await asyncio.Future()


# ---------------------------------------------------------------------------
# MySQL writer  (identical schema to ESPN pipeline)
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

    def upsert_game_state(self, row: Dict[str, Any]) -> None:
        # Strip internal-only keys before writing
        clean = {k: v for k, v in row.items() if not k.startswith("_")}
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
            cur.execute(sql, clean)
            self.conn.commit()
        finally:
            cur.close()

    def upsert_player_rows(self, rows: List[Dict[str, Any]]) -> None:
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
# Live ingestion pipeline
# ---------------------------------------------------------------------------

class LiveIngestionPipeline:
    def __init__(
        self,
        config: PipelineConfig,
        writer: Optional[MySQLWriter] = None,
        delta_tracker: Optional[DeltaTracker] = None,
        on_deltas=None,
    ) -> None:
        self.config        = config
        self.client        = SportsDataClient(config)
        self.scorer        = FantasyScorer(config)
        self.writer        = writer
        self.delta_tracker = delta_tracker
        self.on_deltas     = on_deltas
        # Game-state transition tracking for auto-finalize
        self._event_states:     Dict[str, str] = {}   # score_id → last known game_state
        self._finalized_events: Set[str]        = set()
        # Season/week — populated from first scores response
        self._season_str: Optional[str] = None
        self._week:       Optional[int]  = None

    # ------------------------------------------------------------------
    # Finalize hook
    # ------------------------------------------------------------------

    def _call_finalize(self, season: int, week_num: int) -> None:
        app_url = self.config.app_url.rstrip("/")
        secret  = self.config.admin_secret
        if not app_url or not secret:
            print(f"[finalize] Skipping week={week_num} — APP_URL or ADMIN_SECRET not set")
            return
        url = f"{app_url}/api/admin/finalize-games"
        try:
            resp = self.client.session.post(
                url,
                json={"season_year": season, "week_num": week_num},
                headers={"x-admin-secret": secret},
                timeout=30,
            )
            resp.raise_for_status()
            n = resp.json().get("data", {}).get("finalized", "?")
            print(f"[finalize] season={season} week={week_num} → {n} players written to player_weekly_scores")
        except Exception as exc:
            print(f"[finalize] WARN: failed for week={week_num}: {exc}")

    # ------------------------------------------------------------------
    # Single poll cycle
    # ------------------------------------------------------------------

    def run_once(self) -> None:
        snapshot_ts = datetime.now(timezone.utc).replace(tzinfo=None)

        # --- Step 1: fetch game states for today ---
        # If SEASON+WEEK are explicitly configured we still fetch scores for game-state
        # tracking and finalize detection, but we never block the delta call on them.
        scores_date = self.config.get_scores_date()
        try:
            scores = self.client.get_scores_by_date(scores_date)
        except requests.RequestException as exc:
            print(f"[warn] scoresbydate request failed: {exc}")
            scores = []

        # Resolve season/week — explicit env vars take priority over derived values
        if self.config.season and self.config.week:
            self._season_str = self.config.season
            self._week       = int(self.config.week)
        elif scores:
            first            = scores[0]
            season_type      = first.get("SeasonType", 1)
            self._season_str = f"{first.get('Season')}{_SEASON_TYPE_SUFFIX.get(season_type, 'reg')}"
            self._week       = first.get("Week")

        if not self._season_str or not self._week:
            print("[poll] Cannot determine season/week — set SEASON and WEEK env vars or SCORES_DATE with active games")
            return

        # Upsert game states; detect post transitions for finalization
        any_live = False
        for score in scores:
            game_row  = BoxScoreParser.parse_game_row(score, snapshot_ts)
            event_id  = game_row["event_id"]
            new_state = game_row["game_state"]

            if self.writer:
                self.writer.upsert_game_state(game_row)

            if new_state == "in":
                any_live = True

            if new_state == "post" and event_id not in self._finalized_events:
                self._finalized_events.add(event_id)
                season   = game_row.get("season")
                week_num = game_row.get("week_num")
                if season and week_num:
                    old_state = self._event_states.get(event_id, "pre")
                    print(f"[finalize] Game {event_id} is post (was '{old_state}'), triggering finalization week={week_num}")
                    threading.Thread(
                        target=self._call_finalize,
                        args=(season, week_num),
                        daemon=True,
                    ).start()
            if event_id:
                self._event_states[event_id] = new_state

        # --- Step 2: fetch player stat deltas if any games are live or just ended ---
        has_recent_post = any(
            self._event_states.get(str(s["ScoreID"])) == "post"
            and s.get("IsOver")
            for s in scores
        )
        if not any_live and not has_recent_post:
            return

        try:
            box_scores = self.client.get_box_scores_delta(self._season_str, self._week)
        except requests.RequestException as exc:
            print(f"[warn] boxscoresdelta request failed: {exc}")
            return

        all_player_rows: List[Dict[str, Any]] = []
        for box in box_scores:
            score       = box.get("Score", {})
            player_games = box.get("PlayerGames", [])
            player_rows  = BoxScoreParser.parse_player_rows(
                score, player_games, snapshot_ts, self.scorer
            )
            all_player_rows.extend(player_rows)

        if self.writer and all_player_rows:
            self.writer.upsert_player_rows(all_player_rows)

        if self.delta_tracker and all_player_rows:
            deltas = self.delta_tracker.compute_and_update(all_player_rows)
            if deltas and self.on_deltas:
                self.on_deltas(deltas)

        print(
            f"[poll] {datetime.utcnow().isoformat()} — "
            f"{len(scores)} games, {len(all_player_rows)} player rows, "
            f"{len(box_scores)} delta box scores"
        )

    # ------------------------------------------------------------------
    # Poll loop
    # ------------------------------------------------------------------

    def run_forever(self) -> None:
        while True:
            started = time.time()
            try:
                self.run_once()
            except Exception as exc:
                print(f"[error] poll cycle failed: {exc}")
            elapsed = time.time() - started
            time.sleep(max(self.config.poll_seconds - elapsed, 1))


# ---------------------------------------------------------------------------
# Entry point — async main
# ---------------------------------------------------------------------------

async def run(config: PipelineConfig) -> None:
    loop      = asyncio.get_running_loop()
    ws_server = WebSocketServer(config.ws_host, config.ws_port)

    def on_deltas(deltas: List[Dict[str, Any]]) -> None:
        for delta in deltas:
            asyncio.run_coroutine_threadsafe(ws_server.broadcast_delta(delta), loop)

    writer        = MySQLWriter(config)
    delta_tracker = DeltaTracker()
    pipeline      = LiveIngestionPipeline(
        config,
        writer=writer,
        delta_tracker=delta_tracker,
        on_deltas=on_deltas,
    )

    poll_thread = threading.Thread(target=pipeline.run_forever, daemon=True)
    poll_thread.start()
    print(f"[poll] started polling thread (interval={config.poll_seconds}s, date={config.get_scores_date()})")

    try:
        await ws_server.serve()
    finally:
        writer.close()


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def _f(d: Dict[str, Any], key: str) -> float:
    """Safe float extraction from a SportsDataIO PlayerGame dict."""
    v = d.get(key)
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _str_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value)
    return s if s else None


def _derive_game_state(score: Dict[str, Any]) -> str:
    if score.get("IsInProgress"):
        return "in"
    if score.get("IsOver") or score.get("Status") == "Final":
        return "post"
    if score.get("Status") == "Canceled":
        return "canceled"
    return "pre"


def _derive_game_clock(score: Dict[str, Any]) -> Optional[str]:
    quarter  = score.get("Quarter")
    time_rem = score.get("TimeRemaining")
    if quarter == "F":
        return "Final"
    if quarter and time_rem:
        return f"Q{quarter} {time_rem}"
    if quarter:
        return f"Q{quarter}"
    return None


def _parse_quarter(quarter: Any) -> Optional[int]:
    if quarter is None:
        return None
    q = str(quarter).upper().strip()
    if q.lstrip("-").isdigit():
        return int(q)
    if q in ("OT", "F/OT"):
        return 5
    return None  # "F", null, etc.


# ---------------------------------------------------------------------------
# __main__
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mode = os.getenv("PIPELINE_MODE", "live")

    if mode == "ws_only":
        config    = PipelineConfig()
        ws_server = WebSocketServer(config.ws_host, config.ws_port)
        asyncio.run(ws_server.serve())
    else:
        # Full live/replay mode: polling + WebSocket server
        config = PipelineConfig()
        if not config.api_key:
            raise SystemExit("SPORTSDATA_API_KEY is required.")
        print(f"[init] base_url={config.base_url}")
        print(f"[init] scores_date={config.get_scores_date()}")
        print(f"[init] season={config.season or '(derived from scores)'} week={config.week or '(derived from scores)'}")
        asyncio.run(run(config))
