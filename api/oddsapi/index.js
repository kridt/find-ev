function redact(u) {
  return String(u).replace(/([?&]apiKey=)[^&#]+/gi, "$1***");
}

export default async function handler(req, res) {
  try {
    const { path = "" } = req.query; // fx v3/leagues
    if (!path) return res.status(400).json({ error: "Missing ?path=v3/..." });

    const u = new URL(`https://api.odds-api.io/${path}`);
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path") continue;
      if (k.toLowerCase() === "apikey") continue;
      if (v == null) continue;
      u.searchParams.set(k, String(v));
    }

    const key = process.env.ODDS_API_KEY;
    if (!key)
      return res.status(500).json({ error: "Missing ODDS_API_KEY on server" });
    u.searchParams.set("apiKey", key);

    const r = await fetch(u.toString(), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = await r.text();

    console.log("[oddsapi/index] upstream", r.status, redact(u.toString()));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(r.status).send(body);
  } catch (e) {
    res
      .status(502)
      .json({ error: "Upstream proxy error", detail: String(e?.message || e) });
  }
}
