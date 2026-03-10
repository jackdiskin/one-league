import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';

// POST /api/leagues — createLeague
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const body = await request.json();
  const {
    name,
    season_year,
    salary_cap = 200_000_000,
    is_public = false,
    invite_code = null,
    max_members = 12,
  } = body;

  if (!name || !season_year) {
    return NextResponse.json({ error: 'name and season_year are required' }, { status: 400 });
  }

  const league = await withTransaction(async (conn) => {
    const [result] = await conn.execute<import('mysql2').ResultSetHeader>(
      `INSERT INTO leagues (name, owner_user_id, season_year, salary_cap, is_public, invite_code, max_members)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, userId, season_year, salary_cap, is_public, invite_code, max_members]
    );
    const leagueId = result.insertId;

    // Owner is automatically a member
    await conn.execute(
      `INSERT INTO league_members (league_id, user_id, role) VALUES (?, ?, 'owner')`,
      [leagueId, userId]
    );

    return { id: leagueId, name, season_year, salary_cap, is_public, invite_code, max_members };
  });

  return NextResponse.json({ data: league }, { status: 201 });
}

// GET /api/leagues — list public leagues (or leagues the user belongs to)
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  const leagues = await query<{
    id: number; name: string; season_year: number; salary_cap: number;
    is_public: number; max_members: number; member_count: number; role: string | null;
  }>(
    `SELECT l.id, l.name, l.season_year, l.salary_cap, l.is_public, l.max_members,
            COUNT(lm2.id) AS member_count,
            my.role
     FROM leagues l
     LEFT JOIN league_members lm2 ON lm2.league_id = l.id
     LEFT JOIN league_members my  ON my.league_id = l.id AND my.user_id = ?
     WHERE l.is_public = TRUE OR my.user_id = ?
     GROUP BY l.id`,
    [userId, userId]
  );

  return NextResponse.json({ data: leagues });
}
