import { useEffect, useMemo, useState } from "react";

const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const BASE = "/oddsapi"; // Vite-proxy → https://api.odds-api.io
const DEBUG_VERBOSE = true;

// ---------- tids-helpers ----------
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
function toMs(ev) {
  const iso = pickISO(ev);
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

// ---------- batching ----------
async function runBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    if (DEBUG_VERBOSE) {
      console.log(
        `[PREFETCH][BATCH] ${i}..${Math.min(i + size, items.length) - 1} of ${
          items.length
        }`
      );
    }
    const part = await Promise.allSettled(chunk.map(fn));
    out.push(...part);
  }
  return out;
}

/**
 * Prefetcher pending events for alle givne ligaer (slug skal findes).
 * Filtrerer events til nu .. nu+maxDays (inkl.), sorterer stigende kickoff.
 * Logger ALT hvad der tjekkes.
 *
 * Returnerer { byLeague: { [slug]: Event[] }, loading, error? }
 */
export function usePrefetchLeagueEvents(
  leagues,
  {
    sport = "football",
    status = "pending",
    maxDays = 3,
    useProxy = true,
    concurrency = 5,
  } = {}
) {
  const list = useMemo(
    () => (Array.isArray(leagues) ? leagues.filter((l) => l?.slug) : []),
    [leagues]
  );

  const [byLeague, setByLeague] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (!API_KEY) {
        console.error("[PREFETCH] Missing VITE_ODDS_API_KEY");
        setByLeague({});
        return;
      }
      if (list.length === 0) {
        if (DEBUG_VERBOSE)
          console.log("[PREFETCH] Ingen ligaer at hente (liste tom).");
        setByLeague({});
        return;
      }

      setLoading(true);
      setError("");

      const t0 = Date.now();
      const horizon = t0 + maxDays * 24 * 60 * 60 * 1000;
      if (DEBUG_VERBOSE) {
        console.log("[PREFETCH][CONFIG]", {
          leagues: list.map((l) => ({ name: l.name, slug: l.slug })),
          sport,
          status,
          maxDays,
          useProxy,
          concurrency,
          nowISO: new Date(t0).toISOString(),
          horizonISO: new Date(horizon).toISOString(),
          base: useProxy ? `${BASE} (proxy)` : "https://api.odds-api.io",
        });
      }

      try {
        const base = useProxy ? BASE : "https://api.odds-api.io";

        const results = await runBatches(list, concurrency, async (lg) => {
          const url = `${base}/v3/events?apiKey=${encodeURIComponent(
            API_KEY
          )}&sport=${encodeURIComponent(sport)}&league=${encodeURIComponent(
            lg.slug
          )}&status=${encodeURIComponent(status)}`;

          const started = performance.now();
          let res, txt;
          try {
            if (DEBUG_VERBOSE)
              console.log(`[PREFETCH][FETCH-START] ${lg.slug} -> ${url}`);
            res = await fetch(url);
            txt = await res.text();
            const ms = Math.round(performance.now() - started);

            if (DEBUG_VERBOSE) {
              console.log(
                `[PREFETCH][FETCH-END] ${lg.slug} HTTP ${res.status} in ${ms}ms`
              );
              console.log(
                `[PREFETCH][BODY-PREVIEW] ${lg.slug}:`,
                txt.slice(0, 600)
              );
            }

            if (!res.ok)
              throw new Error(`HTTP ${res.status} :: ${txt.slice(0, 300)}`);

            let json;
            try {
              json = JSON.parse(txt || "{}");
            } catch (e) {
              console.error(`[PREFETCH][JSON-ERROR] ${lg.slug}`, e);
              json = null;
            }

            let arr;
            let parsePath = "";
            if (Array.isArray(json?.events)) {
              arr = json.events;
              parsePath = "json.events";
            } else if (Array.isArray(json)) {
              arr = json;
              parsePath = "top-level array";
            } else {
              arr = [];
              parsePath = "unknown (empty)";
            }
            if (DEBUG_VERBOSE) {
              console.log(
                `[PREFETCH][PARSE] ${lg.slug} via ${parsePath} -> ${arr.length} event(s)`
              );
            }

            // pr-event debug + filter
            let kept = 0;
            let droppedNoDate = 0;
            let droppedTooOld = 0;
            let droppedTooFar = 0;

            const filtered = arr.filter((ev, idx) => {
              const iso = pickISO(ev);
              const ms = iso ? Date.parse(iso) : NaN;

              let include = false;
              let reason = "";

              if (!Number.isFinite(ms)) {
                reason = "NO_DATE";
                droppedNoDate++;
              } else if (ms < t0) {
                reason = "BEFORE_NOW";
                droppedTooOld++;
              } else if (ms > horizon) {
                reason = "AFTER_HORIZON";
                droppedTooFar++;
              } else {
                include = true;
                reason = "IN_RANGE";
                kept++;
              }

              if (DEBUG_VERBOSE) {
                console.log(
                  `[PREFETCH][CHECK] ${lg.slug} #${idx} id=${
                    ev?.id ?? ev?.event_id ?? "?"
                  } iso=${iso ?? "?"} ms=${
                    Number.isFinite(ms) ? ms : "NaN"
                  } => ${include ? "KEEP" : "DROP"} (${reason})`
                );
              }

              return include;
            });

            // sorter stigende tid
            filtered.sort((a, b) => toMs(a) - toMs(b));

            if (DEBUG_VERBOSE) {
              console.log(
                `[PREFETCH][SUMMARY] ${lg.slug}: kept=${kept}, noDate=${droppedNoDate}, beforeNow=${droppedTooOld}, afterHorizon=${droppedTooFar}`
              );
            }

            return { slug: lg.slug, events: filtered };
          } catch (e) {
            console.warn("[PREFETCH][ERROR]", lg.slug, e?.message || e);
            return { slug: lg.slug, events: [] };
          }
        });

        if (cancelled) return;

        const map = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            map[r.value.slug] = r.value.events;
          } else {
            map[list[i].slug] = [];
          }
        });

        if (DEBUG_VERBOSE) {
          const summary = Object.fromEntries(
            Object.entries(map).map(([slug, arr]) => [
              slug,
              Array.isArray(arr) ? arr.length : 0,
            ])
          );
          console.log("[PREFETCH][DONE] per-league counts:", summary);
        }

        setByLeague(map);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    go();
    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(list), sport, status, maxDays, useProxy]);

  return { byLeague, loading, error };
}
