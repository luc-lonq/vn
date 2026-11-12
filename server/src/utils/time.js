export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Local midnight of the day containing `t`. */
export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Start of the "study day" containing `t`. Like Anki, the day rolls over at
 * `hour` (e.g. 4 am) rather than midnight, so a late-night session still
 * counts as the same day.
 */
export function studyDayStart(t, hour) {
  const d = new Date(t);
  if (d.getHours() < hour) d.setDate(d.getDate() - 1);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** Adds calendar days (DST-safe, unlike adding multiples of DAY). */
export function addDays(t, days) {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole calendar days from `from` to `to` (both should be day starts). */
export function daysBetween(from, to) {
  return Math.round((to - from) / DAY);
}
