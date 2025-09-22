// /api/oddsapi/[...path].js

// Redact 'apiKey' værdier i URLs/tekster
function redact(str = "") {
  return String(str).replace(/([?&]apiKey=)([^&#]+)/gi, "$1***");
}
// Lille logger der respekterer DEBUG_ODDS_PROXY
function log(rid, ...args) {
  if (process.env.DEBUG_ODDS_PROXY === "1") {
    console.log(`[odds-proxy:${rid}]`, ...args);
  }
}
// Build upstream URL sikkert
function buildUpstreamUrl(upstreamPath, clientQuery) {
  const u = new URL(`https://api.odds-api.io/${upstreamPath}`);
  // Kopiér alle query params fra klienten — men IKKE apiKey
  for (const [k, v] of Object.entries(clientQuery)) {
    if (k === "path") continue;
    if (k.toLowerCase() === "apikey") continue;
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((vv) => u.searchParams.append(k, vv));
    } else {
      u.searchParams.set(k, v);
    }
  }
  // Server-side key
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("Missing ODDS_API_KEY on server");
  u.searchParams.set("apiKey", key);
  return u;
}

export default async function handler(req, res) {
  // Unik request-id til at følge hele flowet i loggen
  const rid = Math.random().toString(36).slice(2, 8);
  const started = Date.now();

  try {
    // Path segments efter /api/oddsapi/*
    const segRaw = req.query.path;
    const seg = Array.isArray(segRaw) ? segRaw : segRaw ? [segRaw] : [];
    const upstreamPath = seg.join("/"); // fx "v3/events"

    // Health/debug endpoint — går IKKE til upstream
    if (upstreamPath.toLowerCase() === "debug") {
      const info = {
        ok: true,
        env: process.env.VERCEL_ENV || "unknown",
        region: process.env.VERCEL_REGION || "unknown",
        hasKey: !!process.env.ODDS_API_KEY,
        method: req.method,
        ip:
          req.headers["x-forwarded-for"] ||
          req.socket?.remoteAddress ||
          "unknown",
        now: new Date().toISOString(),
        note: "Dette endpoint kalder ikke upstream. Brug det til hurtig sanity-check.",
      };
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(info);
    }

    // Kun GET/HEAD (tilpas hvis du senere vil støtte POST)
    if (!["GET", "HEAD"].includes(req.method)) {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Safety: kræv path
    if (!upstreamPath) {
      return res
        .status(400)
        .json({ error: "Missing path segment after /api/oddsapi/" });
    }

    // Byg upstream URL
    let upstream;
    try {
      upstream = buildUpstreamUrl(upstreamPath, req.query);
    } catch (e) {
      log(rid, "BUILD-URL ERROR:", e?.message || e);
      return res
        .status(500)
        .json({ error: e?.message || "Failed to build upstream URL" });
    }

    // Log request-metadata (redacted URL)
    log(rid, "REQ", {
      method: req.method,
      host: req.headers.host,
      path: upstreamPath,
      query: Object.fromEntries(
        Object.entries(req.query).map(([k, v]) => [k, v])
      ),
      vercelId: req.headers["x-vercel-id"] || null,
      ip:
        req.headers["x-forwarded-for"] ||
        req.socket?.remoteAddress ||
        "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      url: redact(upstream.toString()),
    });

    // Fetch upstream
    const uStart = Date.now();
    let r, bodyText;
    try {
      r = await fetch(upstream.toString(), {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      bodyText = await r.text();
    } catch (e) {
      log(rid, "UPSTREAM FETCH ERROR:", e?.message || e);
      return res.status(502).json({
        error: "Upstream fetch failed",
        detail: String(e?.message || e),
      });
    }

    // Log upstream resultat
    const dur = Date.now() - uStart;
    const preview = bodyText.slice(0, 600);
    log(rid, "UPSTREAM", {
      status: r.status,
      ms: dur,
      url: redact(upstream.toString()),
      bodyPreview: preview,
    });

    // Svar videre til klienten
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Proxy-Trace", rid);
    res.setHeader("X-Proxy-Upstream", redact(upstream.toString()));
    res.status(r.status).send(bodyText);
  } catch (e) {
    log(rid, "FATAL", e?.stack || e?.message || e);
    res.setHeader("X-Proxy-Trace", rid);
    res.status(500).json({
      error: "Proxy crashed",
      trace: rid,
      detail: String(e?.message || e),
    });
  } finally {
    const totalMs = Date.now() - started;
    log(rid, "DONE in", totalMs + "ms");
  }
}
