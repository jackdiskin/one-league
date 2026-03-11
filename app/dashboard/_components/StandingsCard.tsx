import { query } from '@/lib/mysql';
import { formatPoints, formatPrice } from '@/lib/format';

interface Props { userId: string; seasonYear: number }

export default async function StandingsCard({ userId, seasonYear }: Props) {
  const [membership] = await query<{ league_id: number; league_name: string }>(
    `SELECT ft.league_id, l.name AS league_name
     FROM fantasy_teams ft JOIN leagues l ON l.id = ft.league_id
     WHERE ft.user_id = ? AND ft.season_year = ?
     ORDER BY ft.created_at DESC LIMIT 1`,
    [userId, seasonYear]
  );
  if (!membership) return null;

  const standings = await query<{
    rank: number; team_name: string; user_name: string;
    total_points: number; budget_remaining: number; user_id: string;
  }>(
    `SELECT RANK() OVER (ORDER BY ft.total_points DESC) AS \`rank\`,
            ft.team_name, u.name AS user_name,
            ft.total_points, ft.budget_remaining, ft.user_id
     FROM fantasy_teams ft
     JOIN \`user\` u ON u.id = ft.user_id
     WHERE ft.league_id = ?
     ORDER BY ft.total_points DESC`,
    [membership.league_id]
  );

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Standings</h3>
        <span className="text-xs text-slate-500 truncate max-w-[120px]">{membership.league_name}</span>
      </div>

      <div className="space-y-1.5">
        {standings.map((row) => {
          const isMe = row.user_id === userId;
          const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;
          return (
            <div key={row.user_id}
              className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all bg-slate-50 ring-1 ring-slate-200 cursor-pointer hover:bg-white hover:ring-slate-300 hover:shadow-sm'
              }`}
              style={isMe ? { backgroundColor: 'oklch(92.9% 0.013 255.508)', borderColor: "oklch(86.9% 0.022 252.894)" } : undefined}
            >
              <span className="w-5 text-center shrink-0">
                {medal ?? <span className={`text-xs font-bold text-slate-400`}>{row.rank}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold truncate leading-none text-slate-900`}>
                  {row.team_name}
                </p>
                <p className={`text-xs truncate mt-0.5 text-slate-400`}>
                  {row.user_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-semibold tabular-nums text-slate-900`}>
                  {formatPoints(row.total_points)}
                </p>
                <p className={`text-xs text-slate-400`}>
                  {formatPrice(row.budget_remaining)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
