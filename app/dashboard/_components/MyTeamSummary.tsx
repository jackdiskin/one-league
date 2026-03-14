import { query } from '@/lib/mysql';
import { formatPrice, formatPoints } from '@/lib/format';
import LiveTeamField, { type FieldPlayer, type FieldSlot } from './LiveTeamField';

interface Props { userId: string; seasonYear: number }

type Player = FieldPlayer;

// Compute (x%, y%) for each slot — always 8 fixed slots; player is null for empty slots
function getPositions(wrs: Player[], tes: Player[], qbs: Player[], rbs: Player[], ks: Player[]) {
  const out: FieldSlot[] = [];

  // ── Receiver line (y = 26%) — always 4 evenly-spaced slots ──────────────
  const flex = [...wrs, ...tes];
  const flexX = [10, 35, 62, 87];
  for (let i = 0; i < 4; i++) {
    out.push({ player: flex[i] ?? null, pos: flex[i]?.position ?? 'WR', x: flexX[i], y: 26 });
  }

  // ── QB in shotgun (y = 47%) — always 1 slot ──────────────────────────────
  out.push({ player: qbs[0] ?? null, pos: 'QB', x: 50, y: 47 });

  // ── RBs flanking QB (y = 62%) — always 2 slots ────────────────────────────
  out.push({ player: rbs[0] ?? null, pos: 'RB', x: 34, y: 62 });
  out.push({ player: rbs[1] ?? null, pos: 'RB', x: 66, y: 62 });

  // ── Kicker (y = 80%) — always 1 slot ─────────────────────────────────────
  out.push({ player: ks[0] ?? null, pos: 'K', x: 50, y: 80 });

  return out;
}


export default async function MyTeamSummary({ userId, seasonYear }: Props) {
  const [team] = await query<{
    id: number; team_name: string; total_points: number; budget_remaining: number;
    league_name: string; rank: number; league_size: number;
  }>(
    `SELECT ft.id, ft.team_name, ft.total_points, ft.budget_remaining,
            l.name AS league_name,
            (SELECT COUNT(*) + 1
             FROM fantasy_teams ft2
             JOIN league_members lm2 ON lm2.user_id = ft2.user_id AND lm2.league_id = ft.league_id
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
            (SELECT COUNT(*) FROM league_members WHERE league_id = ft.league_id) AS league_size
     FROM fantasy_teams ft
     JOIN leagues l ON l.id = ft.league_id
     WHERE ft.user_id = ? AND ft.season_year = ?
     ORDER BY ft.created_at DESC LIMIT 1`,
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

  const starters = await query<Player>(
    `SELECT p.full_name, p.position, p.team_code, pms.current_price, p.headshot_url, p.espn_athlete_id
     FROM fantasy_team_roster ftr
     JOIN players p ON p.id = ftr.player_id
     JOIN player_market_state pms ON pms.player_id = ftr.player_id AND pms.season_year = ?
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE AND ftr.roster_slot != 'BENCH'
     ORDER BY FIELD(p.position,'WR','TE','QB','RB','K'), pms.current_price DESC`,
    [seasonYear, team.id]
  );

  const qbs = starters.filter(p => p.position === 'QB');
  const rbs = starters.filter(p => p.position === 'RB');
  const wrs = starters.filter(p => p.position === 'WR');
  const tes = starters.filter(p => p.position === 'TE');
  const ks  = starters.filter(p => p.position === 'K');
  const positions = getPositions(wrs, tes, qbs, rbs, ks);

  const rankLabel = team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : team.rank === 3 ? '3rd' : `${team.rank}th`;
  const rankMedal = team.rank === 1 ? '🥇' : team.rank === 2 ? '🥈' : team.rank === 3 ? '🥉' : null;

  // Line of scrimmage sits just above the WR row (y=26% → ~14% on field)
  const losY = 13;

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
            { label: 'Cap Space', value: formatPrice(team.budget_remaining), bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', labelColor: '#16a34a' },
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
      <LiveTeamField positions={positions} losY={losY} />
    </div>
  );
}
