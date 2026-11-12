import { addDays, daysBetween, studyDayStart } from '../utils/time.js';

/**
 * Anki-style scheduler (the classic SM-2 variant used by Anki's v3 scheduler).
 *
 * A card goes through these states:
 *
 *   new ──► learning ──(Good on last step / Easy)──► review
 *              ▲  │                                   │
 *              └──┘ Again: back to step 1             │ Again (lapse)
 *                                                     ▼
 *                         review ◄──(Good / Easy)── relearning
 *
 * Learning and relearning use short steps in minutes and come back within the
 * same session. Review intervals are whole days and grow with each success.
 */

export const Rating = Object.freeze({ AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 });

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
  graduatingInterval: 1, // days, after Good on the last learning step
  easyInterval: 4, // days, after Easy on a learning card
  startingEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  lapseMultiplier: 0, // "new interval": share of the interval kept after a lapse
  minimumInterval: 1,
  maximumInterval: 36500,
  dayStartHour: 4, // "next day starts at"
});

const MINUTE = 60 * 1000;

/**
 * Moves a (re)learning card through its steps.
 * Returns `{ step, minutes }` to stay in learning, or `{ graduate: rating }`.
 */
function answerStep(steps, step, rating) {
  if (steps.length === 0) return { graduate: rating === Rating.EASY ? 'easy' : 'good' };
  const current = Math.min(step, steps.length - 1);

  switch (rating) {
    case Rating.AGAIN:
      return { step: 0, minutes: steps[0] };
    case Rating.HARD: {
      // Anki: on the first step, Hard waits halfway between steps 1 and 2
      // (or 1.5× the step when there is only one); later, it repeats the step.
      if (current > 0) return { step: current, minutes: steps[current] };
      const minutes = steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5;
      return { step: 0, minutes };
    }
    case Rating.GOOD:
      return current + 1 < steps.length
        ? { step: current + 1, minutes: steps[current + 1] }
        : { graduate: 'good' };
    default:
      return { graduate: 'easy' };
  }
}

export function createScheduler(overrides = {}) {
  const s = { ...DEFAULT_SETTINGS, ...overrides };

  const clampInterval = (days) =>
    Math.min(s.maximumInterval, Math.max(s.minimumInterval, Math.round(days)));

  const inLearning = (card, state, { step, minutes }, now) => ({
    ...card,
    state,
    step,
    due: now + Math.round(minutes * MINUTE),
    delay: { minutes },
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

  function answerLearning(card, rating, now) {
    const result = answerStep(s.learningSteps, card.step, rating);
    if (!result.graduate) return inLearning(card, State.LEARNING, result, now);
    const interval = result.graduate === 'easy' ? s.easyInterval : s.graduatingInterval;
    return toReview(card, interval, now);
  }

  function answerRelearning(card, rating, now) {
    const result = answerStep(s.relearningSteps, card.step, rating);
    if (!result.graduate) return inLearning(card, State.RELEARNING, result, now);
    // card.interval was already reduced when the card lapsed.
    const interval = result.graduate === 'easy' ? card.interval + 1 : card.interval;
    return toReview(card, interval, now);
  }

  function answerReview(card, rating, now) {
    if (rating === Rating.AGAIN) {
      const lapsed = {
        ...card,
        lapses: card.lapses + 1,
        ease: Math.max(s.minEase, card.ease - 0.2),
        interval: clampInterval(card.interval * s.lapseMultiplier),
      };
      if (s.relearningSteps.length === 0) return toReview(lapsed, lapsed.interval, now);
      return inLearning(lapsed, State.RELEARNING, { step: 0, minutes: s.relearningSteps[0] }, now);
    }

    // Reviewing late is rewarded: Good counts half the delay, Easy all of it.
    const today = studyDayStart(now, s.dayStartHour);
    const daysLate = Math.max(0, daysBetween(studyDayStart(card.due, s.dayStartHour), today));
    const ivl = card.interval;

    // Each button gives at least one more day than the one before it.
    const hard = clampInterval(Math.max(ivl * s.hardMultiplier, ivl + 1));
    const good = clampInterval(Math.max((ivl + daysLate / 2) * card.ease, hard + 1));
    const easy = clampInterval(Math.max((ivl + daysLate) * card.ease * s.easyBonus, good + 1));

    if (rating === Rating.HARD) {
      return toReview({ ...card, ease: Math.max(s.minEase, card.ease - 0.15) }, hard, now);
    }
    if (rating === Rating.GOOD) return toReview(card, good, now);
    return toReview({ ...card, ease: card.ease + 0.15 }, easy, now);
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
        return answerRelearning(base, rating, now);
      default: // new cards start on the first learning step
        return answerLearning(
          { ...base, step: card.state === State.NEW ? 0 : card.step },
          rating,
          now
        );
    }
  }

  /** Wait shown on each answer button, in rating order. */
  function previews(card, now = Date.now()) {
    return Object.values(Rating).map((r) => formatDelay(schedule(card, r, now).delay));
  }

  return { settings: s, schedule, previews };
}

/** "1 min", "6 min", "1 h", "4 j", "3 mois", "1,5 an" (French UI). */
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
