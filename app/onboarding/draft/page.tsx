import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';
import DraftBoard, { type DraftPlayer, type PublicLeague } from './_components/DraftBoard';

const SEASON = 2025;

async function fetchPlayers(): Promise<DraftPlayer[]> {
  return query<DraftPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            COALESCE(pms.current_price, 20000000) AS current_price
     FROM players p
     LEFT JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.position IN ('QB','RB','WR','TE','K')
     ORDER BY COALESCE(pms.current_price, 20000000) DESC`,
    [SEASON]
  );
}

async function fetchPublicLeagues(): Promise<PublicLeague[]> {
  return query<PublicLeague>(
    `SELECT l.id, l.name, l.season_year, l.salary_cap, l.max_members,
            COUNT(lm.id) AS member_count
     FROM leagues l
     LEFT JOIN league_members lm ON lm.league_id = l.id
     WHERE l.is_public = TRUE
     GROUP BY l.id
     HAVING member_count < l.max_members
     ORDER BY member_count DESC
     LIMIT 8`,
    []
  );
}

export default async function OnboardingDraftPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/auth/sign-in');

  const userId = session.user.id;

  // If user already has a team, skip onboarding
  const [existing] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, SEASON]
  );
  if (existing) redirect('/dashboard');

  const [players, publicLeagues] = await Promise.all([
    fetchPlayers(),
    fetchPublicLeagues(),
  ]);

  return (
    <DraftBoard
      players={players}
      publicLeagues={publicLeagues}
      userName={session.user.name ?? 'Manager'}
      season={SEASON}
    />
  );
}
