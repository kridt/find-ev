// src/pages/Home.jsx
import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useLeagues } from "../hooks/useLeagues";
import { usePrefetchLeagueEvents } from "../hooks/usePrefetchLeagueEvents";
import { LEAGUE_WHITELIST_NAMES } from "../constants/leagueWhitelist";

/* ---------- Skeleton (med liste-pladsholdere) ---------- */
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-950/40">
      <div className="h-5 w-2/3 animate-pulse rounded bg-slate-700/50 mb-3" />
      <div className="h-3 w-28 animate-pulse rounded bg-slate-700/50" />
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-slate-800/60" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-slate-800/60" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-slate-800/60" />
      </div>
    </div>
  );
}

/* ---------- Tid & countdown helpers ---------- */
function pickISO(ev) {
  return (
    ev?.date ??
    ev?.start_time ??
    ev?.commence_time ??
    ev?.kickoff ??
    ev?.start ??
    null
  );
}
const dkFmt = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function formatDK(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return dkFmt.format(d);
}
function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
function humanCountdown(msDiff) {
  const sign = msDiff > 0 ? 1 : -1;
  const abs = Math.abs(msDiff);
  const s = Math.floor(abs / 1000) % 60;
  const m = Math.floor(abs / 60000) % 60;
  const h = Math.floor(abs / 3600000) % 24;
  const d = Math.floor(abs / 86400000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}t`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return sign > 0
    ? `om ${parts.join(" ")}`
    : `startet for ${parts.join(" ")} siden`;
}

/* ---------- Navne & ID helpers ---------- */
function getHome(ev) {
  return (
    ev.home ??
    ev.home_team ??
    ev.homeTeam ??
    ev.teams?.home ??
    ev.participants?.[0]?.name ??
    (typeof ev.name === "string" ? ev.name.split(" vs ")[0] : "Home")
  );
}
function getAway(ev) {
  return (
    ev.away ??
    ev.away_team ??
    ev.awayTeam ??
    ev.teams?.away ??
    ev.participants?.[1]?.name ??
    (typeof ev.name === "string" ? ev.name.split(" vs ")[1] : "Away")
  );
}
function getEventId(ev) {
  const home = getHome(ev);
  const away = getAway(ev);
  const iso = pickISO(ev);
  return ev.id ?? ev.event_id ?? ev.key ?? `${home}-${away}-${iso || "tbd"}`;
}

/* ---------- Farverige dark accents ---------- */
const ACCENTS = [
  {
    ring: "ring-emerald-500/20",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    chipBorder: "border-emerald-400/30",
    chipBg: "bg-emerald-400/10",
  },
  {
    ring: "ring-sky-500/20",
    border: "border-sky-500/30",
    text: "text-sky-300",
    chipBorder: "border-sky-400/30",
    chipBg: "bg-sky-400/10",
  },
  {
    ring: "ring-violet-500/20",
    border: "border-violet-500/30",
    text: "text-violet-300",
    chipBorder: "border-violet-400/30",
    chipBg: "bg-violet-400/10",
  },
  {
    ring: "ring-amber-500/20",
    border: "border-amber-500/30",
    text: "text-amber-300",
    chipBorder: "border-amber-400/30",
    chipBg: "bg-amber-400/10",
  },
  {
    ring: "ring-rose-500/20",
    border: "border-rose-500/30",
    text: "text-rose-300",
    chipBorder: "border-rose-400/30",
    chipBg: "bg-rose-400/10",
  },
  {
    ring: "ring-cyan-500/20",
    border: "border-cyan-500/30",
    text: "text-cyan-300",
    chipBorder: "border-cyan-400/30",
    chipBg: "bg-cyan-400/10",
  },
  {
    ring: "ring-lime-500/20",
    border: "border-lime-500/30",
    text: "text-lime-300",
    chipBorder: "border-lime-400/30",
    chipBg: "bg-lime-400/10",
  },
  {
    ring: "ring-orange-500/20",
    border: "border-orange-500/30",
    text: "text-orange-300",
    chipBorder: "border-orange-400/30",
    chipBg: "bg-orange-400/10",
  },
  {
    ring: "ring-pink-500/20",
    border: "border-pink-500/30",
    text: "text-pink-300",
    chipBorder: "border-pink-400/30",
    chipBg: "bg-pink-400/10",
  },
  {
    ring: "ring-indigo-500/20",
    border: "border-indigo-500/30",
    text: "text-indigo-300",
    chipBorder: "border-indigo-400/30",
    chipBg: "bg-indigo-400/10",
  },
];
const accentForIndex = (i) => ACCENTS[i % ACCENTS.length];

/* ---------- Små inline ikoner (uden libs) ---------- */
const IconClock = (props) => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden {...props}>
    <path
      fill="currentColor"
      d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm1 5a1 1 0 1 0-2 0v5c0 .265.105.52.293.707l3 3a1 1 0 0 0 1.414-1.414L13 11.586V7Z"
    />
  </svg>
);
const IconArrow = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden {...props}>
    <path
      fill="currentColor"
      d="m8.29 6.71 4.59 4.59-4.59 4.59L9.71 17l6-6-6-6-1.42 1.41Z"
    />
  </svg>
);

/* ---------- UI: Countdown label ---------- */
function KickoffInfo({ iso }) {
  const now = useNow(1000);
  if (!iso) return null;
  const kickoffMs = Date.parse(iso);
  if (!Number.isFinite(kickoffMs)) return null;
  const diff = kickoffMs - now;
  const label = humanCountdown(diff);
  const local = formatDK(iso);
  const isSoon = diff > 0 && diff <= 60 * 60 * 1000;
  const textClass =
    diff <= 0
      ? "text-emerald-400"
      : isSoon
      ? "text-yellow-300"
      : "text-slate-300";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className={`inline-flex items-center gap-1 ${textClass}`}>
        <IconClock />
        {label}
      </span>
      <span className="text-slate-500">•</span>
      <span className="text-slate-400">{local}</span>
    </div>
  );
}

/* ---------- Event række (nyt design, uden ID) ---------- */
function EventRow({ ev }) {
  const home = getHome(ev);
  const away = getAway(ev);
  const iso = pickISO(ev);
  const id = getEventId(ev);

  return (
    <li className="group/item relative rounded-xl border border-slate-800/60 bg-slate-900/30 px-3 py-2 hover:bg-slate-900/60 transition">
      <Link
        to={`/events/${encodeURIComponent(id)}/odds`}
        state={{ event: ev }}
        className="flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight">
            <span className="text-slate-200">{home}</span>
            <span className="text-slate-500"> vs </span>
            <span className="text-slate-200">{away}</span>
          </div>
          <KickoffInfo iso={iso} />
        </div>
        <div className="shrink-0 text-slate-400 group-hover/item:text-slate-200 transition translate-x-0 group-hover/item:translate-x-0.5">
          <IconArrow />
        </div>
      </Link>
    </li>
  );
}

/* ---------- Event-count badge ---------- */
function CountBadge({ value, loading, accent }) {
  const plural = value === 1 ? "event" : "events";
  const display = loading || value == null ? "…" : value;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border ${accent.chipBorder} ${accent.chipBg} px-3 py-1`}
    >
      <span className="text-base font-bold leading-none">{display}</span>
      <span className="text-[11px] uppercase tracking-wide text-slate-300">
        {plural}
      </span>
    </div>
  );
}

/* ---------- Liga-kort (altid åbent) ---------- */
function LeagueCard({ league, index, events, loading }) {
  const acc = accentForIndex(index);

  useEffect(() => {
    if (!events) return;
    console.log(`[EVENTS for ${league.slug}]`, events);
  }, [events, league.slug]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${acc.border} bg-slate-950/70 p-4 shadow-lg shadow-slate-950/40 ring-1 ${acc.ring} transition`}
    >
      {/* dekorativ gradient */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />

      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className={`text-base font-semibold ${acc.text}`}>
            {league.name ?? league.league ?? "Unknown League"}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {league.slug ?? league.league_slug ?? "-"}
          </div>
        </div>
        <CountBadge value={events?.length} loading={loading} accent={acc} />
      </div>

      {/* Liste */}
      {!events ? (
        <div className="text-sm text-slate-300">Henter events…</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-slate-400">
          Ingen pending events ≤ 3 dage.
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {events.map((ev, i) => (
            <EventRow key={ev.id ?? i} ev={ev} />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Forside med whitelist + PREFETCH + Show All toggle ---------- */
export default function Home() {
  const { leagues, loading, error } = useLeagues({
    sport: "football",
    useProxy: true,
  });

  // Show-all toggle (persist i localStorage)
  const [showAll, setShowAll] = useState(() => {
    try {
      return localStorage.getItem("ev.showAllLeagues") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("ev.showAllLeagues", showAll ? "1" : "0");
    } catch {}
  }, [showAll]);

  // Filtrer + sortér i whitelist-rækkefølge
  const filteredLeagues = useMemo(() => {
    const norm = (s) =>
      String(s || "")
        .trim()
        .toLowerCase();
    const order = new Map(LEAGUE_WHITELIST_NAMES.map((n, i) => [norm(n), i]));
    const allow = new Set(order.keys());
    const arr = (leagues || []).filter((l) =>
      allow.has(norm(l.name ?? l.league))
    );
    arr.sort(
      (a, b) =>
        (order.get(norm(a.name ?? a.league)) ?? 9999) -
        (order.get(norm(b.name ?? b.league)) ?? 9999)
    );
    return arr;
  }, [leagues]);

  // Prefetch alle events (≤ 3 dage) for whitelisten
  const { byLeague, loading: preLoading } = usePrefetchLeagueEvents(
    filteredLeagues,
    {
      sport: "football",
      status: "pending",
      maxDays: 3,
      useProxy: true,
      concurrency: 5,
    }
  );

  // Skjul ligaer med 0 events (med mindre “Show all” er slået til)
  const leaguesToRender = useMemo(() => {
    if (showAll) return filteredLeagues;
    return filteredLeagues.filter((l) => {
      const arr = byLeague[l.slug];
      if (arr == null) return true; // vis mens den loader
      return arr.length > 0;
    });
  }, [filteredLeagues, byLeague, showAll]);

  const hiddenCount = useMemo(() => {
    if (showAll) return 0;
    let c = 0;
    for (const l of filteredLeagues) {
      const arr = byLeague[l.slug];
      if (Array.isArray(arr) && arr.length === 0) c++;
    }
    return c;
  }, [filteredLeagues, byLeague, showAll]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <p className="opacity-80">
          Viser whitelisted ligaer.{" "}
          <span className="opacity-90">Alle kampe ≤ 3 dage</span>, DK-tid & live
          countdown. Næste kamp øverst.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            <span>Show all leagues</span>
          </label>
          <Link
            to="/live"
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-sm border border-slate-700"
          >
            Live (WS)
          </Link>
        </div>
      </div>

      {!showAll && hiddenCount > 0 && (
        <div className="text-xs opacity-70">
          Skjuler{" "}
          <span className="text-emerald-300 font-medium">{hiddenCount}</span>{" "}
          liga(er) uden kampe.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <div className="font-semibold mb-1">Fejl</div>
          <div className="break-all">{error}</div>
        </div>
      )}

      {loading && !leagues.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leaguesToRender.map((l, i) => (
            <LeagueCard
              key={l.slug ?? l.name ?? i}
              league={l}
              index={i}
              events={byLeague[l.slug]} // hentet & filtreret & sorteret
              loading={preLoading && !byLeague[l.slug]} // viser "…" i badge mens netop den liga loader
            />
          ))}
        </div>
      )}

      {preLoading && (
        <div className="text-xs opacity-70">Henter kampe for ligaerne…</div>
      )}
    </div>
  );
}
