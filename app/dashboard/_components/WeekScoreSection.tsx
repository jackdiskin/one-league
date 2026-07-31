import { query } from '@/lib/mysql';
import { isWeekLive } from '@/lib/live-week';
import LiveWeekScore from './LiveWeekScore';
import ProjectedPointsPanel from '@/components/ProjectedPointsPanel';
import type { RosterPlayer } from '@/app/team/_components/RosterList';

interface Props {
  teamId:      number;
  season:      number;
  currentWeek: number;
}

async function fetchRoster(season: number, teamId: number, lastWeek: number): Promise<RosterPlayer[]> {
  return query<RosterPlayer>(
    `SELECT p.id, p.full_name, p.position, p.team_code, p.headshot_url,
            p.external_player_id,
            pms.current_price, ftr.purchase_price, ftr.acquired_week, ftr.roster_slot,
            pws.fantasy_points           AS last_week_points,
            tot.season_points
     FROM fantasy_team_roster ftr
     JOIN players p          ON p.id = ftr.player_id
     JOIN player_market_state pms
       ON pms.player_id = ftr.player_id AND pms.season_year = ?
     LEFT JOIN player_weekly_scores pws
       ON pws.player_id = ftr.player_id AND pws.season_year = ? AND pws.week = ?
     LEFT JOIN (
       SELECT player_id, SUM(fantasy_points) AS season_points
       FROM player_weekly_scores WHERE season_year = ? GROUP BY player_id
     ) tot ON tot.player_id = ftr.player_id
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE AND ftr.roster_slot != 'BENCH'`,
    [season, season, lastWeek, season, teamId]
  );
}

// Bench points never count toward the score (only starters do — see
// api/admin/scores and api/admin/finalize-games, which apply the same
// roster_slot != 'BENCH' filter when computing the official total_points).
async function fetchProjectedTotal(season: number, teamId: number, week: number): Promise<number> {
  const [row] = await query<{ total: number }>(
    `SELECT COALESCE(SUM(pwp.expected_points), 0) AS total
     FROM fantasy_team_roster ftr
     LEFT JOIN player_weekly_projections pwp
       ON pwp.player_id = ftr.player_id AND pwp.season_year = ? AND pwp.week = ?
          AND pwp.projection_source = 'internal_model'
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE AND ftr.roster_slot != 'BENCH'`,
    [season, week, teamId]
  );
  return Number(row?.total ?? 0);
}

// Only shows the live current-week score once a game is actually underway
// (mirrors ESPN FantasyCast) — otherwise shows the team's projected total.
export default async function WeekScoreSection({ teamId, season, currentWeek }: Props) {
  const live = await isWeekLive(season, currentWeek);

  if (live) {
    const roster = await fetchRoster(season, teamId, currentWeek);
    return <LiveWeekScore roster={roster} currentWeek={currentWeek} />;
  }

  const projected = await fetchProjectedTotal(season, teamId, currentWeek);

  // Dark panel is earned here: this is live/market-state data (see the
  // dark-panel ruling). Flat fill, no gradient.
  return (
    <ProjectedPointsPanel
      week={currentWeek}
      projectedPoints={projected}
      caption="Games haven't started yet"
    />
  );
}
