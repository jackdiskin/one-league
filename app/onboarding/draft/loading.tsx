// Route-level loading state. Skeleton rows are exactly ROW_HEIGHT (h-14) and
// the panel widths match DraftBoard, so nothing shifts when the data lands.

const SKELETON_ROWS = 12;

export default function DraftLoading() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Left panel */}
      <aside className="flex w-80 min-w-72 shrink-0 flex-col overflow-hidden border-r border-line bg-surface">
        <div className="shrink-0 px-4 pb-3 pt-4">
          <div className="h-3 w-20 animate-pulse rounded-pill bg-line" />
          <div className="mt-2 h-6 w-40 animate-pulse rounded-control bg-line" />
        </div>

        <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
          <div className="flex gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-6 w-12 animate-pulse rounded-pill bg-line" />
            ))}
          </div>
          <div className="h-9 w-full animate-pulse rounded-control bg-line" />
          <div className="flex gap-2">
            <div className="h-9 flex-1 animate-pulse rounded-control bg-line" />
            <div className="h-9 w-28 shrink-0 animate-pulse rounded-control bg-line" />
          </div>
          <div className="h-9 w-full animate-pulse rounded-control bg-line" />
        </div>

        {/* Rows — same h-14 and border as PlayerRow */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className="flex h-14 items-center gap-3 border-b border-line px-4">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-pill bg-line" />
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-32 animate-pulse rounded-pill bg-line" />
                <div className="mt-1.5 h-3 w-20 animate-pulse rounded-pill bg-line" />
              </div>
              <div className="h-3.5 w-12 shrink-0 animate-pulse rounded-pill bg-line" />
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-control bg-line" />
            </div>
          ))}
        </div>
      </aside>

      {/* Right panel */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-line bg-surface px-6 py-4">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-48">
              <div className="h-3 w-24 animate-pulse rounded-pill bg-line" />
              <div className="mt-2 h-9 w-40 animate-pulse rounded-control bg-line" />
              <div className="mt-2 h-1 w-full animate-pulse rounded-pill bg-line" />
            </div>
            <div className="h-5 w-64 animate-pulse rounded-pill bg-line" />
            <div className="h-10 w-32 animate-pulse rounded-control bg-line" />
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-6">
          <div className="h-full w-full animate-pulse rounded-card bg-line" />
        </div>
      </div>
    </div>
  );
}
