import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

const SEASON = 2026;

// POST /api/leagues/join — join by league_id (resolved via /api/leagues/search
// or the public browser). Private leagues require the matching password;
// public leagues need nothing else.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { league_id, password } = await req.json();

  if (!league_id) {
    return NextResponse.json({ error: 'Provide league_id' }, { status: 400 });
  }

  const [league] = await query<{
    id: number; is_public: number; invite_code: string | null; name: string;
  }>(
    `SELECT l.id, l.is_public, l.invite_code, l.name
     FROM leagues l
     WHERE l.id = ? AND l.season_year = ?`,
    [league_id, SEASON]
  );
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

  if (!league.is_public) {
    if (!password || password !== league.invite_code) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
    }
  }

  // Check not already a member
  const [alreadyMember] = await query<{ id: number }>(
    `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`,
    [league.id, userId]
  );
  if (alreadyMember) return NextResponse.json({ error: 'You are already in this league' }, { status: 409 });

  // Verify the user has an existing team this season
  const [existingTeam] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, SEASON]
  );
  if (!existingTeam) {
    return NextResponse.json(
      { error: 'You must complete the onboarding draft before joining a league' },
      { status: 400 }
    );
  }

  // Add user to league_members — their existing fantasy_team is shared across leagues
  await query(
    `INSERT INTO league_members (league_id, user_id, role) VALUES (?, ?, 'member')`,
    [league.id, userId]
  );

  return NextResponse.json({ data: { league_id: league.id, league_name: league.name } }, { status: 201 });
}
