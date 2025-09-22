import { useEffect, useState, useMemo } from "react";

const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const BASE = "/oddsapi"; // Vite-proxy → https://api.odds-api.io

// Lille helper til batching så vi ikke skyder 25+ requests på én gang
async function runBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const part = await Promise.allSettled(chunk.map(fn));
    out.push(...part);
  }
  return out;
}

/**
 * Prefetcher counts af pending events pr. liga (via v3/events?league=<slug>&status=pending)
 * Returnerer { counts: { [slug]: number }, loading: boolean }
 */
export function usePendingCounts(
  leagues,
  { concurrency = 5, sport = "football", useProxy = true } = {}
) {
  const list = useMemo(
    () => (Array.isArray(leagues) ? leagues.filter((l) => l?.slug) : []),
    [leagues]
  );
  const [countsObj, setCountsObj] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!API_KEY || !list.length) {
        setCountsObj({});
        return;
      }
      setLoading(true);
      try {
        const base = useProxy ? BASE : "https://api.odds-api.io";
        const results = await runBatches(list, concurrency, async (lg) => {
          const url = `${base}/v3/events?apiKey=${encodeURIComponent(
            API_KEY
          )}&sport=${encodeURIComponent(sport)}&league=${encodeURIComponent(
            lg.slug
          )}&status=pending`;
          try {
            const res = await fetch(url);
            const txt = await res.text();
            if (!res.ok)
              throw new Error(`HTTP ${res.status} :: ${txt.slice(0, 200)}`);
            const json = JSON.parse(txt || "{}");
            const arr = Array.isArray(json?.events) ? json.events : [];
            return { slug: lg.slug, count: arr.length };
          } catch {
            return { slug: lg.slug, count: 0 };
          }
        });
        if (cancelled) return;
        const merged = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") merged[r.value.slug] = r.value.count;
          else merged[list[i].slug] = 0;
        });
        setCountsObj(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    go();
    return () => {
      cancelled = true;
    };
  }, [list, sport, useProxy]);

  return { counts: countsObj, loading };
}
