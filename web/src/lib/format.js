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

/** Calendar days until a future timestamp: "demain", "dans 4 j". */
export function daysUntil(t, now = Date.now()) {
  const days = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} j`;
}

/** Local midnight of the day containing `t`. */
export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
