// src/pages/EventOdds.jsx
import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useEventOdds } from "../hooks/useEventOdds";
import { BOOKMAKERS } from "../constants/bookmakers";

// UI
function Badge({ children }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px]">
      {children}
    </span>
  );
}
function SegButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg border text-sm transition
        ${
          active
            ? "bg-emerald-900/40 border-emerald-700 text-emerald-300 hover:bg-emerald-900/60"
            : "bg-slate-800 border-slate-700 hover:bg-slate-700"
        }`}
    >
      {children}
    </button>
  );
}

// Outcomes vi kender i data
const OUT_LABEL = {
  home: "Home",
  draw: "Draw",
  away: "Away",
  over: "Over",
  under: "Under",
  yes: "Yes",
  no: "No",
};
const OUT_ORDER = ["home", "draw", "away", "over", "under", "yes", "no"];

// Udvidet markedsrækkefølge (de ukendte ryger automatisk til sidst)
const MARKET_ORDER = [
  // Klassikere
  "ML",
  "ML HT",
  "Draw No Bet",
  "Double Chance",
  "Half Time Double Chance",
  "Spread",
  "Spread HT",
  "Totals",
  "Totals HT",
  "Goals Over/Under",
  "Team Total Home",
  "Team Total Away",
  "Both Teams To Score",
  "Both Teams to Score in 1st Half",
  "Both Teams to Score in 2nd Half",
  // Result/score kombinationer
  "Half Time/Full Time",
  "Result/Both Teams to Score",
  "Half Time Result",
  "2nd Half Result",
  "First Team to Score",
  "Last Team to Score",
  "10 Minute Result",
  // Eksakte mål
  "Exact Total Goals",
  "Exact 1st Half Goals",
  "Exact 2nd Half Goals",
  // Alternative linjer
  "Alternative Total Goals",
  "Alternative Goal Line",
  "Alternative Asian Handicap",
  "Alternative 1st Half Asian Handicap",
  "Alternative Handicap Result",
  "Alternative 1st Half Handicap Result",
  // Handicap-varianter
  "European Handicap",
  "Handicap Result",
  "1st Half Handicap",
  // Halvlege/mest mål mv.
  "First Half Goals",
  "2nd Half Goals",
  "Half With Most Goals",
  "Early Goal",
  "Late Goal",
  "Time of First Goal Brackets",
  "Total Goal Minutes",
  "Time of 1st Team Goal",
  // Odd/Even, Clean sheet, teams to score
  "Goals Odd/Even",
  "1st Half Goals Odd/Even",
  "2nd Half Goals Odd/Even",
  "Home Team Odd/Even Goals",
  "Away Team Odd/Even Goals",
  "Clean Sheet",
  "Teams to Score",
  // Scorer-markeder
  "Anytime Goalscorer",
  "Team Goalscorer",
  "Player to Score or Assist",
  "Multi Scorers",
  "Own Goal",
  "Goal Method",
];

// Helpers
const num = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const fmt = (v, d = 3) =>
  v == null
    ? "—"
    : Number(v)
        .toFixed(d)
        .replace(/\.?0+$/, "");
const makeRowLabel = (marketName, hdp, outcome, label) => {
  const h = hdp ?? hdp === 0 ? ` ${hdp}` : "";
  return `${marketName}${h} — ${label || OUT_LABEL[outcome] || outcome}`;
};
const orderBookies = (data, preferred) => {
  const all = Object.keys(data?.bookmakers || {});
  if (!preferred?.length) return all;
  const seen = new Set();
  const pref = preferred.filter(
    (b) => all.includes(b) && !seen.has(b) && seen.add(b)
  );
  const rest = all.filter((b) => !seen.has(b));
  return pref.concat(rest);
};

/**
 * Pivoter odds og beregn stats med odds-cap
 * rows = [{
 *   key, market, hdp, outcome, labelRaw?, label,
 *   cells: { [bookie]: "1.85" },
 *   stats: { count, avg, bestBookie, bestOdds, evPct }
 * }]
 */
function buildPivotWithStats(data, preferredBookies = [], maxOddsCap = null) {
  const bookies = orderBookies(data, preferredBookies);
  const rowsMap = new Map();

  const byBookie = data?.bookmakers || {};
  for (const bookie of bookies) {
    const markets = byBookie[bookie] || [];
    for (const m of markets) {
      const name = m?.name ?? "Unknown";
      const oddsArr = Array.isArray(m?.odds) ? m.odds : [];
      for (const o of oddsArr) {
        const hdp = o?.hdp;
        const label = o?.label ? String(o.label).trim() : "";

        // Kør alle outcomes vi kender igennem
        for (const k of OUT_ORDER) {
          if (o?.[k] != null) {
            const key = `${name}|${hdp ?? ""}|${k}|${label}`;
            if (!rowsMap.has(key)) {
              rowsMap.set(key, {
                key,
                market: name,
                hdp,
                outcome: k,
                labelRaw: label || null,
                label: makeRowLabel(name, hdp, k, label),
                cells: {}, // bookie -> string
              });
            }
            rowsMap.get(key).cells[bookie] = o[k];
          }
        }
      }
    }
  }

  // Til array + "naturlig" sortering
  const rows = Array.from(rowsMap.values());
  rows.sort((a, b) => {
    const ma = MARKET_ORDER.indexOf(a.market);
    const mb = MARKET_ORDER.indexOf(b.market);
    const am = ma === -1 ? 999 : ma;
    const bm = mb === -1 ? 999 : mb;
    if (am !== bm) return am - bm;

    const ha = a.hdp == null ? Infinity : Number(a.hdp);
    const hb = b.hdp == null ? Infinity : Number(b.hdp);
    if (ha !== hb) return ha - hb;

    const oa = OUT_ORDER.indexOf(a.outcome);
    const ob = OUT_ORDER.indexOf(b.outcome);
    if (oa !== ob) return (oa === -1 ? 999 : oa) - (ob === -1 ? 999 : ob);

    return String(a.label).localeCompare(String(b.label));
  });

  // Stats (med cap)
  for (const r of rows) {
    const entriesAll = Object.entries(r.cells)
      .map(([b, v]) => [b, num(v)])
      .filter(([, n]) => n != null);

    const entries = maxOddsCap
      ? entriesAll.filter(([, n]) => n <= maxOddsCap)
      : entriesAll;
    const count = entries.length;

    let avg = null,
      bestOdds = null,
      bestBookie = null,
      evPct = null;
    if (count > 0) {
      const sum = entries.reduce((acc, [, n]) => acc + n, 0);
      avg = sum / count;
      const [bBookie, bOdds] = entries.reduce((best, cur) =>
        cur[1] > best[1] ? cur : best
      );
      bestBookie = bBookie;
      bestOdds = bOdds;
      if (count >= 3 && avg > 0) evPct = (bestOdds / avg - 1) * 100;
    }
    r.stats = { count, avg, bestBookie, bestOdds, evPct };
  }

  return { bookies, rows };
}

export default function EventOdds() {
  const { eventId } = useParams();

  // Bookmakere (styrer både API-kald og kolonner)
  const preferred = BOOKMAKERS;

  // UI state
  const [sortByEV, setSortByEV] = useState(false);
  const [capMode, setCapMode] = useState("none"); // "none" | "2" | "3"
  const capValue = capMode === "2" ? 2 : capMode === "3" ? 3 : null;

  // Hent data
  const { data, loading, error } = useEventOdds(eventId, preferred, {
    useProxy: true,
  });

  // Pivot + stats med cap
  const pivot = useMemo(
    () =>
      data
        ? buildPivotWithStats(data, preferred, capValue)
        : { bookies: [], rows: [] },
    [data, preferred, capValue]
  );

  // Filtrér rækker med mindst 3 bookmakere (efter cap!)
  const rows3p = useMemo(
    () => pivot.rows.filter((r) => (r.stats?.count ?? 0) >= 3),
    [pivot.rows]
  );

  // Sortering EV%
  const sortedRows = useMemo(() => {
    if (!sortByEV) return rows3p;
    const arr = rows3p.slice();
    arr.sort((a, b) => {
      const av = a.stats?.evPct ?? -Infinity;
      const bv = b.stats?.evPct ?? -Infinity;
      return bv - av; // desc
    });
    return arr;
  }, [rows3p, sortByEV]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {data?.home} <span className="opacity-70">vs</span> {data?.away}
          </h1>
          <div className="text-sm opacity-80">{data?.league?.name}</div>
          <div className="text-xs opacity-60">{data?.date}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{data?.status ?? "unknown"}</Badge>
            <Badge>eventId: {String(eventId)}</Badge>
          </div>
          <div className="text-xs opacity-70 mt-2">
            Bookmakers: {preferred.join(" · ")}
          </div>
          <div className="text-xs opacity-70 mt-1">
            Viser kun rækker med <strong>≥ 3</strong> bookmakere <em>efter</em>{" "}
            odds-cap. EV% = (Højeste / Gennemsnit − 1) × 100.
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
          >
            ← Hjem
          </Link>
        </div>
      </div>

      {/* Kontroller: EV-sort + Odds cap */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <SegButton active={sortByEV} onClick={() => setSortByEV((s) => !s)}>
            {sortByEV
              ? "Sorter: EV% (højeste) ✓"
              : "Sortér efter EV% (højeste)"}
          </SegButton>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">Odds-cap:</span>
          <SegButton
            active={capMode === "none"}
            onClick={() => setCapMode("none")}
          >
            Ingen cap
          </SegButton>
          <SegButton active={capMode === "2"} onClick={() => setCapMode("2")}>
            ≤ 2.0
          </SegButton>
          <SegButton active={capMode === "3"} onClick={() => setCapMode("3")}>
            ≤ 3.0
          </SegButton>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm break-all">
          {error}
        </div>
      )}

      {/* Links til bookmakere hvis tilstede */}
      {data?.urls && Object.keys(data.urls).length > 0 && (
        <div className="text-sm">
          <div className="opacity-70 mb-1">Links:</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.urls).map(([name, href]) =>
              href && href !== "N/A" ? (
                <a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 hover:bg-slate-700"
                >
                  {name}
                </a>
              ) : (
                <span
                  key={name}
                  className="rounded-md border border-slate-800 bg-slate-900/50 px-2 py-1 opacity-60"
                >
                  {name}: N/A
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* Tabel */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-slate-900/70">
            <tr>
              <th className="text-left px-3 py-2 border-b border-slate-800 sticky left-0 bg-slate-900/80 z-10">
                Market / Variant
              </th>
              <th className="text-left px-3 py-2 border-b border-slate-800">
                Cnt
              </th>
              <th className="text-left px-3 py-2 border-b border-slate-800">
                Avg
              </th>
              <th className="text-left px-3 py-2 border-b border-slate-800">
                Best
              </th>
              <th
                className="text-left px-3 py-2 border-b border-slate-800 cursor-pointer select-none"
                onClick={() => setSortByEV((s) => !s)}
                aria-sort={sortByEV ? "descending" : "none"}
                title="Klik for at sortere efter EV% (højeste først)"
              >
                EV% {sortByEV ? "↓" : ""}
              </th>
              {pivot.bookies.map((b) => (
                <th
                  key={b}
                  className="text-left px-3 py-2 border-b border-slate-800"
                >
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  className="px-3 py-3 text-slate-300"
                  colSpan={5 + pivot.bookies.length}
                >
                  Henter odds…
                </td>
              </tr>
            )}

            {!loading && sortedRows.length === 0 && (
              <tr>
                <td
                  className="px-3 py-3 text-slate-300"
                  colSpan={5 + pivot.bookies.length}
                >
                  Ingen markeder opfylder filteret (≥3 bookmakere efter cap{" "}
                  {capValue ? `≤ ${capValue.toFixed(1)}` : "(ingen)"}).
                </td>
              </tr>
            )}

            {!loading &&
              sortedRows.map((r) => {
                const ev = r.stats.evPct;
                const evClass =
                  ev == null
                    ? "opacity-60"
                    : ev > 0
                    ? "text-emerald-400 font-medium"
                    : "text-slate-300 opacity-80";
                const bestStr =
                  r.stats.bestBookie && r.stats.bestOdds != null
                    ? `${r.stats.bestBookie} @ ${fmt(r.stats.bestOdds)}`
                    : "—";

                return (
                  <tr key={r.key} className="odd:bg-slate-900/40">
                    <td className="px-3 py-2 font-medium sticky left-0 bg-slate-900/60">
                      {r.label}
                    </td>
                    <td className="px-3 py-2">{r.stats.count}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {fmt(r.stats.avg)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{bestStr}</td>
                    <td className={`px-3 py-2 tabular-nums ${evClass}`}>
                      {ev == null ? "—" : `${fmt(ev, 2)}%`}
                    </td>
                    {pivot.bookies.map((b) => (
                      <td key={b} className="px-3 py-2 tabular-nums">
                        {r.cells[b] ?? <span className="opacity-40">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Debug – slå til hvis du vil se hele JSON */}
      {/* <pre className="text-xs whitespace-pre-wrap break-all opacity-70">{JSON.stringify(data, null, 2)}</pre> */}
    </div>
  );
}
