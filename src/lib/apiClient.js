// src/lib/apiClient.js
const IS_LOCAL =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)/.test(window.location.hostname);

export function redact(s) {
  return String(s || "").replace(/([?&]apiKey=)([^&#]+)/gi, "$1***");
}

// Dev-nøgle (bruges KUN lokalt ved /oddsapi-proxy)
const DEV_KEY = import.meta.env.VITE_ODDS_API_KEY || "";

/** Byg URL til kald:
 *  - Dev: /oddsapi + auto apiKey, eller /api/oddsapi ved `vercel dev`
 *  - Prod: ALTID fallback /api/oddsapi?path=...
 */
export function buildUrl(path, params = {}) {
  // normaliser
  let p = String(path || "");
  if (p.startsWith("/")) p = p.slice(1); // fx "v3/events"

  if (IS_LOCAL) {
    const base =
      import.meta.env.VITE_USE_VERCEL_DEV === "1" ? "/api/oddsapi" : "/oddsapi";
    const u = new URL(`${base}/${p}`, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null) u.searchParams.set(k, String(v));
    });
    // Tilføj dev apiKey hvis vi bruger /oddsapi (Vite proxy)
    if (base === "/oddsapi" && DEV_KEY) {
      u.searchParams.set("apiKey", DEV_KEY);
    } else if (base === "/oddsapi" && !DEV_KEY) {
      console.warn("[API] Missing VITE_ODDS_API_KEY in dev; requests will 401");
    }
    return u.pathname + u.search;
  }

  // PROD: tvang til fallback route
  const u = new URL(`/api/oddsapi`, window.location.origin);
  u.searchParams.set("path", p); // fx path=v3/odds
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) u.searchParams.set(k, String(v));
  });
  return u.pathname + u.search;
}

export async function getJSON(path, params = {}) {
  const url = buildUrl(path, params);
  console.info("[API] fetch", redact(url));
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  const preview = text.slice(0, 200).replace(/\s+/g, " ");

  console.info("[API]", res.status, "CT:", ct, "::", redact(url));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${redact(url)} :: ${preview}`);
  }

  // JSON heuristik
  const looksJson =
    ct.includes("application/json") || /^[\[{]/.test(text.trim());
  if (!looksJson) {
    throw new Error(`[API] Non-JSON from ${redact(url)} :: ${preview}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`[API] JSON parse failed ${redact(url)} :: ${e.message}`);
  }
}
