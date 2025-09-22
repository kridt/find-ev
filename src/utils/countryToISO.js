// Minimal map. Tilføj frit flere lande efter behov.
export const COUNTRY_TO_ISO = {
  Austria: "AT",
  Belgium: "BE",
  Denmark: "DK",
  Ecuador: "EC",
  England: "GB", // England bruger UK-flag (GB) i emoji-sættet
  Europe: "EU", // ingen officiel emoji—vi fallback'er til 🌍
  Spain: "ES",
  Italy: "IT",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  Portugal: "PT",
  Scotland: "GB",
  Turkey: "TR",
  Switzerland: "CH",
  Sweden: "SE",
  Norway: "NO",
  Poland: "PL",
};

function isoToFlagEmoji(iso) {
  if (!iso || iso.toUpperCase() === "EU") return "🌍";
  const codePoints = iso
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt());
  return String.fromCodePoint(...codePoints);
}

export function countryToFlag(countryName) {
  const iso = COUNTRY_TO_ISO[countryName] || null;
  return isoToFlagEmoji(iso);
}
