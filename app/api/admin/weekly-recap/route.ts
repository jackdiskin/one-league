import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';

function isAuthorized(request: NextRequest) {
  return request.headers.get('x-admin-secret') === process.env.ADMIN_SECRET;
}

// GET /api/admin/weekly-recap?leagueId=X&season=Y
// Returns the active recap flag for a league (if any)
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');
  const season = searchParams.get('season');

  if (!leagueId || !season) {
    return NextResponse.json({ error: 'leagueId and season are required' }, { status: 400 });
  }

  const rows = await query<{ league_id: number; season_year: number; week: number; is_active: boolean; triggered_at: string }>(
    `SELECT league_id, season_year, week, is_active, triggered_at
     FROM weekly_recap_flags
     WHERE league_id = ? AND season_year = ? AND is_active = TRUE
     ORDER BY week DESC LIMIT 1`,
    [Number(leagueId), Number(season)]
  );

  return NextResponse.json({ data: rows[0] ?? null });
}

// POST /api/admin/weekly-recap
// Body: { leagueId, season_year, week }
// Enables the weekly recap for that league+week (disables any previously active one first)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { leagueId, season_year, week } = await request.json() as {
    leagueId: number;
    season_year: number;
    week: number;
  };

  if (!leagueId || !season_year || !week) {
    return NextResponse.json({ error: 'leagueId, season_year, and week are required' }, { status: 400 });
  }

  // Deactivate any previous active recap for this league+season
  await query(
    `UPDATE weekly_recap_flags SET is_active = FALSE
     WHERE league_id = ? AND season_year = ?`,
    [leagueId, season_year]
  );

  // Insert (or re-activate) the new recap flag
  await query(
    `INSERT INTO weekly_recap_flags (league_id, season_year, week, is_active, triggered_at)
     VALUES (?, ?, ?, TRUE, NOW())
     ON DUPLICATE KEY UPDATE is_active = TRUE, triggered_at = NOW()`,
    [leagueId, season_year, week]
  );

  return NextResponse.json({ data: { leagueId, season_year, week, is_active: true } });
}

// DELETE /api/admin/weekly-recap
// Body: { leagueId, season_year }
// Deactivates the recap for a league (called by cron when next week's first game kicks off)
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { leagueId, season_year } = await request.json() as {
    leagueId: number;
    season_year: number;
  };

  if (!leagueId || !season_year) {
    return NextResponse.json({ error: 'leagueId and season_year are required' }, { status: 400 });
  }

  await query(
    `UPDATE weekly_recap_flags SET is_active = FALSE
     WHERE league_id = ? AND season_year = ?`,
    [leagueId, season_year]
  );

  return NextResponse.json({ data: { deactivated: true } });
}
