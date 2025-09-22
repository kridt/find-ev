import { useEffect, useMemo, useState } from "react";
import { buildUrl, redact } from "../lib/apiClient";

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

async function runBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const part = await Promise.allSettled(chunk.map(fn));
    out.push(...part);
  }
  return out;
}

export function usePrefetchLeagueEvents(
  leagues,
  { sport = "football", status = "pending", maxDays = 3, concurrency = 5 } = {}
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
      if (list.length === 0) {
        setByLeague({});
        return;
      }

      setLoading(true);
      setError("");

      const t0 = Date.now();
      const horizon = t0 + maxDays * 24 * 60 * 60 * 1000;

      try {
        const results = await runBatches(list, concurrency, async (lg) => {
          // 🚫 Ingen apiKey i client-URL – proxy/funktion sætter det på server
          const url = buildUrl("/v3/events", {
            sport,
            league: lg.slug,
            status,
          });

          const res = await fetch(url);
          const txt = await res.text();
          if (!res.ok)
            throw new Error(
              `HTTP ${res.status} :: ${txt.slice(0, 300)} :: ${redact(url)}`
            );

          let arr = [];
          try {
            const json = JSON.parse(txt || "{}");
            arr = Array.isArray(json?.events)
              ? json.events
              : Array.isArray(json)
              ? json
              : [];
          } catch {
            arr = [];
          }

          const filtered = arr
            .filter((ev) => {
              const ms = toMs(ev);
              return Number.isFinite(ms) && ms >= t0 && ms <= horizon;
            })
            .sort((a, b) => toMs(a) - toMs(b));

          return { slug: lg.slug, events: filtered };
        });

        if (cancelled) return;

        const map = {};
        results.forEach((r, i) => {
          map[list[i].slug] = r.status === "fulfilled" ? r.value.events : [];
        });

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
  }, [JSON.stringify(list), sport, status, maxDays]);

  return { byLeague, loading, error };
}
