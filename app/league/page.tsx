import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import { formatPoints, formatPrice } from '@/lib/format';
import Image from 'next/image';
import Sidebar, { type SidebarLeague } from '@/app/dashboard/_components/Sidebar';
import LeagueChart, { type TeamWeekScore } from './_components/LeagueChart';

const SEASON = 2025;

type SearchParams = Promise<{ leagueId?: string }>;

type LeagueSummary = {
  id: number; name: string; season_year: number;
  salary_cap: number; max_members: number; member_count: number;
  team_id: number | null; team_name: string | null;
  total_points: number | null; budget_remaining: number | null; rank: number | null;
};

type StandingRow = {
  rank: number; fantasy_team_id: number; team_name: string;
  user_name: string; user_id: string; total_points: number;
  budget_remaining: number; roster_value: number;
  last_week_points: number; trade_count: number;
};

type TransactionRow = {
  id: number; transaction_type: 'buy' | 'sell'; week: number;
  price: number; price_before: number; price_after: number; created_at: string;
  team_name: string; user_name: string; full_name: string; position: string; team_code: string;
  headshot_url: string | null;
};

type WeeklyWinnerRow = { week: number; team_name: string; user_name: string; points: number };

type ValueRow = {
  fantasy_team_id: number; team_name: string; user_name: string;
  roster_value: number; active_players: number;
};

function ordinal(n: number | null) {
  if (!n) return '—';
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function formatTransactionTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

// ── Queries ────────────────────────────────────────────────────────────────
async function fetchCurrentWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_price_weeks WHERE season_year = ?`, [SEASON]
  );
  return row?.w ?? 1;
}

async function fetchLastScoreWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM fantasy_team_weekly_scores WHERE season_year = ?`, [SEASON]
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
               LEFT JOIN (
                 SELECT ftr2.fantasy_team_id, SUM(pms2.current_price) AS rv
                 FROM fantasy_team_roster ftr2
                 JOIN player_market_state pms2 ON pms2.player_id = ftr2.player_id AND pms2.season_year = l.season_year
                 WHERE ftr2.is_active = TRUE GROUP BY ftr2.fantasy_team_id
               ) rv2 ON rv2.fantasy_team_id = ft2.id
               WHERE ft2.season_year = l.season_year
                 AND (ft2.total_points > ft.total_points
                      OR (ft2.total_points = ft.total_points
                          AND COALESCE(rv2.rv, 0) > (
                            SELECT COALESCE(SUM(pms3.current_price), 0)
                            FROM fantasy_team_roster ftr3
                            JOIN player_market_state pms3 ON pms3.player_id = ftr3.player_id AND pms3.season_year = l.season_year
                            WHERE ftr3.fantasy_team_id = ft.id AND ftr3.is_active = TRUE
                          ))))
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

async function fetchLeagueSummary(userId: string, requestedLeagueId?: number | null) {
  const filters = [`lm.user_id = ?`];
  const params: Array<string | number> = [userId];
  if (requestedLeagueId) { filters.push(`l.id = ?`); params.push(requestedLeagueId); }
  const rows = await query<LeagueSummary>(
    `SELECT l.id, l.name, l.season_year, l.salary_cap, l.max_members,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS member_count,
            ft.id AS team_id, ft.team_name, ft.total_points, ft.budget_remaining,
            CASE WHEN ft.id IS NOT NULL THEN
              (SELECT COUNT(*) + 1
               FROM fantasy_teams ft2
               JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
               LEFT JOIN (
                 SELECT ftr2.fantasy_team_id, SUM(pms2.current_price) AS rv
                 FROM fantasy_team_roster ftr2
                 JOIN player_market_state pms2 ON pms2.player_id = ftr2.player_id AND pms2.season_year = l.season_year
                 WHERE ftr2.is_active = TRUE GROUP BY ftr2.fantasy_team_id
               ) rv2 ON rv2.fantasy_team_id = ft2.id
               WHERE ft2.season_year = l.season_year
                 AND (ft2.total_points > ft.total_points
                      OR (ft2.total_points = ft.total_points
                          AND COALESCE(rv2.rv, 0) > (
                            SELECT COALESCE(SUM(pms3.current_price), 0)
                            FROM fantasy_team_roster ftr3
                            JOIN player_market_state pms3 ON pms3.player_id = ftr3.player_id AND pms3.season_year = l.season_year
                            WHERE ftr3.fantasy_team_id = ft.id AND ftr3.is_active = TRUE
                          ))))
            ELSE NULL END AS \`rank\`
     FROM league_members lm
     JOIN leagues l ON l.id = lm.league_id
     LEFT JOIN fantasy_teams ft ON ft.user_id = lm.user_id AND ft.season_year = l.season_year
     WHERE ${filters.join(' AND ')}
     ORDER BY l.id DESC LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}

async function fetchStandings(leagueId: number, lastScoreWeek: number): Promise<StandingRow[]> {
  return query<StandingRow>(
    `SELECT
       RANK() OVER (ORDER BY ft.total_points DESC, COALESCE(rv.roster_value,0) DESC) AS \`rank\`,
       ft.id AS fantasy_team_id, ft.team_name, u.name AS user_name, ft.user_id,
       ft.total_points, ft.budget_remaining,
       COALESCE(rv.roster_value, 0) AS roster_value,
       COALESCE(ws.points, 0) AS last_week_points,
       COALESCE(tx.trade_count, 0) AS trade_count
     FROM fantasy_teams ft
     JOIN \`user\` u ON u.id = ft.user_id
     JOIN league_members lm ON lm.user_id = ft.user_id AND lm.league_id = ?
     LEFT JOIN (
       SELECT ftr.fantasy_team_id, SUM(pms.current_price) AS roster_value
       FROM fantasy_team_roster ftr
       JOIN player_market_state pms ON pms.player_id = ftr.player_id AND pms.season_year = ?
       WHERE ftr.is_active = TRUE GROUP BY ftr.fantasy_team_id
     ) rv ON rv.fantasy_team_id = ft.id
     LEFT JOIN fantasy_team_weekly_scores ws
       ON ws.fantasy_team_id = ft.id AND ws.season_year = ? AND ws.week = ?
     LEFT JOIN (
       SELECT fantasy_team_id, COUNT(*) AS trade_count
       FROM player_transactions WHERE season_year = ? GROUP BY fantasy_team_id
     ) tx ON tx.fantasy_team_id = ft.id
     WHERE ft.season_year = ?
     ORDER BY ft.total_points DESC, roster_value DESC`,
    [leagueId, SEASON, SEASON, lastScoreWeek, SEASON, SEASON]
  );
}

async function fetchTeamWeeklyScores(leagueId: number): Promise<TeamWeekScore[]> {
  return query<TeamWeekScore>(
    `SELECT ft.id AS fantasy_team_id, ft.team_name, u.name AS user_name, ft.user_id,
            ftws.week, ftws.points
     FROM fantasy_team_weekly_scores ftws
     JOIN fantasy_teams ft ON ft.id = ftws.fantasy_team_id
     JOIN \`user\` u ON u.id = ft.user_id
     JOIN league_members lm ON lm.user_id = ft.user_id AND lm.league_id = ?
     WHERE ftws.season_year = ?
     ORDER BY ft.id, ftws.week`,
    [leagueId, SEASON]
  );
}

async function fetchTransactions(leagueId: number): Promise<TransactionRow[]> {
  return query<TransactionRow>(
    `SELECT pt.id, pt.transaction_type, pt.week, pt.price, pt.price_before, pt.price_after, pt.created_at,
            ft.team_name, u.name AS user_name, p.full_name, p.position, p.team_code, p.headshot_url
     FROM player_transactions pt
     JOIN fantasy_teams ft ON ft.id = pt.fantasy_team_id
     JOIN \`user\` u ON u.id = ft.user_id
     JOIN players p ON p.id = pt.player_id
     JOIN league_members lm ON lm.user_id = ft.user_id AND lm.league_id = ?
     WHERE pt.season_year = ?
     ORDER BY pt.created_at DESC, pt.id DESC LIMIT 10`,
    [leagueId, SEASON]
  );
}

async function fetchWeeklyWinners(leagueId: number): Promise<WeeklyWinnerRow[]> {
  return query<WeeklyWinnerRow>(
    `SELECT leaders.week, ft.team_name, u.name AS user_name, leaders.points
     FROM (
       SELECT ftws.week, ftws.fantasy_team_id, ftws.points,
              ROW_NUMBER() OVER (PARTITION BY ftws.week ORDER BY ftws.points DESC) AS row_num
       FROM fantasy_team_weekly_scores ftws
       JOIN fantasy_teams ft ON ft.id = ftws.fantasy_team_id
       JOIN league_members lm ON lm.user_id = ft.user_id AND lm.league_id = ?
       WHERE ftws.season_year = ?
     ) leaders
     JOIN fantasy_teams ft ON ft.id = leaders.fantasy_team_id
     JOIN \`user\` u ON u.id = ft.user_id
     WHERE leaders.row_num = 1
     ORDER BY leaders.week DESC LIMIT 6`,
    [leagueId, SEASON]
  );
}

async function fetchRosterValues(leagueId: number): Promise<ValueRow[]> {
  return query<ValueRow>(
    `SELECT ft.id AS fantasy_team_id, ft.team_name, u.name AS user_name,
            COALESCE(SUM(pms.current_price), 0) AS roster_value,
            COUNT(ftr.id) AS active_players
     FROM fantasy_teams ft
     JOIN \`user\` u ON u.id = ft.user_id
     JOIN league_members lm ON lm.user_id = ft.user_id AND lm.league_id = ?
     LEFT JOIN fantasy_team_roster ftr ON ftr.fantasy_team_id = ft.id AND ftr.is_active = TRUE
     LEFT JOIN player_market_state pms ON pms.player_id = ftr.player_id AND pms.season_year = ?
     WHERE ft.season_year = ?
     GROUP BY ft.id ORDER BY roster_value DESC LIMIT 6`,
    [leagueId, SEASON, SEASON]
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SectionCard({ title, sub, badge, children }: {
  title: string; sub?: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      borderRadius: 16, background: '#fff',
      border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '13px 18px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em' }}>{title}</h3>
          {sub && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{sub}</p>}
        </div>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f8fafc',
            border: '1px solid #e2e8f0', borderRadius: 20, padding: '3px 10px',
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ padding: '18px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>{msg}</div>;
}

// ── Page ───────────────────────────────────────────────────────────────────
export default async function LeaguePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;
  const { leagueId } = await searchParams;
  const requestedLeagueId = leagueId ? Number(leagueId) : null;

  const [currentWeek, lastScoreWeek, userLeagues, league] = await Promise.all([
    fetchCurrentWeek(),
    fetchLastScoreWeek(),
    fetchUserLeagues(userId),
    fetchLeagueSummary(userId, requestedLeagueId),
  ]);

  if (!league) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
        <Sidebar
          user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
          leagues={userLeagues} currentWeek={currentWeek} season={SEASON}
          logoUri={String(process.env.LOGO_URI)}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏆</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>No league selected</p>
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Join or create a league, then click it in the sidebar.</p>
          </div>
        </div>
      </div>
    );
  }

  const [standings, weeklyScores, transactions, weeklyWinners, rosterValues] = await Promise.all([
    fetchStandings(league.id, lastScoreWeek),
    fetchTeamWeeklyScores(league.id),
    fetchTransactions(league.id),
    fetchWeeklyWinners(league.id),
    fetchRosterValues(league.id),
  ]);

  const leaderPoints = Number(standings[0]?.total_points ?? 0);
  const myStanding   = standings.find(r => r.user_id === userId) ?? null;
  const secondPlace  = standings[1] ?? null;
  const avgPoints    = standings.length
    ? standings.reduce((s, r) => s + Number(r.total_points), 0) / standings.length : 0;
  const totalTx      = standings.reduce((s, r) => s + r.trade_count, 0);
  const mostActive   = [...standings].sort((a, b) => b.trade_count - a.trade_count)[0] ?? null;
  const bestWeek     = weeklyWinners[0] ?? null;
  const maxRosterVal = Number(rosterValues[0]?.roster_value ?? 1);

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
              borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0',
              padding: '4px 12px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>
                Season {SEASON} · Week {currentWeek}
              </span>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: '#0f172a', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800,
            }}>
              {session.user.name?.[0]?.toUpperCase() ?? '?'}
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Hero: football field + season chart ── */}
          <div style={{
            borderRadius: 20, overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          }}>
            {/* White title band */}
            <div style={{
              background: '#fff', borderBottom: '1px solid #e2e8f0',
              padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3 }}>
                  League Hub
                </div>
                <h1 style={{
                  fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em',
                  backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'inline-block',
                }}>
                  {league.name}
                </h1>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {[
                  { label: 'Your Rank', value: ordinal(myStanding?.rank ?? league.rank) },
                  { label: 'Members', value: `${league.member_count}/${league.max_members}` },
                  { label: 'Season', value: String(league.season_year) },
                ].map(chip => (
                  <div key={chip.label} style={{
                    borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
                    padding: '7px 14px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{chip.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', marginTop: 2, letterSpacing: '-0.02em' }}>{chip.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Football field background with chart */}
            <div style={{
              position: 'relative', overflow: 'hidden',
              background: 'repeating-linear-gradient(180deg, #1a7a32 0px, #1a7a32 40px, #1e8838 40px, #1e8838 80px)',
              padding: '20px 24px 12px',
            }}>
              {/* Yard lines (decorative horizontal stripes) */}
              {[15, 30, 45, 60, 75, 90].map(pct => (
                <div key={pct} style={{
                  position: 'absolute', left: 0, right: 0, top: `${pct}%`,
                  height: 1, background: 'rgba(255,255,255,0.12)',
                }} />
              ))}
              {/* Sideline accents */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 24, width: 2, background: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 24, width: 2, background: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />

              {/* Overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.22) 100%)',
              }} />

              {/* Chart */}
              <div style={{ position: 'relative', zIndex: 2 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
                  Points Race
                </div>
                {weeklyScores.length > 0 ? (
                  <LeagueChart
                    scores={weeklyScores}
                    userId={userId}
                    weeks={lastScoreWeek}
                  />
                ) : (
                  <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                      No weekly scores yet — check back after Week 1
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 4 stat tiles ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { label: 'Your Rank',      value: ordinal(myStanding?.rank ?? league.rank), sub: myStanding ? `${formatPoints(myStanding.total_points)} pts` : 'No team yet' },
              { label: 'League Leader',  value: standings[0]?.team_name ?? '—',           sub: leaderPoints ? `${formatPoints(leaderPoints)} pts` : 'No scores yet' },
              { label: 'Avg Score',      value: formatPoints(avgPoints),                   sub: 'points per team' },
              { label: 'Transactions',   value: String(totalTx),                           sub: 'season activity', accent: true },
            ].map(tile => (
              <div key={tile.label} style={{
                borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '14px 16px',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{tile.label}</p>
                <p style={{
                  fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1,
                  color: (tile as any).accent ? '#059669' : '#0f172a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tile.value}
                </p>
                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{tile.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Standings (full width) ── */}
          <SectionCard title="Standings" sub="Season totals · sorted by points" badge={`${standings.length} teams`}>
            {/* Column header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 80px 76px 84px 52px',
              padding: '7px 18px', background: '#fafafa', borderBottom: '1px solid #f1f5f9',
              fontSize: 9, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              <span>#</span><span>Team</span>
              <span style={{ textAlign: 'right' }}>Points</span>
              <span style={{ textAlign: 'right' }}>Last Wk</span>
              <span style={{ textAlign: 'right' }}>Value</span>
              <span style={{ textAlign: 'right' }}>Moves</span>
            </div>
            {standings.length === 0 && <Empty msg="No teams in this league yet." />}
            {standings.map((row, i) => {
              const isMe  = row.user_id === userId;
              const gap   = leaderPoints > 0 ? ((leaderPoints - Number(row.total_points)) / leaderPoints) * 100 : 0;
              const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;

              return (
                <div key={row.fantasy_team_id} style={{
                  display: 'grid', gridTemplateColumns: '44px 1fr 80px 76px 84px 52px',
                  alignItems: 'center', padding: '10px 18px',
                  borderBottom: i < standings.length - 1 ? '1px solid #f8fafc' : 'none',
                  background: isMe ? 'linear-gradient(90deg, rgba(16,185,129,0.06), rgba(240,253,250,0.3))' : 'transparent',
                }}>
                  {/* Rank */}
                  <div>
                    {medal
                      ? <span style={{ fontSize: 16 }}>{medal}</span>
                      : (
                        <div style={{
                          width: 26, height: 26, borderRadius: 8,
                          background: isMe ? '#f0fdf4' : '#f8fafc',
                          border: `1px solid ${isMe ? '#bbf7d0' : '#e2e8f0'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: isMe ? '#059669' : '#94a3b8',
                        }}>
                          {row.rank}
                        </div>
                      )
                    }
                  </div>

                  {/* Team + progress */}
                  <div style={{ paddingRight: 16, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.team_name}
                      </span>
                      {isMe && (
                        <span style={{
                          fontSize: 8, fontWeight: 800, color: '#059669', background: '#d1fae5',
                          borderRadius: 20, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
                        }}>
                          You
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 5 }}>{row.user_name}</div>
                    <div style={{ height: 3, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99, width: `${Math.max(6, 100 - gap)}%`,
                        background: isMe ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg,#94a3b8,#cbd5e1)',
                      }} />
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                    {formatPoints(row.total_points)}
                  </div>
                  <div style={{
                    textAlign: 'right', fontSize: 12, fontWeight: 700,
                    color: Number(row.last_week_points) > 0 ? '#10b981' : '#94a3b8',
                  }}>
                    {Number(row.last_week_points) > 0 ? formatPoints(row.last_week_points) : '—'}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#475569' }}>
                    {formatPrice(row.roster_value)}
                  </div>
                  <div style={{
                    textAlign: 'right', fontSize: 12, fontWeight: 700,
                    color: row.trade_count > 0 ? '#f59e0b' : '#cbd5e1',
                  }}>
                    {row.trade_count > 0 ? row.trade_count : '—'}
                  </div>
                </div>
              );
            })}
          </SectionCard>

          {/* ── Three-column insight row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

            {/* Race Snapshot — dark */}
            <div style={{
              borderRadius: 16, overflow: 'hidden',
              background: 'linear-gradient(160deg,#0f172a 0%,#1e293b 100%)',
              border: '1px solid #1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}>
              <div style={{ padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>League Pulse</div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Race Snapshot</h3>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  {
                    label: 'Title Race', accent: '#34d399', bg: 'rgba(255,255,255,0.06)',
                    title: standings[0]?.team_name ?? 'No leader yet',
                    sub: secondPlace
                      ? `${formatPoints(leaderPoints - Number(secondPlace.total_points))} pts ahead of ${secondPlace.team_name}`
                      : 'No challenger yet',
                  },
                  {
                    label: 'Most Active', accent: '#34d399', bg: 'rgba(16,185,129,0.10)',
                    title: mostActive?.team_name ?? '—',
                    sub: mostActive ? `${mostActive.trade_count} total moves` : 'No moves yet',
                  },
                  {
                    label: 'Best Recent Week', accent: '#7dd3fc', bg: 'rgba(14,165,233,0.10)',
                    title: bestWeek?.team_name ?? '—',
                    sub: bestWeek ? `Wk ${bestWeek.week} · ${formatPoints(bestWeek.points)} pts` : 'No completed weeks',
                  },
                ].map(item => (
                  <div key={item.label} style={{
                    borderRadius: 12, background: item.bg,
                    border: `1px solid ${item.bg === 'rgba(255,255,255,0.06)' ? 'rgba(255,255,255,0.08)' : item.accent + '26'}`,
                    padding: '10px 12px',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: item.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weekly Winners */}
            <SectionCard title="Weekly Winners" sub="Top scorer per completed week">
              {weeklyWinners.length === 0 && <Empty msg="No completed weeks yet." />}
              {weeklyWinners.map((w, i) => (
                <div key={w.week} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 18px',
                  borderBottom: i < weeklyWinners.length - 1 ? '1px solid #f8fafc' : 'none',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: '#94a3b8', background: '#f8fafc',
                        border: '1px solid #e2e8f0', borderRadius: 20, padding: '1px 6px',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}>Wk {w.week}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{w.team_name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{w.user_name}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#f59e0b', letterSpacing: '-0.02em' }}>
                    {formatPoints(w.points)}
                  </div>
                </div>
              ))}
            </SectionCard>

            {/* Most Valuable Squads */}
            <SectionCard title="Most Valuable Squads" sub="Roster value at current market prices">
              {rosterValues.length === 0 && <Empty msg="No roster data yet." />}
              {rosterValues.map((team, i) => {
                const pct = maxRosterVal > 0 ? (Number(team.roster_value) / maxRosterVal) * 100 : 0;
                return (
                  <div key={team.fantasy_team_id} style={{
                    padding: '9px 18px',
                    borderBottom: i < rosterValues.length - 1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: '#94a3b8', background: '#f8fafc',
                            border: '1px solid #e2e8f0', borderRadius: 20, padding: '1px 5px',
                          }}>#{i + 1}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{team.team_name}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          {team.user_name} · {team.active_players} players
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#0ea5e9', letterSpacing: '-0.02em' }}>
                        {formatPrice(team.roster_value)}
                      </div>
                    </div>
                    <div style={{ height: 3, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 99, width: `${pct}%`,
                        background: 'linear-gradient(90deg,#0ea5e9,#38bdf8)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </SectionCard>
          </div>

          {/* ── Recent Activity (full width) ── */}
          <SectionCard title="Recent Activity" sub="Latest buy & sell transactions across the league" badge={`Last ${transactions.length}`}>
            {transactions.length === 0 && <Empty msg="No transaction history for this league yet." />}
            {transactions.map((tx, i) => {
              const isBuy      = tx.transaction_type === 'buy';
              const priceDelta = Number(tx.price_after) - Number(tx.price_before);
              return (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '9px 18px',
                  borderBottom: i < transactions.length - 1 ? '1px solid #f8fafc' : 'none',
                }}>
                  <div style={{ flexShrink: 0, position: 'relative', marginTop: 2 }}>
                    {tx.headshot_url ? (
                      <Image
                        src={tx.headshot_url} alt={tx.full_name}
                        width={32} height={32} unoptimized
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #e2e8f0', display: 'block' }}
                      />
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#64748b',
                      }}>
                        {tx.full_name[0]}
                      </div>
                    )}
                    {/* Buy/Sell indicator dot */}
                    <div style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 11, height: 11, borderRadius: '50%',
                      background: isBuy ? '#10b981' : '#f43f5e',
                      border: '1.5px solid #fff',
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{tx.team_name}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{tx.user_name}</span>
                      <span style={{
                        fontSize: 8, fontWeight: 800, color: isBuy ? '#059669' : '#f43f5e',
                        background: isBuy ? '#f0fdf4' : '#fff1f2', borderRadius: 20,
                        padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}>{tx.transaction_type}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                      {isBuy ? 'Added ' : 'Sold '}
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>{tx.full_name}</span>
                      <span style={{
                        marginLeft: 5, fontSize: 9, fontWeight: 700, color: '#64748b',
                        background: '#f1f5f9', borderRadius: 20, padding: '1px 5px', textTransform: 'uppercase',
                      }}>{tx.position} · {tx.team_code}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 10, color: '#94a3b8' }}>
                      <span>{formatPrice(tx.price)}</span>
                      <span style={{ color: priceDelta >= 0 ? '#10b981' : '#f43f5e' }}>
                        {priceDelta >= 0 ? '▲' : '▼'} {formatPrice(Math.abs(priceDelta))} market
                      </span>
                      <span>Wk {tx.week}</span>
                      <span style={{ marginLeft: 'auto' }}>{formatTransactionTime(tx.created_at)}</span>
                    </div>
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
