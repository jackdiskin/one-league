import { query } from '@/lib/mysql';
import { formatPrice, formatPoints } from '@/lib/format';
import LiveTeamField, { type FieldPlayer, type FieldSlot } from './LiveTeamField';
import { getNextMatchupByTeam } from '@/lib/schedule';

const SCHEDULE_SEASON = 2026;

interface Props { userId: string; seasonYear: number; hidePrices?: boolean; interactive?: boolean }

type Player = FieldPlayer;

// Compute (x%, y%) for each slot — a real NFL pre-snap shotgun look: the
// O-line marks the line of scrimmage near the top, and every skill player
// lines up even with it or behind it (nobody lines up ahead of the ball).
// The flex trio adapts to who's actually starting (like FPL): WR1/WR2 always
// out wide, right on the line; WR3 is the true FLEX slot (RB/WR/TE) and can
// be a TE lined up tight next to the tackle, a 3rd WR in the slot, or a RB.
// A RB in the flex slot drops into the backfield instead of lining up as a
// receiver — directly behind the QB, deeper than RB1/RB2, so the four
// backfield players form a diamond: QB at the front point, RB1/RB2 flanking
// the sides, and the flex RB at the back point.
// Looked up by named roster_slot (not position), so subbing auto-updates it
// and a RB sitting in the FLEX slot renders in the right spot.
function getPositions(starters: Player[]) {
  const bySlot = (slot: string) => starters.find(p => p.roster_slot === slot) ?? null;

  const wr1  = bySlot('WR1');
  const wr2  = bySlot('WR2');
  const flex = bySlot('WR3');
  const qb1  = bySlot('QB1');
  const rb1  = bySlot('RB1');
  const rb2  = bySlot('RB2');

  const out: FieldSlot[] = [];
  const LOS = 16; // O-line / line-of-scrimmage depth — see the bar in LiveTeamField
  const flexIsTE = flex?.position === 'TE';
  const flexIsRB = flex?.position === 'RB';

  out.push({ player: wr1,  pos: wr1?.position  ?? 'WR',   x: 6,  y: LOS });
  out.push({ player: wr2,  pos: wr2?.position  ?? 'WR',   x: 94, y: LOS });

  // ── QB in shotgun, well behind the line ───────────────────────────────
  out.push({ player: qb1, pos: 'QB', x: 50, y: LOS + 24 });

  // ── RBs split, flanking the QB ────────────────────────────────────────
  out.push({ player: rb1, pos: 'RB', x: 32, y: LOS + 32 });
  out.push({ player: rb2, pos: 'RB', x: 68, y: LOS + 32 });

  // TE lines up on the line too, tight next to the tackle; a flex WR lines
  // up just off the line in the slot (has to be off the line to be
  // eligible); a flex RB drops deepest of all, directly behind the QB,
  // completing the backfield diamond.
  out.push({
    player: flex, pos: flex?.position ?? 'FLEX',
    x: flexIsTE ? 74 : 50,
    y: flexIsTE ? LOS : flexIsRB ? LOS + 56 : LOS + 7,
  });

  return out;
}


export default async function MyTeamSummary({ userId, seasonYear, hidePrices = false, interactive = false }: Props) {
  const [team] = await query<{
    id: number; team_name: string; total_points: number; budget_remaining: number;
    league_name: string; rank: number; league_size: number;
  }>(
    `SELECT ft.id, ft.team_name, ft.total_points, ft.budget_remaining,
            l.name AS league_name,
            (SELECT COUNT(*) + 1
             FROM fantasy_teams ft2
             JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = l.id
             LEFT JOIN (
               SELECT ftr2.fantasy_team_id, SUM(pms2.current_price) AS rv
               FROM fantasy_team_roster ftr2
               JOIN player_market_state pms2 ON pms2.player_id = ftr2.player_id AND pms2.season_year = ft.season_year
               WHERE ftr2.is_active = TRUE GROUP BY ftr2.fantasy_team_id
             ) rv2 ON rv2.fantasy_team_id = ft2.id
             WHERE ft2.season_year = ft.season_year
               AND (ft2.total_points > ft.total_points
                    OR (ft2.total_points = ft.total_points
                        AND COALESCE(rv2.rv, 0) > (
                          SELECT COALESCE(SUM(pms3.current_price), 0)
                          FROM fantasy_team_roster ftr3
                          JOIN player_market_state pms3 ON pms3.player_id = ftr3.player_id AND pms3.season_year = ft.season_year
                          WHERE ftr3.fantasy_team_id = ft.id AND ftr3.is_active = TRUE
                        )))) AS \`rank\`,
            (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) AS league_size
     FROM fantasy_teams ft
     JOIN leagues l ON l.season_year = ft.season_year AND l.is_global = 1
     WHERE ft.user_id = ? AND ft.season_year = ?
     LIMIT 1`,
    [userId, seasonYear]
  );

  if (!team) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center text-2xl">🏈</div>
        <p className="font-semibold text-slate-900">No team yet</p>
        <p className="text-sm text-slate-500 mt-1">Join a league to get started.</p>
      </div>
    );
  }

  const [weekRow] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [seasonYear]
  );
  const lastWeek = weekRow?.w ?? 1;

  const [roster, matchups] = await Promise.all([
    query<Player>(
      `SELECT p.id, p.full_name, p.position, p.team_code, pms.current_price, p.headshot_url,
              p.external_player_id, ftr.roster_slot, pwp.expected_points AS projected_points
       FROM fantasy_team_roster ftr
       JOIN players p ON p.id = ftr.player_id
       JOIN player_market_state pms ON pms.player_id = ftr.player_id AND pms.season_year = ?
       LEFT JOIN player_weekly_projections pwp
         ON pwp.player_id = ftr.player_id AND pwp.season_year = ? AND pwp.week = ?
            AND pwp.projection_source = 'internal_model'
       WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE
       ORDER BY FIELD(p.position,'WR','TE','QB','RB'), pms.current_price DESC`,
      [seasonYear, seasonYear, lastWeek, team.id]
    ),
    getNextMatchupByTeam(SCHEDULE_SEASON),
  ]);

  const starters = roster.filter(p => p.roster_slot !== 'BENCH');
  const bench    = roster.filter(p => p.roster_slot === 'BENCH');

  const positions = getPositions(starters);

  const rankLabel = team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : team.rank === 3 ? '3rd' : `${team.rank}th`;
  const rankMedal = team.rank === 1 ? '🥇' : team.rank === 2 ? '🥈' : team.rank === 3 ? '🥉' : null;

  return (
    <div className="rounded-2xl overflow-hidden ring-1 ring-slate-200 shadow-sm">

      {/* ── Header ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            {team.league_name}
          </div>
          <div style={{
            fontSize: 21, fontWeight: 900, letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #0f172a 0%, #334155 55%, #059669 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {team.team_name}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {[
            { label: 'Points', value: formatPoints(team.total_points), bg: '#f8fafc', border: '#e2e8f0', color: '#0f172a', labelColor: '#94a3b8' },
            ...(hidePrices ? [] : [{ label: 'Cap Space', value: formatPrice(team.budget_remaining), bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', labelColor: '#16a34a' }]),
            { label: 'Rank',   value: `${rankMedal ?? ''}${rankLabel}`,  bg: team.rank <= 3 ? '#fffbeb' : '#f8fafc', border: team.rank <= 3 ? '#fde68a' : '#e2e8f0', color: '#0f172a', labelColor: '#94a3b8' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '6px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: s.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Field ── */}
      <LiveTeamField
        positions={positions} hidePrices={hidePrices} matchups={matchups}
        bench={bench} teamId={team.id} interactive={interactive} season={seasonYear}
      />
    </div>
  );
}
