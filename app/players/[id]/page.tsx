import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPrice, formatPoints, formatWeekLong } from '@/lib/format';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import PriceChart, { type PriceWeek } from './_components/PriceChart';
import BuyButton from './_components/BuyButton';
import BackLink from './_components/BackLink';
import LivePlayerHeroStats from './_components/LivePlayerHeroStats';
import WeeklyStatsTable, { type WeekScore, type StatCol } from './_components/WeeklyStatsTable';

const SEASON = 2025;
const CURRENT_SEASON = 2026;

const POS_COLORS: Record<string, { pill: string; color: string }> = {
  QB: { pill: 'bg-blue-100 text-blue-700',      color: '#3b82f6' },
  RB: { pill: 'bg-emerald-100 text-emerald-700', color: '#10b981' },
  WR: { pill: 'bg-amber-100 text-amber-700',     color: '#f59e0b' },
  TE: { pill: 'bg-purple-100 text-purple-700',   color: '#a855f7' },
  K:  { pill: 'bg-slate-100 text-slate-600',     color: '#94a3b8' },
};

const STAT_COLS: Record<string, { key: string; label: string }[]> = {
  QB: [
    { key: 'passing_yards',        label: 'Pass Yds' },
    { key: 'passing_tds',          label: 'Pass TD' },
    { key: 'interceptions_thrown', label: 'INT' },
    { key: 'rushing_yards',        label: 'Rush Yds' },
    { key: 'rushing_tds',          label: 'Rush TD' },
  ],
  RB: [
    { key: 'rushing_yards',  label: 'Rush Yds' },
    { key: 'rushing_tds',    label: 'Rush TD' },
    { key: 'receptions',     label: 'Rec' },
    { key: 'receiving_yards',label: 'Rec Yds' },
    { key: 'receiving_tds',  label: 'Rec TD' },
  ],
  WR: [
    { key: 'receptions',     label: 'Rec' },
    { key: 'receiving_yards',label: 'Rec Yds' },
    { key: 'receiving_tds',  label: 'Rec TD' },
    { key: 'rushing_yards',  label: 'Rush Yds' },
    { key: 'rushing_tds',    label: 'Rush TD' },
  ],
  TE: [
    { key: 'receptions',     label: 'Rec' },
    { key: 'receiving_yards',label: 'Rec Yds' },
    { key: 'receiving_tds',  label: 'Rec TD' },
  ],
  K: [
    { key: 'field_goals_made',  label: 'FG Made' },
    { key: 'extra_points_made', label: 'XP Made' },
  ],
};

async function fetchCurrentWeek() {
  const [r] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [SEASON]
  );
  return r?.w ?? 1;
}

async function fetchUserLeagues(userId: string): Promise<SidebarLeague[]> {
  return query<SidebarLeague>(
    `SELECT l.id, l.name, l.season_year,
            ft.team_name,
            RANK() OVER (PARTITION BY ft.league_id ORDER BY ft.total_points DESC) AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.league_id = l.id AND ft.user_id = ?
     WHERE lm.user_id = ?
     ORDER BY l.created_at DESC`,
    [userId, userId]
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const playerId = parseInt(id, 10);
  if (isNaN(playerId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');
  const userId = session.user.id;

  const [currentWeek, userLeagues] = await Promise.all([
    fetchCurrentWeek(),
    fetchUserLeagues(userId),
  ]);

  // Player + market state
  const [player] = await query<{
    id: number; full_name: string; position: string; team_code: string;
    headshot_url: string | null; espn_athlete_id: string | null;
    current_price: number; base_weekly_price: number;
    intraday_high: number; intraday_low: number; net_order_flow: number;
  }>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url, p.espn_athlete_id,
            COALESCE(pms.current_price, 0)       AS current_price,
            COALESCE(pms.base_weekly_price, 0)   AS base_weekly_price,
            COALESCE(pms.intraday_high, 0)       AS intraday_high,
            COALESCE(pms.intraday_low, 0)        AS intraday_low,
            COALESCE(pms.net_order_flow, 0)      AS net_order_flow
     FROM players p
     LEFT JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.id = ?`,
    [SEASON, playerId]
  );
  if (!player) notFound();

  // User's primary team
  const [userTeam] = await query<{
    id: number; budget_remaining: number; league_id: number;
  }>(
    `SELECT id, budget_remaining, league_id
     FROM fantasy_teams WHERE user_id = ? AND season_year = ?
     ORDER BY created_at DESC LIMIT 1`,
    [userId, SEASON]
  );

  // Ownership + roster quota check
  const [owned] = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM fantasy_team_roster
     WHERE fantasy_team_id = ? AND player_id = ? AND is_active = TRUE`,
    [userTeam?.id ?? 0, playerId]
  );
  const alreadyOwned = (owned?.cnt ?? 0) > 0;
  const canAfford = userTeam ? Number(userTeam.budget_remaining) >= Number(player.current_price) : false;

  // Count active roster slots by position to enforce quotas
  const QUOTA = { QB: 2, RB: 3, FLEX: 5, K: 1 } as const;
  let blockReason: string | null = null;

  if (userTeam && !alreadyOwned) {
    const posCounts = await query<{ position: string; cnt: number }>(
      `SELECT p.position, COUNT(*) AS cnt
       FROM fantasy_team_roster ftr
       JOIN players p ON p.id = ftr.player_id
       WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE
       GROUP BY p.position`,
      [userTeam.id]
    );
    const countMap = Object.fromEntries(posCounts.map(r => [r.position, Number(r.cnt)]));
    const rosterTotal = Object.values(countMap).reduce((s, n) => s + n, 0);
    const flexCount   = (countMap.WR ?? 0) + (countMap.TE ?? 0);

    if (rosterTotal >= 11) {
      blockReason = 'Roster full — sell a player first';
    } else if (player.position === 'QB' && (countMap.QB ?? 0) >= QUOTA.QB) {
      blockReason = `QB slots full (${QUOTA.QB}/${QUOTA.QB})`;
    } else if (player.position === 'RB' && (countMap.RB ?? 0) >= QUOTA.RB) {
      blockReason = `RB slots full (${QUOTA.RB}/${QUOTA.RB})`;
    } else if ((player.position === 'WR' || player.position === 'TE') && flexCount >= QUOTA.FLEX) {
      blockReason = `WR/TE slots full (${QUOTA.FLEX}/${QUOTA.FLEX})`;
    } else if (player.position === 'K' && (countMap.K ?? 0) >= QUOTA.K) {
      blockReason = `K slot full (${QUOTA.K}/${QUOTA.K})`;
    }
  }

  // Price history
  const priceHistory = await query<PriceWeek>(
    `SELECT week, opening_price, closing_price, base_price
     FROM player_price_weeks WHERE player_id = ? AND season_year = ?
     ORDER BY week ASC`,
    [playerId, SEASON]
  );

  // Weekly scores + projections (both historical and current season in parallel)
  const weeklyScoresQuery = (seasonYear: number) => query<WeekScore>(
    `SELECT pws.week,
            pws.fantasy_points, pws.passing_yards, pws.passing_tds,
            pws.interceptions_thrown, pws.rushing_yards, pws.rushing_tds,
            pws.receptions, pws.receiving_yards, pws.receiving_tds,
            pws.field_goals_made, pws.extra_points_made,
            COALESCE(pwp.expected_points, 0) AS projected_points
     FROM player_weekly_scores pws
     LEFT JOIN player_weekly_projections pwp
       ON pwp.player_id = pws.player_id AND pwp.season_year = pws.season_year
          AND pwp.week = pws.week AND pwp.projection_source = 'internal_model'
     WHERE pws.player_id = ? AND pws.season_year = ?
     ORDER BY pws.week DESC`,
    [playerId, seasonYear]
  );

  const [weeklyScores, currentSeasonScores] = await Promise.all([
    weeklyScoresQuery(SEASON),
    weeklyScoresQuery(CURRENT_SEASON),
  ]);

  const pos = player.position;
  const posStyle = POS_COLORS[pos] ?? { pill: 'bg-slate-100 text-slate-600', color: '#94a3b8' };
  const statCols = STAT_COLS[pos] ?? [];

  const priceChange = priceHistory.length >= 2
    ? Number(priceHistory[priceHistory.length - 1].closing_price) - Number(priceHistory[priceHistory.length - 2].closing_price)
    : null;
  const seasonPts = weeklyScores.reduce((s, w) => s + Number(w.fantasy_points ?? 0), 0);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-200/40 via-sky-200/30 to-indigo-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-[-80px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-sky-200/40 via-indigo-200/25 to-emerald-200/20 blur-3xl" />
      </div>

      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-3">
            <BackLink href="/team" label="My Team" />
            <div className="flex items-center gap-3 ml-auto">
              <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-50 ring-1 ring-slate-200 px-3 py-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-slate-600">Season {SEASON} · {formatWeekLong(currentWeek)}</span>
              </div>
              <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold">
                {session.user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Hero card ── */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              {/* Headshot */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {player.headshot_url ? (
                  <Image src={player.headshot_url} alt={player.full_name} width={96} height={96} unoptimized
                    style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid #e2e8f0', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, color: '#94a3b8' }}>
                    {player.full_name[0]}
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 26, height: 26, borderRadius: '50%',
                  background: posStyle.color, border: '2.5px solid #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 900, color: '#fff',
                }}>
                  {pos}
                </div>
              </div>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${posStyle.pill}`}>{pos}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{player.team_code}</span>
                </div>
                <h1 style={{
                  fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em',
                  backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  display: 'inline-block', lineHeight: 1.1,
                }}>
                  {player.full_name}
                </h1>
                <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Season Pts', value: formatPoints(seasonPts) },
                    { label: 'Weeks played', value: String(weeklyScores.length) },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Price + buy */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                    Market Price
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    {formatPrice(player.current_price)}
                  </div>
                  {priceChange !== null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: priceChange >= 0 ? '#10b981' : '#f43f5e', marginTop: 3 }}>
                      {priceChange >= 0 ? '▲' : '▼'} {formatPrice(Math.abs(priceChange))} this week
                    </div>
                  )}
                </div>
                {userTeam && (
                  <BuyButton
                    playerId={player.id}
                    fantasyTeamId={userTeam.id}
                    currentWeek={currentWeek}
                    price={Number(player.current_price)}
                    canAfford={canAfford}
                    alreadyOwned={alreadyOwned}
                    blockReason={blockReason}
                  />
                )}
              </div>
            </div>

            {/* Live stats — client island, renders only when player is in a live game */}
            <LivePlayerHeroStats
              espnAthleteId={player.espn_athlete_id}
              position={player.position}
            />
          </div>

          {/* ── Price chart + market stats ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, alignItems: 'start' }}>

            {/* Chart */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Price History</h3>
                  <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Weekly closing price · {SEASON} season</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{formatPrice(player.current_price)}</div>
                </div>
              </div>
              <PriceChart data={priceHistory} />
            </div>

            {/* Market stats */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Market Stats</h3>
              {[
                { label: 'Base Price',     value: formatPrice(player.base_weekly_price) },
                { label: 'Intraday High',  value: formatPrice(player.intraday_high) },
                { label: 'Intraday Low',   value: formatPrice(player.intraday_low) },
                { label: 'Net Order Flow', value: player.net_order_flow > 0 ? `+${player.net_order_flow}` : String(player.net_order_flow) },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{s.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.value}</span>
                </div>
              ))}
              <div style={{ height: 1, background: '#f1f5f9' }} />
              {/* Order flow bar */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Buy / Sell Pressure
                </div>
                <div style={{ height: 6, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden', display: 'flex' }}>
                  <div style={{
                    width: `${Math.max(5, Math.min(95, 50 + (Number(player.net_order_flow) / 20) * 50))}%`,
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                  }} />
                  <div style={{ flex: 1, background: 'linear-gradient(90deg, #fda4af, #f43f5e)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
                  <span>BUY</span>
                  <span>SELL</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Weekly stats table ── */}
          {(weeklyScores.length > 0 || currentSeasonScores.length > 0) && (
            <WeeklyStatsTable
              historicalScores={weeklyScores}
              currentScores={currentSeasonScores}
              statCols={statCols as StatCol[]}
              historicalSeason={SEASON}
              currentSeason={CURRENT_SEASON}
            />
          )}

        </main>
      </div>
    </div>
  );
}
