import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

// POST /api/leagues/[id]/leave
// Leaves a private league. The season's Global Leaderboard can never be left
// — every drafted team is auto-enrolled in it for the life of the season.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { id } = await params;
  const leagueId = Number(id);

  const [league] = await query<{ id: number; is_global: number }>(
    `SELECT id, is_global FROM leagues WHERE id = ?`,
    [leagueId]
  );
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  if (league.is_global) {
    return NextResponse.json({ error: 'You cannot leave the Global Leaderboard' }, { status: 403 });
  }

  const [membership] = await query<{ id: number }>(
    `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`,
    [leagueId, userId]
  );
  if (!membership) return NextResponse.json({ error: 'Not a member of this league' }, { status: 404 });

  await query(`DELETE FROM league_members WHERE league_id = ? AND user_id = ?`, [leagueId, userId]);

  return NextResponse.json({ data: { left: true } });
}
