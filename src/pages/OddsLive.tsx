// OddsLive.tsx
import React, { useEffect, useRef, useState } from "react";

type Market = { name: string; updatedAt?: string; odds: any[] };

type WsMsg =
  | {
      type: "created" | "deleted" | "no_markets";
      id: string;
      bookie?: string;
      timestamp?: number | string;
      date?: string;
    }
  | {
      type: "updated";
      id: string;
      bookie: string;
      markets: Market[];
      timestamp?: number | string;
      date?: string;
    };

type MatchState = {
  id: string;
  bookie: string | null;
  markets: Market[];
  updatedAt?: string;
};

const WS_URL = (key: string) => `wss://api.odds-api.io/v3/ws?apiKey=${key}`;

// Lille LIVE-badge (blink ved 'open')
function LiveBadge({
  status,
}: {
  status: "connecting" | "open" | "closed" | "error";
}) {
  const active = status === "open";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: active
            ? "#16a34a"
            : status === "connecting"
            ? "#f59e0b"
            : "#ef4444",
          animation: active ? "blink 1s steps(2, start) infinite" : "none",
          boxShadow: active ? "0 0 0 2px rgba(22,163,74,0.2)" : "none",
        }}
      />
      <span
        style={{
          fontFamily: "monospace",
          fontSize: 12,
          letterSpacing: 2,
          color: active
            ? "#16a34a"
            : status === "connecting"
            ? "#f59e0b"
            : "#ef4444",
        }}
      >
        {active ? "LIVE" : status.toUpperCase()}
      </span>
      <style>{`@keyframes blink{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}`}</style>
    </div>
  );
}

// --- Helpers: robust parsing af WS payloads ---
async function readEventData(data: any): Promise<string> {
  if (typeof data === "string") return data;
  if (data?.text) return await data.text(); // Blob/Response
  try {
    return await new Response(data).text();
  } catch {
    return String(data ?? "");
  }
}

function normalizeTimestamp(t?: number | string): string | undefined {
  if (t == null) return undefined;
  if (typeof t === "number") return new Date(t * 1000).toISOString(); // epoch seconds
  if (/^\d+$/.test(t)) return new Date(Number(t) * 1000).toISOString();
  return t; // antag ISO allerede
}

/** Forsøg 1: parse hele strengen som ét JSON-objekt.
 *  Forsøg 2: NDJSON (split på linjer, parse hver linje).
 *  Forsøg 3: grov chunking på top-level {..} eller [..] (fallback). */
function parseWsPayload(raw: string): any[] {
  const out: any[] = [];
  // #1: ét JSON-objekt?
  try {
    out.push(JSON.parse(raw));
    return out;
  } catch {
    /* continue */
  }

  // #2: NDJSON (linje for linje)
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    let ok = true;
    const arr: any[] = [];
    for (const line of lines) {
      try {
        arr.push(JSON.parse(line));
      } catch {
        ok = false;
        break;
      }
    }
    if (ok) return arr;
  }

  // #3: fallback chunker (kan fejle hvis der er { eller } i strings, men fint til vores payloads)
  const chunks: string[] = [];
  let depth = 0,
    start = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{" || c === "[") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        chunks.push(raw.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (const ch of chunks) {
    try {
      out.push(JSON.parse(ch));
    } catch {
      /* ignore */
    }
  }
  return out.length ? out : [];
}

export default function OddsLive() {
  const apiKey = import.meta.env.VITE_ODDS_API_KEY as string;
  if (!apiKey) console.error("Missing VITE_ODDS_API_KEY");

  const DEBUG =
    (import.meta.env.VITE_WS_DEBUG ?? "true").toString().toLowerCase() !==
    "false";

  const [status, setStatus] = useState<
    "connecting" | "open" | "closed" | "error"
  >("connecting");
  const [matches, setMatches] = useState<Map<string, MatchState>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const closingRef = useRef(false);
  const backoffRef = useRef(1000);

  useEffect(() => {
    if (!apiKey) return;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(WS_URL(apiKey));
      wsRef.current = ws;
      closingRef.current = false;

      ws.onopen = () => {
        setStatus("open");
        backoffRef.current = 1000;
        if (DEBUG) console.log("[WS] connected");
      };

      ws.onclose = (evt) => {
        setStatus("closed");
        if (DEBUG) console.warn("[WS] closed", evt.code, evt.reason);
        if (!closingRef.current) {
          const delay = backoffRef.current;
          setTimeout(connect, delay);
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
        }
      };

      ws.onerror = (err) => {
        setStatus("error");
        console.error("[WS] error", err);
      };

      ws.onmessage = async (event) => {
        const raw = await readEventData(event.data);

        // RAW log
        if (DEBUG) {
          const size = new Blob([raw]).size;
          console.groupCollapsed(`[WS][RAW] ${size} bytes`);
          console.log(raw);
          console.groupEnd();
        }

        const msgs = parseWsPayload(raw);
        if (!msgs.length) {
          console.error("[WS] parse failed (empty result). Raw below:\n", raw);
          return;
        }

        // PARSED log + dispatch
        for (const msg of msgs) {
          if (DEBUG) {
            const meta = [
              `type=${msg?.type ?? "-"}`,
              `id=${msg?.id ?? "-"}`,
              `bookie=${msg?.bookie ?? "-"}`,
              `markets=${Array.isArray(msg?.markets) ? msg.markets.length : 0}`,
            ].join(" | ");
            console.groupCollapsed(`[WS][PARSED] ${meta}`);
            console.dir(msg, { depth: null });
            if (Array.isArray(msg?.markets) && msg.markets.length) {
              try {
                console.table(
                  msg.markets.map((m: any) => ({
                    name: m.name,
                    updatedAt: m.updatedAt,
                    odds_items: Array.isArray(m.odds) ? m.odds.length : 0,
                  }))
                );
              } catch {}
            }
            console.groupEnd();
          }
          handleMessage(msg as WsMsg);
        }
      };
    }

    function handleMessage(data: WsMsg) {
      const ts = normalizeTimestamp(data.timestamp);
      setMatches((prev) => {
        const next = new Map(prev);
        if (data.type === "created") {
          if (!next.has(data.id))
            next.set(data.id, {
              id: data.id,
              bookie: data.bookie ?? null,
              markets: [],
              updatedAt: ts,
            });
        } else if (data.type === "deleted") {
          next.delete(data.id);
        } else if (data.type === "no_markets") {
          const cur = next.get(data.id) || {
            id: data.id,
            bookie: data.bookie ?? null,
            markets: [] as Market[],
          };
          next.set(data.id, { ...cur, markets: [], updatedAt: ts });
        } else if (data.type === "updated") {
          const cur = next.get(data.id) || {
            id: data.id,
            bookie: null,
            markets: [] as Market[],
          };
          next.set(data.id, {
            ...cur,
            bookie: data.bookie,
            markets: data.markets,
            updatedAt: ts,
          });
        }
        return next;
      });
    }

    connect();
    return () => {
      closingRef.current = true;
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [apiKey, DEBUG]);

  const list = Array.from(matches.values());

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <LiveBadge status={status} />
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Matches in memory: {list.length}
        </div>
      </div>

      <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
        {list.slice(0, 20).map((m) => {
          const ml = m.markets.find((x) => x.name === "ML");
          const o = ml?.odds?.[0];
          return (
            <li
              key={m.id}
              style={{ border: "1px solid #333", borderRadius: 8, padding: 12 }}
            >
              <div style={{ fontWeight: 600 }}>
                #{m.id} — {m.bookie ?? "?"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Updated: {m.updatedAt ?? "?"}
              </div>
              <div style={{ marginTop: 6 }}>
                {o ? (
                  <code>
                    ML H:{o.home ?? "-"} D:{o.draw ?? "-"} A:{o.away ?? "-"}{" "}
                    (max {o.max ?? "-"})
                  </code>
                ) : (
                  <em>No ML odds</em>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
