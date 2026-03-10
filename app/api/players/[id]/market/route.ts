import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

// GET /api/players/[id]/market?season_year=2025
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const playerId = Number(id);
  const seasonYear = Number(request.nextUrl.searchParams.get('season_year'));

  if (!seasonYear) {
    return NextResponse.json({ error: 'season_year is required' }, { status: 400 });
  }

  const [state] = await query<{
    player_id: number;
    full_name: string;
    short_name: string;
    team_code: string;
    position: string;
    status: string;
    headshot_url: string | null;
    season_year: number;
    current_week: number;
    base_weekly_price: number;
    current_price: number;
    buy_orders_count: number;
    sell_orders_count: number;
    net_order_flow: number;
    intraday_high: number;
    intraday_low: number;
    last_trade_at: string | null;
  }>(
    `SELECT
       p.id AS player_id, p.full_name, p.short_name, p.team_code, p.position, p.status, p.headshot_url,
       pms.season_year, pms.current_week, pms.base_weekly_price, pms.current_price,
       pms.buy_orders_count, pms.sell_orders_count, pms.net_order_flow,
       pms.intraday_high, pms.intraday_low, pms.last_trade_at
     FROM player_market_state pms
     JOIN players p ON p.id = pms.player_id
     WHERE pms.player_id = ? AND pms.season_year = ?`,
    [playerId, seasonYear]
  );

  if (!state) return NextResponse.json({ error: 'Market state not found' }, { status: 404 });

  return NextResponse.json({ data: state });
}
