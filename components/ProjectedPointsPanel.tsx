import { formatPoints, formatWeekLong } from '@/lib/format';

/**
 * Dark hero panel showing a team's projected points for a week. Shared by
 * the Dashboard (pre-kickoff state of WeekScoreSection) and the My Team page.
 */
export default function ProjectedPointsPanel({
  week,
  projectedPoints,
  caption,
}: {
  week: number;
  projectedPoints: number;
  caption?: string;
}) {
  return (
    <div className="overflow-hidden rounded-card bg-ink p-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="text-eyebrow uppercase text-emerald">
          {formatWeekLong(week)}
        </span>
        {caption && (
          <span className="text-label text-turf-chalk/50">{caption}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5">
        <span className="font-mono tabular-nums text-display text-turf-chalk">
          {formatPoints(projectedPoints)}
        </span>
        <span className="text-label text-turf-chalk/60">
          projected points this week
        </span>
      </div>
    </div>
  );
}
