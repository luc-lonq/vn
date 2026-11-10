import { DAY, MINUTE } from '../utils/time.js';

/** Review ratings, as sent by the client. */
export const Rating = Object.freeze({ AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 });

const MIN_EASE = 1.3;
const RELEARN_DELAY = 10 * MINUTE;

/**
 * Simplified SM-2 scheduler (close to Anki's defaults).
 * Returns the new scheduling fields; does not mutate `card`.
 */
export function schedule(card, rating, now = Date.now()) {
  let { interval, ease } = card;
  const { reps, lapses } = card;

  if (rating === Rating.AGAIN) {
    return {
      interval: 0,
      ease: Math.max(MIN_EASE, ease - 0.2),
      reps: 0,
      lapses: lapses + 1,
      due: now + RELEARN_DELAY,
    };
  }

  if (reps === 0) {
    interval = { [Rating.HARD]: 0.5, [Rating.GOOD]: 1, [Rating.EASY]: 4 }[rating];
  } else if (reps === 1) {
    interval = { [Rating.HARD]: 3, [Rating.GOOD]: 6, [Rating.EASY]: 8 }[rating];
  } else {
    const factor = { [Rating.HARD]: 1.2, [Rating.GOOD]: ease, [Rating.EASY]: ease * 1.3 }[rating];
    interval = Math.max(interval + 1, interval * factor);
  }

  if (rating === Rating.HARD) ease = Math.max(MIN_EASE, ease - 0.15);
  if (rating === Rating.EASY) ease += 0.15;

  interval = Math.round(interval * 10) / 10;
  return { interval, ease, reps: reps + 1, lapses, due: now + interval * DAY };
}

/** Human-readable delay in French ("10 min", "3 j", "2 mois"). */
export function formatDelay(ms) {
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(ms / DAY);
  if (days < 31) return `${days} j`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mois`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${years} an${years >= 2 ? 's' : ''}`;
}

/** Next-review delay for each rating, shown on the answer buttons. */
export function previews(card, now = Date.now()) {
  return Object.values(Rating).map((r) => formatDelay(schedule(card, r, now).due - now));
}
