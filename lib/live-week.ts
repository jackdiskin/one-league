import { query } from '@/lib/mysql';

// Mirrors the check in app/api/leagues/[id]/live-week-scores/route.ts —
// true once any game for the given season/week is actually in progress.
export async function isWeekLive(season: number, week: number): Promise<boolean> {
  const [row] = await query<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM live_game_states
     WHERE game_state = 'in' AND season = ? AND week_num = ?`,
    [season, week]
  );
  return Number(row?.cnt ?? 0) > 0;
}
