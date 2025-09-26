// src/lib/apiClient.js
const IS_LOCAL =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)/.test(window.location.hostname);

// Lokal Vite -> /oddsapi (proxy til upstream) ELLER /api/oddsapi hvis du kører `vercel dev`
// Prod/Preview -> ALTID /api/oddsapi
export const API_BASE = IS_LOCAL
  ? import.meta.env.VITE_USE_VERCEL_DEV === "1"
    ? "/api/oddsapi"
    : "/oddsapi"
  : "/api/oddsapi";

// Dev-nøgle læses kun lokalt
const DEV_KEY = import.meta.env.VITE_ODDS_API_KEY || "";

export function redact(s) {
  return String(s || "").replace(/([?&]apiKey=)([^&#]+)/gi, "$1***");
}

export function buildUrl(path, params = {}) {
  // Forbyd fejlagtig /oddsapi i prod
  if (!IS_LOCAL && path.startsWith("/oddsapi/")) {
    console.error("[API] forbids /oddsapi in prod, rewriting to /api/oddsapi");
    path = path.replace(/^\/oddsapi\//, "/");
  }
  const u = new URL(`${API_BASE}${path}`, window.location.origin);

  // Tilføj brugerens params
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) u.searchParams.set(k, String(v));
  });

  // ⬅️ VIGTIGT: i lokal Vite (/oddsapi) vedhæfter vi dev-API-key
  if (IS_LOCAL && API_BASE === "/oddsapi") {
    if (!DEV_KEY) {
      console.warn("[API] Missing VITE_ODDS_API_KEY in dev; requests will 401");
    } else {
      u.searchParams.set("apiKey", DEV_KEY);
    }
  }

  return u.pathname + u.search;
}

export async function getJSON(path, params = {}) {
  const url = buildUrl(path, params);
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  console.info("[API]", res.status, redact(url));
  if (!res.ok)
    throw new Error(
      `HTTP ${res.status} ${redact(url)} :: ${text.slice(0, 200)}`
    );

  const looksHtml =
    text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");
  if (
    looksHtml ||
    (!ct.includes("application/json") && !/^[\[{]/.test(text.trim()))
  ) {
    throw new Error(
      `[API] Non-JSON from ${redact(url)} :: ${text.slice(0, 200)}`
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`[API] JSON parse failed ${redact(url)} :: ${e.message}`);
  }
}
