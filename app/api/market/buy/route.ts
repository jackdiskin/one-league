import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';
import { applyBuyImpact } from '@/lib/pricing';

// POST /api/market/buy
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
  const [team] = await query<{ id: number; budget_remaining: number; league_id: number }>(
    `SELECT id, budget_remaining, league_id FROM fantasy_teams WHERE id = ? AND user_id = ?`,
    [fantasy_team_id, userId]
  );
  if (!team) return NextResponse.json({ error: 'Fantasy team not found' }, { status: 404 });

  // Get current market state
  const [marketState] = await query<{ current_price: number; season_year: number }>(
    `SELECT current_price, season_year FROM player_market_state WHERE player_id = ?`,
    [player_id]
  );
  if (!marketState) return NextResponse.json({ error: 'Player has no active market state' }, { status: 404 });

  const { current_price: executionPrice, season_year } = marketState;

  if (team.budget_remaining < executionPrice) {
    return NextResponse.json({ error: 'Insufficient budget' }, { status: 400 });
  }

  // Cannot buy a player already on active roster
  const [alreadyOwned] = await query<{ id: number }>(
    `SELECT id FROM fantasy_team_roster
     WHERE fantasy_team_id = ? AND player_id = ? AND is_active = TRUE`,
    [fantasy_team_id, player_id]
  );
  if (alreadyOwned) return NextResponse.json({ error: 'Player already on roster' }, { status: 409 });

  // Enforce roster quota (11 total; 2 QB, 3 RB, 5 WR/TE combined, 1 K)
  const QUOTA = { QB: 2, RB: 3, FLEX: 5, K: 1 };
  const [playerPos] = await query<{ position: string }>(
    `SELECT position FROM players WHERE id = ?`, [player_id]
  );
  if (!playerPos) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  const posCounts = await query<{ position: string; cnt: number }>(
    `SELECT p.position, COUNT(*) AS cnt
     FROM fantasy_team_roster ftr
     JOIN players p ON p.id = ftr.player_id
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE
     GROUP BY p.position`,
    [fantasy_team_id]
  );
  const countMap    = Object.fromEntries(posCounts.map(r => [r.position, Number(r.cnt)]));
  const rosterTotal = Object.values(countMap).reduce((s, n) => s + n, 0);
  const flexCount   = (countMap.WR ?? 0) + (countMap.TE ?? 0);

  if (rosterTotal >= 11) {
    return NextResponse.json({ error: 'Roster full — sell a player first' }, { status: 409 });
  }
  if (playerPos.position === 'QB' && (countMap.QB ?? 0) >= QUOTA.QB) {
    return NextResponse.json({ error: `QB slots full (max ${QUOTA.QB})` }, { status: 409 });
  }
  if (playerPos.position === 'RB' && (countMap.RB ?? 0) >= QUOTA.RB) {
    return NextResponse.json({ error: `RB slots full (max ${QUOTA.RB})` }, { status: 409 });
  }
  if ((playerPos.position === 'WR' || playerPos.position === 'TE') && flexCount >= QUOTA.FLEX) {
    return NextResponse.json({ error: `WR/TE slots full (max ${QUOTA.FLEX})` }, { status: 409 });
  }
  if (playerPos.position === 'K' && (countMap.K ?? 0) >= QUOTA.K) {
    return NextResponse.json({ error: `K slot full (max ${QUOTA.K})` }, { status: 409 });
  }

  const newPrice = applyBuyImpact(executionPrice);

  const result = await withTransaction(async (conn) => {
    // 1. Update market state
    await conn.execute(
      `UPDATE player_market_state SET
         current_price      = ?,
         buy_orders_count   = buy_orders_count + 1,
         buy_volume         = buy_volume + 1,
         net_order_flow     = net_order_flow + 1,
         intraday_high      = GREATEST(intraday_high, ?),
         last_trade_at      = NOW()
       WHERE player_id = ? AND season_year = ?`,
      [newPrice, newPrice, player_id, season_year]
    );

    // 2. Record transaction
    const [txResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO player_transactions
         (fantasy_team_id, player_id, transaction_type, season_year, week, price, price_before, price_after)
       VALUES (?, ?, 'buy', ?, ?, ?, ?, ?)`,
      [fantasy_team_id, player_id, season_year, week, executionPrice, executionPrice, newPrice]
    );
    const transactionId = txResult.insertId;

    // 3. Record price tick
    await conn.execute(
      `INSERT INTO player_price_ticks
         (player_id, season_year, week, price, trigger_type, reference_transaction_id)
       VALUES (?, ?, ?, ?, 'buy', ?)`,
      [player_id, season_year, week, newPrice, transactionId]
    );

    // 4. Deduct from team budget
    await conn.execute(
      `UPDATE fantasy_teams SET
         budget_remaining = budget_remaining - ?,
         total_spent      = total_spent + ?
       WHERE id = ?`,
      [executionPrice, executionPrice, fantasy_team_id]
    );

    // 5. Remove any prior sold record for this player so re-buys can be tracked cleanly
    await conn.execute(
      `DELETE FROM fantasy_team_roster
       WHERE fantasy_team_id = ? AND player_id = ? AND is_active = FALSE`,
      [fantasy_team_id, player_id]
    );

    // 6. Add player to roster
    await conn.execute(
      `INSERT INTO fantasy_team_roster
         (fantasy_team_id, player_id, acquisition_type, purchase_price, acquired_week)
       VALUES (?, ?, 'market_buy', ?, ?)`,
      [fantasy_team_id, player_id, executionPrice, week]
    );

    // 7. Update weekly price ledger (upsert — handles case where weekly reset hasn't run yet)
    await conn.execute(
      `INSERT INTO player_price_weeks
         (player_id, season_year, week, opening_price, base_price, closing_price,
          total_buy_orders, total_buy_volume)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE
         total_buy_orders  = total_buy_orders + 1,
         total_buy_volume  = total_buy_volume + 1,
         closing_price     = VALUES(closing_price)`,
      [player_id, season_year, week, executionPrice, executionPrice, newPrice]
    );

    return { transaction_id: transactionId, execution_price: executionPrice, new_market_price: newPrice };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
