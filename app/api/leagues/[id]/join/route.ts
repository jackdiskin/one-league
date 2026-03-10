import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';

// POST /api/leagues/[id]/join
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { id } = await params;
  const leagueId = Number(id);
  const body = await request.json().catch(() => ({}));
  const { invite_code } = body;

  const [league] = await query<{
    id: number; is_public: number; invite_code: string | null; max_members: number;
  }>(
    `SELECT l.id, l.is_public, l.invite_code, l.max_members,
            COUNT(lm.id) AS member_count
     FROM leagues l
     LEFT JOIN league_members lm ON lm.league_id = l.id
     WHERE l.id = ?
     GROUP BY l.id`,
    [leagueId]
  );

  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

  if (!league.is_public) {
    if (!invite_code || invite_code !== league.invite_code) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 });
    }
  }

  const [existing] = await query<{ id: number }>(
    `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`,
    [leagueId, userId]
  );
  if (existing) return NextResponse.json({ error: 'Already a member' }, { status: 409 });

  await withTransaction(async (conn) => {
    // Re-check member count inside transaction to avoid race conditions
    const [count] = await conn.execute<import('mysql2').RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM league_members WHERE league_id = ?`,
      [leagueId]
    ) as [import('mysql2').RowDataPacket[], unknown];
    if (count[0].cnt >= league.max_members) {
      throw Object.assign(new Error('League is full'), { status: 409 });
    }

    await conn.execute(
      `INSERT INTO league_members (league_id, user_id, role) VALUES (?, ?, 'member')`,
      [leagueId, userId]
    );
  });

  return NextResponse.json({ data: { league_id: leagueId, user_id: userId, role: 'member' } }, { status: 201 });
}
