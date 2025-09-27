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
const IS_VERBOSE = () => {
  try {
    return localStorage.getItem("ev.debug") === "1";
  } catch {
    return true;
  }
};

/** Batch-kørsel med lille pause for at undgå rate limits */
async function runBatches(items, size, gapMs, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const part = await Promise.allSettled(chunk.map(worker));
    out.push(...part);
    if (i + size < items.length) {
      const jitter = Math.floor(Math.random() * 200);
      await delay(gapMs + jitter);
    }
  }
  return out;
}

/** Robust fetch: returnér headers + text + parsed json (hvis muligt) */
async function fetchJsonWithPreview(url, extraHeaders = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "x-ev-client": "prefetch",
      ...extraHeaders,
    },
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
      IS_VERBOSE() &&
        console.groupCollapsed(
          `%c[PF] Start prefetch: ${list.length} leagues (≤${maxDays} dage)`,
          "color:#6ee7b7"
        );

      try {
        const results = await runBatches(
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
            const r = await fetchJsonWithPreview(url, {
              "x-ev-league": lg.slug,
            });

            const groupLabel = `[PF][${lg.slug}] HTTP ${r.status} in ${
              Date.now() - started
            }ms`;
            IS_VERBOSE()
              ? console.group(groupLabel)
              : console.groupCollapsed(groupLabel);

            // Overordnede response-logs
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
            console.log("Content-Type:", r.headers["content-type"]);

            // Ikke-OK? → fejl
            if (!r.ok) {
              console.warn(
                `[PF][${lg.slug}] Non-OK (behandles som fejl, IKKE som 0 kampe).`
              );
              console.log("Body preview:", (r.text || "").slice(0, 400));
              console.groupEnd();
              return { slug: lg.slug, error: `HTTP ${r.status}` };
            }

            // JSON form & nøgler
            const keys =
              r.json && typeof r.json === "object" ? Object.keys(r.json) : [];
            console.log("Top-level keys:", keys);
            const arrRaw = Array.isArray(r.json?.events)
              ? r.json.events
              : Array.isArray(r.json)
              ? r.json
              : Array.isArray(r.json?.data)
              ? r.json.data
              : [];

            console.log("events raw count:", arrRaw.length);
            if (arrRaw.length > 0) {
              const sample = arrRaw.slice(0, 3).map((ev, i) => ({
                i: i + 1,
                id: ev.id ?? ev.event_id ?? ev.key ?? "n/a",
                date: pickISO(ev),
                home:
                  ev.home ??
                  ev.home_team ??
                  ev.teams?.home ??
                  ev.participants?.[0]?.name,
                away:
                  ev.away ??
                  ev.away_team ??
                  ev.teams?.away ??
                  ev.participants?.[1]?.name,
              }));
              console.table(sample);
            } else {
              console.log(
                "Body preview (0 raw):",
                (r.text || "").slice(0, 400)
              );
            }

            // Filtrér ≤3 dage og log årsager for bortfiltrering
            const reasons = {
              invalidDate: 0,
              past: 0,
              beyondHorizon: 0,
              kept: 0,
            };
            const filtered = arrRaw
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

            console.log("filter reasons:", reasons);
            if (filtered.length > 0) {
              const first = filtered[0];
              console.log("first kept:", {
                id: first.id ?? first.event_id ?? first.key ?? "n/a",
                date: pickISO(first),
                home:
                  first.home ??
                  first.home_team ??
                  first.teams?.home ??
                  first.participants?.[0]?.name,
                away:
                  first.away ??
                  first.away_team ??
                  first.teams?.away ??
                  first.participants?.[1]?.name,
              });
            }

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
              map[slug] = undefined; // fejl → behold som "ukendt" i UI
            } else {
              map[slug] = val?.events ?? [];
            }
          } else {
            map[slug] = undefined; // promise-reject
          }
        }

        setByLeague(map);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) {
          setLoading(false);
          IS_VERBOSE() &&
            console.log(
              `[PF] done in ${Date.now() - startedAll}ms. Leagues: ${
                list.length
              }`
            );
          IS_VERBOSE() && console.groupEnd();
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
