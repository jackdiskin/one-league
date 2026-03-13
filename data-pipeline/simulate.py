"""
simulate.py — Live stats simulator for offseason testing
---------------------------------------------------------
Replays a finished game JSON as if it were live, broadcasting realistic
stat deltas over WebSocket so the frontend UI can be tested end-to-end.

Usage:
    python simulate.py                        # replay example_api_res.json
    python simulate.py my_game.json           # replay any summary JSON
    python simulate.py --ticks 40 --interval 3

Options:
    positional  Path to ESPN summary JSON file (default: example_api_res.json)
    --ticks     Number of simulated poll cycles (default: 30)
    --interval  Seconds between ticks          (default: 5)
    --port      WebSocket server port          (default: 8765)
    --host      WebSocket server host          (default: 0.0.0.0)
    --seed      Random seed for reproducibility (default: random)

The simulator connects to the same ws://localhost:<port> URL that the
Next.js app uses, so no changes to the frontend are needed.

At startup it prints the ESPN athlete IDs being simulated. Your DB
players need espn_athlete_id populated (via migrate_espn_ids.py) and
those IDs need to appear on your roster for the live badge to show.
To force-test without matching IDs, open the browser console and run:
    window.__testLiveIds = ['4361741', '3117251']   // etc.
"""
from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

# ---------------------------------------------------------------------------
# Import WebSocketServer + DeltaTracker + scoring from the pipeline
# ---------------------------------------------------------------------------

_PIPELINE = Path(__file__).parent / "espn_live_pipeline-5.py"
_spec = importlib.util.spec_from_file_location("pipeline", _PIPELINE)
_mod  = importlib.util.module_from_spec(_spec)          # type: ignore[arg-type]
sys.modules["pipeline"] = _mod                          # required for @dataclass to resolve module
_spec.loader.exec_module(_mod)                          # type: ignore[union-attr]

WebSocketServer = _mod.WebSocketServer
DeltaTracker    = _mod.DeltaTracker
SummaryParser   = _mod.SummaryParser
FantasyScorer   = _mod.FantasyScorer
PipelineConfig  = _mod.PipelineConfig
SNAKE_FIELDS    = _mod.SNAKE_FIELDS


# ---------------------------------------------------------------------------
# Stat distribution helpers
# ---------------------------------------------------------------------------

def _distribute(total: float, num_ticks: int, rng: random.Random) -> List[float]:
    """
    Randomly assign `total` units across `num_ticks` buckets.
    Models the bursty nature of real football plays.
    """
    count = max(0, round(total))
    buckets = [0.0] * num_ticks
    for _ in range(count):
        buckets[rng.randint(0, num_ticks - 1)] += 1.0
    return buckets


def build_snapshots(
    player_rows: List[Dict[str, Any]],
    num_ticks: int,
    rng: random.Random,
    event_id: str,
) -> List[List[Dict[str, Any]]]:
    """
    Return `num_ticks` cumulative player-stat snapshots.
    Snapshot[0] is the state after the first simulated poll.
    Snapshot[-1] should be close to the real final stats.
    """
    # Per-player, per-stat tick increments
    increments: Dict[str, Dict[str, List[float]]] = {}
    for row in player_rows:
        pid   = row["player_id"]
        incs  = {}
        for stat in SNAKE_FIELDS:
            if stat == "fantasy_points_total":
                continue  # recomputed each tick
            incs[stat] = _distribute(float(row.get(stat) or 0), num_ticks, rng)
        increments[pid] = incs

    snapshots: List[List[Dict[str, Any]]] = []
    for tick in range(num_ticks):
        snapshot: List[Dict[str, Any]] = []
        for row in player_rows:
            pid      = row["player_id"]
            cum_row  = {k: v for k, v in row.items() if k not in SNAKE_FIELDS}
            cum_row["event_id"] = event_id
            for stat in SNAKE_FIELDS:
                if stat == "fantasy_points_total":
                    continue
                cum_row[stat] = sum(increments[pid][stat][: tick + 1])
            snapshot.append(cum_row)
        snapshots.append(snapshot)

    return snapshots


# ---------------------------------------------------------------------------
# Main simulation coroutine
# ---------------------------------------------------------------------------

async def run_simulation(
    summary_path: str,
    num_ticks: int,
    interval: float,
    host: str,
    port: int,
    seed: int | None,
) -> None:
    rng = random.Random(seed)

    # Load game JSON
    with open(summary_path, encoding="utf-8") as f:
        summary_json = json.load(f)

    config   = PipelineConfig()
    scorer   = FantasyScorer(config)
    snapshot_ts = datetime.now(timezone.utc).replace(tzinfo=None)

    # Parse final player stats (this is what the game will "end at")
    player_rows = SummaryParser.parse_player_rows(summary_json, snapshot_ts, scorer)
    if not player_rows:
        print("[sim] No player rows found in JSON — aborting.")
        sys.exit(1)

    # Extract a stable event ID to use throughout simulation
    event_id = str((summary_json.get("header") or {}).get("id") or "SIM_EVENT_001")

    # Print info
    print("=" * 60)
    print(f"[sim] Loaded:    {summary_path}")
    print(f"[sim] Event ID:  {event_id}")
    print(f"[sim] Players:   {len(player_rows)}")
    print(f"[sim] Ticks:     {num_ticks}  ×  {interval}s  ({num_ticks * interval:.0f}s total)")
    print(f"[sim] WS:        ws://{host if host != '0.0.0.0' else 'localhost'}:{port}")
    print()
    print("[sim] ESPN athlete IDs being simulated:")
    for p in sorted(player_rows, key=lambda r: float(r.get("fantasy_points_total", 0)), reverse=True):
        pts = float(p.get("fantasy_points_total", 0))
        print(f"       {p['player_id']:>10}  {p['player_name']:<28}  {p['team_abbr']:<4}  {pts:.1f} pts (final)")
    print("=" * 60)
    print()

    # Build cumulative snapshots
    snapshots = build_snapshots(player_rows, num_ticks, rng, event_id)

    # WebSocket server + delta tracker
    ws_server     = WebSocketServer(host, port)
    delta_tracker = DeltaTracker()

    # Start WebSocket server as background task
    loop   = asyncio.get_running_loop()
    server_task = loop.create_task(ws_server.serve())
    await asyncio.sleep(0.2)  # let server bind before printing ready

    print("[sim] WebSocket server ready — connect your Next.js app now.")
    print("[sim] Starting simulation in 3 seconds...\n")
    await asyncio.sleep(3)

    # Replay ticks
    for tick_idx, snapshot in enumerate(snapshots):
        # Recompute fantasy points at current cumulative stats
        for row in snapshot:
            row["fantasy_points_total"] = scorer.score_player_row(row)

        deltas = delta_tracker.compute_and_update(snapshot)

        now = datetime.utcnow().strftime("%H:%M:%S")
        pct = int(((tick_idx + 1) / num_ticks) * 100)
        bar = "█" * (pct // 5) + "░" * (20 - pct // 5)

        if deltas:
            names = ", ".join(d["name"].split()[-1] for d in deltas)
            print(f"[{now}] Tick {tick_idx+1:>3}/{num_ticks}  [{bar}] {pct:>3}%  — {len(deltas)} updates: {names}")
            for delta in deltas:
                await ws_server.broadcast_delta(delta)
        else:
            print(f"[{now}] Tick {tick_idx+1:>3}/{num_ticks}  [{bar}] {pct:>3}%  — (quiet play)")

        if tick_idx < num_ticks - 1:
            await asyncio.sleep(interval)

    print()
    print("[sim] Simulation complete — all stats at final values.")
    print("[sim] WebSocket server still running. Ctrl+C to stop.")
    server_task.cancel()
    try:
        await server_task
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Live stats simulator")
    parser.add_argument("json_file", nargs="?", default="example_api_res.json",
                        help="ESPN summary JSON file to replay (default: example_api_res.json)")
    parser.add_argument("--ticks",    type=int,   default=30,    help="Number of poll cycles (default: 30)")
    parser.add_argument("--interval", type=float, default=5.0,   help="Seconds between ticks (default: 5)")
    parser.add_argument("--port",     type=int,   default=8765,  help="WebSocket port (default: 8765)")
    parser.add_argument("--host",     type=str,   default="0.0.0.0", help="WebSocket host")
    parser.add_argument("--seed",     type=int,   default=None,  help="Random seed for reproducibility")
    args = parser.parse_args()

    if not os.path.exists(args.json_file):
        print(f"[sim] File not found: {args.json_file}")
        sys.exit(1)

    try:
        asyncio.run(run_simulation(
            summary_path=args.json_file,
            num_ticks=args.ticks,
            interval=args.interval,
            host=args.host,
            port=args.port,
            seed=args.seed,
        ))
    except KeyboardInterrupt:
        print("\n[sim] Stopped.")


if __name__ == "__main__":
    main()
