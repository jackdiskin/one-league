import Image from 'next/image';
import { query } from '@/lib/mysql';
import { formatPrice, formatPct } from '@/lib/format';

interface Props { seasonYear: number }

interface Mover {
  player_id: number; full_name: string; position: string;
  team_code: string; headshot_url: string | null;
  current_price: number; prev_price: number; pct_change: number;
}

interface PricePoint { player_id: number; closing_price: number }

// Simple SVG sparkline
function Sparkline({ prices, up }: { prices: number[]; up: boolean }) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 56; const H = 22;
  const pts = prices
    .map((p, i) => `${(i / (prices.length - 1)) * W},${H - ((p - min) / range) * H}`)
    .join(' ');
  return (
    <svg width={W} height={H} className="overflow-visible shrink-0">
      <polyline points={pts} fill="none"
        stroke={up ? '#10b981' : '#f43f5e'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

const POSITION_COLORS: Record<string, string> = {
  QB: 'bg-blue-100 text-blue-700',
  RB: 'bg-emerald-100 text-emerald-700',
  WR: 'bg-amber-100 text-amber-700',
  TE: 'bg-purple-100 text-purple-700',
  K:  'bg-slate-100 text-slate-600',
};

async function fetchMovers(seasonYear: number, maxWeek: number, direction: 'gainers' | 'losers') {
  return query<Mover>(
    `SELECT p.id AS player_id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price,
            ppw_prev.closing_price AS prev_price,
            (pms.current_price - ppw_prev.closing_price) / ppw_prev.closing_price * 100 AS pct_change
     FROM player_market_state pms
     JOIN players p ON p.id = pms.player_id
     JOIN player_price_weeks ppw_curr
       ON ppw_curr.player_id = pms.player_id AND ppw_curr.season_year = ? AND ppw_curr.week = ?
     JOIN player_price_weeks ppw_prev
       ON ppw_prev.player_id = pms.player_id AND ppw_prev.season_year = ? AND ppw_prev.week = ?
     WHERE pms.season_year = ? AND ppw_prev.closing_price > 0
     ORDER BY pct_change ${direction === 'gainers' ? 'DESC' : 'ASC'}
     LIMIT 5`,
    [seasonYear, maxWeek, seasonYear, maxWeek - 1, seasonYear]
  );
}

function MoverRow({ mover, up }: { mover: Mover & { sparkPrices: number[] }; up: boolean }) {
  const lastName = mover.full_name.split(' ').slice(1).join(' ') || mover.full_name;
  return (
    <div className="group flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200 cursor-pointer hover:ring-slate-200 hover:shadow-sm transition-all">
      <div className="flex items-center gap-3 min-w-0">
        {mover.headshot_url ? (
          <Image src={mover.headshot_url} alt={mover.full_name}
            width={48} height={48}
            className="h-12 w-12 rounded-full object-cover border border-slate-100 shrink-0"
            unoptimized
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-sm font-bold text-slate-500 shrink-0">
            {mover.full_name[0]}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${POSITION_COLORS[mover.position] ?? 'bg-slate-100 text-slate-600'}`}>
              {mover.position}
            </span>
            <span className="text-xs text-slate-500 shrink-0">{mover.team_code}</span>
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-emerald-700 transition-colors">{lastName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <Sparkline prices={mover.sparkPrices} up={up} />
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">{formatPrice(mover.current_price)}</p>
          <p className={`text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
            {formatPct(mover.pct_change)}
          </p>
        </div>
        <div className={`h-8 w-8 rounded-xl flex items-center justify-center ring-1 shrink-0 ${
          up ? 'bg-emerald-50 ring-emerald-200 text-emerald-700' : 'bg-rose-50 ring-rose-200 text-rose-600'
        }`}>
          {up ? '↗' : '↘'}
        </div>
      </div>
    </div>
  );
}

export default async function TopMovers({ seasonYear }: Props) {
  // Use the two most recent weeks in price history (robust to market_state.current_week lag)
  const [weekRow] = await query<{ max_week: number }>(
    `SELECT MAX(week) AS max_week FROM player_price_weeks WHERE season_year = ?`,
    [seasonYear]
  );
  const maxWeek = weekRow?.max_week ?? 0;
  if (maxWeek < 2) return null;

  const [gainers, losers] = await Promise.all([
    fetchMovers(seasonYear, maxWeek, 'gainers'),
    fetchMovers(seasonYear, maxWeek, 'losers'),
  ]);

  if (!gainers.length && !losers.length) return null;

  // Fetch 6-week sparkline prices for all movers in one query
  const allIds = [...gainers, ...losers].map((m) => m.player_id);
  const sparkData = allIds.length
    ? await query<PricePoint>(
        `SELECT player_id, closing_price FROM player_price_weeks
         WHERE season_year = ? AND player_id IN (${allIds.map(() => '?').join(',')})
           AND week >= ? AND week <= ?
         ORDER BY player_id, week ASC`,
        [seasonYear, ...allIds, Math.max(1, maxWeek - 5), maxWeek]
      )
    : [];

  const sparkMap = new Map<number, number[]>();
  for (const row of sparkData) {
    const arr = sparkMap.get(row.player_id) ?? [];
    arr.push(Number(row.closing_price));
    sparkMap.set(row.player_id, arr);
  }

  const enrich = (m: Mover) => ({ ...m, sparkPrices: sparkMap.get(m.player_id) ?? [Number(m.prev_price), Number(m.current_price)] });

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Gainers */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">↑</span>
          <h3 className="font-semibold text-slate-900">Top Gainers</h3>
          <span className="ml-auto text-xs text-slate-400">Wk {maxWeek}</span>
        </div>
        <div className="space-y-2">
          {gainers.map((m) => <MoverRow key={m.player_id} mover={enrich(m)} up={true} />)}
        </div>
      </div>

      {/* Losers */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600 text-xs font-bold">↓</span>
          <h3 className="font-semibold text-slate-900">Top Losers</h3>
          <span className="ml-auto text-xs text-slate-400">Wk {maxWeek}</span>
        </div>
        <div className="space-y-2">
          {losers.map((m) => <MoverRow key={m.player_id} mover={enrich(m)} up={false} />)}
        </div>
      </div>
    </div>
  );
}
