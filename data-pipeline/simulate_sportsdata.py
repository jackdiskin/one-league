#!/usr/bin/env python3
"""
simulate_sportsdata.py — Live stats simulator for the SportsDataIO pipeline
----------------------------------------------------------------------------
Replays a real, completed SportsDataIO box score as if it were live,
broadcasting stat deltas over WebSocket using the exact same scoring engine
as sportsdata_live_pipeline.py (half-PPR + milestone bonuses). No MySQL
required — pure WebSocket broadcast, so you can point a test client (or the
Next.js app's useLiveStats hook) at ws://localhost:8765 and watch fantasy
points tick up in real time, without waiting for an actual live game.

Usage:
    python simulate_sportsdata.py                          # first game, 2025REG week 1
    python simulate_sportsdata.py --season 2025REG --week 3
    python simulate_sportsdata.py --team KC                 # pick a specific team's game
    python simulate_sportsdata.py --ticks 40 --interval 3
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List

from sportsdata_live_pipeline import (
    BoxScoreParser,
    DeltaTracker,
    FantasyScorer,
    PipelineConfig,
    SNAKE_FIELDS,
    SportsDataClient,
    WebSocketServer,
)


def _distribute(total: float, num_ticks: int, rng: random.Random) -> List[float]:
    """Randomly assign `total` units across `num_ticks` buckets (models bursty plays)."""
    count = max(0, round(total))
    buckets = [0.0] * num_ticks
    for _ in range(count):
        buckets[rng.randint(0, num_ticks - 1)] += 1.0
    return buckets


def build_snapshots(
    player_rows: List[Dict[str, Any]], num_ticks: int, rng: random.Random
) -> List[List[Dict[str, Any]]]:
    """Return num_ticks cumulative player-stat snapshots; snapshot[-1] == final stats."""
    increments: Dict[str, Dict[str, List[float]]] = {}
    for row in player_rows:
        pid = row["player_id"]
        incs = {}
        for stat in SNAKE_FIELDS:
            if stat == "fantasy_points_total":
                continue
            incs[stat] = _distribute(float(row.get(stat) or 0), num_ticks, rng)
        increments[pid] = incs

    snapshots: List[List[Dict[str, Any]]] = []
    for tick in range(num_ticks):
        snapshot: List[Dict[str, Any]] = []
        for row in player_rows:
            pid = row["player_id"]
            cum_row = {k: v for k, v in row.items() if k not in SNAKE_FIELDS}
            for stat in SNAKE_FIELDS:
                if stat == "fantasy_points_total":
                    continue
                cum_row[stat] = sum(increments[pid][stat][: tick + 1])
            snapshot.append(cum_row)
        snapshots.append(snapshot)
    return snapshots


async def run_simulation(
    season: str, week: int, team: str | None,
    num_ticks: int, interval: float, host: str, port: int, seed: int | None,
) -> None:
    rng = random.Random(seed)
    config = PipelineConfig()
    if not config.api_key:
        sys.exit("ERROR: SPORTSDATA_API_KEY is required (set it in data-pipeline/.env)")

    client = SportsDataClient(config)
    scorer = FantasyScorer(config)
    snapshot_ts = datetime.now(timezone.utc).replace(tzinfo=None)

    print(f"[sim] Fetching boxscoresdeltav3/{season}/{week} ...")
    boxes = client.get_box_scores_delta(season, week)
    if not boxes:
        sys.exit(f"No games found for {season} week {week}")

    box = None
    if team:
        team = team.upper()
        for b in boxes:
            score = b.get("Score", {})
            if score.get("HomeTeam") == team or score.get("AwayTeam") == team:
                box = b
                break
        if box is None:
            sys.exit(f"No game found for team {team} in {season} week {week}")
    else:
        box = boxes[0]

    score = box.get("Score", {})
    event_id = str(score.get("ScoreID"))
    player_rows = BoxScoreParser.parse_player_rows(
        score, box.get("PlayerGames", []), snapshot_ts, scorer, box.get("ScoringDetails", [])
    )
    if not player_rows:
        sys.exit("No player rows found in this box score — aborting.")

    print("=" * 70)
    print(f"[sim] Game:      {score.get('AwayTeam')} @ {score.get('HomeTeam')}  "
          f"({season} week {week})")
    print(f"[sim] Event ID:  {event_id}")
    print(f"[sim] Players:   {len(player_rows)}")
    print(f"[sim] Ticks:     {num_ticks} x {interval}s  ({num_ticks * interval:.0f}s total)")
    print(f"[sim] WS:        ws://{host if host != '0.0.0.0' else 'localhost'}:{port}")
    print()
    print("[sim] SportsDataIO PlayerIDs being simulated (top scorers, final values):")
    for p in sorted(player_rows, key=lambda r: r["fantasy_points_total"], reverse=True)[:10]:
        print(f"       {p['player_id']:>10}  {p['player_name']:<24} {p['team_abbr']:<4} "
              f"{p['fantasy_points_total']:.1f} pts (final)")
    print("=" * 70)
    print()

    snapshots = build_snapshots(player_rows, num_ticks, rng)

    ws_server = WebSocketServer(host, port)
    delta_tracker = DeltaTracker()

    server_task = asyncio.get_running_loop().create_task(ws_server.serve())
    await asyncio.sleep(0.2)

    print("[sim] WebSocket server ready — connect your test client / Next.js app now.")
    print("[sim] Starting simulation in 3 seconds...\n")
    await asyncio.sleep(3)

    for tick_idx, snapshot in enumerate(snapshots):
        for row in snapshot:
            row["fantasy_points_total"] = scorer.score(row)

        deltas = delta_tracker.compute_and_update(snapshot)

        now = datetime.utcnow().strftime("%H:%M:%S")
        pct = int(((tick_idx + 1) / num_ticks) * 100)
        bar = "#" * (pct // 5) + "." * (20 - pct // 5)

        if deltas:
            names = ", ".join(d["name"].split()[-1] for d in deltas)
            print(f"[{now}] Tick {tick_idx + 1:>3}/{num_ticks}  [{bar}] {pct:>3}%  "
                  f"- {len(deltas)} updates: {names}")
            for delta in deltas:
                await ws_server.broadcast_delta(delta)
        else:
            print(f"[{now}] Tick {tick_idx + 1:>3}/{num_ticks}  [{bar}] {pct:>3}%  - (quiet play)")

        if tick_idx < num_ticks - 1:
            await asyncio.sleep(interval)

    print()
    print("[sim] Simulation complete - all stats at final values.")
    print("[sim] WebSocket server still running. Ctrl+C to stop.")
    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Simulate a live SportsDataIO game over WebSocket")
    parser.add_argument("--season", default="2025REG", help="Season string, e.g. 2025REG (default: 2025REG)")
    parser.add_argument("--week", type=int, default=1, help="Week number (default: 1)")
    parser.add_argument("--team", default=None, help="Team abbreviation to pick a specific game, e.g. KC")
    parser.add_argument("--ticks", type=int, default=30, help="Number of simulated poll cycles (default: 30)")
    parser.add_argument("--interval", type=float, default=5.0, help="Seconds between ticks (default: 5)")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port (default: 8765)")
    parser.add_argument("--host", default="0.0.0.0", help="WebSocket host")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    args = parser.parse_args()

    try:
        asyncio.run(run_simulation(
            season=args.season, week=args.week, team=args.team,
            num_ticks=args.ticks, interval=args.interval,
            host=args.host, port=args.port, seed=args.seed,
        ))
    except KeyboardInterrupt:
        print("\n[sim] Stopped.")


if __name__ == "__main__":
    main()
