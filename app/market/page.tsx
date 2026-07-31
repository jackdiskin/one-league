import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPrice, formatWeekLong, formatPlayerName } from '@/lib/format';
import SeasonModeSwitcher from '@/app/dashboard/_components/SeasonModeSwitcher';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import ClickablePlayerRow from '@/components/ClickablePlayerRow';
import PositionChip from '@/components/ui/PositionChip';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import TeamLogo from '@/components/TeamLogo';
import MatchupBadge from '@/components/MatchupBadge';
import { getNextMatchupByTeam } from '@/lib/schedule';

const PREV_SEASON = 2025;
const SCHEDULE_SEASON = 2026;

type MoverRow = {
  id: number; full_name: string; position: string; team_code: string; headshot_url: string | null;
  current_price: number; base_weekly_price: number; price_delta: number;
  net_order_flow: number; buy_orders_count: number; sell_orders_count: number;
  last_week_points: number | null;
};

type TradedRow = {
  id: number; full_name: string; position: string; team_code: string; headshot_url: string | null;
  current_price: number; buy_orders_count: number; sell_orders_count: number;
  total_orders: number; net_order_flow: number;
};

type RecentTx = {
  id: number; transaction_type: 'buy' | 'sell'; week: number;
  price: number; price_before: number; price_after: number; created_at: string;
  team_name: string; user_name: string;
  full_name: string; position: string; team_code: string; headshot_url: string | null;
};

// ── Queries ────────────────────────────────────────────────────────────────
async function fetchCurrentWeek(season: number): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [season]
  );
  return row?.w ?? 1;
}

async function fetchLastScoreWeek(season: number): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [season]
  );
  return row?.w ?? 1;
}

async function fetchUserLeagues(userId: string): Promise<SidebarLeague[]> {
  return query<SidebarLeague>(
    `SELECT l.id, l.name, l.season_year,
            ft.team_name,
            CASE WHEN ft.id IS NOT NULL THEN
              (SELECT COUNT(*) + 1
               FROM fantasy_teams ft2
               JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
               WHERE ft2.season_year = l.season_year AND ft2.total_points > ft.total_points)
            ELSE NULL END AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.user_id = ? AND ft.season_year = l.season_year
     WHERE lm.user_id = ?
     ORDER BY l.created_at DESC`,
    [userId, userId]
  );
}

async function fetchMovers(season: number, lastWeek: number): Promise<MoverRow[]> {
  return query<MoverRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.base_weekly_price,
            (pms.current_price - pms.base_weekly_price) AS price_delta,
            pms.net_order_flow, pms.buy_orders_count, pms.sell_orders_count,
            pws.fantasy_points AS last_week_points
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = p.id AND pws.season_year = ? AND pws.week = ?
     WHERE p.position IN ('QB','RB','WR','TE')
       AND pms.base_weekly_price > 0
     ORDER BY ABS(pms.current_price - pms.base_weekly_price) DESC
     LIMIT 20`,
    [season, season, lastWeek]
  );
}

async function fetchMostTraded(season: number): Promise<TradedRow[]> {
  return query<TradedRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.buy_orders_count, pms.sell_orders_count,
            (pms.buy_orders_count + pms.sell_orders_count) AS total_orders,
            pms.net_order_flow
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE')
       AND (pms.buy_orders_count + pms.sell_orders_count) > 0
     ORDER BY total_orders DESC
     LIMIT 10`,
    [season]
  );
}

async function fetchHighDemand(season: number): Promise<TradedRow[]> {
  return query<TradedRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.buy_orders_count, pms.sell_orders_count,
            (pms.buy_orders_count + pms.sell_orders_count) AS total_orders,
            pms.net_order_flow
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE')
       AND pms.net_order_flow > 0
     ORDER BY pms.net_order_flow DESC
     LIMIT 10`,
    [season]
  );
}

async function fetchSellPressure(season: number): Promise<TradedRow[]> {
  return query<TradedRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.buy_orders_count, pms.sell_orders_count,
            (pms.buy_orders_count + pms.sell_orders_count) AS total_orders,
            pms.net_order_flow
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE')
       AND pms.net_order_flow < 0
     ORDER BY pms.net_order_flow ASC
     LIMIT 10`,
    [season]
  );
}

async function fetchRecentTransactions(season: number): Promise<RecentTx[]> {
  return query<RecentTx>(
    `SELECT pt.id, pt.transaction_type, pt.week, pt.price, pt.price_before, pt.price_after, pt.created_at,
            ft.team_name, u.name AS user_name,
            p.full_name, p.position, p.team_code, p.headshot_url
     FROM player_transactions pt
     JOIN fantasy_teams ft ON ft.id = pt.fantasy_team_id
     JOIN \`user\` u ON u.id = ft.user_id
     JOIN players p ON p.id = pt.player_id
     WHERE pt.season_year = ?
     ORDER BY pt.created_at DESC, pt.id DESC
     LIMIT 12`,
    [season]
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────
function formatTime(val: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(val));
}

function PosBadge({ pos }: { pos: string }) {
  return <PositionChip label={pos} />;
}

function PlayerAvatar({ player, size = 32 }: { player: { headshot_url: string | null; full_name: string }; size?: number }) {
  return player.headshot_url ? (
    <Image
      src={player.headshot_url} alt="" width={size} height={size} unoptimized
      className="block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-pill bg-emerald-tint text-emerald"
      style={{ width: size, height: size }}
    >
      {player.full_name[0]}
    </div>
  );
}

function SectionCard({ title, sub, badge, dark, children }: {
  title: string; sub?: string; badge?: string; dark?: boolean; children: React.ReactNode;
}) {
  return (
    // Dark is reserved for live/market-state data — see the dark-panel ruling.
    <div className={[
      'overflow-hidden rounded-card border',
      dark ? 'border-ink bg-ink' : 'border-line bg-surface',
    ].join(' ')}>
      <div className={[
        'flex items-center justify-between gap-3 border-b px-5 py-3',
        dark ? 'border-turf-chalk/10' : 'border-line',
      ].join(' ')}>
        <div>
          <h3 className={['text-section', dark ? 'text-turf-chalk' : 'text-ink'].join(' ')}>{title}</h3>
          {sub && (
            <p className={['mt-0.5 text-label', dark ? 'text-turf-chalk/50' : 'text-ink-3'].join(' ')}>{sub}</p>
          )}
        </div>
        {badge && (
          <span className={[
            'shrink-0 rounded-pill border px-2.5 py-1 font-mono tabular-nums text-eyebrow',
            dark
              ? 'border-turf-chalk/15 bg-turf-chalk/10 text-turf-chalk/60'
              : 'border-line bg-surface-sunken text-ink-2',
          ].join(' ')}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Empty state for a dark panel. The light panels use the shared EmptyState,
 * which is built for the light surface and has no dark treatment.
 */
function DarkEmpty({ msg }: { msg: string }) {
  return (
    <p className="px-5 py-6 text-center text-label text-turf-chalk/50">
      {msg}
    </p>
  );
}

/** One gainers/drops row. Gainers and drops differ only in sign and tone. */
function MoverListRow({ p, season, matchups, up, isLast }: {
  p: MoverRow; season: number;
  matchups: Record<string, import('@/lib/schedule').Matchup>;
  up: boolean; isLast: boolean;
}) {
  const delta = Number(p.price_delta);
  const base  = Number(p.base_weekly_price);
  const pct   = base > 0 ? (Math.abs(delta) / base) * 100 : 0;
  const orders = up ? p.buy_orders_count : p.sell_orders_count;

  return (
    <ClickablePlayerRow playerId={p.id} season={season} className="block">
      <div className={[
        'flex items-center gap-2.5 px-5 py-2.5',
        'transition-colors duration-150 ease-out-quart hover:bg-surface-sunken',
        isLast ? '' : 'border-b border-line',
      ].join(' ')}>
        <PlayerAvatar player={p} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-body font-medium text-ink">{formatPlayerName(p.full_name)}</span>
            <PosBadge pos={p.position} />
            <TeamLogo code={p.team_code} size={11} />
            <span className="shrink-0 text-label text-ink-3">{p.team_code}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-label text-ink-3">
            <MatchupBadge matchup={matchups[p.team_code]} />
            <span>
              · <span className="font-mono tabular-nums">{formatPrice(p.current_price)}</span>
              {' · '}
              <span className="font-mono tabular-nums">{orders}</span> {up ? 'buys' : 'sells'}
            </span>
          </div>
        </div>
        <div className={['shrink-0 text-right', up ? 'text-up' : 'text-down'].join(' ')}>
          <div className="font-mono tabular-nums text-body">
            {up ? '+' : ''}{formatPrice(delta)}
          </div>
          <div className="flex items-center justify-end gap-0.5 font-mono tabular-nums text-eyebrow">
            <Icon name="arrowRight" size={9} className={up ? '-rotate-90' : 'rotate-90'} />
            {pct.toFixed(1)}%
          </div>
        </div>
      </div>
    </ClickablePlayerRow>
  );
}

/** One flow row on a dark panel. Demand and sell pressure differ only in sign. */
function FlowListRow({ p, season, matchups, pct, up, isLast }: {
  p: TradedRow; season: number;
  matchups: Record<string, import('@/lib/schedule').Matchup>;
  pct: number; up: boolean; isLast: boolean;
}) {
  return (
    <ClickablePlayerRow playerId={p.id} season={season} className="block">
      <div className={['cursor-pointer px-4 py-2.5', isLast ? '' : 'border-b border-turf-chalk/8'].join(' ')}>
        <div className="mb-1.5 flex items-center gap-2">
          <PlayerAvatar player={p} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-label text-turf-chalk">{formatPlayerName(p.full_name)}</span>
              <PosBadge pos={p.position} />
              <TeamLogo code={p.team_code} size={11} />
              <span className="shrink-0 text-eyebrow text-turf-chalk/40">{p.team_code}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-eyebrow text-turf-chalk/40">
              <MatchupBadge matchup={matchups[p.team_code]} />
              <span>· <span className="font-mono tabular-nums">{formatPrice(p.current_price)}</span></span>
            </span>
          </div>
          <div className={['shrink-0 font-mono tabular-nums text-label', up ? 'text-emerald' : 'text-down'].join(' ')}>
            {up ? '+' : ''}{p.net_order_flow}
          </div>
        </div>
        <div className="h-0.5 rounded-pill bg-turf-chalk/10">
          <div
            className={['h-full rounded-pill', up ? 'bg-emerald' : 'bg-down'].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </ClickablePlayerRow>
  );
}

/**
 * The market's default state, not an edge case.
 *
 * Until games are played there are no buys, no sells and no price movement, so
 * the populated layout renders as eight empty containers reading "None yet" —
 * a working page that looks broken. This replaces all of it with one panel that
 * says when the market opens and what will land here.
 *
 * Dark, like the other market-state panels — see the dark-panel ruling.
 */
function PreSeasonMarket() {
  const upcoming = [
    { icon: 'chart'      as const, title: 'Gainers and drops',  sub: 'Who rose and fell each week' },
    { icon: 'users'      as const, title: 'Demand and pressure', sub: 'What managers are buying and selling' },
    { icon: 'globe'      as const, title: 'Every transaction',   sub: 'Live buys and sells across all leagues' },
  ];

  return (
    <div className="overflow-hidden rounded-card bg-ink">
      <div className="flex flex-col gap-3 px-8 pb-8 pt-10">
        <p className="text-eyebrow uppercase text-emerald">No trades yet</p>
        <h2 className="max-w-lg text-display text-turf-chalk">
          Prices move when the games do.
        </h2>
        <p className="max-w-lg text-body text-turf-chalk/60">
          Every player is priced for the season. The first buys and sells land once
          the games kick off, and this page starts keeping score of them.
        </p>
        <Link
          href="/transfers"
          className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-control bg-emerald px-4 py-2 text-label text-surface transition-colors duration-150 ease-out-quart hover:bg-emerald-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          Browse players
          <Icon name="arrowRight" size={13} />
        </Link>
      </div>

      <div className="grid grid-cols-1 border-t border-turf-chalk/10 sm:grid-cols-3">
        {upcoming.map((u, i) => (
          <div
            key={u.title}
            className={[
              'flex flex-col gap-1 px-8 py-5',
              i < upcoming.length - 1 ? 'sm:border-r sm:border-turf-chalk/10' : '',
              i > 0 ? 'border-t border-turf-chalk/10 sm:border-t-0' : '',
            ].join(' ')}
          >
            <span className="text-emerald">
              <Icon name={u.icon} size={18} />
            </span>
            <p className="text-label text-turf-chalk">{u.title}</p>
            <p className="text-label text-turf-chalk/50">{u.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;
  const { season: seasonParam } = await searchParams;
  const SEASON = seasonParam ? parseInt(seasonParam, 10) : PREV_SEASON;

  const [currentWeek, lastScoreWeek, userLeagues] = await Promise.all([
    fetchCurrentWeek(SEASON),
    fetchLastScoreWeek(SEASON),
    fetchUserLeagues(userId),
  ]);

  const [movers, mostTraded, highDemand, sellPressure, recentTx, matchups] = await Promise.all([
    fetchMovers(SEASON, lastScoreWeek),
    fetchMostTraded(SEASON),
    fetchHighDemand(SEASON),
    fetchSellPressure(SEASON),
    fetchRecentTransactions(SEASON),
    getNextMatchupByTeam(SCHEDULE_SEASON),
  ]);

  const gainers = movers.filter(m => Number(m.price_delta) >= 0).slice(0, 8);
  const losers  = movers.filter(m => Number(m.price_delta) <  0).slice(0, 8);

  const totalTxCount  = recentTx.length;
  const biggestGainer = gainers[0] ?? null;
  const biggestLoser  = losers[0]  ?? null;
  const topDemand     = highDemand[0] ?? null;

  /**
   * Nothing has been bought or sold yet, so every panel on the populated layout
   * would render empty. See PreSeasonMarket.
   */
  const hasActivity =
    movers.length > 0 || mostTraded.length > 0 || highDemand.length > 0 ||
    sellPressure.length > 0 || recentTx.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-surface md:flex-row">

      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      <div className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-2.5">
            <SeasonModeSwitcher season={SEASON} currentWeek={currentWeek} />
            <div className="flex h-8 w-8 items-center justify-center rounded-pill bg-ink text-eyebrow text-surface">
              {session.user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 px-6 py-7">

          {/* Page title */}
          <div>
            <p className="text-eyebrow uppercase text-emerald">Live pricing</p>
            <h1 className="mt-1 text-display text-ink">Market</h1>
            <p className="mt-1 text-label text-ink-3">
              Supply and demand pricing · {formatWeekLong(currentWeek)} ·{' '}
              <span className="font-mono tabular-nums">{SEASON}</span> season
            </p>
          </div>

          {!hasActivity ? (
            <PreSeasonMarket />
          ) : (
            <>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                {
                  label: 'Biggest gainer',
                  value: biggestGainer ? `+${formatPrice(Math.abs(Number(biggestGainer.price_delta)))}` : 'None yet',
                  sub:   biggestGainer ? formatPlayerName(biggestGainer.full_name) : 'Prices move once games start',
                  tone:  biggestGainer ? 'text-up' : 'text-ink-3',
                  numeric: !!biggestGainer,
                },
                {
                  label: 'Biggest drop',
                  value: biggestLoser ? `-${formatPrice(Math.abs(Number(biggestLoser.price_delta)))}` : 'None yet',
                  sub:   biggestLoser ? formatPlayerName(biggestLoser.full_name) : 'Prices move once games start',
                  tone:  biggestLoser ? 'text-down' : 'text-ink-3',
                  numeric: !!biggestLoser,
                },
                {
                  label: 'Top demand',
                  value: topDemand ? formatPlayerName(topDemand.full_name) : 'None yet',
                  sub:   topDemand ? `+${topDemand.net_order_flow} net flow` : 'No transfers recorded yet',
                  tone:  topDemand ? 'text-ink' : 'text-ink-3',
                  numeric: false,
                },
                {
                  label: 'Recent transactions',
                  value: String(totalTxCount),
                  sub:   'Across all leagues',
                  tone:  totalTxCount > 0 ? 'text-ink' : 'text-ink-3',
                  numeric: true,
                },
              ].map(tile => (
                <div key={tile.label} className="rounded-card border border-line bg-surface p-4">
                  <p className="text-eyebrow uppercase text-ink-3">{tile.label}</p>
                  <p className={[
                    'mt-1.5 truncate text-section',
                    tile.numeric ? 'font-mono tabular-nums' : '',
                    tile.tone,
                  ].join(' ')}>
                    {tile.value}
                  </p>
                  <p className="mt-1 truncate text-label text-ink-3">{tile.sub}</p>
                </div>
              ))}
            </div>

            {/* Movers: Gainers | Losers */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

              {/* Top Gainers */}
              <SectionCard title="Top gainers" sub="Biggest price rises this week" badge={`${gainers.length} players`}>
                {gainers.length === 0 && <EmptyState compact title="No price rises this week." />}
                {gainers.map((p, i) => (
                  <MoverListRow key={p.id} p={p} season={SEASON} matchups={matchups} up isLast={i === gainers.length - 1} />
                ))}
              </SectionCard>

              {/* Top Losers */}
              <SectionCard title="Biggest drops" sub="Biggest price falls this week" badge={`${losers.length} players`}>
                {losers.length === 0 && <EmptyState compact title="No price falls this week." />}
                {losers.map((p, i) => (
                  <MoverListRow key={p.id} p={p} season={SEASON} matchups={matchups} up={false} isLast={i === losers.length - 1} />
                ))}
              </SectionCard>
            </div>

            {/* Demand Watch + Sell Pressure + Most Traded */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

              {/* High Demand */}
              <SectionCard title="High demand" sub="Most net buying this week" dark>
                {highDemand.length === 0 && <DarkEmpty msg="No buying recorded yet." />}
                {highDemand.map((p, i) => {
                  const maxFlow = Number(highDemand[0]?.net_order_flow ?? 1);
                  return (
                    <FlowListRow
                      key={p.id} p={p} season={SEASON} matchups={matchups} up
                      pct={(Number(p.net_order_flow) / maxFlow) * 100}
                      isLast={i === highDemand.length - 1}
                    />
                  );
                })}
              </SectionCard>

              {/* Sell Pressure */}
              <SectionCard title="Sell pressure" sub="Most net selling this week" dark>
                {sellPressure.length === 0 && <DarkEmpty msg="No selling recorded yet." />}
                {sellPressure.map((p, i) => {
                  const maxFlow = Math.abs(Number(sellPressure[0]?.net_order_flow ?? 1));
                  return (
                    <FlowListRow
                      key={p.id} p={p} season={SEASON} matchups={matchups} up={false}
                      pct={(Math.abs(Number(p.net_order_flow)) / maxFlow) * 100}
                      isLast={i === sellPressure.length - 1}
                    />
                  );
                })}
              </SectionCard>

              {/* Most Traded */}
              <SectionCard title="Most traded" sub="Highest combined buy and sell volume">
                {mostTraded.length === 0 && <EmptyState compact title="No trades recorded yet." />}
                {mostTraded.map((p, i) => {
                  const total   = Number(p.buy_orders_count) + Number(p.sell_orders_count);
                  const maxTotal = Number(mostTraded[0]?.buy_orders_count ?? 0) + Number(mostTraded[0]?.sell_orders_count ?? 1);
                  const buyPct  = total > 0 ? (Number(p.buy_orders_count) / total) * 100 : 50;
                  const barPct  = (total / maxTotal) * 100;
                  return (
                    <ClickablePlayerRow key={p.id} playerId={p.id} season={SEASON} className="block">
                      <div className={[
                        'px-5 py-2.5 transition-colors duration-150 ease-out-quart hover:bg-surface-sunken',
                        i < mostTraded.length - 1 ? 'border-b border-line' : '',
                      ].join(' ')}>
                        <div className="mb-1.5 flex items-center gap-2">
                          <PlayerAvatar player={p} size={28} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-label text-ink">{formatPlayerName(p.full_name)}</span>
                              <PosBadge pos={p.position} />
                              <MatchupBadge matchup={matchups[p.team_code]} />
                            </div>
                            <span className="font-mono tabular-nums text-eyebrow text-ink-3">
                              {p.buy_orders_count} bought / {p.sell_orders_count} sold
                            </span>
                          </div>
                          <div className="shrink-0 font-mono tabular-nums text-body text-ink">
                            {total}
                          </div>
                        </div>
                        {/* Buy/sell split bar — the split point is data, so it stays computed */}
                        <div className="h-[3px] overflow-hidden rounded-pill bg-line">
                          <div
                            className="h-full rounded-pill"
                            style={{
                              width: `${barPct}%`,
                              background: `linear-gradient(90deg, var(--color-up) ${buyPct}%, var(--color-down) ${buyPct}%)`,
                            }}
                          />
                        </div>
                      </div>
                    </ClickablePlayerRow>
                  );
                })}
              </SectionCard>
            </div>

            {/* Recent Transactions (full width) */}
            <SectionCard title="Recent transactions" sub="Latest buys and sells across all leagues" badge={`Last ${recentTx.length}`}>
              {recentTx.length === 0 ? (
                <EmptyState compact title="No transactions yet this season." />
              ) : (
              <div className="overflow-x-auto">
              {/* Column headers */}
              <div
                className="grid min-w-[640px] border-b border-line bg-surface-sunken px-5 py-2 text-eyebrow uppercase text-ink-3"
                style={{ gridTemplateColumns: '36px 1fr 140px 80px 80px 80px 120px' }}
              >
                <span />
                <span>Player</span>
                <span>Team</span>
                <span className="text-right">Price</span>
                <span className="text-right">Before</span>
                <span className="text-right">After</span>
                <span className="text-right">Time</span>
              </div>

              {recentTx.map((tx, i) => {
                const isBuy = tx.transaction_type === 'buy';
                const delta = Number(tx.price_after) - Number(tx.price_before);
                return (
                  <div
                    key={tx.id}
                    className={[
                      'grid min-w-[640px] items-center px-5 py-2',
                      i < recentTx.length - 1 ? 'border-b border-line' : '',
                    ].join(' ')}
                    style={{ gridTemplateColumns: '36px 1fr 140px 80px 80px 80px 120px' }}
                  >
                    {/* Avatar + buy/sell indicator */}
                    <div className="relative h-7 w-7">
                      <PlayerAvatar player={tx} size={28} />
                      <div className={[
                        'absolute -right-0.5 bottom-0 h-2.5 w-2.5 rounded-pill border-2 border-surface',
                        isBuy ? 'bg-up' : 'bg-down',
                      ].join(' ')} />
                    </div>

                    {/* Player */}
                    <div className="min-w-0 pl-2">
                      <ClickablePlayerRow playerId={tx.id} season={SEASON}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-label text-ink">
                            {formatPlayerName(tx.full_name)}
                          </span>
                          <PosBadge pos={tx.position} />
                          <TeamLogo code={tx.team_code} size={11} />
                          <span className="shrink-0 text-eyebrow text-ink-3">{tx.team_code}</span>
                        </div>
                      </ClickablePlayerRow>
                      <div className="mt-0.5 flex items-center gap-1.5 text-eyebrow text-ink-3">
                        <MatchupBadge matchup={matchups[tx.team_code]} />
                      </div>
                    </div>

                    {/* Fantasy team */}
                    <div className="min-w-0">
                      <div className="truncate text-label text-ink-2">{tx.team_name}</div>
                      <div className="truncate text-eyebrow text-ink-3">{tx.user_name}</div>
                    </div>

                    <div className="text-right font-mono tabular-nums text-label text-ink">
                      {formatPrice(tx.price)}
                    </div>

                    <div className="text-right font-mono tabular-nums text-label text-ink-3">
                      {formatPrice(tx.price_before)}
                    </div>

                    <div className={['text-right font-mono tabular-nums', delta >= 0 ? 'text-up' : 'text-down'].join(' ')}>
                      <div className="text-label">{formatPrice(tx.price_after)}</div>
                      <div className="text-eyebrow">
                        {delta >= 0 ? '+' : ''}{formatPrice(delta)}
                      </div>
                    </div>

                    <div className="text-right font-mono tabular-nums text-eyebrow text-ink-3">
                      {formatTime(tx.created_at)}
                    </div>
                  </div>
                );
              })}
              </div>
              )}
            </SectionCard>
            </>
          )}

        </main>
      </div>
    </div>
  );
}
