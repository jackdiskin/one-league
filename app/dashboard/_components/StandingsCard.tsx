import Link from 'next/link';
import type { SidebarLeague } from './Sidebar';

interface Props { leagues: SidebarLeague[] }

function rankLabel(r: number | null) {
  if (!r) return null;
  return r === 1 ? '1st' : r === 2 ? '2nd' : r === 3 ? '3rd' : `${r}th`;
}

export default function StandingsCard({ leagues }: Props) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Standings</h3>
        <span className="text-xs text-slate-400">{leagues.length} league{leagues.length === 1 ? '' : 's'}</span>
      </div>

      {leagues.length === 0 ? (
        <p className="text-sm text-slate-400">You&apos;re not in any leagues yet.</p>
      ) : (
        <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 320 }}>
          {leagues.map(league => {
            const rl = rankLabel(league.rank);
            return (
              <Link
                key={league.id}
                href={`/league?leagueId=${league.id}`}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-all bg-slate-50 ring-1 ring-slate-200 hover:bg-white hover:ring-slate-300 hover:shadow-sm"
              >
                <span className="w-7 text-center shrink-0 text-xs font-bold text-slate-400">
                  {rl ?? '—'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate leading-none text-slate-900">
                    {league.name}
                  </p>
                  {league.team_name && (
                    <p className="text-xs truncate mt-0.5 text-slate-400">
                      {league.team_name}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">
                    {league.member_count} member{league.member_count === 1 ? '' : 's'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
