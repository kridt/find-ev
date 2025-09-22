import { useEffect, useState } from "react";
import axios from "axios";

const API_KEY = import.meta.env.VITE_ODDS_API_KEY;

export function useEvents(
  leagueSlug,
  { status = "pending", sport = "football" } = {}
) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancel;
    if (!leagueSlug) return;

    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const url = `https://api.odds-api.io/v3/events?sport=${encodeURIComponent(
          sport
        )}&league=${encodeURIComponent(leagueSlug)}&status=${encodeURIComponent(
          status
        )}&apiKey=${API_KEY}`;

        const res = await axios.get(url, {
          signal:
            typeof AbortController !== "undefined"
              ? (cancel = new AbortController()).signal
              : undefined,
        });

        // Forventet struktur: res.data.events || res.data
        const data = res.data?.events ?? res.data ?? [];
        setEvents(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e?.response?.data || e?.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    run();
    return () => {
      if (cancel) cancel.abort?.();
    };
  }, [leagueSlug, sport, status]);

  return { events, loading, err };
}
