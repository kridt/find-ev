// src/pages/Home.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLocalLeagues } from "../hooks/useLocalLeagues";
import { usePrefetchLeagueEvents } from "../hooks/usePrefetchLeagueEvents";

/* ---------- Skeleton ---------- */
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

/* ---------- Tid & helpers ---------- */
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
  return dkFmt.format(new Date(iso));
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

/* ---------- Navne/ID helpers ---------- */
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
  const home = getHome(ev),
    away = getAway(ev),
    iso = pickISO(ev);
  return ev.id ?? ev.event_id ?? ev.key ?? `${home}-${away}-${iso || "tbd"}`;
}

/* ---------- Farve-accents ---------- */
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
];
const accentForIndex = (i) => ACCENTS[i % ACCENTS.length];

/* ---------- UI: Countdown ---------- */
function KickoffInfo({ iso }) {
  const now = useNow(1000);
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const diff = ms - now;
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
      <span className={textClass}>{label}</span>
      <span className="text-slate-500">•</span>
      <span className="text-slate-400">{local}</span>
    </div>
  );
}

/* ---------- Event-række ---------- */
function EventRow({ ev }) {
  const home = getHome(ev),
    away = getAway(ev),
    iso = pickISO(ev),
    id = getEventId(ev);
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
        <div className="shrink-0 text-slate-400 group-hover/item:text-slate-200 transition">
          ›
        </div>
      </Link>
    </li>
  );
}

/* ---------- Count-badge ---------- */
function CountBadge({ value, loading, accent }) {
  const display = loading || value == null ? "…" : value;
  const label = display === 1 ? "event" : "events";
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border ${accent.chipBorder} ${accent.chipBg} px-3 py-1`}
    >
      <span className="text-base font-bold leading-none">{display}</span>
      <span className="text-[11px] uppercase tracking-wide text-slate-300">
        {label}
      </span>
    </div>
  );
}

/* ---------- Liga-kort (ALTID åbent) ---------- */
function LeagueCard({ league, index, events, loading }) {
  const acc = accentForIndex(index);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${acc.border} bg-slate-950/70 p-4 shadow-lg shadow-slate-950/40 ring-1 ${acc.ring} transition`}
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-gradient-to-br from-white/5 to-transparent blur-2xl" />
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <div className={`text-base font-semibold ${acc.text}`}>
            {league.name ?? "Unknown League"}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {league.slug ?? "-"}
          </div>
        </div>
        <CountBadge value={events?.length} loading={loading} accent={acc} />
      </div>
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

/* ---------- Home ---------- */
export default function Home() {
  // Alle ligaer fra lokal fil
  const { leagues, loading, error } = useLocalLeagues();

  // Prefetch events ≤3d for alle ligaer
  const { byLeague, loading: preLoading } = usePrefetchLeagueEvents(leagues, {
    sport: "football",
    status: "pending",
    maxDays: 3,
    concurrency: 5,
  });

  // Toggle: skjul 0-kampe (default: fra)
  const [hideZero, setHideZero] = useState(() => {
    try {
      return localStorage.getItem("ev.hideZero") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("ev.hideZero", hideZero ? "1" : "0");
    } catch {}
  }, [hideZero]);

  const sortedLeagues = useMemo(
    () =>
      [...(leagues || [])].sort((a, b) => a.name.localeCompare(b.name, "en")),
    [leagues]
  );

  const leaguesToRender = useMemo(() => {
    if (!hideZero) return sortedLeagues;
    return sortedLeagues.filter((l) => {
      const arr = byLeague[l.slug];
      if (arr == null) return true; // vis mens den loader
      return arr.length > 0;
    });
  }, [sortedLeagues, byLeague, hideZero]);

  const hiddenCount = useMemo(() => {
    if (!hideZero) return 0;
    let c = 0;
    for (const l of sortedLeagues) {
      const arr = byLeague[l.slug];
      if (Array.isArray(arr) && arr.length === 0) c++;
    }
    return c;
  }, [sortedLeagues, byLeague, hideZero]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <p className="opacity-80">
          Viser <b>alle ligaer</b> fra lokal fil. Events ≤ 3 dage, DK-tid & live
          countdown.
        </p>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideZero}
              onChange={(e) => setHideZero(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            <span>Hide leagues with 0 events</span>
          </label>
          <Link
            to="/live"
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-sm border border-slate-700"
          >
            Live (WS)
          </Link>
        </div>
      </div>

      {hiddenCount > 0 && hideZero && (
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
              events={byLeague[l.slug]}
              loading={preLoading && !byLeague[l.slug]}
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
