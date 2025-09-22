// src/utils/flags.jsx
export function FlagIcon({ country, size = 20, className = "" }) {
  const map = {
    Austria: "AT",
    Belgium: "BE",
    Denmark: "DK",
    Ecuador: "EC",
    England: "GB",
    Europe: "EU",
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
  const iso = map[country] || null;
  if (!iso || iso === "EU") {
    return (
      <span className={`inline-block ${className}`} style={{ fontSize: size }}>
        🌍
      </span>
    );
  }
  const code = iso.toLowerCase();
  return (
    <span
      className={`fi fi-${code} inline-block align-middle ${className}`}
      style={{ fontSize: `${size}px`, lineHeight: 0 }}
      aria-label={`${country} flag`}
      title={country}
    />
  );
}
