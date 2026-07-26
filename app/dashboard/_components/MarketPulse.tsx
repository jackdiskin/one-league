import Image from 'next/image';
import { query } from '@/lib/mysql';
import { formatPrice } from '@/lib/format';
import ClickablePlayerRow from '@/components/ClickablePlayerRow';
import MatchupBadge from '@/components/MatchupBadge';
import { getNextMatchupByTeam } from '@/lib/schedule';

const SCHEDULE_SEASON = 2026;

interface Props { seasonYear: number }


export default async function MarketPulse({ seasonYear }: Props) {
  // Use actual transaction ledger for counts so this renders even when
  // market_state order counters haven't been incremented (e.g. after direct seeding).
  const players = await query<{
    player_id: number; full_name: string; position: string; team_code: string; headshot_url: string | null;
    current_price: number; buy_orders_count: number; sell_orders_count: number; net_order_flow: number;
  }>(
    `SELECT p.id AS player_id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price,
            COALESCE(SUM(pt.transaction_type = 'buy'),  0) AS buy_orders_count,
            COALESCE(SUM(pt.transaction_type = 'sell'), 0) AS sell_orders_count,
            COALESCE(SUM(pt.transaction_type = 'buy'), 0) -
            COALESCE(SUM(pt.transaction_type = 'sell'), 0) AS net_order_flow
     FROM player_market_state pms
     JOIN players p ON p.id = pms.player_id
     LEFT JOIN player_transactions pt
            ON pt.player_id = pms.player_id AND pt.season_year = pms.season_year
     WHERE pms.season_year = ?
     GROUP BY pms.player_id, p.full_name, p.position, p.team_code, p.headshot_url, pms.current_price
     ORDER BY (buy_orders_count + sell_orders_count) DESC, pms.current_price DESC
     LIMIT 6`,
    [seasonYear]
  );

  if (!players.length) return null;

  const matchups = await getNextMatchupByTeam(SCHEDULE_SEASON);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        <h3 className="font-semibold text-slate-900">Market Pulse</h3>
      </div>

      <div className="space-y-3">
        {players.map((p) => {
          const total  = p.buy_orders_count + p.sell_orders_count;
          const buyPct = total > 0 ? (p.buy_orders_count / total) * 100 : 50;
          const netUp  = p.net_order_flow >= 0;
          const lastName = p.full_name.split(' ').slice(1).join(' ') || p.full_name;

          return (
            <ClickablePlayerRow
              key={p.player_id}
              playerId={p.player_id}
              season={seasonYear}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50 transition-colors -mx-2"
            >
              {p.headshot_url ? (
                <Image src={p.headshot_url} alt={p.full_name}
                  width={36} height={36}
                  className="h-9 w-9 object-contain shrink-0"
                  unoptimized
                />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                  {p.full_name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold shrink-0 bg-slate-100 text-slate-600">
                      {p.position}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 truncate">{lastName}</span>
                    <MatchupBadge matchup={matchups[p.team_code]} />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-[10px] text-emerald-600 font-medium">{p.buy_orders_count}B</span>
                    <span className="text-[10px] text-rose-500 font-medium">{p.sell_orders_count}S</span>
                    <span className={`text-xs font-semibold ${netUp ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {formatPrice(p.current_price)}
                    </span>
                  </div>
                </div>
                {/* Buy pressure bar */}
                <div className="h-1.5 w-full rounded-full bg-rose-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${buyPct}%` }} />
                </div>
              </div>
            </ClickablePlayerRow>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
        Green = buy pressure · Red = sell pressure
      </p>
    </div>
  );
}
