import TeamLogo from './TeamLogo';
import type { Matchup } from '@/lib/schedule';

function formatMatchupWhen(iso: string): string {
  const d = new Date(iso);
  const day  = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
  const date = new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${day} ${date} · ${time}`;
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
      <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{matchup.isHome ? 'vs' : '@'}</span>
      <TeamLogo code={matchup.opponent} size={size} />
      <span style={{ fontWeight: 700, color: '#64748b' }}>{matchup.opponent}</span>
      <span style={{ color: '#cbd5e1' }}>·</span>
      <span>{formatMatchupWhen(matchup.gameDate)}</span>
    </span>
  );
}
