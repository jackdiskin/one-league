import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';

export interface LeagueStanding {
  id: number;
  name: string;
  season_year: number;
  team_name: string | null;
  rank: number | null;
  member_count: number;
}

interface Props { leagues: LeagueStanding[] }

function rankLabel(r: number | null) {
  if (!r) return null;
  return r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
}

export default function StandingsCard({ leagues }: Props) {
  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
      <SectionHeader
        title="Standings"
        right={
          <span className="font-mono tabular-nums text-label text-ink-3">
            {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
          </span>
        }
      />

      {leagues.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="trophy" size={18} />}
          title="Join a league to see where you stand."
        />
      ) : (
        <div className="mt-4 flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {leagues.map(league => {
            const rl = rankLabel(league.rank);
            return (
              <Link
                key={league.id}
                href={`/league?leagueId=${league.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-line bg-surface-sunken px-3 py-2.5 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
              >
                <span
                  className={[
                    'w-8 shrink-0 text-center font-mono tabular-nums text-label',
                    rl ? 'text-ink' : 'text-ink-3',
                  ].join(' ')}
                >
                  {/* Unranked reads as a word, not an em-dash that could mean zero */}
                  {rl ?? 'Unranked'}
                </span>
                {/* min-w (not min-w-0) so the name keeps a real sliver to
                    truncate into instead of getting squeezed to nothing —
                    once the row is too narrow for everything, member count
                    (ml-auto) wraps to its own right-aligned line instead. */}
                <div className="min-w-28 flex-1">
                  <p className="truncate text-body font-medium text-ink">{league.name}</p>
                  {league.team_name && (
                    <p className="mt-0.5 truncate text-label text-ink-3">{league.team_name}</p>
                  )}
                </div>
                <span className="ml-auto shrink-0 font-mono tabular-nums text-label text-ink-3">
                  {league.member_count} {league.member_count === 1 ? 'member' : 'members'}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
