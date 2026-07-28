import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';

const SEASON      = 2026;
const CAP         = 100_000_000;
const QUOTA       = { QB: 2, RB: 3, FLEX: 5 };
const GLOBAL_LEADERBOARD_NAME = 'Global Leaderboard';

// POST /api/onboarding/draft
// Body: { team_name, player_ids[10], season_year? }
// One team per user per season, shared across every league (FPL model) — no
// league selection at draft time. Every drafted team is auto-enrolled in the
// season's Global Leaderboard; private leagues are joined separately via a code.
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  const { team_name, player_ids, season_year = SEASON } = await request.json();

  if (!team_name || typeof team_name !== 'string' || team_name.trim().length < 2) {
    return NextResponse.json({ error: 'team_name must be at least 2 characters' }, { status: 400 });
  }

  if (!Array.isArray(player_ids) || player_ids.length !== 10) {
    return NextResponse.json({ error: 'Must select exactly 10 players' }, { status: 400 });
  }

  // Validate user doesn't already have a team this season
  const [existing] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, season_year]
  );
  if (existing) return NextResponse.json({ error: 'You already have a team this season' }, { status: 409 });

  // Fetch player prices to validate budget and build roster slots
  const placeholders = player_ids.map(() => '?').join(',');
  const players = await query<{
    id: number; position: string; current_price: number;
  }>(
    `SELECT p.id, p.position, COALESCE(pms.current_price, 20000000) AS current_price
     FROM players p
     LEFT JOIN player_market_state pms ON pms.player_id = p.id AND pms.season_year = ?
     WHERE p.id IN (${placeholders})`,
    [season_year, ...player_ids]
  );

  if (players.length !== 10) {
    return NextResponse.json({ error: 'One or more players not found' }, { status: 400 });
  }

  // Validate quotas
  const qbCount   = players.filter(p => p.position === 'QB').length;
  const rbCount   = players.filter(p => p.position === 'RB').length;
  const flexCount = players.filter(p => p.position === 'WR' || p.position === 'TE').length;

  if (qbCount !== QUOTA.QB || rbCount !== QUOTA.RB || flexCount !== QUOTA.FLEX) {
    return NextResponse.json({
      error: `Invalid roster composition. Required: ${QUOTA.QB} QB, ${QUOTA.RB} RB, ${QUOTA.FLEX} WR/TE`,
    }, { status: 400 });
  }

  const totalCost = players.reduce((s, p) => s + Number(p.current_price), 0);
  if (totalCost > CAP) {
    return NextResponse.json({ error: 'Selection exceeds salary cap' }, { status: 400 });
  }

  // Build slot assignments
  // Starting lineup: 1 QB, 2 RB, 3 WR/TE — extras go to BENCH
  function shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  const slotMap = new Map<number, string>();
  const qbs    = shuffle(players.filter(p => p.position === 'QB'));
  const rbs    = shuffle(players.filter(p => p.position === 'RB'));
  const flex   = shuffle(players.filter(p => p.position === 'WR' || p.position === 'TE'));

  // Starters first, bench after
  qbs.forEach((p, i)  => slotMap.set(p.id, i < 1 ? `QB${i + 1}` : 'BENCH'));
  rbs.forEach((p, i)  => slotMap.set(p.id, i < 2 ? `RB${i + 1}` : 'BENCH'));
  flex.forEach((p, i) => slotMap.set(p.id, i < 3 ? `WR${i + 1}` : 'BENCH'));

  const budgetRemaining = CAP - totalCost;

  await withTransaction(async (conn) => {
    // Find or create this season's Global Leaderboard — every drafted team is
    // auto-enrolled in it, no invite/selection needed. Locked with FOR UPDATE
    // so two simultaneous first-drafts of the season can't both create one.
    const [globalRows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM leagues WHERE season_year = ? AND is_global = 1 LIMIT 1 FOR UPDATE`,
      [season_year]
    ) as [RowDataPacket[], unknown];

    let globalLeagueId: number;
    if (globalRows[0]) {
      globalLeagueId = globalRows[0].id;
    } else {
      const [globalResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO leagues (name, owner_user_id, season_year, salary_cap, is_public, is_global, max_members)
         VALUES (?, ?, ?, ?, 0, 1, 2147483647)`,
        [GLOBAL_LEADERBOARD_NAME, userId, season_year, CAP]
      );
      globalLeagueId = globalResult.insertId;
    }

    await conn.execute(
      `INSERT IGNORE INTO league_members (league_id, user_id, role) VALUES (?, ?, 'member')`,
      [globalLeagueId, userId]
    );

    // Create fantasy team — one per user per season, shared across every league
    const [teamResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO fantasy_teams (user_id, team_name, season_year, budget_remaining)
       VALUES (?, ?, ?, ?)`,
      [userId, team_name.trim(), season_year, budgetRemaining]
    );
    const teamId = teamResult.insertId;

    // Insert roster entries
    for (const player of players) {
      const slot = slotMap.get(player.id) ?? 'BENCH';
      await conn.execute(
        `INSERT INTO fantasy_team_roster
           (fantasy_team_id, player_id, roster_slot, acquisition_type, purchase_price, acquired_week)
         VALUES (?, ?, ?, 'draft', ?, 1)`,
        [teamId, player.id, slot, player.current_price]
      );
    }
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
