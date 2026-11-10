import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, speak } from '../api.js';

const tab = ({ isActive }) =>
  `px-3 py-1.5 text-sm border ${isActive ? 'border-fg' : 'border-transparent text-muted hover:text-fg'}`;

export default function Vocab() {
  const [stats, setStats] = useState(null);
  const refreshStats = useCallback(() => api('/stats').then(setStats), []);
  useEffect(() => { refreshStats(); }, [refreshStats]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <NavLink end to="/vocab" className={tab}>réviser</NavLink>
        <NavLink to="/vocab/cartes" className={tab}>cartes</NavLink>
        <NavLink to="/vocab/importer" className={tab}>importer</NavLink>
        {stats && (
          <div className="ml-auto flex gap-5 text-xs text-muted">
            <Stat n={stats.due} label="à revoir" />
            <Stat n={stats.newToday} label="nouvelles" />
            <Stat n={stats.reviewedToday} label="aujourd'hui" />
            <Stat n={stats.streak} label={stats.streak > 1 ? 'jours de suite' : 'jour de suite'} />
            <Stat n={stats.total} label="cartes" />
          </div>
        )}
      </div>
      <Routes>
        <Route index element={<Review onStats={setStats} />} />
        <Route path="cartes" element={<Cards onChange={refreshStats} />} />
        <Route path="importer" element={<Import onChange={refreshStats} />} />
      </Routes>
    </div>
  );
}

const Stat = ({ n, label }) => (
  <span><span className="text-fg text-sm tabular-nums">{n}</span> {label}</span>
);

// ---------------------------------------------------------------- Révision
const RATINGS = [
  { r: 1, label: 'à revoir' },
  { r: 2, label: 'difficile' },
  { r: 3, label: 'bien' },
  { r: 4, label: 'facile' },
];

function Review({ onStats }) {
  const [data, setData] = useState(null);
  const [shown, setShown] = useState(false);
  const [reverse, setReverse] = useState(() => { try { return localStorage.getItem('reverse') === '1'; } catch { return false; } });

  const next = useCallback(async () => {
    const d = await api('/review/next');
    setData(d); setShown(false); onStats(d.stats);
  }, [onStats]);

  useEffect(() => { next(); }, [next]);
  useEffect(() => { try { localStorage.setItem('reverse', reverse ? '1' : '0'); } catch {} }, [reverse]);

  const card = data?.card;

  const rate = useCallback(async (rating) => {
    if (!card) return;
    await api(`/review/${card.id}`, { method: 'POST', body: { rating } });
    next();
  }, [card, next]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea') || !card) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true); if (reverse) speak(card.front); }
      else if (shown && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key));
      else if (shown && e.key === ' ') { e.preventDefault(); rate(3); }
      else if (e.key === 'v') speak(card.front);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, shown, rate, reverse]);

  if (!data) return null;

  if (!card) {
    const empty = data.stats.total === 0;
    return (
      <div className="border border-line py-20 text-center space-y-3">
        <p className="text-lg">{empty ? 'Aucune carte pour l\'instant.' : 'Terminé pour le moment. Giỏi lắm !'}</p>
        <p className="text-sm text-muted">
          {empty ? 'Ajoute des mots dans « cartes » ou « importer ».'
                 : data.nextDue ? `Prochaine révision ${new Date(data.nextDue).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.` : ''}
        </p>
        {!empty && data.nextDue && data.nextDue - Date.now() < 15 * 60000 && (
          <button className="btn-secondary mt-4" onClick={next}>actualiser</button>
        )}
      </div>
    );
  }

  const question = reverse ? card.back : card.front;
  const answer = reverse ? card.front : card.back;
  const isNew = card.reps === 0 && card.lapses === 0 && card.interval === 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center text-xs text-muted mb-3">
        <span>{isNew ? 'nouvelle' : card.lapses ? `oubliée ${card.lapses}×` : `intervalle ${card.interval} j`}</span>
        <button className="hover:text-fg" onClick={() => setReverse((r) => !r)}>
          sens : {reverse ? 'fr → vi' : 'vi → fr'}
        </button>
      </div>
      <div className="border border-fg min-h-80 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-3">
          <div className="text-3xl md:text-4xl">{question}</div>
          {!reverse && (
            <button className="text-xs text-muted hover:text-fg" onClick={() => speak(card.front)}>▶ écouter <span className="kbd">v</span></button>
          )}
        </div>
        {shown && (
          <div className="border-t border-line px-6 py-10 text-center space-y-3">
            <div className="text-2xl">{answer}</div>
            {reverse && (
              <button className="text-xs text-muted hover:text-fg" onClick={() => speak(card.front)}>▶ écouter <span className="kbd">v</span></button>
            )}
            {card.example && <p className="text-sm text-muted italic">{card.example}</p>}
            {card.tags && <p className="text-xs text-muted">#{card.tags.split(/[\s,]+/).filter(Boolean).join(' #')}</p>}
          </div>
        )}
      </div>
      <div className="mt-4">
        {!shown ? (
          <button className="btn-primary w-full py-3" onClick={() => setShown(true)}>
            afficher la réponse <span className="text-[10px] opacity-60">espace</span>
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map(({ r, label }) => (
              <button key={r} className={`${r === 3 ? 'btn-primary' : 'btn-secondary'} flex-col py-3 gap-0.5`} onClick={() => rate(r)}>
                <span>{label}</span>
                <span className="text-[11px] opacity-60">{data.previews[r - 1]} · {r}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Cartes
const EMPTY = { front: '', back: '', example: '', tags: '' };

function CardForm({ initial = EMPTY, onSubmit, onCancel, submitLabel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(f);
      if (initial === EMPTY) setF(EMPTY);
      e.target.querySelector('input')?.focus();
    } catch (err) { setError(err.message); }
  };

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
      <div><label className="label">vietnamien</label><input className="input text-base" value={f.front} onChange={set('front')} autoFocus={initial !== EMPTY} /></div>
      <div><label className="label">français</label><input className="input text-base" value={f.back} onChange={set('back')} /></div>
      <div><label className="label">exemple (optionnel)</label><input className="input" value={f.example} onChange={set('example')} /></div>
      <div><label className="label">tags (optionnel)</label><input className="input" value={f.tags} onChange={set('tags')} placeholder="nourriture, leçon-3" /></div>
      <div className="md:col-span-2 flex items-center gap-2 justify-end">
        {error && <span className="text-sm mr-auto">{error}</span>}
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>annuler</button>}
        <button className="btn-primary" disabled={!f.front.trim() || !f.back.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

function Cards({ onChange }) {
  const [cards, setCards] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api(`/cards${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setCards), [q]);
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [load]);

  const create = async (f) => { await api('/cards', { method: 'POST', body: f }); load(); onChange(); };
  const update = async (f) => { await api(`/cards/${editing}`, { method: 'PUT', body: f }); setEditing(null); load(); };
  const remove = async (c) => {
    if (!confirm(`Supprimer « ${c.front} » ?`)) return;
    await api(`/cards/${c.id}`, { method: 'DELETE' });
    setEditing(null); load(); onChange();
  };

  const status = (c) => {
    if (c.reps === 0 && c.lapses === 0 && c.interval === 0) return 'nouvelle';
    if (c.due <= Date.now()) return 'à revoir';
    const ms = c.due - Date.now();
    if (ms < 3600000) return `dans ${Math.ceil(ms / 60000)} min`;
    if (ms < 86400000) return `dans ${Math.round(ms / 3600000)} h`;
    return `dans ${Math.round(ms / 86400000)} j`;
  };

  return (
    <div className="space-y-10">
      <section className="border border-line p-5">
        <h2 className="label mb-4">nouvelle carte</h2>
        <CardForm onSubmit={create} submitLabel="ajouter" />
      </section>

      <section>
        <div className="flex items-center gap-3 mb-3">
          <input className="input max-w-xs" placeholder="rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="text-xs text-muted">{cards.length} carte{cards.length > 1 ? 's' : ''}</span>
        </div>
        <div className="border-t border-line">
          {cards.map((c) => editing === c.id ? (
            <div key={c.id} className="border-b border-line py-4 px-2 bg-soft">
              <CardForm initial={{ front: c.front, back: c.back, example: c.example, tags: c.tags }}
                        onSubmit={update} onCancel={() => setEditing(null)} submitLabel="enregistrer" />
              <button className="btn-ghost mt-2 -ml-2" onClick={() => remove(c)}>supprimer cette carte</button>
            </div>
          ) : (
            <button key={c.id} onClick={() => setEditing(c.id)}
                    className="w-full text-left grid grid-cols-[1fr_1fr_6rem] gap-4 items-baseline py-3 px-2 border-b border-line hover:bg-soft">
              <span className="truncate">{c.front}</span>
              <span className="truncate text-muted">{c.back}</span>
              <span className="text-xs text-muted whitespace-nowrap text-right">{status(c)}</span>
            </button>
          ))}
          {cards.length === 0 && <p className="text-sm text-muted py-6 px-2">aucune carte</p>}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Import
function Import({ onChange }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [result, setResult] = useState(null);

  const lines = text.split('\n').filter((l) => l.trim()).length;

  const submit = async () => {
    const r = await api('/cards/import', { method: 'POST', body: { text, tags } });
    setResult(r);
    if (r.imported) { setText(''); onChange(); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted">
        Une carte par ligne : <code className="text-fg">vietnamien ; français ; exemple</code>. Séparateurs acceptés : <code className="text-fg">;</code> <code className="text-fg">|</code> ou tabulation (copier-coller depuis un tableur fonctionne).
      </p>
      <textarea className="input min-h-72 leading-relaxed" spellCheck={false} value={text}
                onChange={(e) => { setText(e.target.value); setResult(null); }}
                placeholder={'cảm ơn ; merci\nnước ; eau ; Tôi muốn uống nước.\nbao nhiêu ; combien'} />
      <div className="flex items-end gap-3">
        <div className="flex-1"><label className="label">tags pour tout l'import</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="leçon-1" /></div>
        <button className="btn-primary" disabled={!lines} onClick={submit}>importer {lines || ''} ligne{lines > 1 ? 's' : ''}</button>
      </div>
      {result && (
        <p className="text-sm border border-line px-3 py-2">
          {result.imported} carte{result.imported > 1 ? 's' : ''} importée{result.imported > 1 ? 's' : ''}
          {result.skipped ? ` · ${result.skipped} ligne${result.skipped > 1 ? 's' : ''} ignorée${result.skipped > 1 ? 's' : ''} (format invalide)` : ''}
        </p>
      )}
    </div>
  );
}

