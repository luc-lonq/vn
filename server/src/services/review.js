import { DAY, HOUR, MINUTE, addDays, startOfDay, studyDayStart } from '../utils/time.js';
import { State } from './srs.js';

// Like Anki: when nothing else is due, learning cards due within this window
// are shown early, so a session doesn't stall waiting for a 10-minute step.
const LEARN_AHEAD = 20 * MINUTE;

const LEARNING = `state IN ('${State.LEARNING}', '${State.RELEARNING}')`;

export function createReviewService(db, { newCardsPerDay, scheduler }) {
  const { dayStartHour } = scheduler.settings;

  const stmt = {
    nextLearning: db.prepare(
      `SELECT * FROM cards WHERE ${LEARNING} AND due <= ? ORDER BY due, id LIMIT 1`
    ),
    nextReview: db.prepare(
      `SELECT * FROM cards WHERE state = 'review' AND due <= ? ORDER BY due, id LIMIT 1`
    ),
    nextNew: db.prepare(`SELECT * FROM cards WHERE state = 'new' ORDER BY created_at, id LIMIT 1`),
    nextDueAt: db.prepare(`SELECT MIN(due) AS t FROM cards WHERE state != 'new'`),

    learningCount: db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE ${LEARNING} AND due < ?`),
    reviewCount: db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE state = 'review' AND due <= ?`),
    newCount: db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE state = 'new'`),
    total: db.prepare('SELECT COUNT(*) AS n FROM cards'),
    // New cards introduced today = cards whose first-ever review is today.
    newIntroducedSince: db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT MIN(reviewed_at) AS first FROM reviews GROUP BY card_id
      ) WHERE first >= ?`),
    reviewedSince: db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at >= ?'),
    reviewTimesSince: db.prepare('SELECT reviewed_at FROM reviews WHERE reviewed_at >= ?'),

    getCard: db.prepare('SELECT * FROM cards WHERE id = ?'),
    updateSchedule: db.prepare(`
      UPDATE cards
      SET state = @state, step = @step, interval = @interval, ease = @ease, due = @due,
          reps = @reps, lapses = @lapses
      WHERE id = @id`),
    insertReview: db.prepare('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (?, ?, ?)'),
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
    return {
      learning: stmt.learningCount.get(tomorrow).n,
      due: stmt.reviewCount.get(now).n,
      newToday: Math.min(newLeftToday, newTotal),
      newTotal,
      reviewedToday: stmt.reviewedSince.get(today).n,
      total: stmt.total.get().n,
      streak: streak(now),
    };
  }

  /**
   * Next card, in Anki's order: learning cards that are due, then reviews,
   * then new cards within the daily limit, then learning cards a bit early.
   */
  function next(now = Date.now()) {
    const s = stats(now);
    const card =
      stmt.nextLearning.get(now) ??
      stmt.nextReview.get(now) ??
      (s.newToday > 0 ? stmt.nextNew.get() : undefined) ??
      stmt.nextLearning.get(now + LEARN_AHEAD) ??
      null;

    return {
      card,
      previews: card ? scheduler.previews(card, now) : null,
      stats: s,
      nextDue: card ? null : stmt.nextDueAt.get().t,
    };
  }

  /** Applies a rating; returns false if the card doesn't exist. */
  const answer = db.transaction((cardId, rating, now = Date.now()) => {
    const card = stmt.getCard.get(cardId);
    if (!card) return false;
    const { state, step, interval, ease, due, reps, lapses } = scheduler.schedule(
      card,
      rating,
      now
    );
    stmt.updateSchedule.run({ id: card.id, state, step, interval, ease, due, reps, lapses });
    stmt.insertReview.run(card.id, rating, now);
    return true;
  });

  return { stats, next, answer };
}
