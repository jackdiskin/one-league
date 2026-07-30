import { query } from '@/lib/mysql';
import LeaderboardModalTrigger, { type StandingRow } from './LeaderboardModalTrigger';

interface Props { userId: string; seasonYear: number }

export default async function LeaderboardCard({ userId, seasonYear }: Props) {
  const [globalLeague] = await query<{ id: number }>(
    `SELECT id FROM leagues WHERE season_year = ? AND is_global = 1 LIMIT 1`,
    [seasonYear]
  );
  if (!globalLeague) return null;

  const standings = await query<StandingRow>(
    `SELECT RANK() OVER (ORDER BY ft.total_points DESC) AS \`rank\`,
            ft.team_name, u.name AS user_name, ft.total_points, ft.user_id
     FROM league_members lm
     JOIN fantasy_teams ft ON ft.user_id = lm.user_id AND ft.season_year = ?
     JOIN \`user\` u ON u.id = ft.user_id
     WHERE lm.league_id = ?
     ORDER BY ft.total_points DESC`,
    [seasonYear, globalLeague.id]
  );

  const mine = standings.find(s => s.user_id === userId);

  return <LeaderboardModalTrigger standings={standings} myRank={mine?.rank ?? null} userId={userId} />;
}
