#!/usr/bin/env python3
"""
ws_test_client.py — Minimal WebSocket client for watching live stat deltas.

Connects to a running pipeline (real or simulate_sportsdata.py), subscribes
to one or more player IDs, and prints every delta message as it arrives.
This is the same protocol useLiveStats.ts uses in the Next.js app.

Usage:
    python ws_test_client.py 17959 19801            # subscribe to specific PlayerIDs
    python ws_test_client.py --all                   # print every delta, no subscribe filter
    python ws_test_client.py --url ws://localhost:8765 17959
"""
from __future__ import annotations

import argparse
import asyncio
import json

import websockets


async def listen(url: str, player_ids: list[str], show_all: bool) -> None:
    print(f"[client] connecting to {url} ...")
    async with websockets.connect(url) as ws:
        if player_ids and not show_all:
            await ws.send(json.dumps({"subscribe": player_ids}))
            print(f"[client] subscribed to: {', '.join(player_ids)}")
        else:
            print("[client] no subscribe filter — server only pushes to subscribed IDs, "
                  "so pass player IDs unless the server is patched to broadcast to all.")
        print("[client] listening for deltas (Ctrl+C to stop)...\n")

        async for raw in ws:
            msg = json.loads(raw)
            delta = msg.get("delta", {})
            totals = msg.get("totals", {})
            delta_str = ", ".join(f"{k}+{v:g}" for k, v in delta.items() if v)
            print(f"[{msg.get('name')}] {delta_str}  ->  total pts = {totals.get('fantasyPointsTotal', '?')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Watch live stat deltas over WebSocket")
    parser.add_argument("player_ids", nargs="*", help="SportsDataIO PlayerIDs to subscribe to")
    parser.add_argument("--url", default="ws://localhost:8765", help="WebSocket URL")
    parser.add_argument("--all", action="store_true", help="Skip subscribe filter (diagnostic only)")
    args = parser.parse_args()

    try:
        asyncio.run(listen(args.url, args.player_ids, args.all))
    except KeyboardInterrupt:
        print("\n[client] Stopped.")


if __name__ == "__main__":
    main()
