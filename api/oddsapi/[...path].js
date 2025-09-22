// /api/oddsapi/[...path].js
export default async function handler(req, res) {
  try {
    // Saml path-segmenter efter /api/oddsapi/*
    const seg = Array.isArray(req.query.path)
      ? req.query.path
      : [req.query.path].filter(Boolean);
    const upstreamPath = seg.length ? seg.join("/") : ""; // fx "v3/events"

    // Byg upstream URL
    const upstream = new URL(`https://api.odds-api.io/${upstreamPath}`);

    // Kopiér alle querys fra klienten, men ignorér evt. apiKey fra klient
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path") continue;
      if (k.toLowerCase() === "apikey") continue;
      upstream.searchParams.append(k, v);
    }

    // Server-side API key fra Vercel env (lækkes ikke til browseren)
    const key = process.env.ODDS_API_KEY;
    if (!key)
      return res.status(500).json({ error: "Missing ODDS_API_KEY on server" });
    upstream.searchParams.set("apiKey", key);

    // Fetch videre
    const r = await fetch(upstream.toString(), {
      headers: { accept: "application/json" },
    });
    const body = await r.text();

    res.setHeader("Content-Type", "application/json");
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: "Upstream proxy error" });
  }
}
