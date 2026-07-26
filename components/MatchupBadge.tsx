import TeamLogo from './TeamLogo';
import { parseNaiveDateTime, type Matchup } from '@/lib/schedule';

// Kickoff times are naive ET wall-clock values — format from the raw
// components directly instead of `new Date(...)`, which would silently
// reinterpret them in whatever timezone the runtime/viewer happens to be in.
function formatMatchupWhen(raw: string): string {
  const dt = parseNaiveDateTime(raw);
  if (!dt) return '';
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
    .format(Date.UTC(dt.year, dt.month - 1, dt.day));
  const date = `${dt.month}/${dt.day}`;
  let hour12 = dt.hour % 12;
  if (hour12 === 0) hour12 = 12;
  const period = dt.hour < 12 ? 'AM' : 'PM';
  const time = `${hour12}:${String(dt.minute).padStart(2, '0')} ${period}`;
  return `${weekday} ${date} · ${time}`;
}

// Renders opponent logo + @/vs abbreviation + day/date/time — meant to sit on
// its own line just below the player's name (where the player's own team
// logo used to be; that now sits next to the name instead).
export default function MatchupBadge({ matchup, size = 11 }: { matchup: Matchup | null | undefined; size?: number }) {
  if (!matchup) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 9.5, fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap',
    }}>
      <span>{formatMatchupWhen(matchup.gameDate)}</span>
      <span style={{ color: '#cbd5e1' }}>·</span>
      <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{matchup.isHome ? 'vs' : '@'}</span>
      <TeamLogo code={matchup.opponent} size={size} />
      <span style={{ fontWeight: 700, color: '#64748b' }}>{matchup.opponent}</span>
    </span>
  );
}
