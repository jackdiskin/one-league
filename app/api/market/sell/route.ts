import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';
import { applySellImpact, sellProceeds } from '@/lib/pricing';

// POST /api/market/sell
// Body: { fantasy_team_id, player_id, week }
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { fantasy_team_id, player_id, week } = await request.json();

  if (!fantasy_team_id || !player_id || !week) {
    return NextResponse.json({ error: 'fantasy_team_id, player_id, and week are required' }, { status: 400 });
  }

  // Verify the user owns this fantasy team
  const [team] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE id = ? AND user_id = ?`,
    [fantasy_team_id, userId]
  );
  if (!team) return NextResponse.json({ error: 'Fantasy team not found' }, { status: 404 });

  // Verify player is on active roster
  const [rosterEntry] = await query<{ id: number; purchase_price: number }>(
    `SELECT id, purchase_price FROM fantasy_team_roster
     WHERE fantasy_team_id = ? AND player_id = ? AND is_active = TRUE`,
    [fantasy_team_id, player_id]
  );
  if (!rosterEntry) return NextResponse.json({ error: 'Player not on active roster' }, { status: 400 });

  // Get current market state
  const [marketState] = await query<{ current_price: number; season_year: number }>(
    `SELECT current_price, season_year FROM player_market_state WHERE player_id = ?`,
    [player_id]
  );
  if (!marketState) return NextResponse.json({ error: 'Player has no active market state' }, { status: 404 });

  const { current_price, season_year } = marketState;

  // Seller receives current_price minus the bid-ask spread
  const proceeds = sellProceeds(current_price);
  // Market price moves down by the standard impact rate
  const newMarketPrice = applySellImpact(current_price);

  const result = await withTransaction(async (conn) => {
    // 1. Update market state
    await conn.execute(
      `UPDATE player_market_state SET
         current_price      = ?,
         sell_orders_count  = sell_orders_count + 1,
         sell_volume        = sell_volume + 1,
         net_order_flow     = net_order_flow - 1,
         intraday_low       = LEAST(intraday_low, ?),
         last_trade_at      = NOW()
       WHERE player_id = ? AND season_year = ?`,
      [newMarketPrice, newMarketPrice, player_id, season_year]
    );

    // 2. Record transaction (price = what seller receives, price_after = new market price)
    const [txResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO player_transactions
         (fantasy_team_id, player_id, transaction_type, season_year, week, price, price_before, price_after)
       VALUES (?, ?, 'sell', ?, ?, ?, ?, ?)`,
      [fantasy_team_id, player_id, season_year, week, proceeds, current_price, newMarketPrice]
    );
    const transactionId = txResult.insertId;

    // 3. Record price tick
    await conn.execute(
      `INSERT INTO player_price_ticks
         (player_id, season_year, week, price, trigger_type, reference_transaction_id)
       VALUES (?, ?, ?, ?, 'sell', ?)`,
      [player_id, season_year, week, newMarketPrice, transactionId]
    );

    // 4. Return proceeds to team budget
    await conn.execute(
      `UPDATE fantasy_teams SET budget_remaining = budget_remaining + ? WHERE id = ?`,
      [proceeds, fantasy_team_id]
    );

    // 5. Mark roster entry as sold
    await conn.execute(
      `UPDATE fantasy_team_roster SET
         is_active  = FALSE,
         sold_week  = ?,
         sold_price = ?
       WHERE id = ?`,
      [week, proceeds, rosterEntry.id]
    );

    // 6. Update weekly price ledger
    await conn.execute(
      `INSERT INTO player_price_weeks
         (player_id, season_year, week, opening_price, base_price, closing_price,
          total_sell_orders, total_sell_volume)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE
         total_sell_orders = total_sell_orders + 1,
         total_sell_volume = total_sell_volume + 1,
         closing_price     = VALUES(closing_price)`,
      [player_id, season_year, week, current_price, current_price, newMarketPrice]
    );

    return {
      transaction_id: transactionId,
      proceeds,
      spread_cost: current_price - proceeds,
      new_market_price: newMarketPrice,
    };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
