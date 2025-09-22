// Slå log til/fra med localStorage.DEBUG_ODDS ('*' = alt; 'v3' = kun v3; 'v1' = kun v1)
// i DevTools: localStorage.DEBUG_ODDS='*'  (eller 'v3' / 'v1');  slet for at disable
export const DBG = (() => {
  const level =
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("DEBUG_ODDS")) ||
    "";
  const on = !!level;
  const match = (tag) =>
    !level || level === "*" || String(level).toLowerCase().includes(tag);

  const pad = (n) => String(n).padStart(2, "0");
  const ts = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
      d.getSeconds()
    )}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  };
  const maskKey = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}` : "(missing)");

  const group = (title) => on && console.groupCollapsed?.(`[${ts()}] ${title}`);
  const groupEnd = () => on && console.groupEnd?.();
  const log = (...args) => on && console.log(`[${ts()}]`, ...args);
  const info = (...args) => on && console.info(`[${ts()}]`, ...args);
  const warn = (...args) => on && console.warn(`[${ts()}]`, ...args);
  const error = (...args) => on && console.error(`[${ts()}]`, ...args);
  const time = (label) => on && console.time?.(`${label}`);
  const timeEnd = (label) => on && console.timeEnd?.(`${label}`);

  return {
    on,
    match,
    maskKey,
    group,
    groupEnd,
    log,
    info,
    warn,
    error,
    time,
    timeEnd,
  };
})();
