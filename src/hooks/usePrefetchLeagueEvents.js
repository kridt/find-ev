// src/hooks/usePrefetchLeagueEvents.js
import { useEffect, useMemo, useState } from "react";
import { buildUrl, redact } from "../lib/apiClient";

const TTL_HOURS = 24;
const CACHE_KEY = "ev.cache.events.v1";

/** Utils */
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
const looksHtml = (txt = "") => {
  const t = String(txt).trim().slice(0, 50).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
};
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function runBatches(items, size, gapMs, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const settled = await Promise.allSettled(chunk.map(worker));
    out.push(...settled);
    if (i + size < items.length)
      await delay(gapMs + Math.floor(Math.random() * 200));
  }
  return out;
}
async function fetchPreview(url, extraHeaders = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "x-ev-client": "prefetch", ...extraHeaders },
  });
  const text = await res.text();
  const headers = {
    "content-type": res.headers.get("content-type") || "",
    "x-proxy-trace": res.headers.get("x-proxy-trace") || "",
    "x-proxy-upstream": res.headers.get("x-proxy-upstream") || "",
  };
  let json = null;
  if (
    headers["content-type"].includes("application/json") ||
    /^[\[{]/.test(text.trim())
  ) {
    try {
      json = JSON.parse(text);
    } catch {}
  }
  return { ok: res.ok, status: res.status, headers, text, json };
}
function extractEvents(anyJson) {
  if (!anyJson) return [];
  if (Array.isArray(anyJson.events)) return anyJson.events;
  if (Array.isArray(anyJson.data)) return anyJson.data;
  if (Array.isArray(anyJson)) return anyJson;
  if (
    anyJson?.events &&
    typeof anyJson.events === "object" &&
    Array.isArray(anyJson.events.data)
  )
    return anyJson.events.data;
  return [];
}

/** Cache helpers */
function loadCache(sport, status) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    const ageMs = Date.now() - (obj.ts || 0);
    const ttlMs = TTL_HOURS * 3600 * 1000;
    if (ageMs > ttlMs) {
      console.log("[PF][cache] expired (", Math.round(ageMs / 3600000), "h )");
      return null;
    }
    if (obj.sport !== sport || obj.status !== status) {
      console.log("[PF][cache] sport/status mismatch");
      return null;
    }
    console.log("[PF][cache] hit ->", new Date(obj.ts).toISOString());
    return obj.byLeague || {};
  } catch {
    return null;
  }
}
function saveCache(sport, status, byLeague) {
  try {
    const obj = { ts: Date.now(), sport, status, byLeague };
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    console.log("[PF][cache] saved at", new Date(obj.ts).toISOString());
  } catch {}
}

/** Hoved-hook */
export function usePrefetchLeagueEvents(
  leagues,
  {
    sport = "football",
    status = "pending",
    maxDays = 3,
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

      const now = Date.now();
      const horizon = now + maxDays * 24 * 60 * 60 * 1000;

      // 1) Prøv cache
      const cached = loadCache(sport, status);
      const needSlugs = new Set(list.map((l) => l.slug));
      let initial = {};
      if (cached) {
        // Brug cached events for slugs vi allerede har
        for (const slug of Object.keys(cached)) {
          if (needSlugs.has(slug)) {
            initial[slug] = cached[slug];
            needSlugs.delete(slug);
          }
        }
        setByLeague(initial);
        console.log(
          "[PF] cache primed – missing slugs:",
          Array.from(needSlugs)
        );
      }

      // Hvis cache dækker ALT → ingenting at hente
      if (needSlugs.size === 0) {
        setLoading(false);
        setError("");
        console.log("[PF] all leagues served from cache");
        return;
      }

      // 2) Hent dem der mangler
      setLoading(true);
      setError("");
      try {
        const slugsToFetch = list.filter((l) => needSlugs.has(l.slug));

        const results = await runBatches(
          slugsToFetch,
          concurrency,
          gapMs,
          async (lg) => {
            const baseUrl = buildUrl("/v3/events", {
              sport,
              league: lg.slug,
              status,
            });
            const r1 = await fetchPreview(baseUrl, { "x-ev-league": lg.slug });

            console.log(
              `[PF][${lg.slug}] HTTP ${r1.status} CT=${
                r1.headers["content-type"] || "n/a"
              } URL=${redact(baseUrl)}`
            );

            // Fallback hvis HTML/SPA
            if (!r1.ok || looksHtml(r1.text)) {
              const fbUrl = buildUrl("/", {
                path: "v3/events",
                sport,
                league: lg.slug,
                status,
              });
              const r2 = await fetchPreview(fbUrl, {
                "x-ev-league": lg.slug,
                "x-ev-fallback": "1",
              });
              console.log(
                `[PF][${lg.slug}] FB HTTP ${r2.status} CT=${
                  r2.headers["content-type"] || "n/a"
                } URL=${redact(fbUrl)}`
              );
              if (!r2.ok || looksHtml(r2.text)) {
                return { slug: lg.slug, error: `Bad response` };
              }
              const arrFb = extractEvents(r2.json);
              const filteredFb = arrFb
                .filter((ev) => {
                  const ms = toMs(ev);
                  return Number.isFinite(ms) && ms >= now && ms <= horizon;
                })
                .sort((a, b) => toMs(a) - toMs(b));
              return { slug: lg.slug, events: filteredFb };
            }

            // Primær OK
            const arr = extractEvents(r1.json);
            const filtered = arr
              .filter((ev) => {
                const ms = toMs(ev);
                return Number.isFinite(ms) && ms >= now && ms <= horizon;
              })
              .sort((a, b) => toMs(a) - toMs(b));
            return { slug: lg.slug, events: filtered };
          }
        );

        if (cancelled) return;

        // Merge: cache-initial + nye
        const merged = { ...initial };
        for (const r of results) {
          if (r.status === "fulfilled") {
            const val = r.value;
            if (!val?.error) merged[val.slug] = val.events ?? [];
            else merged[val.slug] = undefined; // markér fejl (UI kan vise "henter/fejl")
          } else {
            const slug = slugsToFetch[results.indexOf(r)]?.slug;
            if (slug) merged[slug] = undefined;
          }
        }

        setByLeague(merged);

        // 3) gem i cache (kun de arrays der ikke er undefined)
        const toCache = {};
        for (const [slug, arr] of Object.entries(merged)) {
          if (Array.isArray(arr)) toCache[slug] = arr;
        }
        saveCache(sport, status, toCache);
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
  }, [JSON.stringify(list), sport, status, maxDays, concurrency, gapMs]);

  return { byLeague, loading, error };
}
