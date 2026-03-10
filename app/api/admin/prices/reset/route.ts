import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { query, withTransaction } from '@/lib/mysql';
import { computeWeeklyBasePrice } from '@/lib/pricing';

function isAuthorized(request: NextRequest) {
  return request.headers.get('x-admin-secret') === process.env.ADMIN_SECRET;
}

// POST /api/admin/prices/reset
// Body: { season_year, new_week, projection_source? }
// Run this at the start of each new week, after the prior week's scores are recorded.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const {
    season_year,
    new_week,
    projection_source = 'internal_model',
  } = await request.json() as { season_year: number; new_week: number; projection_source?: string };

  if (!season_year || !new_week) {
    return NextResponse.json({ error: 'season_year and new_week are required' }, { status: 400 });
  }

  const completedWeek = new_week - 1;

  // 1. Fetch all active market states with player position
  const marketStates = await query<{
    player_id: number; position: string; current_price: number; net_order_flow: number;
  }>(
    `SELECT pms.player_id, p.position, pms.current_price, pms.net_order_flow
     FROM player_market_state pms
     JOIN players p ON p.id = pms.player_id
     WHERE pms.season_year = ?`,
    [season_year]
  );

  if (marketStates.length === 0) {
    return NextResponse.json({ data: { updated: 0 } });
  }

  const playerIds = marketStates.map((m) => m.player_id);
  const placeholders = playerIds.map(() => '?').join(',');

  // 2. Fetch last completed week's scores (batch)
  const lastWeekScores = await query<{ player_id: number; fantasy_points: number }>(
    `SELECT player_id, fantasy_points
     FROM player_weekly_scores
     WHERE season_year = ? AND week = ? AND player_id IN (${placeholders})`,
    [season_year, completedWeek, ...playerIds]
  );
  const lastWeekMap = new Map(lastWeekScores.map((r) => [r.player_id, r.fantasy_points]));

  // 3. Fetch last completed week's projections (batch)
  const projections = await query<{ player_id: number; expected_points: number }>(
    `SELECT player_id, expected_points
     FROM player_weekly_projections
     WHERE season_year = ? AND week = ? AND projection_source = ?
       AND player_id IN (${placeholders})`,
    [season_year, completedWeek, projection_source, ...playerIds]
  );
  const projectionMap = new Map(projections.map((r) => [r.player_id, r.expected_points]));

  // 4. Fetch recent 6 weeks of scores for momentum (all players, batch)
  const momentumRows = await query<{ player_id: number; week: number; fantasy_points: number }>(
    `SELECT player_id, week, fantasy_points
     FROM player_weekly_scores
     WHERE season_year = ? AND week BETWEEN ? AND ? AND player_id IN (${placeholders})
     ORDER BY player_id, week DESC`,
    [season_year, Math.max(1, completedWeek - 6), completedWeek - 1, ...playerIds]
  ) as RowDataPacket[] as { player_id: number; week: number; fantasy_points: number }[];

  // Group momentum points by player (newest-first, excluding the just-completed week)
  const momentumMap = new Map<number, number[]>();
  for (const row of momentumRows) {
    const arr = momentumMap.get(row.player_id) ?? [];
    arr.push(row.fantasy_points);
    momentumMap.set(row.player_id, arr);
  }

  // 5. Compute new prices and persist
  let updated = 0;

  await withTransaction(async (conn) => {
    for (const state of marketStates) {
      const { player_id, position, current_price, net_order_flow } = state;

      const newBasePrice = computeWeeklyBasePrice({
        prevClosingPrice: current_price,
        position,
        lastWeekPoints: lastWeekMap.get(player_id) ?? null,
        expectedPoints: projectionMap.get(player_id) ?? null,
        recentPoints: momentumMap.get(player_id) ?? [],
        netOrderFlow: net_order_flow,
      });

      // Archive last week's closing price in player_price_weeks
      await conn.execute(
        `INSERT INTO player_price_weeks
           (player_id, season_year, week, opening_price, base_price, closing_price,
            performance_adjustment, market_adjustment,
            total_buy_orders, total_sell_orders, total_buy_volume, total_sell_volume)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0)
         ON DUPLICATE KEY UPDATE
           closing_price = VALUES(closing_price)`,
        [player_id, season_year, completedWeek, current_price, current_price, current_price]
      );

      // Open the new week row
      await conn.execute(
        `INSERT INTO player_price_weeks
           (player_id, season_year, week, opening_price, base_price, closing_price)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           opening_price = VALUES(opening_price),
           base_price    = VALUES(base_price),
           closing_price = VALUES(closing_price)`,
        [player_id, season_year, new_week, current_price, newBasePrice, newBasePrice]
      );

      // Reset market state for the new week
      await conn.execute(
        `UPDATE player_market_state SET
           current_week       = ?,
           base_weekly_price  = ?,
           current_price      = ?,
           buy_orders_count   = 0,
           sell_orders_count  = 0,
           buy_volume         = 0,
           sell_volume        = 0,
           net_order_flow     = 0,
           intraday_high      = ?,
           intraday_low       = ?,
           last_trade_at      = NULL
         WHERE player_id = ? AND season_year = ?`,
        [new_week, newBasePrice, newBasePrice, newBasePrice, newBasePrice, player_id, season_year]
      );

      // Record the weekly reset tick
      await conn.execute(
        `INSERT INTO player_price_ticks (player_id, season_year, week, price, trigger_type)
         VALUES (?, ?, ?, ?, 'weekly_reset')`,
        [player_id, season_year, new_week, newBasePrice]
      );

      updated++;
    }
  });

  return NextResponse.json({ data: { updated, season_year, new_week } });
}
