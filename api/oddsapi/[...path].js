// /api/oddsapi/[...path].js
function redact(u) {
  return String(u).replace(/([?&]apiKey=)[^&#]+/gi, "$1***");
}

export default async function handler(req, res) {
  const trace = Math.random().toString(36).slice(2);
  res.setHeader("x-proxy-trace", trace);

  try {
    const key = process.env.ODDS_API_KEY;
    if (!key) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

    // path kan være string eller array
    const segs = req.query.path;
    const joined = Array.isArray(segs) ? segs.join("/") : String(segs || "");
    const u = new URL(`https://api.odds-api.io/${joined}`);

    // Kopiér alle query params undtagen apiKey
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path" || k.toLowerCase() === "apikey") continue;
      if (v == null) continue;
      u.searchParams.set(k, String(v));
    }
    u.searchParams.set("apiKey", key);

    res.setHeader("x-proxy-upstream", redact(u.toString()));

    const r = await fetch(u.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = await r.text();
    const ct = r.headers.get("content-type") || "";

    res.status(r.status);
    res.setHeader("Cache-Control", "no-store");
    if (ct.includes("application/json") || /^[\[{]/.test(body.trim())) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.send(body);
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(body.slice(0, 500));
    }
  } catch (e) {
    res
      .status(502)
      .json({ error: "Upstream proxy error", detail: String(e?.message || e) });
  }
}
