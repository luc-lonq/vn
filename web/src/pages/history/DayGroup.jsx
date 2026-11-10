import { DAY, plural, startOfDay } from '../../lib/format.js';
import ChangeCounts from './ChangeCounts.jsx';
import HistoryEntry from './HistoryEntry.jsx';

function dayLabel(day) {
  const today = startOfDay(Date.now());
  if (day === today) return "aujourd'hui";
  if (day === startOfDay(today - DAY / 2)) return 'hier';
  return new Date(day).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** Auto-generated one-line summary of a day's activity. */
function summarizeDay(entries, reviews) {
  const parts = [];
  const count = (type) => entries.filter((e) => e.type === type).length;

  if (reviews) {
    const forgotten = reviews.again ? ` (${reviews.again} ${plural(reviews.again, 'oubli')})` : '';
    parts.push(`${reviews.total} ${plural(reviews.total, 'révision')}${forgotten}`);
  }
  const notes = count('note');
  if (notes) parts.push(`${notes} ${plural(notes, 'note')} ${plural(notes, 'touchée')}`);
  const cards = count('card');
  if (cards) parts.push(`${cards} ${plural(cards, 'carte')} ${plural(cards, 'modifiée')}`);
  const imported = entries.filter((e) => e.type === 'import').reduce((n, e) => n + e.added, 0);
  if (imported) {
    parts.push(`${imported} ${plural(imported, 'carte')} ${plural(imported, 'importée')}`);
  }
  return parts.join(' · ');
}

export default function DayGroup({ day, entries, reviews }) {
  const added = entries.reduce((n, e) => n + e.added, 0);
  const removed = entries.reduce((n, e) => n + e.removed, 0);

  return (
    <section>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-fg pb-2 mb-4">
        <h2 className="font-semibold">{dayLabel(day)}</h2>
        <span className="text-xs text-muted">{summarizeDay(entries, reviews)}</span>
        {(added > 0 || removed > 0) && (
          <ChangeCounts added={added} removed={removed} className="ml-auto" />
        )}
      </header>
      <div className="space-y-3">
        {entries.map((entry) => (
          <HistoryEntry key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
