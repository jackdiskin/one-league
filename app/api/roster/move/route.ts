import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';

// Valid named starter slots — bench players always use 'BENCH'
const VALID_STARTER_SLOTS = new Set(['QB1', 'RB1', 'RB2', 'WR1', 'WR2', 'WR3', 'WR4', 'K1']);

// POST /api/roster/move
// Moves a single player to a new slot (starter → BENCH, or BENCH → starter slot)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fantasy_team_id, player_id, target_slot } = await req.json();
  if (!fantasy_team_id || !player_id || !target_slot) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  if (target_slot !== 'BENCH' && !VALID_STARTER_SLOTS.has(target_slot)) {
    return NextResponse.json({ error: 'Invalid target slot' }, { status: 400 });
  }

  try {
    await withTransaction(async (conn) => {
      // Verify player is on this team
      const [rows] = await conn.execute<any[]>(
        `SELECT ftr.id, ftr.roster_slot FROM fantasy_team_roster ftr
         JOIN fantasy_teams ft ON ft.id = ftr.fantasy_team_id
         WHERE ftr.fantasy_team_id = ? AND ftr.player_id = ?
           AND ftr.is_active = TRUE AND ft.user_id = ?
         FOR UPDATE`,
        [fantasy_team_id, player_id, session.user.id]
      );
      if (!rows.length) throw new Error('Player not on roster');

      const current_slot = rows[0].roster_slot;
      if (current_slot === target_slot) throw new Error('Player is already in that slot');

      // If moving to a named starter slot, ensure it's not already occupied
      if (target_slot !== 'BENCH') {
        const [occupied] = await conn.execute<any[]>(
          `SELECT id FROM fantasy_team_roster
           WHERE fantasy_team_id = ? AND roster_slot = ? AND is_active = TRUE`,
          [fantasy_team_id, target_slot]
        );
        if ((occupied as any[]).length > 0) throw new Error('Slot already occupied');
      }

      await conn.execute(
        `UPDATE fantasy_team_roster SET roster_slot = ?
         WHERE fantasy_team_id = ? AND player_id = ? AND is_active = TRUE`,
        [target_slot, fantasy_team_id, player_id]
      );
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Move failed' }, { status: 500 });
  }
}
