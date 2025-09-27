// /api/oddsapi/debug.js
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    hasKey: !!process.env.ODDS_API_KEY,
    env: process.env.VERCEL_ENV || "unknown",
    now: new Date().toISOString(),
  });
}
