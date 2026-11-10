import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { startOfDay } from '../../lib/format.js';
import DayGroup from './DayGroup.jsx';

const PAGE_SIZE = 30;

/** Groups entries by local day, including days that only have reviews. */
function groupByDay(entries, reviewsByDay) {
  const days = new Map();
  for (const entry of entries) {
    const day = startOfDay(entry.updatedAt);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(entry);
  }
  for (const day of Object.keys(reviewsByDay).map(Number)) {
    if (!days.has(day)) days.set(day, []);
  }
  return [...days.entries()].sort(([a], [b]) => b - a);
}

export default function HistoryPage() {
  const [entries, setEntries] = useState([]);
  const [reviewsByDay, setReviewsByDay] = useState({});
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async (before) => {
    setLoading(true);
    const page = await api(`/history?limit=${PAGE_SIZE}${before ? `&before=${before}` : ''}`);
    setEntries((prev) => (before ? [...prev, ...page.entries] : page.entries));
    setReviewsByDay((prev) => ({ ...prev, ...page.reviewsByDay }));
    setCursor(page.nextBefore);
    setHasMore(page.hasMore);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const days = useMemo(() => groupByDay(entries, reviewsByDay), [entries, reviewsByDay]);

  return (
    <div className="max-w-4xl space-y-10">
      {days.map(([day, items]) => (
        <DayGroup key={day} day={day} entries={items} reviews={reviewsByDay[day]} />
      ))}
      {!loading && days.length === 0 && (
        <p className="text-muted text-sm">
          Rien pour l'instant — l'historique se remplit au fil de tes modifications.
        </p>
      )}
      {hasMore && (
        <button className="btn-secondary" disabled={loading} onClick={() => loadPage(cursor)}>
          charger plus
        </button>
      )}
    </div>
  );
}
