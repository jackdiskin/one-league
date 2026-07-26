import { query } from '@/lib/mysql';
import { isWeekLive } from '@/lib/live-week';
import { formatPoints, formatWeekLong } from '@/lib/format';
import LiveWeekScore from './LiveWeekScore';
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
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE`,
    [season, season, lastWeek, season, teamId]
  );
}

async function fetchProjectedTotal(season: number, teamId: number, week: number): Promise<number> {
  const [row] = await query<{ total: number }>(
    `SELECT COALESCE(SUM(pwp.expected_points), 0) AS total
     FROM fantasy_team_roster ftr
     LEFT JOIN player_weekly_projections pwp
       ON pwp.player_id = ftr.player_id AND pwp.season_year = ? AND pwp.week = ?
          AND pwp.projection_source = 'internal_model'
     WHERE ftr.fantasy_team_id = ? AND ftr.is_active = TRUE`,
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

  return (
    <div style={{
      borderRadius: 20,
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #064e3b 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      overflow: 'hidden',
      padding: '18px 20px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
          {formatWeekLong(currentWeek)}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
          Games haven&apos;t started yet
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: 'rgba(255,255,255,0.25)' }}>
          {formatPoints(projected)}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 5 }}>
          projected pts this week
        </span>
      </div>
    </div>
  );
}
