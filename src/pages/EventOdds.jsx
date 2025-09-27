// src/pages/EventOdds.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { getJSON } from "../lib/apiClient";
import { addBet as storeAddBet } from "../lib/betsStore";

/** ---------- Indstillinger ---------- */
const BOOKMAKERS = [
  "Bet365",
  "Betinia DK",
  "Expekt DK",
  "Campobet DK",
  "LeoVegas DK",
  "Betsson",
  "Betano",
  "MrGreen",
  "NordicBet",
  "Unibet DK",
];

const MIN_PROVIDERS = 3; // core skal have ≥3; props vises ved ≥1 (EV kun ved ≥3)
const EV_THRESHOLD = 4;

const DK = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** ---------- Utils ---------- */
const toNum = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s.toUpperCase() === "N/A") return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const pct = (x) => `${x.toFixed(2)}%`;
const fmtOdd = (x) => (x == null ? "—" : Number(x).toFixed(2));
const safeArr = (a) => (Array.isArray(a) ? a : []);
const isObj = (o) => o && typeof o === "object";

const isNumericId = (v) => v != null && /^\d+$/.test(String(v));
const pickNumeric = (...cands) => {
  for (const c of cands) if (isNumericId(c)) return String(c);
  return null;
};

const CORE_MARKET_HINTS = [
  "ML",
  "Draw No Bet",
  "Totals",
  "Goals Over/Under",
  "Both Teams To Score",
  "ML HT",
  "Totals HT",
  "Team Total Home",
  "Team Total Away",
  "Corners Totals",
  "European Handicap",
];
const PROP_MARKET_HINTS = [
  "Anytime Goalscorer",
  "First Goalscorer",
  "Last Goalscorer",
  "Team Goalscorer",
  "Player Cards",
  "Multi Scorers",
  "Player Shots",
  "Player Assists",
  "Player Tackles",
  "Player Passes",
];

/** ---------- helpers ---------- */
const looksLike = (name, list) =>
  (name || "").toLowerCase &&
  list.some((m) => name.toLowerCase().includes(m.toLowerCase()));
const keyFor = (group, selection) => `${group} :: ${selection}`;
function withHdp(base, hdp) {
  if (hdp == null || hdp === "" || isNaN(+hdp)) return base;
  const h = Number(hdp);
  return `${base} (${h > 0 ? `+${h}` : h})`;
}

/** ---------- Normalisering fra én bookmaker ---------- */
function explodeBookieMarkets(bookie, markets) {
  const out = [];
  for (const m of safeArr(markets)) {
    const name = m?.name || "";
    const isCore = looksLike(name, CORE_MARKET_HINTS);
    const isProp = looksLike(name, PROP_MARKET_HINTS);
    const odds = safeArr(m?.odds);

    const push = (group, selection, price, extra = {}) => {
      const p = toNum(price);
      if (p == null) return;
      out.push({
        key: keyFor(group, selection),
        group,
        selection,
        price: p,
        bookie,
        isProp,
        isCore,
        ...extra,
      });
    };

    if (name === "ML" || name === "ML HT" || /moneyline/i.test(name)) {
      odds.forEach((o) => {
        push(name, "Home", o.home);
        if (o.draw != null) push(name, "Draw", o.draw);
        push(name, "Away", o.away);
      });
      continue;
    }
    if (/draw no bet/i.test(name)) {
      odds.forEach((o) => {
        push(name, "Home", o.home, { hdp: o.hdp ?? 0 });
        push(name, "Away", o.away, { hdp: o.hdp ?? 0 });
      });
      continue;
    }
    if (
      /totals/i.test(name) ||
      /goals over\/under/i.test(name) ||
      /team total/i.test(name) ||
      /corners totals/i.test(name)
    ) {
      odds.forEach((o) => {
        if (o.over != null)
          push(name, `Over @ ${o.hdp}`, o.over, { hdp: o.hdp });
        if (o.under != null)
          push(name, `Under @ ${o.hdp}`, o.under, { hdp: o.hdp });
      });
      continue;
    }
    if (/both teams to score/i.test(name)) {
      odds.forEach((o) => {
        if (o.yes != null) push(name, "Yes", o.yes, { hdp: o.hdp ?? 0 });
        if (o.no != null) push(name, "No", o.no, { hdp: o.hdp ?? 0 });
      });
      continue;
    }
    if (looksLike(name, PROP_MARKET_HINTS)) {
      odds.forEach((o) => {
        const label = o.label || o.player || o.name || "Option";
        const price =
          toNum(o.over) ??
          toNum(o.under) ??
          toNum(o.home) ??
          toNum(o.away) ??
          toNum(o.yes) ??
          toNum(o.no);
        if (price != null) push(name, label, price, { hdp: o.hdp });
      });
      continue;
    }
    if (/european handicap/i.test(name)) {
      odds.forEach((o) => {
        if (o.home != null)
          push(name, withHdp("Home", o.hdp), o.home, { hdp: o.hdp });
        if (o.draw != null)
          push(name, withHdp("Draw", o.hdp), o.draw, { hdp: o.hdp });
        if (o.away != null)
          push(name, withHdp("Away", o.hdp), o.away, { hdp: o.hdp });
      });
      continue;
    }
    // fallback: læs alt numerisk
    odds.forEach((o) => {
      const base =
        o.label ||
        o.player ||
        o.name ||
        (o.hdp != null ? `Line ${o.hdp}` : "Option");
      for (const k of ["over", "under", "home", "away", "draw", "yes", "no"]) {
        if (toNum(o[k]) != null) {
          const sel =
            k === "over"
              ? `${base} (Over)`
              : k === "under"
              ? `${base} (Under)`
              : `${base} (${k})`;
          push(name, sel, o[k], { hdp: o.hdp });
        }
      }
    });
  }
  return out;
}

/** ---------- Aggregér & EV ---------- */
function aggregateSelections(json, maxCap = 0) {
  const urls = isObj(json?.urls) ? json.urls : {};
  const bmMap = isObj(json?.bookmakers) ? json.bookmakers : {};

  const rows = [];
  for (const [bookie, markets] of Object.entries(bmMap)) {
    rows.push(...explodeBookieMarkets(bookie, markets));
  }

  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.key)) {
      map.set(r.key, {
        key: r.key,
        group: r.group,
        selection: r.selection,
        isProp: !!r.isProp,
        isCore: !!r.isCore,
        offers: [],
      });
    }
    map.get(r.key).offers.push({ bookie: r.bookie, price: r.price });
  }

  const out = [];
  for (const rec of map.values()) {
    const bestByBookie = new Map();
    for (const o of rec.offers) {
      if (maxCap > 0 && !(o.price <= maxCap)) continue;
      const prev = bestByBookie.get(o.bookie);
      if (!prev || o.price > prev.price) bestByBookie.set(o.bookie, o);
    }
    const uniq = Array.from(bestByBookie.values());
    const count = uniq.length;

    if (!rec.isProp && count < MIN_PROVIDERS) continue; // core: kræv 3
    if (rec.isProp && count < 1) continue; // props: vis ved ≥1

    const avg = count ? uniq.reduce((s, o) => s + o.price, 0) / count : null;
    const best = count ? Math.max(...uniq.map((o) => o.price)) : null;
    const evPct =
      count >= MIN_PROVIDERS && avg && best ? (best / avg - 1) * 100 : null;

    const aboveAvg =
      count && avg
        ? uniq
            .filter((o) => o.price >= avg * (1 + EV_THRESHOLD / 100))
            .sort((a, b) => b.price - a.price)
            .map((o) => ({
              ...o,
              url:
                urls[o.bookie] && urls[o.bookie] !== "N/A"
                  ? urls[o.bookie]
                  : null,
            }))
        : [];

    const bestBookies =
      count && best != null
        ? uniq
            .filter((o) => Math.abs(o.price - best) < 1e-9)
            .map((o) => ({
              ...o,
              url:
                urls[o.bookie] && urls[o.bookie] !== "N/A"
                  ? urls[o.bookie]
                  : null,
            }))
        : [];

    out.push({
      key: rec.key,
      market: rec.group,
      selection: rec.selection,
      isProp: rec.isProp,
      isCore: rec.isCore,
      count,
      avg,
      best,
      evPct,
      bestBookies,
      aboveAvg,
      offers: uniq.sort((a, b) => b.price - a.price),
    });
  }

  return out;
}

/** ---------- UI ---------- */
function Chip({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
      {children}
    </span>
  );
}

function SectionTable({ title, rows, onAdd }) {
  // Lokalt valg af bookmaker pr. række
  const [choice, setChoice] = useState({}); // key -> bookie

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-2">{title}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 shadow-lg shadow-slate-950/40">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-900/70">
            <tr className="text-left text-slate-300 text-xs uppercase tracking-wide">
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Selection</th>
              <th className="px-3 py-2">Bookm.</th>
              <th className="px-3 py-2">Avg</th>
              <th className="px-3 py-2">Best</th>
              <th className="px-3 py-2">EV%</th>
              <th className="px-3 py-2">≥ {EV_THRESHOLD}% over avg</th>
              <th className="px-3 py-2 text-right">Tilføj</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-sm text-slate-400">
                  Ingen rækker matcher filtrene.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const selectedBook = choice[r.key] || r.offers[0]?.bookie;
                const selectedOffer =
                  r.offers.find((o) => o.bookie === selectedBook) ||
                  r.offers[0];
                return (
                  <tr key={r.key} className="hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-sm text-slate-200">
                      {r.market}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className="font-medium text-slate-100">
                        {r.selection}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-300">
                      {r.count}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className="text-slate-200">{fmtOdd(r.avg)}</span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-emerald-300 font-semibold">
                          {fmtOdd(r.best)}
                        </span>
                        {r.bestBookies.map((b) =>
                          b.url ? (
                            <a
                              key={b.bookie}
                              href={b.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 hover:bg-emerald-400/20"
                            >
                              {b.bookie}
                            </a>
                          ) : (
                            <span
                              key={b.bookie}
                              className="text-xs rounded border border-slate-700 bg-slate-800 px-2 py-0.5"
                            >
                              {b.bookie}
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className={`${
                          r.evPct == null
                            ? "text-slate-400"
                            : r.evPct >= EV_THRESHOLD
                            ? "text-emerald-300"
                            : "text-slate-300"
                        } font-semibold`}
                      >
                        {r.evPct == null ? "—" : pct(r.evPct)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {r.aboveAvg.length === 0 ? (
                          <span className="text-xs text-slate-500">—</span>
                        ) : (
                          r.aboveAvg.map((b) =>
                            b.url ? (
                              <a
                                key={b.bookie}
                                href={b.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Chip>
                                  {b.bookie}{" "}
                                  <span className="opacity-70">
                                    ({fmtOdd(b.price)})
                                  </span>
                                </Chip>
                              </a>
                            ) : (
                              <Chip key={b.bookie}>
                                {b.bookie}{" "}
                                <span className="opacity-70">
                                  ({fmtOdd(b.price)})
                                </span>
                              </Chip>
                            )
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                          value={selectedBook}
                          onChange={(e) =>
                            setChoice((c) => ({
                              ...c,
                              [r.key]: e.target.value,
                            }))
                          }
                        >
                          {r.offers.map((o) => (
                            <option key={o.bookie} value={o.bookie}>
                              {o.bookie} · {fmtOdd(o.price)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => onAdd?.(r, selectedOffer)}
                          className="rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-1.5"
                          title="Tilføj væddemål til My Bets"
                        >
                          Tilføj
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** ---------- Side ---------- */
export default function EventOdds() {
  // robust eventId
  const params = useParams();
  const location = useLocation();
  const stateEvent = location.state?.event || null;
  const qEventId = new URLSearchParams(location.search).get("eventId");
  const eventId = pickNumeric(
    stateEvent?.id,
    params.id,
    params.eventId,
    qEventId
  );

  console.group("[EventOdds] resolve eventId");
  console.log("route params:", params);
  console.log("query.eventId:", qEventId);
  console.log("stateEvent.id:", stateEvent?.id);
  console.log("chosen eventId:", eventId || "(none)");
  console.groupEnd();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // UI toggles
  const [sortByEv, setSortByEv] = useState(() => {
    try {
      return localStorage.getItem("ev.sortByEv") !== "0";
    } catch {
      return true;
    }
  });
  const [hideLowEv, setHideLowEv] = useState(() => {
    try {
      return localStorage.getItem("ev.hideLowEv") !== "0";
    } catch {
      return true;
    }
  });
  const [maxCap, setMaxCap] = useState(() => {
    try {
      return Number(localStorage.getItem("ev.maxCap") || "0");
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("ev.sortByEv", sortByEv ? "1" : "0");
    } catch {}
  }, [sortByEv]);
  useEffect(() => {
    try {
      localStorage.setItem("ev.hideLowEv", hideLowEv ? "1" : "0");
    } catch {}
  }, [hideLowEv]);
  useEffect(() => {
    try {
      localStorage.setItem("ev.maxCap", String(maxCap));
    } catch {}
  }, [maxCap]);

  useEffect(() => {
    let off = false;
    if (!eventId) {
      setErr(
        "Mangler numerisk eventId. Gå ind via forsiden eller brug ?eventId=<tal> i URL’en."
      );
      console.error("[EventOdds] No numeric eventId – aborting fetch.");
      return;
    }
    async function go() {
      setLoading(true);
      setErr("");
      try {
        console.info("[EventOdds] fetching odds for eventId=", eventId);
        const json = await getJSON("/v3/odds", {
          eventId,
          bookmakers: BOOKMAKERS.join(","),
        });
        if (!off) setData(json);
      } catch (e) {
        console.error("[EventOdds] fetch error:", e);
        if (!off) setErr(String(e?.message || e));
      } finally {
        if (!off) setLoading(false);
      }
    }
    go();
    return () => {
      off = true;
    };
  }, [eventId]);

  const rowsAll = useMemo(
    () => (data ? aggregateSelections(data, maxCap) : []),
    [data, maxCap]
  );
  const applyEvFilter = (list) => {
    if (!hideLowEv) return list;
    return list.filter((r) => r.evPct == null || r.evPct >= EV_THRESHOLD);
  };
  const rowsCore = useMemo(() => {
    const base = rowsAll.filter((r) => r.isCore && !r.isProp);
    const filtered = applyEvFilter(base);
    return sortByEv
      ? [...filtered].sort((a, b) => (b.evPct ?? -1e9) - (a.evPct ?? -1e9))
      : [...filtered].sort(
          (a, b) =>
            a.market.localeCompare(b.market, "en") ||
            a.selection.localeCompare(b.selection, "en")
        );
  }, [rowsAll, sortByEv, hideLowEv]);
  const rowsProps = useMemo(() => {
    const base = rowsAll.filter((r) => r.isProp);
    const filtered = applyEvFilter(base);
    return sortByEv
      ? [...filtered].sort((a, b) => (b.evPct ?? -1e9) - (a.evPct ?? -1e9))
      : [...filtered].sort(
          (a, b) =>
            a.market.localeCompare(b.market, "en") ||
            a.selection.localeCompare(b.selection, "en")
        );
  }, [rowsAll, sortByEv, hideLowEv]);

  // Tilføj væddemål
  function handleAddRow(row, offer) {
    if (!data) return;
    const matchInfo = {
      eventId,
      date: data.date,
      home: data.home,
      away: data.away,
      league: data.league,
    };
    const bet = {
      market: row.market,
      selection: row.selection,
      price: offer?.price,
      bookmaker: offer?.bookie,
    };
    const added = storeAddBet(matchInfo, bet);
    console.log("[MyBets] added", { matchInfo, bet: added });
    // lille feedback:
    alert(
      `Tilføjet: ${row.market} – ${row.selection}\n${offer?.bookie} @ ${fmtOdd(
        offer?.price
      )}`
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/60"
        >
          ← Tilbage
        </Link>
        <Link
          to="/my-bets"
          className="rounded-lg border border-emerald-700 bg-emerald-800/40 px-3 py-1.5 text-sm hover:bg-emerald-700/40 ml-1"
        >
          My Bets
        </Link>
        <div className="text-lg font-semibold text-slate-100 ml-auto">
          {data ? (
            <>
              {data.home ?? "Home"} <span className="opacity-60">vs</span>{" "}
              {data.away ?? "Away"}
              <span className="ml-3 text-sm opacity-70">
                {data.date ? DK.format(new Date(data.date)) : null}
              </span>
              <span className="ml-3 text-xs text-slate-400">
                {data.league?.name}
              </span>
            </>
          ) : (
            <>Event {eventId ? `#${eventId}` : ""}</>
          )}
        </div>
      </div>

      {/* Toggles */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={sortByEv}
            onChange={(e) => setSortByEv(e.target.checked)}
          />
          <span>Sortér efter højeste EV%</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={hideLowEv}
            onChange={(e) => setHideLowEv(e.target.checked)}
          />
          <span>Skjul EV &lt; {EV_THRESHOLD}%</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="opacity-80">Max odds:</span>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
            <button
              className={`px-2 py-1 ${
                maxCap === 0
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800/60 hover:bg-slate-700/60"
              }`}
              onClick={() => setMaxCap(0)}
            >
              Ingen
            </button>
            <button
              className={`px-2 py-1 border-l border-slate-700 ${
                maxCap === 2
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800/60 hover:bg-slate-700/60"
              }`}
              onClick={() => setMaxCap(2)}
            >
              ≤2.00
            </button>
            <button
              className={`px-2 py-1 border-l border-slate-700 ${
                maxCap === 3
                  ? "bg-slate-700 text-white"
                  : "bg-slate-800/60 hover:bg-slate-700/60"
              }`}
              onClick={() => setMaxCap(3)}
            >
              ≤3.00
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      {loading && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm">
          Henter odds…
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <div className="font-semibold mb-1">Fejl</div>
          <div className="break-all">{err}</div>
        </div>
      )}

      {/* Tabel-sektioner */}
      {!loading && !err && (
        <>
          <SectionTable
            title="Core markets"
            rows={rowsCore}
            onAdd={handleAddRow}
          />
          <SectionTable
            title="Player props & specials"
            rows={rowsProps}
            onAdd={handleAddRow}
          />
        </>
      )}
    </div>
  );
}
