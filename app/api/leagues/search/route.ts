import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

const SEASON = 2026;

// GET /api/leagues/search?name=... — find leagues by name (public or private)
// so a user can look one up to join. Whether a password is required is
// decided client-side from is_public; the password itself is never returned.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('name')?.trim() ?? '';
  if (name.length < 2) return NextResponse.json({ data: [] });

  const leagues = await query<{
    id: number; name: string; is_public: number; member_count: number;
  }>(
    `SELECT l.id, l.name, l.is_public, COUNT(lm.id) AS member_count
     FROM leagues l
     LEFT JOIN league_members lm ON lm.league_id = l.id
     WHERE l.is_global = 0 AND l.season_year = ?
       AND l.name LIKE ?
       AND l.id NOT IN (
         SELECT league_id FROM league_members WHERE user_id = ?
       )
     GROUP BY l.id
     ORDER BY l.name ASC
     LIMIT 10`,
    [SEASON, `%${name}%`, session.user.id]
  );

  return NextResponse.json({ data: leagues });
}
