import TeamLogo from './TeamLogo';
import type { Matchup } from '@/lib/schedule';

export default function MatchupBadge({ matchup, size = 11 }: { matchup: Matchup | null | undefined; size?: number }) {
  if (!matchup) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, color: '#94a3b8',
    }}>
      <span style={{ color: '#cbd5e1' }}>{matchup.isHome ? 'vs' : '@'}</span>
      <TeamLogo code={matchup.opponent} size={size} />
      {matchup.opponent}
    </span>
  );
}
