import leaguesRaw from "../assets/leagues.json";
import { useMemo } from "react";
import { useLeagueEventCounts } from "../hooks/useLeagueEventCounts";

function CountBadge({ value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/70 px-3 py-1">
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[11px] uppercase tracking-wide opacity-70">
        events
      </span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-950/40">
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-700/50 mb-3" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-slate-700/50" />
      <div className="mt-4 h-6 w-20 animate-pulse rounded-full bg-slate-700/50" />
    </div>
  );
}

function LeagueCard({ league }) {
  return (
    <div className="group rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-4 shadow-lg shadow-slate-950/40 backdrop-blur transition hover:-translate-y-0.5 hover:border-sky-600/40 hover:shadow-sky-900/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold">{league.name}</div>
          <div className="mt-1 text-xs opacity-60">{league.slug}</div>
          {league._error && (
            <div className="mt-2 text-[11px] text-red-400/90 break-all">
              {_short(league._error)}
            </div>
          )}
        </div>
        <CountBadge value={league.eventsCount ?? 0} />
      </div>
    </div>
  );
}
const _short = (s) => String(s).slice(0, 200);

export default function LeagueCounts() {
  const leagues = useMemo(() => leaguesRaw, []);

  // TIP: force useProxy=true i dev
  const { data, loading } = useLeagueEventCounts(leagues, {
    batchSize: 3,
    useProxy: true,
    fetchTimeoutMs: 20000,
  });

  const withCounts = leagues.map((l) => {
    const found = data.find((d) => d.slug === l.slug);
    return {
      ...l,
      eventsCount: found?.eventsCount ?? l.eventsCount ?? 0,
      _error: found?._error,
    };
  });

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {loading && !data.length
        ? Array.from({ length: Math.min(6, withCounts.length || 6) }).map(
            (_, i) => <SkeletonCard key={i} />
          )
        : withCounts.map((l) => <LeagueCard key={l.slug} league={l} />)}
    </div>
  );
}
