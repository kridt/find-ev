export function SkeletonLine({ className = "" }) {
  return (
    <div
      className={`h-4 w-full animate-pulse rounded bg-slate-700/50 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-950/40">
      <SkeletonLine className="mb-3 h-5 w-2/3" />
      <SkeletonLine className="h-3 w-1/3" />
      <div className="mt-4 h-6 w-20 animate-pulse rounded-full bg-slate-700/50" />
    </div>
  );
}
