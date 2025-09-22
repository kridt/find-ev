// src/lib/apiClient.js
const IS_PROD = import.meta.env.PROD;

// I prod bruger vi Vercel serverless-funktionen; i dev kan du
// enten køre "vercel dev" (så /api virker), eller bruge din Vite-proxy.
export const API_BASE = IS_PROD
  ? "/api/oddsapi"
  : import.meta.env.VITE_USE_VERCEL_DEV === "1"
  ? "/api/oddsapi"
  : "/oddsapi";

// Til dev (kun hvis du kører Vite-proxy): tilføj apiKey fra .env VITE_ODDS_API_KEY
function appendApiKeyIfDev(url) {
  if (IS_PROD) return url;
  const key = import.meta.env.VITE_ODDS_API_KEY;
  if (!key) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}apiKey=${encodeURIComponent(key)}`;
}

// Log uden at lække apiKey
export function redact(url) {
  return url.replace(/(apiKey=)[^&]+/gi, "$1***");
}

// Byg en URL til vores (proxy) API
export function buildUrl(path, params = {}) {
  const u = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    u.searchParams.set(k, String(v));
  });
  const s = u.pathname + u.search;
  return appendApiKeyIfDev(s);
}
