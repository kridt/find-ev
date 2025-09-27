// src/hooks/useLocalLeagues.js
import leaguesRaw from "../data/leagues.json";

/**
 * Læser alle ligaer fra lokal JSON og normaliserer struktur.
 * Vi deduplikerer på slug og sorterer alfabetisk efter name.
 */
export function useLocalLeagues() {
  // Normaliser
  const items = Array.isArray(leaguesRaw) ? leaguesRaw : [];

  const dedupMap = new Map();
  for (const row of items) {
    if (!row) continue;
    const name = String(row.name ?? row.league ?? "").trim();
    const slug = String(row.slug ?? row.league_slug ?? "").trim();
    const country = String(row.country ?? row.cc ?? row.region ?? "").trim();

    if (!name || !slug) {
      // Bevidst stille i production – hvis du vil debugge, tilføj en console.warn her.
      continue;
    }
    if (!dedupMap.has(slug)) {
      dedupMap.set(slug, { name, slug, country });
    }
  }

  const leagues = Array.from(dedupMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "en")
  );

  return { leagues, loading: false, error: "" };
}
