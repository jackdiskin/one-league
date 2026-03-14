import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { auth } from '@/lib/auth';
import { query, withTransaction } from '@/lib/mysql';

const SEASON      = 2026;
const CAP         = 200_000_000;
const QUOTA       = { QB: 2, RB: 3, FLEX: 5, K: 1 };

// POST /api/onboarding/draft
// Body: { team_name, player_ids[11], season_year, league_id? | invite_code? }
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  const { team_name, player_ids, season_year = SEASON, league_id, invite_code } = await request.json();

  if (!team_name || typeof team_name !== 'string' || team_name.trim().length < 2) {
    return NextResponse.json({ error: 'team_name must be at least 2 characters' }, { status: 400 });
  }

  if (!Array.isArray(player_ids) || player_ids.length !== 11) {
    return NextResponse.json({ error: 'Must select exactly 11 players' }, { status: 400 });
  }

  // Validate user doesn't already have a team this season
  const [existing] = await query<{ id: number }>(
    `SELECT id FROM fantasy_teams WHERE user_id = ? AND season_year = ? LIMIT 1`,
    [userId, season_year]
  );
  if (existing) return NextResponse.json({ error: 'You already have a team this season' }, { status: 409 });

  // Resolve league
  let resolvedLeagueId: number | null = null;

  if (league_id) {
    const [league] = await query<{ id: number; is_public: number; max_members: number; member_count: number }>(
      `SELECT l.id, l.is_public, l.max_members, COUNT(lm.id) AS member_count
       FROM leagues l
       LEFT JOIN league_members lm ON lm.league_id = l.id
       WHERE l.id = ?
       GROUP BY l.id`,
      [league_id]
    );
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.member_count >= league.max_members) return NextResponse.json({ error: 'League is full' }, { status: 409 });
    resolvedLeagueId = league.id;
  } else if (invite_code) {
    const [league] = await query<{ id: number; invite_code: string; max_members: number; member_count: number }>(
      `SELECT l.id, l.invite_code, l.max_members, COUNT(lm.id) AS member_count
       FROM leagues l
       LEFT JOIN league_members lm ON lm.league_id = l.id
       WHERE l.invite_code = ?
       GROUP BY l.id`,
      [invite_code]
    );
    if (!league || league.invite_code !== invite_code) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 });
    }
    if (league.member_count >= league.max_members) return NextResponse.json({ error: 'League is full' }, { status: 409 });
    resolvedLeagueId = league.id;
  } else {
    return NextResponse.json({ error: 'Must provide league_id or invite_code' }, { status: 400 });
  }

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

  if (players.length !== 11) {
    return NextResponse.json({ error: 'One or more players not found' }, { status: 400 });
  }

  // Validate quotas
  const qbCount   = players.filter(p => p.position === 'QB').length;
  const rbCount   = players.filter(p => p.position === 'RB').length;
  const flexCount = players.filter(p => p.position === 'WR' || p.position === 'TE').length;
  const kCount    = players.filter(p => p.position === 'K').length;

  if (qbCount !== QUOTA.QB || rbCount !== QUOTA.RB || flexCount !== QUOTA.FLEX || kCount !== QUOTA.K) {
    return NextResponse.json({
      error: `Invalid roster composition. Required: ${QUOTA.QB} QB, ${QUOTA.RB} RB, ${QUOTA.FLEX} WR/TE, ${QUOTA.K} K`,
    }, { status: 400 });
  }

  const totalCost = players.reduce((s, p) => s + Number(p.current_price), 0);
  if (totalCost > CAP) {
    return NextResponse.json({ error: 'Selection exceeds salary cap' }, { status: 400 });
  }

  // Build slot assignments
  // Starting lineup: 1 QB, 2 RB, 4 WR/TE, 1 K — extras go to BENCH
  function shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }

  const slotMap = new Map<number, string>();
  const qbs    = shuffle(players.filter(p => p.position === 'QB'));
  const rbs    = shuffle(players.filter(p => p.position === 'RB'));
  const flex   = shuffle(players.filter(p => p.position === 'WR' || p.position === 'TE'));
  const ks     = players.filter(p => p.position === 'K');

  // Starters first, bench after
  qbs.forEach((p, i)  => slotMap.set(p.id, i < 1 ? `QB${i + 1}` : 'BENCH'));
  rbs.forEach((p, i)  => slotMap.set(p.id, i < 2 ? `RB${i + 1}` : 'BENCH'));
  flex.forEach((p, i) => slotMap.set(p.id, i < 4 ? `WR${i + 1}` : 'BENCH'));
  ks.forEach((p, i)   => slotMap.set(p.id, `K${i + 1}`));

  const budgetRemaining = CAP - totalCost;

  await withTransaction(async (conn) => {
    // Check if already a member of this league
    const [alreadyMember] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM league_members WHERE league_id = ? AND user_id = ?`,
      [resolvedLeagueId, userId]
    ) as [RowDataPacket[], unknown];

    if (!alreadyMember[0]) {
      await conn.execute(
        `INSERT INTO league_members (league_id, user_id, role) VALUES (?, ?, 'member')`,
        [resolvedLeagueId, userId]
      );
    }

    // Create fantasy team
    const [teamResult] = await conn.execute<ResultSetHeader>(
      `INSERT INTO fantasy_teams (user_id, league_id, team_name, season_year, budget_remaining)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, resolvedLeagueId, team_name.trim(), season_year, budgetRemaining]
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
