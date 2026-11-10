import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const dayKey = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function dayLabel(t) {
  const today = dayKey(Date.now());
  if (t === today) return 'aujourd\'hui';
  if (t === today - 86400000) return 'hier';
  return new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function History() {
  const [entries, setEntries] = useState([]);
  const [reviews, setReviews] = useState({});
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async (before) => {
    setLoading(true);
    const r = await api(`/history?limit=30${before ? `&before=${before}` : ''}`);
    setEntries((e) => (before ? [...e, ...r.entries] : r.entries));
    setReviews((v) => ({ ...v, ...r.reviewsByDay }));
    setCursor(r.nextBefore); setHasMore(r.hasMore); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const days = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      const k = dayKey(e.updatedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
    for (const k of Object.keys(reviews).map(Number)) if (!map.has(k)) map.set(k, []);
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [entries, reviews]);

  return (
    <div className="max-w-4xl space-y-10">
      {days.map(([day, items]) => <Day key={day} day={day} items={items} reviews={reviews[day]} />)}
      {!loading && days.length === 0 && <p className="text-muted text-sm">Rien pour l'instant — l'historique se remplit au fil de tes modifications.</p>}
      {hasMore && <button className="btn-secondary" disabled={loading} onClick={() => load(cursor)}>charger plus</button>}
    </div>
  );
}

function Day({ day, items, reviews }) {
  const added = items.reduce((s, e) => s + e.added, 0);
  const removed = items.reduce((s, e) => s + e.removed, 0);
  const count = (type) => items.filter((e) => e.type === type).length;

  // résumé automatique de la journée
  const parts = [];
  if (reviews) parts.push(`${reviews.total} révision${reviews.total > 1 ? 's' : ''}${reviews.again ? ` (${reviews.again} oubli${reviews.again > 1 ? 's' : ''})` : ''}`);
  const nNotes = count('note');
  if (nNotes) parts.push(`${nNotes} note${nNotes > 1 ? 's' : ''} touchée${nNotes > 1 ? 's' : ''}`);
  const nCards = count('card');
  if (nCards) parts.push(`${nCards} carte${nCards > 1 ? 's' : ''} modifiée${nCards > 1 ? 's' : ''}`);
  const imported = items.filter((e) => e.type === 'import').reduce((s, e) => s + e.added, 0);
  if (imported) parts.push(`${imported} carte${imported > 1 ? 's' : ''} importée${imported > 1 ? 's' : ''}`);

  return (
    <section>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-fg pb-2 mb-4">
        <h2 className="font-semibold">{dayLabel(day)}</h2>
        <span className="text-xs text-muted">{parts.join(' · ')}</span>
        {(added > 0 || removed > 0) && <Counts added={added} removed={removed} className="ml-auto" />}
      </header>
      <div className="space-y-3">
        {items.map((e) => <Entry key={e.id} e={e} />)}
      </div>
    </section>
  );
}

function Counts({ added, removed, className = '' }) {
  const total = added + removed;
  const blocks = 5;
  const plus = total ? Math.round((added / total) * blocks) : 0;
  return (
    <span className={`text-xs flex items-center gap-2 ${className}`}>
      <span>+{added}</span>
      <span className="text-muted">−{removed}</span>
      <span className="flex gap-px">
        {Array.from({ length: blocks }, (_, i) => (
          <span key={i} className={`w-2 h-2 ${i < plus ? 'bg-fg' : 'border border-muted'}`} />
        ))}
      </span>
    </span>
  );
}

function Entry({ e }) {
  const lineCount = e.hunks.reduce((s, h) => s + h.lines.length, 0);
  const [open, setOpen] = useState(lineCount <= 14);
  const time = new Date(e.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const target = e.type === 'note' && e.action !== 'delete' ? `/notes/${e.entityId}` : null;

  return (
    <div className="border border-line">
      <button className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-soft" onClick={() => setOpen((o) => !o)}>
        <span className="text-muted w-3">{open ? '▾' : '▸'}</span>
        <span className="flex-1 truncate">{e.summary}</span>
        <Counts added={e.added} removed={e.removed} />
        <span className="text-xs text-muted tabular-nums">{time}</span>
      </button>
      {open && (
        <div className="border-t border-line">
          <Diff hunks={e.hunks} />
          {target && <div className="px-3 py-2 border-t border-line text-xs"><Link to={target} className="text-muted hover:text-fg">ouvrir la note →</Link></div>}
        </div>
      )}
    </div>
  );
}

function Diff({ hunks }) {
  return (
    <div className="text-xs overflow-x-auto">
      {hunks.map((h, i) => {
        let oldN = h.oldStart, newN = h.newStart;
        return (
          <div key={i}>
            <div className="px-3 py-1 text-muted bg-soft">@@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@</div>
            <table className="w-full border-collapse">
              <tbody>
                {h.lines.map((l, j) => {
                  const sign = l[0];
                  const text = l.slice(1);
                  const o = sign === '+' ? '' : oldN++;
                  const n = sign === '-' ? '' : newN++;
                  const cls = sign === '+' ? 'bg-fg/12' : sign === '-' ? 'text-muted line-through decoration-muted/60' : '';
                  return (
                    <tr key={j} className={cls}>
                      <td className="select-none text-right text-muted px-2 w-10 tabular-nums">{o}</td>
                      <td className="select-none text-right text-muted px-2 w-10 tabular-nums border-r border-line">{n}</td>
                      <td className="select-none px-2 w-4">{sign === ' ' ? '' : sign === '-' ? '−' : '+'}</td>
                      <td className="whitespace-pre pr-4 py-px">{text || ' '}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
