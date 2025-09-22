export function normalizeLeague(raw) {
  // Tillad lidt fleksibilitet, hvis din leagues.json har andre key-navne
  const sport = (raw.sport || raw.Sport || "football").toLowerCase();
  const country =
    raw.country || raw.Country || raw.area || raw.Area || "Unknown";
  const name =
    raw.name || raw.Name || raw.league || raw.league_name || "Unknown League";
  const slug = raw.slug || raw.Slug || raw.league_slug;
  return { sport, country, name, slug };
}
