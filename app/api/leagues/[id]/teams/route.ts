import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

// POST /api/leagues/[id]/teams — createFantasyTeam
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { id } = await params;
  const leagueId = Number(id);
  const { team_name } = await request.json();

  if (!team_name?.trim()) {
    return NextResponse.json({ error: 'team_name is required' }, { status: 400 });
  }

  // Must be a league member
  const [membership] = await query<{ id: number }>(
    `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`,
    [leagueId, userId]
  );
  if (!membership) return NextResponse.json({ error: 'Not a league member' }, { status: 403 });

  // Cannot already have a team in this league
  const [existing] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE league_id = ? AND user_id = ?`,
    [leagueId, userId]
  );
  if (existing) return NextResponse.json({ error: 'Team already exists for this league' }, { status: 409 });

  const [league] = await query<{ salary_cap: number; season_year: number }>(
    `SELECT salary_cap, season_year FROM leagues WHERE id = ?`,
    [leagueId]
  );
  if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

  const [result] = await query<import('mysql2').ResultSetHeader>(
    `INSERT INTO fantasy_teams (league_id, user_id, team_name, season_year, budget_remaining)
     VALUES (?, ?, ?, ?, ?)`,
    [leagueId, userId, team_name.trim(), league.season_year, league.salary_cap]
  );

  return NextResponse.json({
    data: {
      id: (result as unknown as import('mysql2').ResultSetHeader).insertId,
      league_id: leagueId,
      team_name: team_name.trim(),
      season_year: league.season_year,
      budget_remaining: league.salary_cap,
    }
  }, { status: 201 });
}
