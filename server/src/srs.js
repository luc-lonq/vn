// Algorithme type SM-2 (Anki simplifié)
// rating : 1 = à revoir, 2 = difficile, 3 = bien, 4 = facile
const MIN = 60 * 1000;
const DAY = 24 * 3600 * 1000;

export function schedule(card, rating, now = Date.now()) {
  let { interval, ease, reps, lapses } = card;

  if (rating === 1) {
    return {
      interval: 0, ease: Math.max(1.3, ease - 0.2), reps: 0, lapses: lapses + 1,
      due: now + 10 * MIN,
    };
  }

  if (reps === 0) {
    interval = rating === 2 ? 0.5 : rating === 3 ? 1 : 4;
  } else if (reps === 1) {
    interval = rating === 2 ? 3 : rating === 3 ? 6 : 8;
  } else {
    const factor = rating === 2 ? 1.2 : rating === 3 ? ease : ease * 1.3;
    interval = Math.max(interval + 1, interval * factor);
  }
  if (rating === 2) ease = Math.max(1.3, ease - 0.15);
  if (rating === 4) ease = ease + 0.15;

  interval = Math.round(interval * 10) / 10;
  return { interval, ease, reps: reps + 1, lapses, due: now + interval * DAY };
}

export function formatDelay(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} mois`;
  return `${Math.round(d / 365 * 10) / 10} an${d >= 730 ? 's' : ''}`;
}

export function previews(card, now = Date.now()) {
  return [1, 2, 3, 4].map((r) => formatDelay(schedule(card, r, now).due - now));
}
