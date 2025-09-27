// src/pages/MyBets.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { loadAll, removeMatch, removeBet } from "../lib/betsStore";

const DK = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function useNow(tickMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return now;
}

function msToCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function MyBets() {
  const [list, setList] = useState([]);
  const now = useNow(1000);

  useEffect(() => {
    setList(loadAll());
  }, []);

  const { upcoming, live } = useMemo(() => {
    const up = [];
    const lv = [];
    for (const m of list) {
      const t = Date.parse(m.date);
      if (!Number.isFinite(t)) continue;
      if (now < t) up.push(m);
      else lv.push(m);
    }
    // sortér
    up.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    lv.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return { upcoming: up, live: lv };
  }, [list, now]);

  const handleRemoveMatch = (eventId) => {
    removeMatch(eventId);
    setList(loadAll());
  };
  const handleRemoveBet = (eventId, betId) => {
    removeBet(eventId, betId);
    setList(loadAll());
  };

  return (
    <div className="p-4 md:p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/60"
        >
          ← Forside
        </Link>
        <div className="text-xl font-semibold text-slate-100">My Bets</div>
        <div className="ml-auto text-xs text-slate-400">
          Lokal tid:{" "}
          {new Date(now).toLocaleTimeString("da-DK", {
            timeZone: "Europe/Copenhagen",
          })}
        </div>
      </div>

      {/* Ikke startet */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">
          Ikke startet endnu
        </h2>
        <div className="grid gap-4">
          {upcoming.length === 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-slate-400">
              Ingen kommende kampe.
            </div>
          )}
          {upcoming.map((m) => {
            const t = Date.parse(m.date);
            const eta = t - now;
            return (
              <div
                key={m.eventId}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="text-slate-100 font-semibold">
                    {m.home} <span className="opacity-60">vs</span> {m.away}
                  </div>
                  <div className="text-xs text-slate-400">{m.league?.name}</div>
                  <div className="ml-auto text-sm text-emerald-300">
                    Kickoff: {DK.format(new Date(m.date))} · T-{" "}
                    {msToCountdown(Math.max(0, eta))}
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {(m.bets || []).map((b) => (
                    <li
                      key={b.betId}
                      className="flex items-center justify-between rounded border border-slate-800 bg-slate-800/40 px-3 py-2"
                    >
                      <div className="text-sm">
                        <span className="text-slate-100 font-medium">
                          {b.market}
                        </span>
                        <span className="mx-2">—</span>
                        <span className="text-slate-200">{b.selection}</span>
                        <span className="ml-3 text-emerald-300 font-semibold">
                          {Number(b.price).toFixed(2)}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          @ {b.bookmaker}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveBet(m.eventId, b.betId)}
                        className="text-xs rounded bg-rose-600/80 hover:bg-rose-600 text-white px-2 py-1"
                        title="Fjern væddemål"
                      >
                        Fjern
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-end">
                  <button
                    onClick={() => handleRemoveMatch(m.eventId)}
                    className="text-xs rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5"
                    title="Fjern kamp og alle væddemål"
                  >
                    Fjern kamp
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Live</h2>
        <div className="grid gap-4">
          {live.length === 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-slate-400">
              Ingen live kampe.
            </div>
          )}
          {live.map((m) => {
            const t = Date.parse(m.date);
            const mins = Math.max(0, Math.floor((now - t) / 60000));
            return (
              <div
                key={m.eventId}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="text-slate-100 font-semibold">
                    {m.home} <span className="opacity-60">vs</span> {m.away}
                  </div>
                  <div className="text-xs text-slate-400">{m.league?.name}</div>
                  <div className="ml-auto text-sm text-emerald-300">
                    ⚽ {mins}&prime;
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {(m.bets || []).map((b) => (
                    <li
                      key={b.betId}
                      className="flex items-center justify-between rounded border border-slate-800 bg-slate-800/40 px-3 py-2"
                    >
                      <div className="text-sm">
                        <span className="text-slate-100 font-medium">
                          {b.market}
                        </span>
                        <span className="mx-2">—</span>
                        <span className="text-slate-200">{b.selection}</span>
                        <span className="ml-3 text-emerald-300 font-semibold">
                          {Number(b.price).toFixed(2)}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          @ {b.bookmaker}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
