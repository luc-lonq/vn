import { DAY, HOUR, MINUTE, addDays, startOfDay, studyDayStart } from '../utils/time.js';
import { State } from './srs.js';

export const DIRECTIONS = Object.freeze(['vi-fr', 'fr-vi']);

// Like Anki: when nothing else is due, learning cards due within this window
// are shown early, so a session doesn't stall waiting for a 10-minute step.
const LEARN_AHEAD = 20 * MINUTE;

const LEARNING = `s.state IN ('${State.LEARNING}', '${State.RELEARNING}')`;

// Seeing one direction gives the other one's answer away, so a new direction
// waits while its sibling is being learned or was introduced today (close to
// Anki's "bury new siblings"). Takes the start of the study day as parameter.
const AVAILABLE_NEW = `
  s.state = 'new' AND NOT EXISTS (
    SELECT 1 FROM card_states o
    WHERE o.card_id = s.card_id AND o.id != s.id AND (
      o.state IN ('${State.LEARNING}', '${State.RELEARNING}')
      OR (SELECT MIN(r.reviewed_at) FROM reviews r
          WHERE r.card_id = o.card_id AND r.direction = o.direction) >= ?
    )
  )`;

// A review item: one direction of a card, with the card's content.
const ITEM = `
  SELECT s.id, s.card_id AS cardId, s.direction, s.state, s.step, s.due, s.interval,
         s.ease, s.reps, s.lapses, c.front, c.back, c.example, c.tags
  FROM card_states s JOIN cards c ON c.id = s.card_id`;

export function createReviewService(db, { newCardsPerDay, scheduler }) {
  const { dayStartHour } = scheduler.settings;

  const stmt = {
    nextLearning: db.prepare(
      `${ITEM} WHERE ${LEARNING} AND s.due <= ? ORDER BY s.due, s.id LIMIT 1`
    ),
    nextReview: db.prepare(
      `${ITEM} WHERE s.state = 'review' AND s.due <= ? ORDER BY s.due, s.id LIMIT 1`
    ),
    nextNew: db.prepare(
      `${ITEM} WHERE ${AVAILABLE_NEW} ORDER BY c.created_at, c.id, s.direction = 'fr-vi' LIMIT 1`
    ),
    availableNewCount: db.prepare(`SELECT COUNT(*) AS n FROM card_states s WHERE ${AVAILABLE_NEW}`),
    nextDueAt: db.prepare(`SELECT MIN(due) AS t FROM card_states WHERE state != 'new'`),

    learningCount: db.prepare(
      `SELECT COUNT(*) AS n FROM card_states s WHERE ${LEARNING} AND s.due < ?`
    ),
    reviewCount: db.prepare(
      `SELECT COUNT(*) AS n FROM card_states WHERE state = 'review' AND due <= ?`
    ),
    newCount: db.prepare(`SELECT COUNT(*) AS n FROM card_states WHERE state = 'new'`),
    total: db.prepare('SELECT COUNT(*) AS n FROM cards'),
    // New items introduced today = directions whose first-ever review is today.
    newIntroducedSince: db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT MIN(reviewed_at) AS first FROM reviews GROUP BY card_id, direction
      ) WHERE first >= ?`),
    reviewedSince: db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at >= ?'),
    reviewTimesSince: db.prepare('SELECT reviewed_at FROM reviews WHERE reviewed_at >= ?'),

    getItem: db.prepare(`${ITEM} WHERE s.id = ?`),
    updateSchedule: db.prepare(`
      UPDATE card_states
      SET state = @state, step = @step, interval = @interval, ease = @ease, due = @due,
          reps = @reps, lapses = @lapses
      WHERE id = @id`),
    insertReview: db.prepare(
      'INSERT INTO reviews (card_id, direction, rating, reviewed_at) VALUES (?, ?, ?, ?)'
    ),
  };

  /** Number of consecutive calendar days (ending today or yesterday) with a review. */
  function streak(now) {
    const days = new Set(
      stmt.reviewTimesSince.all(now - 400 * DAY).map((r) => startOfDay(r.reviewed_at))
    );
    let day = startOfDay(now);
    if (!days.has(day)) day = startOfDay(day - 12 * HOUR); // today isn't over yet
    let count = 0;
    while (days.has(day)) {
      count++;
      day = startOfDay(day - 12 * HOUR); // DST-safe "previous day"
    }
    return count;
  }

  function stats(now = Date.now()) {
    const today = studyDayStart(now, dayStartHour);
    const tomorrow = addDays(today, 1);
    const newLeftToday = Math.max(0, newCardsPerDay - stmt.newIntroducedSince.get(today).n);
    const newTotal = stmt.newCount.get().n;
    const newAvailable = stmt.availableNewCount.get(today).n;
    return {
      learning: stmt.learningCount.get(tomorrow).n,
      due: stmt.reviewCount.get(now).n,
      newToday: Math.min(newLeftToday, newAvailable),
      newTotal,
      newLimitReached: newLeftToday === 0 && newTotal > 0,
      newWaitingForSibling: newTotal - newAvailable,
      reviewedToday: stmt.reviewedSince.get(today).n,
      total: stmt.total.get().n,
      streak: streak(now),
    };
  }

  /**
   * Next item, in Anki's order: learning items that are due, then reviews,
   * then new items within the daily limit, then learning items a bit early.
   */
  function next(now = Date.now()) {
    const s = stats(now);
    const today = studyDayStart(now, dayStartHour);
    const item =
      stmt.nextLearning.get(now) ??
      stmt.nextReview.get(now) ??
      (s.newToday > 0 ? stmt.nextNew.get(today) : undefined) ??
      stmt.nextLearning.get(now + LEARN_AHEAD) ??
      null;

    return {
      card: item,
      previews: item ? scheduler.previews(item, now) : null,
      stats: s,
      nextDue: item ? null : stmt.nextDueAt.get().t,
    };
  }

  /** Applies a rating to a review item (card_states id); false if it doesn't exist. */
  const answer = db.transaction((itemId, rating, now = Date.now()) => {
    const item = stmt.getItem.get(itemId);
    if (!item) return false;
    const { state, step, interval, ease, due, reps, lapses } = scheduler.schedule(
      item,
      rating,
      now
    );
    stmt.updateSchedule.run({ id: item.id, state, step, interval, ease, due, reps, lapses });
    stmt.insertReview.run(item.cardId, item.direction, rating, now);
    return true;
  });

  return { stats, next, answer };
}
