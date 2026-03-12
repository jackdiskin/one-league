import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import MyTeamSummary   from './_components/MyTeamSummary';
import TopMovers       from './_components/TopMovers';
import StandingsCard   from './_components/StandingsCard';
import DiscoverLeagues from './_components/DiscoverLeagues';
import MarketPulse     from './_components/MarketPulse';
import Sidebar, { type SidebarLeague } from './_components/Sidebar';

const SEASON = 2025;

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-2xl bg-slate-100 animate-pulse ${className}`} />;
}

async function fetchCurrentWeek(): Promise<number> {
  const [row] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_price_weeks WHERE season_year = ?`, [SEASON]
  );
  return row?.w ?? 1;
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

async function fetchDiscoverLeagues(userId: string) {
  return query<{
    id: number; name: string; season_year: number;
    salary_cap: number; member_count: number; max_members: number;
  }>(
    `SELECT l.id, l.name, l.season_year, l.salary_cap, l.max_members,
            COUNT(lm.id) AS member_count
     FROM leagues l
     LEFT JOIN league_members lm ON lm.league_id = l.id
     LEFT JOIN league_members my ON my.league_id = l.id AND my.user_id = ?
     WHERE l.is_public = TRUE AND my.id IS NULL
     GROUP BY l.id ORDER BY l.created_at DESC LIMIT 4`,
    [userId]
  );
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId    = session.user.id;
  const firstName = session.user.name?.split(' ')[0] ?? 'there';

  // New users with no team yet → onboarding
  const [teamCheck] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, SEASON]
  );
  if (!teamCheck) redirect('/onboarding/draft');

  const [currentWeek, discoverLeagues, userLeagues] = await Promise.all([
    fetchCurrentWeek(),
    fetchDiscoverLeagues(userId),
    fetchUserLeagues(userId),
  ]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>

      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-200/40 via-sky-200/30 to-indigo-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-[-80px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-sky-200/40 via-indigo-200/25 to-emerald-200/20 blur-3xl" />
      </div>

      {/* Sidebar */}
      <Sidebar
        user={{ name: session.user.name ?? 'User', email: session.user.email ?? '' }}
        leagues={userLeagues}
        currentWeek={currentWeek}
        season={SEASON}
        logoUri={String(process.env.LOGO_URI)}
      />

      {/* Main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-50 ring-1 ring-slate-200 px-3 py-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-slate-600">
                Season {SEASON} · Week {currentWeek}
              </span>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-slate-700 transition-colors">
                {session.user.name?.[0]?.toUpperCase() ?? '?'}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 space-y-6">

          {/* Greeting */}
          <div style={{ paddingLeft: 10 }}>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Welcome back,{' '}
              <span
                style={{
                  backgroundImage: 'linear-gradient(135deg, #0f172a 0%, #334155 50%, #059669 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {firstName}
              </span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Week {currentWeek} · {SEASON} NFL season
            </p>
          </div>

          {/* My Team */}
          <Suspense fallback={<Skeleton className="h-48" />}>
            <MyTeamSummary userId={userId} seasonYear={SEASON} />
          </Suspense>

          {/* Top Movers */}
          <Suspense fallback={
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-72" />
              <Skeleton className="h-72" />
            </div>
          }>
            <TopMovers seasonYear={SEASON} />
          </Suspense>

          {/* Bottom row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Suspense fallback={<Skeleton className="h-72" />}>
              <StandingsCard userId={userId} seasonYear={SEASON} />
            </Suspense>

            <DiscoverLeagues leagues={discoverLeagues} />

            <Suspense fallback={<Skeleton className="h-72" />}>
              <MarketPulse seasonYear={SEASON} />
            </Suspense>
          </div>

        </main>
      </div>
    </div>
  );
}
