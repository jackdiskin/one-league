import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

const SEASON = 2025;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { league_id, invite_code } = await req.json();

  // Resolve league by id or invite code
  let league: { id: number; is_public: number; invite_code: string | null; max_members: number; member_count: number; name: string } | undefined;

  if (league_id) {
    [league] = await query<typeof league & {}>(
      `SELECT l.id, l.is_public, l.invite_code, l.max_members, l.name,
              COUNT(lm.id) AS member_count
       FROM leagues l
       LEFT JOIN league_members lm ON lm.league_id = l.id
       WHERE l.id = ? AND l.season_year = ?
       GROUP BY l.id`,
      [league_id, SEASON]
    );
  } else if (invite_code) {
    [league] = await query<typeof league & {}>(
      `SELECT l.id, l.is_public, l.invite_code, l.max_members, l.name,
              COUNT(lm.id) AS member_count
       FROM leagues l
       LEFT JOIN league_members lm ON lm.league_id = l.id
       WHERE l.invite_code = ? AND l.season_year = ?
       GROUP BY l.id`,
      [invite_code.trim().toUpperCase(), SEASON]
    );
    if (league && league.invite_code !== invite_code.trim().toUpperCase()) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ error: 'Provide league_id or invite_code' }, { status: 400 });
  }

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.member_count >= league.max_members) return NextResponse.json({ error: 'League is full' }, { status: 409 });

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
