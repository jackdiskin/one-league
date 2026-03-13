# ESPN Live Pipeline

This worker polls ESPN's NFL scoreboard and summary endpoints, parses live game and player stats, computes fantasy point totals, and upserts the latest state into MySQL.

## What it stores

### `live_game_states`
One row per ESPN event.

### `live_player_stats`
One row per player per event.

Stored player fields:
- passing_yards
- passing_tds
- interceptions
- rushing_yards
- rushing_tds
- receptions
- receiving_yards
- receiving_tds
- fumbles_lost
- fantasy_points_total

The worker does **not** store raw JSON blobs and does **not** keep a historical snapshot table. It is designed to maintain the current live state for your frontend/websocket layer.

## Environment variables

- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_DATABASE`
- `POLL_SECONDS`
- `REQUEST_TIMEOUT`
- `PTS_PASS_YD`
- `PTS_PASS_TD`
- `PTS_INT`
- `PTS_RUSH_YD`
- `PTS_RUSH_TD`
- `PTS_REC`
- `PTS_REC_YD`
- `PTS_REC_TD`
- `PTS_FUMBLE_LOST`

## Run demo mode

```bash
python espn_live_pipeline.py
```

Uses `SAMPLE_JSON` or defaults to `/mnt/data/example_api_res.json`.

## Run live mode

```bash
export PIPELINE_MODE=live
python espn_live_pipeline.py
```

## Frontend pattern

The intended flow is:
1. worker polls ESPN
2. worker upserts latest player/game state into MySQL
3. your websocket layer reads only the players currently being viewed
4. frontend subscribes by player ID or event ID

## Notes

- This worker treats ESPN summary stats as cumulative totals.
- Fantasy points are recomputed from the latest cumulative stats each poll.
- If you later want a chart of point changes over time, add a second append-only history table, but keep `live_player_stats` as the current-state table.
