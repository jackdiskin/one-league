import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

const SEASON = 2025;

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leagues = await query<{
    id: number; name: string; member_count: number; max_members: number;
  }>(
    `SELECT l.id, l.name, l.max_members, COUNT(lm.id) AS member_count
     FROM leagues l
     LEFT JOIN league_members lm ON lm.league_id = l.id
     WHERE l.is_public = 1 AND l.season_year = ?
       AND l.id NOT IN (
         SELECT league_id FROM league_members WHERE user_id = ?
       )
     GROUP BY l.id
     HAVING member_count < l.max_members
     ORDER BY member_count DESC
     LIMIT 30`,
    [SEASON, session.user.id]
  );

  return NextResponse.json({ data: leagues });
}
