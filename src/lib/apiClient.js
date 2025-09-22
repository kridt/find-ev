// src/lib/apiClient.js
const IS_PROD = !!import.meta.env.PROD;

// PROD => Vercel serverless. DEV => Vite-proxy (/oddsapi) eller Vercel dev (/api/oddsapi) hvis du sætter VITE_USE_VERCEL_DEV=1
export const API_BASE = IS_PROD
  ? "/api/oddsapi"
  : import.meta.env.VITE_USE_VERCEL_DEV === "1"
  ? "/api/oddsapi"
  : "/oddsapi";

if (typeof window !== "undefined") {
  console.info("[API] mode:", IS_PROD ? "prod" : "dev", "API_BASE:", API_BASE);
}

// Redact apiKey i alle logs
export function redact(s) {
  return String(s || "").replace(/([?&]apiKey=)([^&#]+)/gi, "$1***");
}

export function buildUrl(path, params = {}) {
  const u = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    u.searchParams.set(k, String(v));
  });
  return u.pathname + u.search; // ingen apiKey fra klienten!
}

export async function getJSON(path, params = {}) {
  const url = buildUrl(path, params);
  console.info("[API][fetch]", redact(url));

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";

  console.info(
    "[API][http]",
    res.status,
    "in",
    res.headers.get("server-timing") || "n/a"
  );
  console.info("[API][preview]", text.slice(0, 200));

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${redact(url)} :: ${text.slice(0, 200)}`
    );
  }

  // Beskyt mod at få index.html tilbage
  const looksHtml =
    text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");
  if (
    looksHtml ||
    (!ct.includes("application/json") &&
      !text.trim().startsWith("{") &&
      !text.trim().startsWith("["))
  ) {
    throw new Error(
      `[API] Non-JSON response from ${redact(url)}\nPreview:\n${text.slice(
        0,
        300
      )}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `[API] JSON parse failed from ${redact(url)} :: ${
        e.message
      }\nPreview:\n${text.slice(0, 200)}`
    );
  }
}
