'use client';

// Live stat breakdown for one player. Row selection logic is unchanged from the
// original dashboard field — only the styling moved onto tokens.

import Image from 'next/image';
import { formatPoints } from '@/lib/format';
import type { LivePlayerStats } from '@/hooks/useLiveStats';
import type { FieldPlayer } from './types';

export default function LiveStatsModal({
  player, stats, onClose,
}: {
  player: FieldPlayer;
  stats: LivePlayerStats;
  onClose: () => void;
}) {
  const t = stats.totals;

  type StatRow = { label: string; value: string; highlight?: boolean };
  const rows: StatRow[] = [];

  if (t.passingYards   > 0) rows.push({ label: 'Passing yards',   value: String(t.passingYards) });
  if (t.passingTds     > 0) rows.push({ label: 'Passing TDs',     value: String(t.passingTds), highlight: true });
  if (t.interceptions  > 0) rows.push({ label: 'Interceptions',   value: String(t.interceptions) });

  if (t.rushingYards   > 0) rows.push({ label: 'Rushing yards',   value: String(t.rushingYards) });
  if (t.rushingTds     > 0) rows.push({ label: 'Rushing TDs',     value: String(t.rushingTds), highlight: true });

  if (t.receptions     > 0) rows.push({ label: 'Receptions',      value: String(t.receptions) });
  if (t.receivingYards > 0) rows.push({ label: 'Receiving yards', value: String(t.receivingYards) });
  if (t.receivingTds   > 0) rows.push({ label: 'Receiving TDs',   value: String(t.receivingTds), highlight: true });

  if (t.twoPtConversions > 0) rows.push({ label: '2-pt conversions', value: String(t.twoPtConversions), highlight: true });
  if (t.fumblesLost      > 0) rows.push({ label: 'Fumbles lost',     value: String(t.fumblesLost) });

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Live stats for ${player.full_name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-6 backdrop-blur-sm"
    >
      <div className="motion-safe:animate-modal-in w-full max-w-sm overflow-hidden rounded-card border border-line bg-surface shadow-xl">
        <div className="flex items-center gap-3 border-b border-line px-6 py-5">
          {player.headshot_url ? (
            <Image
              src={player.headshot_url} alt="" width={48} height={48} unoptimized
              className="h-12 w-12 shrink-0 object-contain"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-emerald-tint text-section text-emerald">
              {player.full_name.charAt(0)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-section text-ink">{player.full_name}</p>
            <p className="text-label text-ink-3">{player.position} · {player.team_code}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-pill bg-emerald-tint px-2 py-1">
            <span className="motion-safe:animate-live-dot h-1.5 w-1.5 rounded-pill bg-emerald" aria-hidden="true" />
            <span className="text-eyebrow uppercase text-emerald">Live</span>
          </span>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-baseline justify-between">
            <span className="text-eyebrow uppercase text-ink-3">Points</span>
            <span className="font-mono tabular-nums text-display text-ink">
              {formatPoints(t.fantasyPointsTotal)}
            </span>
          </div>

          {rows.length > 0 ? (
            <dl className="mt-4 flex flex-col gap-1 border-t border-line pt-4">
              {rows.map(r => (
                <div key={r.label} className="flex items-center justify-between py-1">
                  <dt className="text-label text-ink-2">{r.label}</dt>
                  <dd className={[
                    'font-mono tabular-nums text-label',
                    r.highlight ? 'text-emerald' : 'text-ink',
                  ].join(' ')}>
                    {r.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 border-t border-line pt-4 text-label text-ink-3">
              No stats recorded yet this game.
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-6 h-10 w-full rounded-control border border-line text-body text-ink-2 transition-colors duration-150 ease-out-quart hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
