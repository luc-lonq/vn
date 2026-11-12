import { addDays, daysBetween, studyDayStart } from '../utils/time.js';

/**
 * Anki-style scheduler (the classic SM-2 variant of Anki's v3 scheduler),
 * reduced to two answers: "I don't know" (Again) and "I know" (Good).
 *
 *   new ──► learning ──(I know, last step)──► review
 *              ▲  │                              │
 *              └──┘ I don't know: step 1         │ I don't know (lapse)
 *                                                ▼
 *                    review ◄──(I know)──── relearning
 *
 * Learning and relearning use short steps in minutes and come back within the
 * same session. Review intervals are whole days and grow with each success.
 */

// Values match the review log, which also holds ratings from the former
// four-button version (2 = hard, 4 = easy).
export const Rating = Object.freeze({ AGAIN: 1, GOOD: 3 });

export const State = Object.freeze({
  NEW: 'new',
  LEARNING: 'learning',
  REVIEW: 'review',
  RELEARNING: 'relearning',
});

/** Anki's default deck options. */
export const DEFAULT_SETTINGS = Object.freeze({
  learningSteps: [1, 10], // minutes
  relearningSteps: [10], // minutes
  graduatingInterval: 1, // days, after "I know" on the last learning step
  startingEase: 2.5,
  minEase: 1.3,
  lapseEasePenalty: 0.2,
  lapseMultiplier: 0, // "new interval": share of the interval kept after a lapse
  minimumInterval: 1,
  maximumInterval: 36500,
  dayStartHour: 4, // "next day starts at"
});

const MINUTE = 60 * 1000;

export function createScheduler(overrides = {}) {
  const s = { ...DEFAULT_SETTINGS, ...overrides };

  const clampInterval = (days) =>
    Math.min(s.maximumInterval, Math.max(s.minimumInterval, Math.round(days)));

  const toStep = (card, state, steps, step, now) => ({
    ...card,
    state,
    step,
    due: now + Math.round(steps[step] * MINUTE),
    delay: { minutes: steps[step] },
  });

  const toReview = (card, interval, now) => {
    const days = clampInterval(interval);
    return {
      ...card,
      state: State.REVIEW,
      step: 0,
      interval: days,
      due: addDays(studyDayStart(now, s.dayStartHour), days),
      delay: { days },
    };
  };

  /**
   * Shared by learning and relearning: "I don't know" goes back to the first
   * step, "I know" moves to the next one or graduates via `graduate()`.
   */
  function answerSteps(card, rating, state, steps, graduate, now) {
    if (steps.length === 0) return graduate();
    if (rating === Rating.AGAIN) return toStep(card, state, steps, 0, now);
    const next = Math.min(card.step, steps.length - 1) + 1;
    return next < steps.length ? toStep(card, state, steps, next, now) : graduate();
  }

  function answerReview(card, rating, now) {
    if (rating === Rating.AGAIN) {
      const lapsed = {
        ...card,
        lapses: card.lapses + 1,
        ease: Math.max(s.minEase, card.ease - s.lapseEasePenalty),
        interval: clampInterval(card.interval * s.lapseMultiplier),
      };
      if (s.relearningSteps.length === 0) return toReview(lapsed, lapsed.interval, now);
      return toStep(lapsed, State.RELEARNING, s.relearningSteps, 0, now);
    }

    // Reviewing late is rewarded with half the delay, like Anki's Good.
    const today = studyDayStart(now, s.dayStartHour);
    const daysLate = Math.max(0, daysBetween(studyDayStart(card.due, s.dayStartHour), today));
    const interval = Math.max((card.interval + daysLate / 2) * card.ease, card.interval + 1);
    return toReview(card, interval, now);
  }

  /**
   * Returns the card's new scheduling fields (state, step, interval, ease, due,
   * reps, lapses) plus `delay`, the wait shown on the answer button.
   */
  function schedule(card, rating, now = Date.now()) {
    const base = { ...card, reps: card.reps + 1 };
    switch (card.state) {
      case State.REVIEW:
        return answerReview(base, rating, now);
      case State.RELEARNING:
        // card.interval was already reduced when the card lapsed.
        return answerSteps(
          base,
          rating,
          State.RELEARNING,
          s.relearningSteps,
          () => toReview(base, base.interval, now),
          now
        );
      default: {
        const learning = card.state === State.NEW ? { ...base, step: 0 } : base;
        return answerSteps(
          learning,
          rating,
          State.LEARNING,
          s.learningSteps,
          () => toReview(learning, s.graduatingInterval, now),
          now
        );
      }
    }
  }

  /** Wait shown on each answer button: [I don't know, I know]. */
  function previews(card, now = Date.now()) {
    return [Rating.AGAIN, Rating.GOOD].map((r) => formatDelay(schedule(card, r, now).delay));
  }

  return { settings: s, schedule, previews };
}

/** "1 min", "10 min", "1 h", "4 j", "3 mois", "1,5 an" (French UI). */
export function formatDelay({ minutes, days }) {
  if (minutes !== undefined) {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
    days = minutes / 1440;
  }
  if (days < 31) return `${Math.round(days)} j`;
  if (days < 365) return `${Math.round(days / 30)} mois`;
  const years = Math.round((days / 365) * 10) / 10;
  return `${String(years).replace('.', ',')} an${years >= 2 ? 's' : ''}`;
}
