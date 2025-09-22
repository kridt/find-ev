import { useEffect, useState } from "react";

// Brug /oddsapi proxy for at undgå CORS i dev (se vite.config.js nedenfor)
const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const ORIGIN = "https://api.odds-api.io";
const PROXY = "/oddsapi";

/**
 * Henter ligaer fra:
 *   GET /v3/leagues?apiKey=...&sport=football
 *
 * Returnerer { leagues, loading, error }
 * - leagues er et array med objekter (fx { name, slug, eventsCount? ... })
 * - robust JSON parsing + detaljeret console logging
 */
export function useLeagues({ sport = "football", useProxy = true } = {}) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (!API_KEY) {
        console.error("[LEAGUES] Missing VITE_ODDS_API_KEY in .env.local");
        setError("Missing API key");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const base = useProxy ? PROXY : ORIGIN;
      const url = `${base}/v3/leagues?apiKey=${encodeURIComponent(
        API_KEY
      )}&sport=${encodeURIComponent(sport)}`;

      console.groupCollapsed("[LEAGUES] fetch", url);
      const t0 = performance.now();
      try {
        const res = await fetch(url);
        const t1 = performance.now();
        console.log(
          "HTTP",
          res.status,
          res.statusText,
          "in",
          Math.round(t1 - t0) + "ms"
        );

        const raw = await res.text();
        console.log("Body preview (first 400 chars):", raw.slice(0, 400));

        if (!res.ok)
          throw new Error(`HTTP ${res.status} :: ${raw.slice(0, 200)}`);

        let json = null;
        try {
          json = JSON.parse(raw);
        } catch {
          console.warn("[LEAGUES] JSON parse failed; using empty array");
        }

        // Robust udpakning: nogle API'er svarer {leagues: [...]}, andre {data: [...]}, eller direkte array
        let arr = Array.isArray(json)
          ? json
          : Array.isArray(json?.leagues)
          ? json.leagues
          : Array.isArray(json?.data)
          ? json.data
          : [];

        if (!Array.isArray(arr)) arr = [];

        if (!cancelled) setLeagues(arr);
      } catch (e) {
        console.error("[LEAGUES] ERROR:", e?.message || e);
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
        console.groupEnd();
      }
    }

    go();
    return () => {
      cancelled = true;
    };
  }, [sport, useProxy]);

  return { leagues, loading, error };
}
