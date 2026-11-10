import { Router } from 'express';
import { hunks, summarize } from '../services/history.js';
import { Rating } from '../services/srs.js';
import { DAY, startOfDay } from '../utils/time.js';

const DEFAULT_PAGE = 30;
const MAX_PAGE = 100;

const toEntry = (row) => ({
  id: row.id,
  type: row.entity_type,
  entityId: row.entity_id,
  action: row.action,
  label: row.label,
  summary: summarize(row),
  added: row.added,
  removed: row.removed,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  hunks: hunks(row.before_text, row.after_text),
});

export function historyRouter(db) {
  const stmt = {
    page: db.prepare('SELECT * FROM history WHERE updated_at < ? ORDER BY updated_at DESC LIMIT ?'),
    reviews: db.prepare(
      'SELECT reviewed_at, rating FROM reviews WHERE reviewed_at >= ? AND reviewed_at < ?'
    ),
  };

  /** Review counts per day (local midnight → { total, again }). */
  function reviewsByDay(from, to) {
    const days = {};
    for (const r of stmt.reviews.all(from, to)) {
      const day = (days[startOfDay(r.reviewed_at)] ??= { total: 0, again: 0 });
      day.total++;
      if (r.rating === Rating.AGAIN) day.again++;
    }
    return days;
  }

  return Router().get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_PAGE, MAX_PAGE);
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const rows = stmt.page.all(before, limit);

    // Cover the same date range as the page, or the last 30 days if it's empty.
    const from = rows.length ? startOfDay(rows.at(-1).updated_at) : startOfDay() - 30 * DAY;

    res.json({
      entries: rows.map(toEntry),
      reviewsByDay: reviewsByDay(from, before),
      hasMore: rows.length === limit,
      nextBefore: rows.at(-1)?.updated_at ?? null,
    });
  });
}
