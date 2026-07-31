import Image from 'next/image';
import { query } from '@/lib/mysql';
import { formatPrice, formatPct, formatWeek, formatPlayerName } from '@/lib/format';
import ClickablePlayerRow from '@/components/ClickablePlayerRow';
import SectionHeader from '@/components/ui/SectionHeader';
import PositionChip from '@/components/ui/PositionChip';
import Icon from '@/components/ui/Icon';
import TeamLogo from '@/components/TeamLogo';
import { getNextMatchupByTeam } from '@/lib/schedule';

const SCHEDULE_SEASON = 2026;

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

function MoverRow({ mover, up, season, matchups }: {
  mover: Mover & { sparkPrices: number[] }; up: boolean; season: number;
  matchups: Record<string, import('@/lib/schedule').Matchup>;
}) {
  const displayName = formatPlayerName(mover.full_name);
  return (
    <ClickablePlayerRow
      playerId={mover.player_id}
      season={season}
      className="group flex items-center justify-between rounded-control border border-line bg-surface p-3 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:bg-surface-sunken"
    >
      <div className="flex items-center gap-3 min-w-0">
        {mover.headshot_url ? (
          <Image src={mover.headshot_url} alt={mover.full_name}
            width={48} height={48}
            className="h-12 w-12 object-contain shrink-0"
            unoptimized
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-emerald-tint text-body text-emerald">
            {mover.full_name[0]}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="truncate text-body font-medium text-ink">{displayName}</p>
            <PositionChip label={mover.position} />
            <TeamLogo code={mover.team_code} size={12} />
            <span className="shrink-0 text-label text-ink-3">{mover.team_code}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <Sparkline prices={mover.sparkPrices} up={up} />
        <div className="text-right">
          <p className="font-mono tabular-nums text-body text-ink">{formatPrice(mover.current_price)}</p>
          <p className={`font-mono tabular-nums text-label ${up ? 'text-up' : 'text-down'}`}>
            {formatPct(mover.pct_change)}
          </p>
        </div>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${
          up ? 'bg-emerald-tint text-up' : 'bg-surface-sunken text-down'
        }`}>
          <Icon name="arrowRight" size={14} className={up ? '-rotate-45' : 'rotate-45'} />
        </div>
      </div>
    </ClickablePlayerRow>
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

  const [gainers, losers, matchups] = await Promise.all([
    fetchMovers(seasonYear, maxWeek, 'gainers'),
    fetchMovers(seasonYear, maxWeek, 'losers'),
    getNextMatchupByTeam(SCHEDULE_SEASON),
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
      <div className="rounded-card border border-line bg-surface p-5">
        <SectionHeader
          title="Top gainers"
          right={<span className="font-mono tabular-nums text-label text-ink-3">{formatWeek(maxWeek)}</span>}
        />
        <div className="mt-4 flex flex-col gap-2">
          {gainers.map((m) => <MoverRow key={m.player_id} mover={enrich(m)} up={true} season={seasonYear} matchups={matchups} />)}
        </div>
      </div>

      {/* Losers */}
      <div className="rounded-card border border-line bg-surface p-5">
        <SectionHeader
          title="Top losers"
          right={<span className="font-mono tabular-nums text-label text-ink-3">{formatWeek(maxWeek)}</span>}
        />
        <div className="mt-4 flex flex-col gap-2">
          {losers.map((m) => <MoverRow key={m.player_id} mover={enrich(m)} up={false} season={seasonYear} matchups={matchups} />)}
        </div>
      </div>
    </div>
  );
}
