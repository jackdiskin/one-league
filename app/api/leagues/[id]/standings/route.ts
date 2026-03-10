import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/mysql';

// GET /api/leagues/[id]/standings
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const { id } = await params;
  const leagueId = Number(id);

  // Must be a member to view standings
  const [membership] = await query<{ id: number }>(
    `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`,
    [leagueId, userId]
  );
  if (!membership) return NextResponse.json({ error: 'Not a league member' }, { status: 403 });

  const standings = await query<{
    rank: number;
    fantasy_team_id: number;
    team_name: string;
    user_name: string;
    total_points: number;
    budget_remaining: number;
    weeks_played: number;
  }>(
    `SELECT
       RANK() OVER (ORDER BY ft.total_points DESC) AS \`rank\`,
       ft.id                                        AS fantasy_team_id,
       ft.team_name,
       u.name                                       AS user_name,
       ft.total_points,
       ft.budget_remaining,
       COUNT(ftws.id)                               AS weeks_played
     FROM fantasy_teams ft
     JOIN users u ON u.id = ft.user_id
     LEFT JOIN fantasy_team_weekly_scores ftws ON ftws.fantasy_team_id = ft.id
     WHERE ft.league_id = ?
     GROUP BY ft.id
     ORDER BY ft.total_points DESC`,
    [leagueId]
  );

  return NextResponse.json({ data: standings });
}
