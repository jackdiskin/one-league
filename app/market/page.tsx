import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPrice, formatPoints, formatWeekLong } from '@/lib/format';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';

const SEASON = 2025;

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

const POS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  QB: { bg: '#eff6ff', text: '#3b82f6', bar: '#3b82f6' },
  RB: { bg: '#f0fdf4', text: '#10b981', bar: '#10b981' },
  WR: { bg: '#fffbeb', text: '#f59e0b', bar: '#f59e0b' },
  TE: { bg: '#faf5ff', text: '#a855f7', bar: '#a855f7' },
  K:  { bg: '#f8fafc', text: '#64748b', bar: '#94a3b8' },
};

// ── Queries ────────────────────────────────────────────────────────────────
async function fetchCurrentWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [SEASON]
  );
  return row?.w ?? 1;
}

async function fetchLastScoreWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [SEASON]
  );
  return row?.w ?? 1;
}

async function fetchUserLeagues(userId: string): Promise<SidebarLeague[]> {
  return query<SidebarLeague>(
    `SELECT l.id, l.name, l.season_year,
            ft.team_name,
            RANK() OVER (PARTITION BY l.id ORDER BY ft.total_points DESC) AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.league_id = l.id AND ft.user_id = ?
     WHERE lm.user_id = ?
     ORDER BY l.created_at DESC`,
    [userId, userId]
  );
}

async function fetchMovers(lastWeek: number): Promise<MoverRow[]> {
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
     WHERE p.position IN ('QB','RB','WR','TE','K')
       AND pms.base_weekly_price > 0
     ORDER BY ABS(pms.current_price - pms.base_weekly_price) DESC
     LIMIT 20`,
    [SEASON, SEASON, lastWeek]
  );
}

async function fetchMostTraded(): Promise<TradedRow[]> {
  return query<TradedRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.buy_orders_count, pms.sell_orders_count,
            (pms.buy_orders_count + pms.sell_orders_count) AS total_orders,
            pms.net_order_flow
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE','K')
       AND (pms.buy_orders_count + pms.sell_orders_count) > 0
     ORDER BY total_orders DESC
     LIMIT 10`,
    [SEASON]
  );
}

async function fetchHighDemand(): Promise<TradedRow[]> {
  return query<TradedRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.buy_orders_count, pms.sell_orders_count,
            (pms.buy_orders_count + pms.sell_orders_count) AS total_orders,
            pms.net_order_flow
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE','K')
       AND pms.net_order_flow > 0
     ORDER BY pms.net_order_flow DESC
     LIMIT 10`,
    [SEASON]
  );
}

async function fetchSellPressure(): Promise<TradedRow[]> {
  return query<TradedRow>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            pms.current_price, pms.buy_orders_count, pms.sell_orders_count,
            (pms.buy_orders_count + pms.sell_orders_count) AS total_orders,
            pms.net_order_flow
     FROM players p
     JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE','K')
       AND pms.net_order_flow < 0
     ORDER BY pms.net_order_flow ASC
     LIMIT 10`,
    [SEASON]
  );
}

async function fetchRecentTransactions(): Promise<RecentTx[]> {
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
    [SEASON]
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────
function formatTime(val: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(val));
}

function PosBadge({ pos }: { pos: string }) {
  const col = POS_COLORS[pos] ?? POS_COLORS.K;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: col.text, background: col.bg,
      borderRadius: 20, padding: '1px 5px', flexShrink: 0,
    }}>{pos}</span>
  );
}

function PlayerAvatar({ player, size = 32 }: { player: { headshot_url: string | null; full_name: string }; size?: number }) {
  return player.headshot_url ? (
    <Image src={player.headshot_url} alt={player.full_name} width={size} height={size} unoptimized
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #f1f5f9', display: 'block', flexShrink: 0 }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 700, color: '#64748b',
    }}>
      {player.full_name[0]}
    </div>
  );
}

function SectionCard({ title, sub, badge, dark, children }: {
  title: string; sub?: string; badge?: string; dark?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 16, overflow: 'hidden',
      background: dark ? 'linear-gradient(160deg,#0f172a 0%,#1e293b 100%)' : '#fff',
      border: dark ? '1px solid #1e293b' : '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        padding: '13px 18px',
        borderBottom: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: dark ? '#fff' : '#0f172a', letterSpacing: '-0.01em' }}>{title}</h3>
          {sub && <p style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,0.4)' : '#94a3b8', marginTop: 1 }}>{sub}</p>}
        </div>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: dark ? 'rgba(255,255,255,0.5)' : '#64748b',
            background: dark ? 'rgba(255,255,255,0.08)' : '#f8fafc',
            border: dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e2e8f0',
            borderRadius: 20, padding: '3px 10px',
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ msg, dark }: { msg: string; dark?: boolean }) {
  return (
    <div style={{ padding: '18px', fontSize: 12, color: dark ? 'rgba(255,255,255,0.3)' : '#94a3b8', textAlign: 'center' }}>
      {msg}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function MarketPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;

  const [currentWeek, lastScoreWeek, userLeagues] = await Promise.all([
    fetchCurrentWeek(),
    fetchLastScoreWeek(),
    fetchUserLeagues(userId),
  ]);

  const [movers, mostTraded, highDemand, sellPressure, recentTx] = await Promise.all([
    fetchMovers(lastScoreWeek),
    fetchMostTraded(),
    fetchHighDemand(),
    fetchSellPressure(),
    fetchRecentTransactions(),
  ]);

  const gainers = movers.filter(m => Number(m.price_delta) >= 0).slice(0, 8);
  const losers  = movers.filter(m => Number(m.price_delta) <  0).slice(0, 8);

  const totalTxCount  = recentTx.length;
  const biggestGainer = gainers[0] ?? null;
  const biggestLoser  = losers[0]  ?? null;
  const topDemand     = highDemand[0] ?? null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Background blobs */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: -1, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: -128, left: '50%', transform: 'translateX(-50%)', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(14,165,233,0.08) 50%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: 0, right: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.15) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 12px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Season {SEASON} · {formatWeekLong(currentWeek)}</span>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#0f172a', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
            }}>
              {session.user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Page title */}
          <div style={{ paddingLeft: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Live Pricing
            </div>
            <h1 style={{
              fontSize: 26, fontWeight: 900, letterSpacing: '-0.03em',
              backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block',
            }}>
              Market
            </h1>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              Supply &amp; demand pricing · {formatWeekLong(currentWeek)} · {SEASON} season
            </p>
          </div>

          {/* Stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              {
                label: 'Biggest Gainer',
                value: biggestGainer ? `+${formatPrice(Math.abs(Number(biggestGainer.price_delta)))}` : '—',
                sub:   biggestGainer?.full_name ?? 'No movers yet',
                color: '#10b981',
              },
              {
                label: 'Biggest Drop',
                value: biggestLoser ? `-${formatPrice(Math.abs(Number(biggestLoser.price_delta)))}` : '—',
                sub:   biggestLoser?.full_name ?? 'No drops yet',
                color: '#f43f5e',
              },
              {
                label: 'Top Demand',
                value: topDemand?.full_name ?? '—',
                sub:   topDemand ? `+${topDemand.net_order_flow} net flow` : 'No demand data',
                color: '#0ea5e9',
              },
              {
                label: 'Recent Transactions',
                value: String(totalTxCount),
                sub:   'across all leagues',
                color: '#059669',
              },
            ].map(tile => (
              <div key={tile.label} style={{
                borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px 16px',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{tile.label}</p>
                <p style={{
                  fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1,
                  color: tile.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tile.value}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{tile.sub}</p>
              </div>
            ))}
          </div>

          {/* Movers: Gainers | Losers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Top Gainers */}
            <SectionCard title="Top Gainers" sub="Biggest price increases this week" badge={`${gainers.length} players`}>
              {gainers.length === 0 && <Empty msg="No price increases this week." />}
              {gainers.map((p, i) => {
                const col  = POS_COLORS[p.position] ?? POS_COLORS.K;
                const delta = Number(p.price_delta);
                const pct  = Number(p.base_weekly_price) > 0 ? (delta / Number(p.base_weekly_price)) * 100 : 0;
                return (
                  <Link key={p.id} href={`/players/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px',
                      borderBottom: i < gainers.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}>
                      <PlayerAvatar player={p} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                          <PosBadge pos={p.position} />
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                          {p.team_code} · {formatPrice(p.current_price)} · {p.buy_orders_count} buys
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>+{formatPrice(delta)}</div>
                        <div style={{ fontSize: 9, color: '#10b981' }}>▲ {pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </SectionCard>

            {/* Top Losers */}
            <SectionCard title="Biggest Drops" sub="Biggest price decreases this week" badge={`${losers.length} players`}>
              {losers.length === 0 && <Empty msg="No price drops this week." />}
              {losers.map((p, i) => {
                const col  = POS_COLORS[p.position] ?? POS_COLORS.K;
                const delta = Number(p.price_delta);
                const pct  = Number(p.base_weekly_price) > 0 ? (Math.abs(delta) / Number(p.base_weekly_price)) * 100 : 0;
                return (
                  <Link key={p.id} href={`/players/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px',
                      borderBottom: i < losers.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}>
                      <PlayerAvatar player={p} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                          <PosBadge pos={p.position} />
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                          {p.team_code} · {formatPrice(p.current_price)} · {p.sell_orders_count} sells
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#f43f5e' }}>{formatPrice(delta)}</div>
                        <div style={{ fontSize: 9, color: '#f43f5e' }}>▼ {pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </SectionCard>
          </div>

          {/* Demand Watch + Sell Pressure + Most Traded */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

            {/* High Demand */}
            <SectionCard title="High Demand" sub="Players with the most net buy flow" dark>
              {highDemand.length === 0 && <Empty msg="No demand data yet." dark />}
              {highDemand.map((p, i) => {
                const maxFlow = Number(highDemand[0]?.net_order_flow ?? 1);
                const pct = (Number(p.net_order_flow) / maxFlow) * 100;
                return (
                  <Link key={p.id} href={`/players/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      padding: '9px 16px',
                      borderBottom: i < highDemand.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <PlayerAvatar player={p} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                            <PosBadge pos={p.position} />
                          </div>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{p.team_code} · {formatPrice(p.current_price)}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#34d399', flexShrink: 0 }}>
                          +{p.net_order_flow}
                        </div>
                      </div>
                      <div style={{ height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </SectionCard>

            {/* Sell Pressure */}
            <SectionCard title="Sell Pressure" sub="Players being offloaded most" dark>
              {sellPressure.length === 0 && <Empty msg="No sell pressure data." dark />}
              {sellPressure.map((p, i) => {
                const maxFlow = Math.abs(Number(sellPressure[0]?.net_order_flow ?? 1));
                const pct = (Math.abs(Number(p.net_order_flow)) / maxFlow) * 100;
                return (
                  <Link key={p.id} href={`/players/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      padding: '9px 16px',
                      borderBottom: i < sellPressure.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <PlayerAvatar player={p} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                            <PosBadge pos={p.position} />
                          </div>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{p.team_code} · {formatPrice(p.current_price)}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#fb7185', flexShrink: 0 }}>
                          {p.net_order_flow}
                        </div>
                      </div>
                      <div style={{ height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: 'linear-gradient(90deg,#f43f5e,#fb7185)' }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </SectionCard>

            {/* Most Traded */}
            <SectionCard title="Most Traded" sub="Highest combined buy + sell volume">
              {mostTraded.length === 0 && <Empty msg="No trade data yet." />}
              {mostTraded.map((p, i) => {
                const total   = Number(p.buy_orders_count) + Number(p.sell_orders_count);
                const maxTotal = Number(mostTraded[0]?.buy_orders_count ?? 0) + Number(mostTraded[0]?.sell_orders_count ?? 1);
                const buyPct  = total > 0 ? (Number(p.buy_orders_count) / total) * 100 : 50;
                const barPct  = (total / maxTotal) * 100;
                return (
                  <Link key={p.id} href={`/players/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      padding: '9px 18px',
                      borderBottom: i < mostTraded.length - 1 ? '1px solid #f8fafc' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <PlayerAvatar player={p} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name}</span>
                            <PosBadge pos={p.position} />
                          </div>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>{p.buy_orders_count}B / {p.sell_orders_count}S</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#475569', flexShrink: 0 }}>
                          {total}
                        </div>
                      </div>
                      {/* Buy/sell split bar */}
                      <div style={{ height: 3, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: 99, width: `${barPct}%`,
                          background: `linear-gradient(90deg, #10b981 ${buyPct}%, #f43f5e ${buyPct}%)`,
                        }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </SectionCard>
          </div>

          {/* Recent Transactions (full width) */}
          <SectionCard title="Recent Transactions" sub="Latest buys &amp; sells across all leagues" badge={`Last ${recentTx.length}`}>
            {recentTx.length === 0 && <Empty msg="No transactions yet this season." />}

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '36px 1fr 140px 80px 80px 80px 120px',
              padding: '7px 18px', background: '#fafafa', borderBottom: '1px solid #f1f5f9',
              fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              <span />
              <span>Player</span>
              <span>Team</span>
              <span style={{ textAlign: 'right' }}>Price</span>
              <span style={{ textAlign: 'right' }}>Before</span>
              <span style={{ textAlign: 'right' }}>After</span>
              <span style={{ textAlign: 'right' }}>Time</span>
            </div>

            {recentTx.map((tx, i) => {
              const isBuy = tx.transaction_type === 'buy';
              const delta = Number(tx.price_after) - Number(tx.price_before);
              return (
                <div key={tx.id} style={{
                  display: 'grid', gridTemplateColumns: '36px 1fr 140px 80px 80px 80px 120px',
                  alignItems: 'center', padding: '8px 18px',
                  borderBottom: i < recentTx.length - 1 ? '1px solid #f8fafc' : 'none',
                }}>
                  {/* Avatar + indicator */}
                  <div style={{ position: 'relative', width: 28, height: 28 }}>
                    <PlayerAvatar player={tx} size={28} />
                    <div style={{
                      position: 'absolute', bottom: 0, right: -2,
                      width: 10, height: 10, borderRadius: '50%',
                      background: isBuy ? '#10b981' : '#f43f5e', border: '1.5px solid #fff',
                    }} />
                  </div>

                  {/* Player */}
                  <div style={{ paddingLeft: 8, minWidth: 0 }}>
                    <Link href={`/players/${tx.id}`} style={{ textDecoration: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.full_name}
                        </span>
                        <PosBadge pos={tx.position} />
                      </div>
                    </Link>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{tx.team_code}</div>
                  </div>

                  {/* Fantasy team */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.team_name}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{tx.user_name}</div>
                  </div>

                  {/* Execution price */}
                  <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                    {formatPrice(tx.price)}
                  </div>

                  {/* Before */}
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
                    {formatPrice(tx.price_before)}
                  </div>

                  {/* After + delta */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: delta >= 0 ? '#10b981' : '#f43f5e' }}>
                      {formatPrice(tx.price_after)}
                    </div>
                    <div style={{ fontSize: 9, color: delta >= 0 ? '#10b981' : '#f43f5e' }}>
                      {delta >= 0 ? '+' : ''}{formatPrice(delta)}
                    </div>
                  </div>

                  {/* Time */}
                  <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8' }}>
                    {formatTime(tx.created_at)}
                  </div>
                </div>
              );
            })}
          </SectionCard>

        </main>
      </div>
    </div>
  );
}
