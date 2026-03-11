const mysql = require('mysql2/promise');

const DB = {
  host: 'one-league.cu9am8gksf0d.us-east-1.rds.amazonaws.com',
  user: 'jackdiskin', password: 'maddie33', database: 'oneleague_db', port: 3306
};

// Team IDs
const TEAMS = [1, 2, 3, 4];
const SEASON = 2025;
const WEEK = 9;

// Players to use with their IDs and base prices
const PLAYERS = [
  { id: 973,  name: 'Christian McCaffrey', pos: 'RB',  base: 25000000 },
  { id: 981,  name: 'Josh Allen',          pos: 'QB',  base: 26047500 },
  { id: 502,  name: "Ja'Marr Chase",       pos: 'WR',  base: 20906667 },
  { id: 195,  name: 'Bijan Robinson',      pos: 'RB',  base: 23175000 },
  { id: 450,  name: 'Caleb Williams',      pos: 'QB',  base: 22306250 },
  { id: 864,  name: 'Trey McBride',        pos: 'TE',  base: 20000000 },
  { id: 1150, name: 'James Cook',          pos: 'RB',  base: 20212500 },
  { id: 1118, name: 'Amon-Ra St. Brown',   pos: 'WR',  base: 21600000 },
  { id: 636,  name: 'Puka Nacua',          pos: 'WR',  base: 30000000 },
  { id: 925,  name: 'Jonathan Taylor',     pos: 'RB',  base: 22643750 },
  { id: 963,  name: 'Drake Maye',          pos: 'QB',  base: 26055000 },
  { id: 715,  name: 'Kyren Williams',      pos: 'RB',  base: 20037500 },
  { id: 148,  name: 'Trevor Lawrence',     pos: 'QB',  base: 22347500 },
  { id: 1300, name: "De'Von Achane",       pos: 'RB',  base: 20175000 },
  { id: 460,  name: 'Jalen Hurts',         pos: 'QB',  base: 19573750 },
];

// Transactions to seed: { teamId, playerId, type, priceDeltaPct, hoursAgo }
// Positive delta = price went up (buy pressure), negative = down (sell pressure)
const TRANSACTIONS = [
  // McCaffrey - hot, 3 buys pushing price up significantly
  { teamId: 1, playerId: 973, type: 'buy',  deltaPct:  2.1, hoursAgo: 6  },
  { teamId: 3, playerId: 973, type: 'buy',  deltaPct:  1.5, hoursAgo: 14 },
  { teamId: 4, playerId: 973, type: 'buy',  deltaPct:  0.8, hoursAgo: 22 },

  // Josh Allen - big buy, strong demand
  { teamId: 2, playerId: 981, type: 'buy',  deltaPct:  3.2, hoursAgo: 3  },
  { teamId: 4, playerId: 981, type: 'buy',  deltaPct:  1.8, hoursAgo: 18 },

  // Ja'Marr Chase - getting sold off, injury concern
  { teamId: 1, playerId: 502, type: 'sell', deltaPct: -2.8, hoursAgo: 2  },
  { teamId: 3, playerId: 502, type: 'sell', deltaPct: -1.9, hoursAgo: 9  },
  { teamId: 2, playerId: 502, type: 'sell', deltaPct: -1.1, hoursAgo: 20 },

  // Bijan Robinson - moderate sell pressure
  { teamId: 4, playerId: 195, type: 'sell', deltaPct: -1.6, hoursAgo: 5  },
  { teamId: 1, playerId: 195, type: 'sell', deltaPct: -0.9, hoursAgo: 16 },

  // Caleb Williams - huge buy spike (breakout week)
  { teamId: 2, playerId: 450, type: 'buy',  deltaPct:  4.5, hoursAgo: 1  },
  { teamId: 3, playerId: 450, type: 'buy',  deltaPct:  2.7, hoursAgo: 7  },
  { teamId: 1, playerId: 450, type: 'buy',  deltaPct:  1.3, hoursAgo: 12 },

  // Trey McBride - moderate demand
  { teamId: 3, playerId: 864, type: 'buy',  deltaPct:  1.8, hoursAgo: 4  },
  { teamId: 1, playerId: 864, type: 'buy',  deltaPct:  0.7, hoursAgo: 19 },

  // James Cook - being sold
  { teamId: 2, playerId: 1150, type: 'sell', deltaPct: -2.2, hoursAgo: 8  },
  { teamId: 4, playerId: 1150, type: 'sell', deltaPct: -1.0, hoursAgo: 21 },

  // Amon-Ra St. Brown - slight buy
  { teamId: 4, playerId: 1118, type: 'buy',  deltaPct:  1.1, hoursAgo: 11 },

  // Puka Nacua - big sell (expected, overpriced)
  { teamId: 2, playerId: 636,  type: 'sell', deltaPct: -3.5, hoursAgo: 3  },
  { teamId: 3, playerId: 636,  type: 'sell', deltaPct: -2.0, hoursAgo: 13 },

  // Jonathan Taylor - buy
  { teamId: 1, playerId: 925,  type: 'buy',  deltaPct:  1.4, hoursAgo: 6  },
  { teamId: 4, playerId: 925,  type: 'buy',  deltaPct:  0.6, hoursAgo: 17 },

  // Drake Maye - sell pressure
  { teamId: 3, playerId: 963,  type: 'sell', deltaPct: -1.7, hoursAgo: 10 },

  // Kyren Williams - buy
  { teamId: 2, playerId: 715,  type: 'buy',  deltaPct:  2.3, hoursAgo: 5  },

  // Trevor Lawrence - sell
  { teamId: 1, playerId: 148,  type: 'sell', deltaPct: -1.3, hoursAgo: 15 },

  // De'Von Achane - neutral buy
  { teamId: 4, playerId: 1300, type: 'buy',  deltaPct:  0.9, hoursAgo: 23 },

  // Jalen Hurts - small buy
  { teamId: 3, playerId: 460,  type: 'buy',  deltaPct:  1.2, hoursAgo: 8  },
];

async function main() {
  const conn = await mysql.createConnection(DB);
  console.log('Connected.');

  // Compute final prices per player (accumulate deltas)
  const playerState = {};
  for (const p of PLAYERS) {
    playerState[p.id] = { base: p.base, current: p.base, buys: 0, sells: 0, netFlow: 0 };
  }

  // Sort by hoursAgo descending (oldest first) to simulate chronological order
  const sorted = [...TRANSACTIONS].sort((a, b) => b.hoursAgo - a.hoursAgo);

  // Build transactions with price_before / price_after
  const rows = [];
  for (const tx of sorted) {
    const ps = playerState[tx.playerId];
    if (!ps) continue;

    const priceBefore = ps.current;
    const priceAfter  = Math.round(priceBefore * (1 + tx.deltaPct / 100));
    const execPrice   = Math.round((priceBefore + priceAfter) / 2);

    rows.push({
      fantasy_team_id: tx.teamId,
      player_id: tx.playerId,
      type: tx.type,
      price: execPrice,
      price_before: priceBefore,
      price_after: priceAfter,
      hoursAgo: tx.hoursAgo,
    });

    // Update running state
    ps.current = priceAfter;
    if (tx.type === 'buy')  { ps.buys++;   ps.netFlow++; }
    if (tx.type === 'sell') { ps.sells++;  ps.netFlow--; }
  }

  // Insert transactions
  console.log(`Inserting ${rows.length} transactions...`);
  for (const r of rows) {
    const createdAt = new Date(Date.now() - r.hoursAgo * 3600 * 1000);
    await conn.execute(
      `INSERT INTO player_transactions
         (fantasy_team_id, player_id, transaction_type, season_year, week, quantity, price, price_before, price_after, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [r.fantasy_team_id, r.player_id, r.type, SEASON, WEEK, r.price, r.price_before, r.price_after, createdAt]
    );
    console.log(`  ${r.type.toUpperCase()} player ${r.player_id} by team ${r.fantasy_team_id}: ${r.price_before} → ${r.price_after}`);
  }

  // Update player_market_state to reflect accumulated price changes and order counts
  console.log('\nUpdating player_market_state...');
  for (const [playerIdStr, ps] of Object.entries(playerState)) {
    const playerId = Number(playerIdStr);
    if (ps.buys === 0 && ps.sells === 0) continue;

    await conn.execute(
      `UPDATE player_market_state
       SET current_price      = ?,
           buy_orders_count   = buy_orders_count  + ?,
           sell_orders_count  = sell_orders_count + ?,
           net_order_flow     = net_order_flow    + ?
       WHERE player_id = ? AND season_year = ?`,
      [ps.current, ps.buys, ps.sells, ps.netFlow, playerId, SEASON]
    );
    const player = PLAYERS.find(p => p.id === playerId);
    const delta = ps.current - ps.base;
    const sign  = delta >= 0 ? '+' : '';
    console.log(`  ${player?.name}: $${(ps.base/1e6).toFixed(2)}M → $${(ps.current/1e6).toFixed(2)}M (${sign}${(delta/1e6).toFixed(2)}M) | B:${ps.buys} S:${ps.sells}`);
  }

  console.log('\nDone!');
  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
