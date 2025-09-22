import { useState, useMemo } from "react";
import leaguesRaw from "../assets/leagues.json";
import { slugify } from "../utils/slugify";
import { useEvents } from "../hooks/useEvents";
import { Link } from "react-router-dom";

function normalizeLeague(item) {
  // Prøv at læse fleksibelt fra brugers fil
  const sport = item.sport || item.Sport || "football";
  const country =
    item.country ||
    item.Country ||
    item.area ||
    item.Area ||
    item.region ||
    "Unknown";
  const name =
    item.name ||
    item.Name ||
    item.league ||
    item.league_name ||
    item.competition ||
    "Unknown League";
  const slug =
    item.slug || item.Slug || item.league_slug || slugify(`${country}-${name}`);

  return { sport, country, name, slug };
}

function groupByCountry(leagues) {
  const map = new Map();
  for (const l of leagues) {
    const key = l.country;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(l);
  }
  // sortér pænt
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function EventRow({ ev }) {
  // Prøv at udlede holdnavne og starttid robust
  const home =
    ev.home_team ||
    ev.homeTeam ||
    ev.home ||
    ev.teams?.home ||
    ev.participants?.[0]?.name ||
    ev.name?.split(" vs ")[0] ||
    "Home";

  const away =
    ev.away_team ||
    ev.awayTeam ||
    ev.away ||
    ev.teams?.away ||
    ev.participants?.[1]?.name ||
    ev.name?.split(" vs ")[1] ||
    "Away";

  const start =
    ev.start_time ||
    ev.commence_time ||
    ev.start ||
    ev.kickoff ||
    ev.date ||
    ev.time ||
    null;

  const id =
    ev.id ||
    ev.event_id ||
    ev.key ||
    ev.uid ||
    `${home}-${away}-${start || "tbd"}`;

  return (
    <li className="flex items-center justify-between py-2 border-b border-slate-800">
      <div className="text-sm sm:text-base">
        <div className="font-medium">
          {home} <span className="opacity-70">vs</span> {away}
        </div>
        {start && (
          <div className="text-xs opacity-70 mt-0.5">{String(start)}</div>
        )}
      </div>
      <Link
        to={`/events/${encodeURIComponent(id)}`}
        className="text-xs sm:text-sm px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700"
      >
        Åbn
      </Link>
    </li>
  );
}

function LeaguePanel({ league }) {
  const [open, setOpen] = useState(false);
  const { events, loading, err } = useEvents(open ? league.slug : null, {
    sport: league.sport,
    status: "pending",
  });

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 text-left"
      >
        <span className="font-medium">{league.name}</span>
        <span className="text-xs opacity-75">
          {open ? "Skjul kampe" : "Vis kampe"}
        </span>
      </button>

      {open && (
        <div className="px-4 py-3 bg-slate-900">
          {loading && <div className="text-sm opacity-75">Henter kampe…</div>}
          {err && (
            <div className="text-sm text-red-400">
              Fejl: {typeof err === "string" ? err : JSON.stringify(err)}
            </div>
          )}
          {!loading && !err && (
            <ul>
              {events.length === 0 && (
                <li className="text-sm opacity-70">
                  Ingen kampe (pending) fundet.
                </li>
              )}
              {events.map((ev, i) => (
                <EventRow key={i} ev={ev} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeagueAccordion() {
  // Normaliser & filtrér til sport=football
  const leagues = useMemo(
    () =>
      leaguesRaw
        .map(normalizeLeague)
        .filter((l) => (l.sport || "").toLowerCase() === "football"),
    []
  );

  const grouped = useMemo(() => groupByCountry(leagues), [leagues]);

  return (
    <div className="space-y-8">
      {grouped.map(([country, ls]) => (
        <section key={country} className="space-y-3">
          <h2 className="text-xl font-semibold">{country}</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {ls.map((l) => (
              <LeaguePanel key={`${country}-${l.slug}`} league={l} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
