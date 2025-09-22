export default function CountBadge({ value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1">
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[11px] uppercase tracking-wide opacity-70">
        events
      </span>
    </div>
  );
}
