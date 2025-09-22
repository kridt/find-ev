import { useEffect, useState } from "react";

const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const BASE = "/oddsapi"; // Vite proxy → https://api.odds-api.io

export function useLeagueEvents(
  slug,
  { useProxy = true, sport = "football", status = "pending" } = {}
) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!slug) return;
      if (!API_KEY) {
        console.error("[EVENTS] Missing VITE_ODDS_API_KEY");
        setError("Missing API key");
        return;
      }

      setLoading(true);
      setError("");

      const base = useProxy ? BASE : "https://api.odds-api.io";
      const url = `${base}/v3/events?apiKey=${encodeURIComponent(
        API_KEY
      )}&sport=${encodeURIComponent(sport)}&league=${encodeURIComponent(
        slug
      )}&status=${encodeURIComponent(status)}`;

      // Debug log
      console.groupCollapsed(`[EVENTS] ${slug}`);
      console.log("GET", url);

      try {
        const res = await fetch(url);
        const txt = await res.text();
        console.log("HTTP", res.status, res.statusText);
        console.log("Body preview:", txt.slice(0, 400));

        if (!res.ok)
          throw new Error(`HTTP ${res.status} :: ${txt.slice(0, 200)}`);

        let json = {};
        try {
          json = JSON.parse(txt);
        } catch {
          console.warn("[EVENTS] JSON parse failed");
        }

        const arr = Array.isArray(json?.events)
          ? json.events
          : Array.isArray(json)
          ? json
          : [];
        if (!cancelled) setEvents(arr);
      } catch (e) {
        console.error("[EVENTS] ERROR:", e?.message || e);
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
  }, [slug, useProxy, sport, status]);

  return { events, loading, error };
}
