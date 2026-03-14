import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ hasTeam: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') ?? '0', 10);
  if (!season) return NextResponse.json({ hasTeam: false }, { status: 400 });

  const [row] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [session.user.id, season]
  );

  return NextResponse.json({ hasTeam: !!row });
}
