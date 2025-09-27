// src/hooks/usePrefetchLeagueEvents.js
import { useEffect, useMemo, useState } from "react";
import { buildUrl, redact } from "../lib/apiClient";

/** ===== helpers ===== */
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
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Kører chunks sekventielt med pause imellem for at undgå 429 */
async function runWithRateLimit(items, chunkSize, gapMs, worker) {
  const results = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(chunk.map(worker));
    results.push(...settled);
    // lille jitter mellem batches (ikke efter sidste)
    if (i + chunkSize < items.length) {
      const jitter = Math.floor(Math.random() * 200);
      await delay(gapMs + jitter);
    }
  }
  return results;
}

/** Robust JSON fetch der returnerer både headers, status, text og parsed json (hvis muligt) */
async function fetchJsonWithPreview(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const headers = {
    "content-type": res.headers.get("content-type") || "",
    "x-proxy-trace": res.headers.get("x-proxy-trace") || "",
    "x-proxy-upstream": res.headers.get("x-proxy-upstream") || "",
    "x-ratelimit-remaining": res.headers.get("x-ratelimit-remaining") || "",
  };
  let json = null;
  if (
    headers["content-type"].includes("application/json") ||
    /^[\[{]/.test(text.trim())
  ) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { ok: res.ok, status: res.status, headers, text, json };
}

/** ===== main hook ===== */
export function usePrefetchLeagueEvents(
  leagues,
  {
    sport = "football",
    status = "pending",
    maxDays = 3,
    // konservativ i prod for at undgå rate limits
    concurrency = import.meta.env.PROD ? 3 : 5,
    gapMs = import.meta.env.PROD ? 350 : 150,
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
      if (list.length === 0) {
        setByLeague({});
        return;
      }

      setLoading(true);
      setError("");

      const now = Date.now();
      const horizon = now + maxDays * 24 * 60 * 60 * 1000;

      const startedAll = Date.now();
      console.groupCollapsed(
        `%c[PF] Prefetch ${list.length} leagues (≤${maxDays}d)`,
        "color:#6ee7b7"
      );

      try {
        const results = await runWithRateLimit(
          list,
          concurrency,
          gapMs,
          async (lg) => {
            const url = buildUrl("/v3/events", {
              sport,
              league: lg.slug,
              status,
            });
            const started = Date.now();
            const r = await fetchJsonWithPreview(url);

            // Verbose logs per liga (sikre – ingen apiKey i URL fra client)
            console.groupCollapsed(
              `[PF][${lg.slug}] HTTP ${r.status} in ${Date.now() - started}ms`
            );
            console.log("URL:", redact(url));
            if (r.headers["x-proxy-upstream"])
              console.log("X-Proxy-Upstream:", r.headers["x-proxy-upstream"]);
            if (r.headers["x-proxy-trace"])
              console.log("X-Proxy-Trace:", r.headers["x-proxy-trace"]);
            if (r.headers["x-ratelimit-remaining"])
              console.log(
                "X-RateLimit-Remaining:",
                r.headers["x-ratelimit-remaining"]
              );
            console.log("CT:", r.headers["content-type"]);
            console.log(
              "Body preview:",
              (r.text || "").slice(0, 300).replace(/\s+/g, " ").trim()
            );

            if (!r.ok) {
              console.warn(
                `[PF][${lg.slug}] non-OK, treating as error (will not show as 0).`
              );
              console.groupEnd();
              return { slug: lg.slug, error: `HTTP ${r.status}` };
            }

            // fleksibel form: {events: []} eller [] på toppen
            const arrRaw = Array.isArray(r.json?.events)
              ? r.json.events
              : Array.isArray(r.json)
              ? r.json
              : [];

            console.log("events raw:", arrRaw.length);

            const filtered = arrRaw
              .filter((ev) => {
                const ms = toMs(ev);
                return Number.isFinite(ms) && ms >= now && ms <= horizon;
              })
              .sort((a, b) => toMs(a) - toMs(b));

            console.log("events filtered (≤horizon):", filtered.length);
            // log de første 3
            filtered.slice(0, 3).forEach((ev, i) =>
              console.log(`#${i + 1}`, {
                id: ev.id ?? ev.event_id ?? "n/a",
                date: pickISO(ev),
                home: ev.home ?? ev.home_team ?? ev.teams?.home,
                away: ev.away ?? ev.away_team ?? ev.teams?.away,
              })
            );
            console.groupEnd();

            return { slug: lg.slug, events: filtered };
          }
        );

        if (cancelled) return;

        const map = {};
        for (let i = 0; i < list.length; i++) {
          const slug = list[i].slug;
          const r = results[i];
          if (r.status === "fulfilled") {
            const val = r.value;
            if (val?.error) {
              // markér som fejl → undefined i map (UI viser “henter…” i stedet for 0)
              map[slug] = undefined;
            } else {
              map[slug] = val?.events ?? [];
            }
          } else {
            // promise fejlede
            map[slug] = undefined;
          }
        }

        setByLeague(map);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) {
          setLoading(false);
          console.log(
            `[PF] done in ${Date.now() - startedAll}ms. Leagues: ${list.length}`
          );
          console.groupEnd();
        }
      }
    }

    go();
    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(list), sport, status, maxDays, concurrency, gapMs]);

  return { byLeague, loading, error };
}
