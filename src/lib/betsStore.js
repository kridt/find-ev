// src/lib/betsStore.js
const KEY = "ev.bets.v1";

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function loadAll() {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  const arr = safeParse(raw, []);
  return Array.isArray(arr) ? arr : [];
}

export function saveAll(list) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

// matchInfo: { eventId, date (ISO), home, away, league:{name,slug} }
// bet: { market, selection, price, bookmaker }
export function addBet(matchInfo, bet) {
  const list = loadAll();
  const idx = list.findIndex((m) => m.eventId === String(matchInfo.eventId));
  const betId =
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2);
  const betItem = { betId, addedAt: new Date().toISOString(), ...bet };

  if (idx === -1) {
    list.push({
      eventId: String(matchInfo.eventId),
      date: matchInfo.date, // ISO
      home: matchInfo.home,
      away: matchInfo.away,
      league: matchInfo.league || null,
      createdAt: new Date().toISOString(),
      bets: [betItem],
    });
  } else {
    list[idx].bets = Array.isArray(list[idx].bets) ? list[idx].bets : [];
    list[idx].bets.push(betItem);
  }
  saveAll(list);
  return betItem;
}

export function removeMatch(eventId) {
  const list = loadAll().filter((m) => m.eventId !== String(eventId));
  saveAll(list);
}

export function removeBet(eventId, betId) {
  const list = loadAll();
  const idx = list.findIndex((m) => m.eventId === String(eventId));
  if (idx === -1) return;
  list[idx].bets = (list[idx].bets || []).filter((b) => b.betId !== betId);
  if (list[idx].bets.length === 0) {
    // tom kamp → fjern hele kampen
    list.splice(idx, 1);
  }
  saveAll(list);
}
