const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export { MINUTE, HOUR, DAY };

/** "carte" → "cartes" when n > 1 (French plural, enough for this UI). */
export const plural = (n, word) => `${word}${n > 1 ? 's' : ''}`;

/** Relative time in French: "à l'instant", "il y a 5 min", "12 nov." */
export function relativeTime(t, now = Date.now()) {
  const elapsed = now - t;
  if (elapsed < MINUTE) return "à l'instant";
  if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `il y a ${Math.floor(elapsed / HOUR)} h`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Time until a future timestamp: "dans 9 min", "dans 3 h", "dans 4 j". */
export function timeUntil(t, now = Date.now()) {
  const ms = t - now;
  if (ms < HOUR) return `dans ${Math.max(1, Math.ceil(ms / MINUTE))} min`;
  if (ms < DAY) return `dans ${Math.round(ms / HOUR)} h`;
  return `dans ${Math.round(ms / DAY)} j`;
}

/** Local midnight of the day containing `t`. */
export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
