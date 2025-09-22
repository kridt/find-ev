export function groupByCountry(leagues) {
  const map = new Map();
  for (const l of leagues) {
    if (!map.has(l.country)) map.set(l.country, []);
    map.get(l.country).push(l);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
