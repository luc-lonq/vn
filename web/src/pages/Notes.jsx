import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, relTime } from '../api.js';
import Markdown from '../components/Markdown.jsx';

const TEMPLATE = `## Vocabulaire

| vietnamien | français |
|---|---|
| xin chào | bonjour |

## Grammaire

-

## Phrases

>
`;

export default function Notes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');

  const loadList = useCallback(() => {
    api(`/notes${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setList);
  }, [q]);

  useEffect(() => { const t = setTimeout(loadList, 150); return () => clearTimeout(t); }, [loadList]);

  const create = async () => {
    const note = await api('/notes', { method: 'POST', body: { title: 'Nouvelle note', content: TEMPLATE } });
    loadList();
    navigate(`/notes/${note.id}?edit=1`);
  };

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-8">
      <aside className="space-y-4">
        <button className="btn-primary w-full" onClick={create}>+ nouvelle note</button>
        <input className="input" placeholder="rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="border-t border-line">
          {list.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`}
                    className={`block py-3 px-2 border-b border-line ${String(n.id) === id ? 'bg-soft' : 'hover:bg-soft'}`}>
                <div className="text-sm truncate">{n.title}</div>
                <div className="text-xs text-muted mt-0.5">{relTime(n.updated_at)}</div>
              </Link>
            </li>
          ))}
          {list.length === 0 && <li className="text-sm text-muted py-4 px-2">aucune note</li>}
        </ul>
      </aside>
      <section className="min-w-0">
        {id ? <NoteView key={id} id={id} onChange={loadList} onDeleted={() => { loadList(); navigate('/notes'); }} />
            : <p className="text-muted text-sm">Sélectionne une note ou crées-en une.</p>}
      </section>
    </div>
  );
}

function NoteView({ id, onChange, onDeleted }) {
  const navigate = useNavigate();
  const [note, setNote] = useState(null);
  const [editing, setEditing] = useState(() => new URLSearchParams(location.search).has('edit'));
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [preview, setPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api(`/notes/${id}`).then((n) => { setNote(n); setDraft({ title: n.title, content: n.content }); });
  }, [id]);

  const dirty = note && (draft.title !== note.title || draft.content !== note.content);

  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const n = await api(`/notes/${id}`, { method: 'PUT', body: draft });
      setNote(n);
      onChange();
    } finally { setSaving(false); }
  }, [dirty, draft, id, onChange]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    };
    const onLeave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave); };
  }, [editing, save, dirty]);

  if (!note) return null;

  const remove = async () => {
    if (!confirm(`Supprimer « ${note.title} » ?`)) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    onDeleted();
  };

  const done = async () => { await save(); setEditing(false); navigate(`/notes/${id}`, { replace: true }); };
  const cancel = () => { setDraft({ title: note.title, content: note.content }); setEditing(false); };

  if (!editing) {
    return (
      <article>
        <div className="flex items-start gap-4 mb-8">
          <h1 className="text-2xl font-semibold tracking-tight flex-1">{note.title}</h1>
          <button className="btn-secondary" onClick={() => setEditing(true)}>modifier</button>
        </div>
        <Markdown>{note.content}</Markdown>
        <p className="text-xs text-muted mt-12">modifiée {relTime(note.updated_at)}</p>
      </article>
    );
  }

  return (
    <div className="space-y-4">
      <input className="input text-lg font-semibold" value={draft.title} placeholder="titre"
             onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button className="btn-ghost" onClick={() => setPreview((p) => !p)}>{preview ? 'masquer aperçu' : 'aperçu'}</button>
        <button className="btn-ghost" onClick={remove}>supprimer</button>
        <button className="btn-secondary" onClick={cancel}>annuler</button>
        <button className="btn-secondary" onClick={save} disabled={!dirty || saving}>
          {saving ? '…' : dirty ? 'enregistrer' : 'enregistré'}<span className="kbd">ctrl s</span>
        </button>
        <button className="btn-primary" onClick={done}>terminer</button>
      </div>
      <div className={`grid gap-6 ${preview ? 'lg:grid-cols-2' : ''}`}>
        <textarea className="input min-h-[65vh] leading-relaxed resize-y" spellCheck={false}
                  value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
        {preview && (
          <div className="border border-line p-5 min-h-[65vh] overflow-auto">
            <Markdown>{draft.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
