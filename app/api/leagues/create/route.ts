import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { withTransaction } from '@/lib/mysql';
import type { ResultSetHeader } from 'mysql2';

const SEASON = 2025;

function generateInviteCode(): string {
  // Unambiguous alphanumeric characters (no 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, visibility } = await req.json();

  if (!name?.trim() || name.trim().length < 2) {
    return NextResponse.json({ error: 'League name must be at least 2 characters' }, { status: 400 });
  }
  if (!['public', 'private'].includes(visibility)) {
    return NextResponse.json({ error: 'Visibility must be public or private' }, { status: 400 });
  }

  const isPublic    = visibility === 'public';
  const invite_code = isPublic ? null : generateInviteCode();

  const result = await withTransaction(async (conn) => {
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO leagues (name, season_year, salary_cap, max_members, is_public, invite_code, owner_user_id)
       VALUES (?, ?, 100.00, 20, ?, ?, ?)`,
      [name.trim(), SEASON, isPublic ? 1 : 0, invite_code, session.user.id]
    );
    const leagueId = res.insertId;

    await conn.execute(
      `INSERT INTO league_members (league_id, user_id, role) VALUES (?, ?, 'commissioner')`,
      [leagueId, session.user.id]
    );

    return { league_id: leagueId, invite_code };
  });

  return NextResponse.json({ data: result }, { status: 201 });
}
