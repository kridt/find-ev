import { useEffect, useMemo, useState } from "react";
import { buildUrl, redact } from "../lib/apiClient";

/* ---------- helpers ---------- */
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

/* Kør i batches (for rate limit) */
async function runBatches(items, size, gapMs, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const settled = await Promise.allSettled(chunk.map(worker));
    out.push(...settled);
    if (i + size < items.length) {
      await delay(gapMs + Math.floor(Math.random() * 200));
    }
  }
  return out;
}

/* Robust fetch: returnér status, headers, text, json (hvis muligt) */
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
    "x-ratelimit-remaining": res.headers.get("x-ratelimit-remaining") || "",
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

/* Parse events fra flere mulige former */
function extractEvents(anyJson) {
  if (!anyJson) return [];
  if (Array.isArray(anyJson.events)) return anyJson.events;
  if (Array.isArray(anyJson.data)) return anyJson.data;
  if (Array.isArray(anyJson)) return anyJson;
  if (
    anyJson?.events &&
    typeof anyJson.events === "object" &&
    Array.isArray(anyJson.events.data)
  ) {
    return anyJson.events.data;
  }
  return [];
}

/* ---------- hoved-hook ---------- */
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
      setLoading(true);
      setError("");

      const now = Date.now();
      const horizon = now + maxDays * 24 * 60 * 60 * 1000;

      console.log(
        `%c[PF] Prefetch ${list.length} leagues (≤${maxDays}d) · conc=${concurrency} gap=${gapMs}ms`,
        "color:#6ee7b7"
      );

      try {
        const results = await runBatches(
          list,
          concurrency,
          gapMs,
          async (lg) => {
            const baseUrl = buildUrl("/v3/events", {
              sport,
              league: lg.slug,
              status,
            });
            const started = Date.now();

            // 1) Primær rute: /api/oddsapi/v3/events...
            const r1 = await fetchPreview(baseUrl, { "x-ev-league": lg.slug });
            const ms1 = Date.now() - started;

            // Grundlog for hvert kald (ALTID – ikke i grupper)
            console.log(
              `[PF][${lg.slug}] HTTP ${r1.status} (${ms1}ms) CT=${
                r1.headers["content-type"] || "n/a"
              } RL=${r1.headers["x-ratelimit-remaining"] || "?"} URL=${redact(
                baseUrl
              )}`
            );
            if (r1.headers["x-proxy-upstream"])
              console.log(
                `[PF][${lg.slug}] Upstream: ${r1.headers["x-proxy-upstream"]}`
              );
            if (!r1.ok || looksHtml(r1.text)) {
              console.warn(
                `[PF][${lg.slug}] Non-JSON eller non-OK fra primær. Preview:`,
                (r1.text || "").slice(0, 200)
              );

              // 2) Fallback rute: /api/oddsapi?path=v3/events&...
              const fbUrl = buildUrl("/", {
                path: "v3/events",
                sport,
                league: lg.slug,
                status,
              });
              const startedFb = Date.now();
              const r2 = await fetchPreview(fbUrl, {
                "x-ev-league": lg.slug,
                "x-ev-fallback": "1",
              });
              const ms2 = Date.now() - startedFb;

              console.log(
                `[PF][${lg.slug}] FB HTTP ${r2.status} (${ms2}ms) CT=${
                  r2.headers["content-type"] || "n/a"
                } URL=${redact(fbUrl)}`
              );
              if (r2.headers["x-proxy-upstream"])
                console.log(
                  `[PF][${lg.slug}] FB Upstream: ${r2.headers["x-proxy-upstream"]}`
                );

              if (!r2.ok || looksHtml(r2.text)) {
                console.error(
                  `[PF][${lg.slug}] Fallback fejlede også. Body preview:`,
                  (r2.text || "").slice(0, 200)
                );
                return {
                  slug: lg.slug,
                  error: `Bad response (CT=${
                    r2.headers["content-type"] || "n/a"
                  })`,
                };
              }

              const arrFb = extractEvents(r2.json);
              console.log(`[PF][${lg.slug}] raw events (FB):`, arrFb.length);
              const reasonsFb = {
                invalidDate: 0,
                past: 0,
                beyondHorizon: 0,
                kept: 0,
              };
              const filteredFb = arrFb
                .filter((ev) => {
                  const ms = toMs(ev);
                  if (!Number.isFinite(ms)) {
                    reasonsFb.invalidDate++;
                    return false;
                  }
                  if (ms < now) {
                    reasonsFb.past++;
                    return false;
                  }
                  if (ms > horizon) {
                    reasonsFb.beyondHorizon++;
                    return false;
                  }
                  reasonsFb.kept++;
                  return true;
                })
                .sort((a, b) => toMs(a) - toMs(b));
              console.log(
                `[PF][${lg.slug}] filter FB:`,
                reasonsFb,
                "kept=",
                filteredFb.length
              );
              return { slug: lg.slug, events: filteredFb };
            }

            // Primær svar OK + JSON
            const keys =
              r1.json && typeof r1.json === "object"
                ? Object.keys(r1.json)
                : [];
            if (keys.length)
              console.log(`[PF][${lg.slug}] top-level keys:`, keys.join(", "));
            const arr = extractEvents(r1.json);

            console.log(`[PF][${lg.slug}] raw events:`, arr.length);
            const reasons = {
              invalidDate: 0,
              past: 0,
              beyondHorizon: 0,
              kept: 0,
            };
            const filtered = arr
              .filter((ev) => {
                const ms = toMs(ev);
                if (!Number.isFinite(ms)) {
                  reasons.invalidDate++;
                  return false;
                }
                if (ms < now) {
                  reasons.past++;
                  return false;
                }
                if (ms > horizon) {
                  reasons.beyondHorizon++;
                  return false;
                }
                reasons.kept++;
                return true;
              })
              .sort((a, b) => toMs(a) - toMs(b));
            console.log(
              `[PF][${lg.slug}] filter:`,
              reasons,
              "kept=",
              filtered.length
            );

            if (filtered.length > 0) {
              const e0 = filtered[0];
              console.log(`[PF][${lg.slug}] first kept:`, {
                id: e0.id ?? e0.event_id ?? e0.key ?? "n/a",
                date: pickISO(e0),
                home:
                  e0.home ??
                  e0.home_team ??
                  e0.teams?.home ??
                  e0.participants?.[0]?.name,
                away:
                  e0.away ??
                  e0.away_team ??
                  e0.teams?.away ??
                  e0.participants?.[1]?.name,
              });
            }

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
            if (val?.error) map[slug] = undefined; // ERROR → hold “ukendt” i UI
            else map[slug] = val?.events ?? []; // OK (kan være tom liste)
          } else {
            map[slug] = undefined; // Promise reject
          }
        }
        setByLeague(map);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    }

    go();
  }, [JSON.stringify(list), sport, status, maxDays, concurrency, gapMs]);

  return { byLeague, loading, error };
}
