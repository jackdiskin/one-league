#!/usr/bin/env python3
"""
seed_2026_prices.py
────────────────────────────────────────────────────────────────────────────────
Seeds player_market_state for the 2026 season using 2025 regular-season
performance data (weeks 1–18 only, matching fantasy scoring).

Pricing Design
──────────────
Goal: the $200M salary cap should be genuinely constraining. A team built with
median players at every position should cost exactly $200M. Elite players are
significantly more expensive; bargain players are significantly cheaper.

Slot budgets (× required starters = $200M total):
  QB  $22M  × 2 = $ 44M
  RB  $17M  × 3 = $ 51M
  WR  $19M  × 4 = $ 76M   ┐ (WR/TE fill 5 FLEX slots)
  TE  $19M  × 1 = $ 19M   ┘
  K   $10M  × 1 = $ 10M
  ────────────────────────
  Total           $200M  ✓

Price formula (percentile-based, anchored to median = slot budget):
  price = floor + range × percentile

  where:
    floor       = 0.4 × slot_budget   (worst active player)
    ceiling     = 1.6 × slot_budget   (best active player)
    range       = ceiling − floor = 1.2 × slot_budget
    percentile  = (rank − 1) / max(N − 1, 1)
                  rank=1 (lowest pts) → p=0.0 → floor price
                  rank=N (highest pts) → p=1.0 → ceiling price

  Players with no 2025 scoring data receive the floor price.

Results:
  • Median squad   ≈ $200M  (at the cap — must make tradeoffs)
  • Elite squad    ≈ $320M  (every elite player — impossible to afford)
  • Bargain squad  ≈ $ 80M  (all floor players)

Safety
──────
  Only touches rows WHERE season_year = 2026.
  2025 player_market_state data is never read from or written to.

Usage
─────
  pip install mysql-connector-python   # already in requirements.txt
  python scripts/seed_2026_prices.py
"""

import mysql.connector

# ── DB connection ─────────────────────────────────────────────────────────────
DB = {
    'host':     'one-league.cu9am8gksf0d.us-east-1.rds.amazonaws.com',
    'user':     'jackdiskin',
    'password': 'maddie33',
    'database': 'oneleague_db',
    'port':     3306,
}

# ── Constants ─────────────────────────────────────────────────────────────────
SEASON_2025  = 2025
SEASON_2026  = 2026
DRAFT_WEEK   = 1          # current_week must be >= 1 per DB constraint
MAX_REG_WEEK = 18         # fantasy scoring stops after regular season

# Slot budgets — calibrated so median squad = $200M cap
# (2 QB × $22M) + (3 RB × $17M) + (4 WR × $19M) + (1 TE × $19M) + (1 K × $10M) = $200M
SLOT_BUDGET = {
    'QB': 22_000_000,
    'RB': 17_000_000,
    'WR': 19_000_000,
    'TE': 19_000_000,
    'K':  10_000_000,
}

# Price range: floor = 40% of budget, ceiling = 160% of budget
FLOOR_MULT   = 0.40
CEILING_MULT = 1.60

POSITIONS = list(SLOT_BUDGET.keys())


def percentile_price(pts: float, sorted_active_pts: list[float], budget: int) -> int:
    """
    Assign a price based on where pts falls within sorted_active_pts.
    Players with pts == 0 (inactive) receive the floor price.
    """
    floor   = FLOOR_MULT   * budget
    ceiling = CEILING_MULT * budget

    if pts <= 0 or not sorted_active_pts:
        return round(floor)

    n = len(sorted_active_pts)

    # Count how many active players score strictly less than this player
    rank = sum(1 for s in sorted_active_pts if s < pts)
    # Ties: place at the bottom of their tie group (conservative — fairer for pricing)
    p = rank / max(n - 1, 1)
    p = max(0.0, min(1.0, p))

    price = floor + (ceiling - floor) * p
    return round(price)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    conn   = mysql.connector.connect(**DB)
    cursor = conn.cursor(dictionary=True)
    print('Connected.\n')

    # 1. Aggregate each player's 2025 regular-season (weeks 1–18) points
    cursor.execute("""
        SELECT p.id         AS player_id,
               p.full_name,
               p.position,
               COALESCE(SUM(pws.fantasy_points), 0) AS season_points
        FROM players p
        LEFT JOIN player_weekly_scores pws
               ON pws.player_id  = p.id
              AND pws.season_year = %s
              AND pws.week       <= %s
        WHERE p.position IN ('QB','RB','WR','TE','K')
        GROUP BY p.id, p.full_name, p.position
    """, (SEASON_2025, MAX_REG_WEEK))

    players = cursor.fetchall()
    print(f'Players found: {len(players)}')

    # 2. Build sorted active-points lists per position (for percentile ranking)
    pos_active_pts = {pos: [] for pos in POSITIONS}
    for p in players:
        pts = float(p['season_points'])
        if pts > 0:
            pos_active_pts[p['position']].append(pts)

    for pos in POSITIONS:
        pos_active_pts[pos].sort()

    print('\n── 2025 position point distributions (active players) ───')
    for pos in POSITIONS:
        pts_list = pos_active_pts[pos]
        if pts_list:
            n      = len(pts_list)
            median = pts_list[n // 2]
            print(f'  {pos}  n={n:3d}  '
                  f'min={pts_list[0]:6.1f}  median={median:6.1f}  max={pts_list[-1]:6.1f} pts')
        else:
            print(f'  {pos}  n=  0  (no active scorers — all players get floor price)')

    # 3. Calculate 2026 draft price for every player
    rows = []
    for p in players:
        pos    = p['position']
        budget = SLOT_BUDGET[pos]
        pts    = float(p['season_points'])
        price  = percentile_price(pts, pos_active_pts[pos], budget)

        rows.append({
            'player_id':     p['player_id'],
            'full_name':     p['full_name'],
            'position':      pos,
            'price':         price,
            'season_points': pts,
        })

    # 4. Sanity-check: what does a median-active-player squad cost?
    #    (Only active players — those who actually scored in 2025 — are counted.)
    print('\n── Median squad cost check (active players only) ─────────')
    REQUIRED_STARTERS = {'QB': 2, 'RB': 3, 'WR': 4, 'TE': 1, 'K': 1}
    total_median_cost = 0
    for pos, count in REQUIRED_STARTERS.items():
        active_rows = sorted(
            [r for r in rows if r['position'] == pos and r['season_points'] > 0],
            key=lambda r: r['price']
        )
        if active_rows:
            median_price = active_rows[len(active_rows) // 2]['price']
        else:
            median_price = round(FLOOR_MULT * SLOT_BUDGET[pos])
        slot_cost          = median_price * count
        total_median_cost += slot_cost
        print(f'  {pos} ×{count}  median=${median_price/1e6:.2f}M  → ${slot_cost/1e6:.1f}M')
    print(f'  {"─"*40}')
    print(f'  Total median squad cost: ${total_median_cost/1e6:.1f}M  (cap = $200M)')

    # 5. Check for existing 2026 rows
    cursor.execute(
        'SELECT COUNT(*) AS cnt FROM player_market_state WHERE season_year = %s',
        (SEASON_2026,)
    )
    existing = cursor.fetchone()['cnt']
    if existing:
        print(f'\nNote: {existing} existing 2026 rows will be overwritten (ON DUPLICATE KEY).')

    # 6. Upsert — ONLY season_year = 2026
    upsert_sql = """
        INSERT INTO player_market_state
            (player_id, season_year, current_week,
             base_weekly_price, current_price,
             buy_orders_count, sell_orders_count,
             buy_volume, sell_volume, net_order_flow,
             intraday_high, intraday_low)
        VALUES
            (%s, %s, %s, %s, %s, 0, 0, 0, 0, 0, %s, %s)
        ON DUPLICATE KEY UPDATE
            base_weekly_price  = VALUES(base_weekly_price),
            current_price      = VALUES(current_price),
            buy_orders_count   = 0,
            sell_orders_count  = 0,
            buy_volume         = 0,
            sell_volume        = 0,
            net_order_flow     = 0,
            intraday_high      = VALUES(intraday_high),
            intraday_low       = VALUES(intraday_low),
            current_week       = VALUES(current_week)
    """

    params = [
        (r['player_id'], SEASON_2026, DRAFT_WEEK, r['price'], r['price'], r['price'], r['price'])
        for r in rows
    ]
    cursor.executemany(upsert_sql, params)
    conn.commit()
    print(f'\nUpserted {cursor.rowcount} rows into player_market_state for season 2026.')

    # 7. Summary — top 25 by price
    cursor.execute("""
        SELECT p.full_name, p.position, pms.current_price
        FROM player_market_state pms
        JOIN players p ON p.id = pms.player_id
        WHERE pms.season_year = %s
        ORDER BY pms.current_price DESC
        LIMIT 25
    """, (SEASON_2026,))

    top = cursor.fetchall()
    print('\n── Top 25 players by 2026 draft price ──────────────────')
    for i, row in enumerate(top, 1):
        price_m = float(row['current_price']) / 1_000_000
        print(f'  {i:2}. {row["full_name"]:<28} {row["position"]}  ${price_m:.1f}M')
    print('─────────────────────────────────────────────────────────')

    # 8. Price distribution by position
    cursor.execute("""
        SELECT p.position,
               COUNT(*)                            AS players,
               MIN(pms.current_price)  / 1000000  AS min_m,
               AVG(pms.current_price)  / 1000000  AS avg_m,
               MAX(pms.current_price)  / 1000000  AS max_m
        FROM player_market_state pms
        JOIN players p ON p.id = pms.player_id
        WHERE pms.season_year = %s
        GROUP BY p.position
        ORDER BY AVG(pms.current_price) DESC
    """, (SEASON_2026,))

    dist = cursor.fetchall()
    print('\n── Price distribution by position ───────────────────────')
    print(f'  {"Pos":<5} {"Players":>7}  {"Min":>8}  {"Avg":>8}  {"Max":>8}')
    for row in dist:
        print(f'  {row["position"]:<5} {row["players"]:>7}  '
              f'${float(row["min_m"]):>6.1f}M  '
              f'${float(row["avg_m"]):>6.1f}M  '
              f'${float(row["max_m"]):>6.1f}M')
    print('─────────────────────────────────────────────────────────')

    cursor.close()
    conn.close()
    print('\nDone.')


if __name__ == '__main__':
    main()
