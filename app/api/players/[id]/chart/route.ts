import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

// GET /api/players/[id]/chart?season_year=2025&week=10
// Returns intraday price ticks for charting
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const playerId = Number(id);
  const { searchParams } = request.nextUrl;
  const seasonYear = Number(searchParams.get('season_year'));
  const week = Number(searchParams.get('week'));

  if (!seasonYear || !week) {
    return NextResponse.json({ error: 'season_year and week are required' }, { status: 400 });
  }

  const ticks = await query<{
    price: number;
    trigger_type: string;
    created_at: string;
  }>(
    `SELECT price, trigger_type, created_at
     FROM player_price_ticks
     WHERE player_id = ? AND season_year = ? AND week = ?
     ORDER BY created_at ASC`,
    [playerId, seasonYear, week]
  );

  // Also return the week summary from player_price_weeks if available
  const [weekSummary] = await query<{
    opening_price: number;
    base_price: number;
    closing_price: number;
    total_buy_orders: number;
    total_sell_orders: number;
  }>(
    `SELECT opening_price, base_price, closing_price, total_buy_orders, total_sell_orders
     FROM player_price_weeks
     WHERE player_id = ? AND season_year = ? AND week = ?`,
    [playerId, seasonYear, week]
  );

  return NextResponse.json({ data: { ticks, week_summary: weekSummary ?? null } });
}
