import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { withTransaction } from '@/lib/mysql';
import type { ResultSetHeader } from 'mysql2';

const SEASON = 2026;
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 64;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, visibility, password } = await req.json();

  if (!name?.trim() || name.trim().length < 2) {
    return NextResponse.json({ error: 'League name must be at least 2 characters' }, { status: 400 });
  }
  if (!['public', 'private'].includes(visibility)) {
    return NextResponse.json({ error: 'Visibility must be public or private' }, { status: 400 });
  }

  const isPublic = visibility === 'public';

  let invite_code: string | null = null;
  if (!isPublic) {
    invite_code = String(password ?? '').trim();
    if (invite_code.length < PASSWORD_MIN_LENGTH || invite_code.length > PASSWORD_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
        { status: 400 }
      );
    }
  }

  let result: { league_id: number; invite_code: string | null };
  try {
    result = await withTransaction(async (conn) => {
      const [res] = await conn.execute<ResultSetHeader>(
        `INSERT INTO leagues (name, season_year, salary_cap, max_members, is_public, invite_code, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name.trim(), SEASON, 100_000_000, 2_147_483_647, isPublic ? 1 : 0, invite_code, session.user.id]
      );
      const leagueId = res.insertId;

      await conn.execute(
        `INSERT INTO league_members (league_id, user_id, role) VALUES (?, ?, 'commissioner')`,
        [leagueId, session.user.id]
      );

      return { league_id: leagueId, invite_code };
    });
  } catch (err) {
    if (!isPublic && (err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'That password is already taken — try another' }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ data: result }, { status: 201 });
}
