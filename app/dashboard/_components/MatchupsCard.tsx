import { query } from '@/lib/mysql';
import { parseNaiveDateTime, formatWeekLong } from '@/lib/format';
import SectionHeader from '@/components/ui/SectionHeader';
import TeamLogo from '@/components/TeamLogo';

interface Game {
  game_key: string;
  game_date: string;
  home_team: string;
  away_team: string;
}

// Naive ET wall-clock value, same handling as MatchupBadge — parse the
// components directly rather than letting `Date` reinterpret the timezone.
function formatKickoff(raw: string): string {
  const dt = parseNaiveDateTime(raw);
  if (!dt) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
    .format(Date.UTC(dt.year, dt.month - 1, dt.day));
  let hour12 = dt.hour % 12;
  if (hour12 === 0) hour12 = 12;
  const period = dt.hour < 12 ? 'AM' : 'PM';
  return `${weekday} ${hour12}:${String(dt.minute).padStart(2, '0')} ${period}`;
}

/** Every NFL game this week — the full league slate, not just this team's players. */
export default async function MatchupsCard({ season, week }: { season: number; week: number }) {
  const games = await query<Game>(
    `SELECT game_key, DATE_FORMAT(game_date, '%Y-%m-%d %H:%i:%s') AS game_date, home_team, away_team
     FROM nfl_schedule
     WHERE season = ? AND week = ?
     ORDER BY game_date ASC`,
    [season, week]
  );

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="px-5 pb-3 pt-4">
        <SectionHeader title="Matchups" sub={`${formatWeekLong(week)} · NFL`} />
      </div>

      {games.length === 0 ? (
        <p className="px-5 py-6 text-center text-label text-ink-3">No games scheduled.</p>
      ) : (
        <div>
          {games.map(g => (
            <div key={g.game_key} className="flex items-center justify-between gap-3 border-t border-line px-5 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <TeamLogo code={g.away_team} size={20} />
                <span className="shrink-0 text-label font-medium text-ink">{g.away_team}</span>
                <span className="shrink-0 text-label text-ink-3">@</span>
                <TeamLogo code={g.home_team} size={20} />
                <span className="shrink-0 text-label font-medium text-ink">{g.home_team}</span>
              </div>
              <span className="shrink-0 font-mono tabular-nums text-eyebrow text-ink-3">
                {formatKickoff(g.game_date)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
