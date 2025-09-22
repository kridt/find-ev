import { useEffect, useState } from "react";
import { BOOKMAKERS } from "../constants/bookmakers";

const API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const BASE = "/oddsapi"; // Vite proxy → https://api.odds-api.io

/**
 * Henter odds for et event og valgte bookmakere (default = hele BOOKMAKERS-listen).
 * Returnerer { data, loading, error }
 */
export function useEventOdds(
  eventId,
  bookmakers = BOOKMAKERS,
  { useProxy = true } = {}
) {
  const [data, setData] = useState(null); // hele JSON-respons
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function go() {
      if (!eventId) return;
      if (!API_KEY) {
        setError("Missing VITE_ODDS_API_KEY");
        return;
      }
      setLoading(true);
      setError("");

      // Rens og de-duplikér bogmærkelisten
      const bmClean = Array.from(
        new Set((bookmakers || []).map((s) => String(s).trim()).filter(Boolean))
      );

      const base = useProxy ? BASE : "https://api.odds-api.io";
      // Comma-separeret liste, *hele strengen* URL-encodes (så både mellemrum og kommaer bliver korrekt)
      const bmParam = encodeURIComponent(bmClean.join(","));
      const url = `${base}/v3/odds?apiKey=${encodeURIComponent(
        API_KEY
      )}&eventId=${encodeURIComponent(eventId)}&bookmakers=${bmParam}`;

      try {
        const res = await fetch(url);
        const txt = await res.text();

        // Almindelig console.log som ønsket (hjælper ved debug)
        console.log("[ODDS GET]", {
          eventId,
          bookmakers: bmClean,
          url,
        });
        console.log("[ODDS RAW first 800 chars]", txt.slice(0, 800));

        if (!res.ok)
          throw new Error(`HTTP ${res.status} :: ${txt.slice(0, 300)}`);

        const json = JSON.parse(txt);
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, useProxy, JSON.stringify(bookmakers)]);

  return { data, loading, error };
}
