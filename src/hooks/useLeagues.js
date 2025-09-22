import { useEffect, useState } from "react";
import { getJSON } from "../lib/apiClient";

export function useLeagues({ sport = "football" } = {}) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let off = false;
    async function go() {
      setLoading(true);
      setError("");
      try {
        const json = await getJSON("/v3/leagues", { sport });
        const arr = Array.isArray(json?.leagues)
          ? json.leagues
          : Array.isArray(json)
          ? json
          : [];
        if (!off) setLeagues(arr);
      } catch (e) {
        if (!off) setError(String(e.message || e));
      } finally {
        if (!off) setLoading(false);
      }
    }
    go();
    return () => {
      off = true;
    };
  }, [sport]);

  return { leagues, loading, error };
}
