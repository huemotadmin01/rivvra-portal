/**
 * Shared skeleton loading components for consistent loading UX across the SaaS app.
 * Compose these building blocks to match each page's unique layout.
 */

/** Animate-pulse wrapper for any skeleton page */
export function PageSkeleton({ children, className = '' }) {
  return <div className={`p-3 sm:p-6 space-y-4 sm:space-y-6 animate-pulse ${className}`}>{children}</div>;
}

/** Page header with title + optional subtitle placeholder */
export function HeaderSkeleton({ withButton = false, titleW = 'w-36', subtitleW = 'w-52' }) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className={`h-7 ${titleW} bg-dark-800 rounded-lg`} />
        <div className={`h-4 ${subtitleW} bg-dark-800/60 rounded`} />
      </div>
      {withButton && <div className="h-9 w-28 bg-dark-800 rounded-lg" />}
    </div>
  );
}

/** Grid of stat/summary cards */
export function CardGridSkeleton({ count = 3 }) {
  const gridCols = count <= 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3';
  return (
    <div className={`grid grid-cols-1 ${gridCols} gap-3 sm:gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-4 w-28 bg-dark-800 rounded" />
            <div className="h-5 w-5 bg-dark-800/60 rounded" />
          </div>
          <div className="h-8 w-24 bg-dark-800 rounded-lg" />
          <div className="h-3 w-20 bg-dark-800/40 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Filter tabs / pill buttons row */
export function TabsSkeleton({ widths = [72, 80, 64, 56] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {widths.map((w, i) => (
        <div key={i} className="h-8 bg-dark-800 rounded-lg" style={{ width: w }} />
      ))}
    </div>
  );
}

/** Table with header row + skeleton rows */
export function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-dark-800/80 h-10" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-t border-dark-800/30">
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-dark-800 rounded w-36" />
            <div className="h-3 bg-dark-800/50 rounded w-24" />
          </div>
          {Array.from({ length: Math.min(cols - 1, 4) }).map((_, j) => (
            <div key={j} className={`h-4 bg-dark-800/60 rounded hidden sm:block ${j === 0 ? 'w-16' : j === 1 ? 'w-20' : 'w-14'}`} />
          ))}
          <div className="h-5 w-14 bg-dark-800 rounded-full hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

/** List of expandable card items */
export function CardListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center justify-between">
          <div className="space-y-1.5 flex-1">
            <div className="h-4 bg-dark-800 rounded w-48" />
            <div className="h-3 bg-dark-800/50 rounded w-72 max-w-full" />
          </div>
          <div className="flex items-center gap-3 ml-4">
            <div className="h-5 w-16 bg-dark-800 rounded-full" />
            <div className="h-4 w-4 bg-dark-800/60 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two-column card grid for earnings/detail pages */
export function TwoCardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map(i => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <div className="h-4 w-32 bg-dark-800 rounded" />
            <div className="h-5 w-16 bg-dark-800 rounded-full" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-40 bg-dark-800/50 rounded" />
            <div className="h-3 w-28 bg-dark-800/40 rounded" />
          </div>
          <div className="h-8 w-32 bg-dark-800 rounded-lg" />
          <div className="h-3 w-48 bg-dark-800/30 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Search bar + action buttons row */
export function SearchBarSkeleton({ buttons = 2 }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[200px] h-10 bg-dark-800/50 border border-dark-700 rounded-lg" />
      {Array.from({ length: buttons }).map((_, i) => (
        <div key={i} className="h-9 w-24 bg-dark-800 rounded-lg" />
      ))}
    </div>
  );
}

/** Pending approvals list (for admin dashboard) */
export function PendingListSkeleton({ count = 4 }) {
  return (
    <div className="card">
      <div className="p-4 border-b border-dark-800 flex items-center justify-between">
        <div className="h-5 w-36 bg-dark-800 rounded" />
        <div className="h-4 w-16 bg-dark-800/60 rounded" />
      </div>
      <div className="divide-y divide-dark-800">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4">
            <div className="space-y-1.5">
              <div className="h-4 bg-dark-800 rounded w-44" />
              <div className="h-3 bg-dark-800/50 rounded w-32" />
            </div>
            <div className="h-4 w-12 bg-dark-800/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Config/form page with card sections */
export function ConfigSkeleton({ sections = 2 }) {
  return (
    <>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-5 w-32 bg-dark-800 rounded" />
            <div className="h-8 w-24 bg-dark-800 rounded-lg" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3">
                <div className="h-8 w-8 bg-dark-800 rounded-lg shrink-0" />
                <div className="h-4 bg-dark-800/60 rounded flex-1 max-w-xs" />
                <div className="h-4 w-8 bg-dark-800/40 rounded ml-auto" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** Small inline skeleton for sub-sections (ATS config tabs, etc.) */
export function InlineSkeleton({ rows = 4 }) {
  return (
    <div className="animate-pulse space-y-3 py-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 bg-dark-800 rounded flex-1 max-w-[200px]" />
          <div className="h-4 bg-dark-800/40 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

/** Centered skeleton for editor pages */
export function EditorSkeleton() {
  return (
    <div className="animate-pulse flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="w-full max-w-3xl space-y-4 px-6">
        <div className="flex items-center justify-between">
          <div className="h-7 w-48 bg-dark-800 rounded-lg" />
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-dark-800 rounded-lg" />
            <div className="h-9 w-20 bg-dark-800 rounded-lg" />
          </div>
        </div>
        <div className="bg-dark-800/30 border border-dark-700 rounded-xl h-[400px]" />
      </div>
    </div>
  );
}
