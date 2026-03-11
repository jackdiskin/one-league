import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { withTransaction } from '@/lib/mysql';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { fantasy_team_id, player_a_id, player_b_id } = await req.json();
  if (!fantasy_team_id || !player_a_id || !player_b_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    await withTransaction(async (conn) => {
      // Verify both players are on this team and get their current slots
      const [rows] = await conn.execute<any[]>(
        `SELECT player_id, roster_slot FROM fantasy_team_roster
         WHERE fantasy_team_id = ? AND player_id IN (?, ?) AND is_active = TRUE
         FOR UPDATE`,
        [fantasy_team_id, player_a_id, player_b_id]
      );

      if (rows.length !== 2) throw new Error('Players not found on roster');

      const rowA = rows.find((r: any) => r.player_id === player_a_id);
      const rowB = rows.find((r: any) => r.player_id === player_b_id);
      if (!rowA || !rowB) throw new Error('Players not found on roster');

      // Swap slots
      await conn.execute(
        `UPDATE fantasy_team_roster SET roster_slot = ? WHERE fantasy_team_id = ? AND player_id = ? AND is_active = TRUE`,
        [rowB.roster_slot, fantasy_team_id, player_a_id]
      );
      await conn.execute(
        `UPDATE fantasy_team_roster SET roster_slot = ? WHERE fantasy_team_id = ? AND player_id = ? AND is_active = TRUE`,
        [rowA.roster_slot, fantasy_team_id, player_b_id]
      );
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Swap failed' }, { status: 500 });
  }
}
