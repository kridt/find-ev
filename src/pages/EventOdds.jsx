// src/pages/EventOdds.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "react-router-dom";
import { getJSON } from "../lib/apiClient";

/** ----------- Indstillinger ----------- */
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
const MIN_PROVIDERS = 3; // min. antal bookmakere for at en selection tæller
const EV_THRESHOLD = 4; // EV%-tærskel til filter + “over gennemsnit”-chips

const DK = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** ----------- Utils ----------- */
const num = (v) => {
  if (v == null) return NaN;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const pct = (x) => `${x.toFixed(2)}%`;
const fmtOdd = (x) => (x ? Number(x).toFixed(2) : "—");
const safeArr = (a) => (Array.isArray(a) ? a : []);
const isObj = (o) => o && typeof o === "object";

/** Byg labels for selections */
function labelFor3Way(side) {
  if (side === "home") return "Home";
  if (side === "draw") return "Draw";
  if (side === "away") return "Away";
  return side;
}
function withHdp(base, hdp) {
  if (hdp == null || hdp === "" || isNaN(+hdp)) return base;
  const h = Number(hdp);
  const s = h > 0 ? `+${h}` : `${h}`;
  return `${base} (${s})`;
}

/** Ekspandér alle markeder til “selection-keys” pr. bookmaker */
function explodeBookieMarkets(bookie, markets) {
  const out = []; // { key, market, selection, hdp, price, bookie }
  for (const m of safeArr(markets)) {
    if (!m?.name) continue;
    const mName = String(m.name);
    for (const row of safeArr(m.odds)) {
      // 1) 3-vejs (home/draw/away)
      for (const side of ["home", "draw", "away"]) {
        if (row[side] != null) {
          const price = num(row[side]);
          if (!Number.isFinite(price)) continue;
          const key = `${mName} :: ${withHdp(labelFor3Way(side), row.hdp)}`;
          out.push({
            key,
            market: mName,
            selection: withHdp(labelFor3Way(side), row.hdp),
            hdp: row.hdp,
            price,
            bookie,
          });
        }
      }
      // 2) over/under
      if (row.over != null || row.under != null) {
        if (row.over != null) {
          const p = num(row.over);
          if (Number.isFinite(p)) {
            const key = `${mName} :: Over ${row.hdp}`;
            out.push({
              key,
              market: mName,
              selection: `Over ${row.hdp}`,
              hdp: row.hdp,
              price: p,
              bookie,
            });
          }
        }
        if (row.under != null) {
          const p = num(row.under);
          if (Number.isFinite(p)) {
            const key = `${mName} :: Under ${row.hdp}`;
            out.push({
              key,
              market: mName,
              selection: `Under ${row.hdp}`,
              hdp: row.hdp,
              price: p,
              bookie,
            });
          }
        }
      }
      // 3) BTTS (yes/no)
      if (
        row.yes != null ||
        row.no != null ||
        (row.hdp === 0 && (row.yes != null || row.no != null))
      ) {
        if (row.yes != null) {
          const p = num(row.yes);
          if (Number.isFinite(p)) {
            const key = `${mName} :: Yes`;
            out.push({
              key,
              market: mName,
              selection: "Yes",
              hdp: 0,
              price: p,
              bookie,
            });
          }
        }
        if (row.no != null) {
          const p = num(row.no);
          if (Number.isFinite(p)) {
            const key = `${mName} :: No`;
            out.push({
              key,
              market: mName,
              selection: "No",
              hdp: 0,
              price: p,
              bookie,
            });
          }
        }
      }
      // 4) Draw No Bet (hdp=0 med home/away)
      if (mName.toLowerCase().includes("draw no bet")) {
        for (const side of ["home", "away"]) {
          if (row[side] != null) {
            const p = num(row[side]);
            if (Number.isFinite(p)) {
              const key = `${mName} :: ${withHdp(
                labelFor3Way(side),
                row.hdp ?? 0
              )}`;
              out.push({
                key,
                market: mName,
                selection: withHdp(labelFor3Way(side), row.hdp ?? 0),
                hdp: row.hdp ?? 0,
                price: p,
                bookie,
              });
            }
          }
        }
      }
    }
  }
  return out;
}

/** Saml på tværs af bookmakere → metrics pr. selection-key
 *  maxCap: 0 (ingen), 2 eller 3 — anvendes pr. bookie (vælg bedste pris ≤ cap)
 */
function aggregateSelections(json, maxCap = 0) {
  const urls = isObj(json?.urls) ? json.urls : {};
  const bmMap = isObj(json?.bookmakers) ? json.bookmakers : {};

  const all = [];
  for (const [bookie, markets] of Object.entries(bmMap)) {
    all.push(...explodeBookieMarkets(bookie, markets));
  }

  const map = new Map(); // key -> { market, selection, offers: [{bookie, price}] }
  for (const row of all) {
    if (!map.has(row.key))
      map.set(row.key, {
        market: row.market,
        selection: row.selection,
        offers: [],
      });
    map.get(row.key).offers.push({ bookie: row.bookie, price: row.price });
  }

  const out = [];
  for (const [key, rec] of map) {
    const offers = rec.offers;

    // dedup per bookmaker: behold bedste pris ≤ cap (eller bedste pris hvis ingen cap)
    const bestByBookie = new Map();
    for (const o of offers) {
      const allowed = maxCap > 0 ? o.price <= maxCap : true;
      if (!allowed) continue;
      const prev = bestByBookie.get(o.bookie);
      if (!prev || o.price > prev.price) bestByBookie.set(o.bookie, o);
    }

    const uniq = Array.from(bestByBookie.values());
    if (uniq.length < MIN_PROVIDERS) continue;

    const avg = uniq.reduce((s, o) => s + o.price, 0) / uniq.length;
    let best = -Infinity;
    for (const o of uniq) if (o.price > best) best = o.price;
    const evPct = (best / avg - 1) * 100;

    // Bookmakere der ligger ≥ EV_THRESHOLD over gennemsnittet
    const aboveAvg = uniq
      .filter((o) => o.price >= avg * (1 + EV_THRESHOLD / 100))
      .sort((a, b) => b.price - a.price)
      .map((o) => ({
        ...o,
        url: urls[o.bookie] && urls[o.bookie] !== "N/A" ? urls[o.bookie] : null,
      }));

    // Hvem har best (kan være flere)
    const bestBookies = uniq
      .filter((o) => Math.abs(o.price - best) < 1e-9)
      .map((o) => ({
        ...o,
        url: urls[o.bookie] && urls[o.bookie] !== "N/A" ? urls[o.bookie] : null,
      }));

    out.push({
      key,
      market: rec.market,
      selection: rec.selection,
      count: uniq.length,
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

/** ----------- UI chips ----------- */
function Chip({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
      {children}
    </span>
  );
}

/** ----------- Side ----------- */
export default function EventOdds() {
  const { id: idParam } = useParams();
  const location = useLocation();
  const stateEvent = location.state?.event;

  // Event-id: helst fra state, fallback til URL-param hvis numerisk
  const eventId =
    stateEvent?.id ?? (Number.isFinite(+idParam) ? +idParam : null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  // Toggles (default: sort on, hide <4% on)
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
  // Max odds cap: 0 (ingen), 2, 3
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
    if (!eventId) {
      setErr(
        "Mangler eventId – gå ind via forsiden eller angiv et numerisk id i URL’en."
      );
      return;
    }
    let off = false;

    async function go() {
      setLoading(true);
      setErr("");
      try {
        const json = await getJSON("/v3/odds", {
          eventId,
          bookmakers: BOOKMAKERS.join(","),
        });
        setData(json);
      } catch (e) {
        setErr(String(e?.message || e));
        console.error("[EventOdds] fetch error:", e);
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

  const rowsFiltered = useMemo(() => {
    const base = hideLowEv
      ? rowsAll.filter((r) => r.evPct >= EV_THRESHOLD)
      : rowsAll;
    if (sortByEv) {
      return [...base].sort((a, b) => b.evPct - a.evPct);
    } else {
      return [...base].sort(
        (a, b) =>
          a.market.localeCompare(b.market, "en") ||
          a.selection.localeCompare(b.selection, "en")
      );
    }
  }, [rowsAll, sortByEv, hideLowEv]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm hover:bg-slate-700/60"
        >
          ← Tilbage
        </Link>
        <div className="text-lg font-semibold">
          {stateEvent ? (
            <>
              {stateEvent.home ?? stateEvent.home_team ?? "Home"}{" "}
              <span className="opacity-60">vs</span>{" "}
              {stateEvent.away ?? stateEvent.away_team ?? "Away"}
              <span className="ml-3 text-sm opacity-70">
                {stateEvent.date ? DK.format(new Date(stateEvent.date)) : null}
              </span>
            </>
          ) : (
            <>Event #{eventId}</>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
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

          {/* Max odds cap */}
          <div className="flex items-center gap-2 ml-2">
            <span className="opacity-80">Max odds:</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-700">
              <button
                className={`px-2 py-1 ${
                  maxCap === 0
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800/60 hover:bg-slate-700/60"
                }`}
                onClick={() => setMaxCap(0)}
                title="Ingen cap"
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
                title="Maks. 2.00"
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
                title="Maks. 3.00"
              >
                ≤3.00
              </button>
            </div>
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

      {/* Tabel */}
      {!loading && !err && (
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rowsFiltered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-sm text-slate-400">
                    Ingen rækker matcher filtrene.
                  </td>
                </tr>
              ) : (
                rowsFiltered.map((r) => (
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
                        className={`font-semibold ${
                          r.evPct >= EV_THRESHOLD
                            ? "text-emerald-300"
                            : "text-slate-300"
                        }`}
                      >
                        {pct(r.evPct)}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Lille fodnote */}
      <div className="text-xs opacity-70 space-y-1">
        <div>
          EV% = <code>(bedste_odds / gennemsnit_odds − 1) × 100</code>. Kun
          selections med mindst {MIN_PROVIDERS} bookmakere tæller.
        </div>
        <div>
          “Max odds” cap filtrerer de enkelte bookmakere før gennemsnit/EV
          beregnes. Har en bookmaker ingen pris ≤ cap, tæller den ikke med.
        </div>
      </div>
    </div>
  );
}
