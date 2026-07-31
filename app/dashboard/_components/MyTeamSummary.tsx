import { query } from '@/lib/mysql';
import { formatPrice, formatPoints } from '@/lib/format';
import LineupField from '@/components/field/LineupField';
import { lineupFormation } from '@/components/field/formations';
import { isBench } from '@/components/field/slots';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import type { FieldPlayer } from '@/components/field/types';

interface Props {
  userId: string;
  seasonYear: number;
  hidePrices?: boolean;
  interactive?: boolean;
  /** Replaces the default team-name/stats header with a plain title bar —
   *  for pages that already show the team name and stats elsewhere. */
  title?: string;
}

type Player = FieldPlayer;

export default async function MyTeamSummary({ userId, seasonYear, hidePrices = false, interactive = false, title }: Props) {
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
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={<Icon name="football" size={20} />}
          title="Draft a squad to see it on the field."
        />
      </div>
    );
  }

  const [weekRow] = await query<{ w: number }>(
    `SELECT MAX(week) AS w FROM player_weekly_scores WHERE season_year = ?`, [seasonYear]
  );
  const lastWeek = weekRow?.w ?? 1;

  const roster = await query<Player>(
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
  );

  const starters = roster.filter(p => !isBench(p.roster_slot));
  const bench    = roster.filter(p => isBench(p.roster_slot));

  const formation = lineupFormation(starters);

  const rankLabel = team.rank === 1 ? '1st' : team.rank === 2 ? '2nd' : team.rank === 3 ? '3rd' : `${team.rank}th`;

  return (
    <div className="overflow-hidden rounded-card border border-line">

      {/* ── Header ── */}
      {title ? (
        <div className="border-b border-line bg-surface px-5 py-3.5">
          <p className="text-body font-medium text-ink">{title}</p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
          {/* Emerald on the team name mirrors the dashboard greeting — the two
              brand moments, and nowhere else. */}
          <p className="min-w-0 truncate text-section text-emerald">{team.team_name}</p>
          <div className="flex shrink-0 gap-2">
            {[
              { label: 'Points', value: formatPoints(team.total_points) },
              ...(hidePrices ? [] : [{ label: 'Cap space', value: formatPrice(team.budget_remaining) }]),
              { label: 'Rank', value: rankLabel },
            ].map(stat => (
              <div key={stat.label} className="rounded-control border border-line bg-surface-sunken px-3 py-1.5 text-center">
                <p className="text-eyebrow uppercase text-ink-3">{stat.label}</p>
                <p className="font-mono tabular-nums text-body text-ink">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Field ── */}
      <LineupField
        formation={formation} hidePrices={hidePrices}
        bench={bench} teamId={team.id} interactive={interactive} season={seasonYear}
      />
    </div>
  );
}
