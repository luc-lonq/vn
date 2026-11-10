import { DAY, HOUR, startOfDay } from '../utils/time.js';
import { previews, schedule } from './srs.js';

// A card is "new" until it has been reviewed at least once.
const IS_SEEN = 'EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id)';

export function createReviewService(db, { newCardsPerDay }) {
  const stmt = {
    newIntroducedSince: db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT MIN(reviewed_at) AS first FROM reviews GROUP BY card_id
      ) WHERE first >= ?`),
    dueCount: db.prepare(`SELECT COUNT(*) AS n FROM cards c WHERE due <= ? AND ${IS_SEEN}`),
    newCount: db.prepare(`SELECT COUNT(*) AS n FROM cards c WHERE NOT ${IS_SEEN}`),
    reviewedSince: db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at >= ?'),
    total: db.prepare('SELECT COUNT(*) AS n FROM cards'),
    reviewTimesSince: db.prepare('SELECT reviewed_at FROM reviews WHERE reviewed_at >= ?'),
    nextDueCard: db.prepare(
      `SELECT * FROM cards c WHERE due <= ? AND ${IS_SEEN} ORDER BY due LIMIT 1`
    ),
    nextNewCard: db.prepare(
      `SELECT * FROM cards c WHERE NOT ${IS_SEEN} ORDER BY created_at, id LIMIT 1`
    ),
    nextDueAt: db.prepare(`SELECT MIN(due) AS t FROM cards c WHERE ${IS_SEEN}`),
    getCard: db.prepare('SELECT * FROM cards WHERE id = ?'),
    updateSchedule: db.prepare(
      'UPDATE cards SET interval = ?, ease = ?, reps = ?, lapses = ?, due = ? WHERE id = ?'
    ),
    insertReview: db.prepare('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (?, ?, ?)'),
  };

  /** Number of consecutive days (ending today or yesterday) with at least one review. */
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
    const today = startOfDay(now);
    const newLeftToday = Math.max(0, newCardsPerDay - stmt.newIntroducedSince.get(today).n);
    const newTotal = stmt.newCount.get().n;
    return {
      due: stmt.dueCount.get(now).n,
      newToday: Math.min(newLeftToday, newTotal),
      newTotal,
      reviewedToday: stmt.reviewedSince.get(today).n,
      total: stmt.total.get().n,
      streak: streak(now),
    };
  }

  /** Next card to review: due cards first, then new cards within the daily limit. */
  function next(now = Date.now()) {
    const s = stats(now);
    const card = stmt.nextDueCard.get(now) ?? (s.newToday > 0 ? stmt.nextNewCard.get() : null);
    return {
      card: card ?? null,
      previews: card ? previews(card, now) : null,
      stats: s,
      nextDue: card ? null : stmt.nextDueAt.get().t,
    };
  }

  /** Applies a rating; returns false if the card doesn't exist. */
  const answer = db.transaction((cardId, rating, now = Date.now()) => {
    const card = stmt.getCard.get(cardId);
    if (!card) return false;
    const s = schedule(card, rating, now);
    stmt.updateSchedule.run(s.interval, s.ease, s.reps, s.lapses, s.due, card.id);
    stmt.insertReview.run(card.id, rating, now);
    return true;
  });

  return { stats, next, answer };
}
