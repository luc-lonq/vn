import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSearch } from '../../hooks/useSearch.js';
import { api } from '../../lib/api.js';
import { relativeTime } from '../../lib/format.js';
import NoteView from './NoteView.jsx';
import { NEW_NOTE_TEMPLATE } from './template.js';

export default function NotesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { query, setQuery, results: notes, reload } = useSearch('/notes');

  const create = async () => {
    const note = await api('/notes', {
      method: 'POST',
      body: { title: 'Nouvelle note', content: NEW_NOTE_TEMPLATE },
    });
    reload();
    navigate(`/notes/${note.id}?edit=1`);
  };

  const onDeleted = () => {
    reload();
    navigate('/notes');
  };

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-8">
      <aside className="space-y-4">
        <button className="btn-primary w-full" onClick={create}>
          + nouvelle note
        </button>
        <input
          className="input"
          placeholder="rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="border-t border-line">
          {notes.map((n) => (
            <li key={n.id}>
              <Link
                to={`/notes/${n.id}`}
                className={`block py-3 px-2 border-b border-line ${
                  String(n.id) === id ? 'bg-soft' : 'hover:bg-soft'
                }`}
              >
                <div className="text-sm truncate">{n.title}</div>
                <div className="text-xs text-muted mt-0.5">{relativeTime(n.updated_at)}</div>
              </Link>
            </li>
          ))}
          {notes.length === 0 && <li className="text-sm text-muted py-4 px-2">aucune note</li>}
        </ul>
      </aside>

      <section className="min-w-0">
        {id ? (
          <NoteView key={id} id={id} onChange={reload} onDeleted={onDeleted} />
        ) : (
          <p className="text-muted text-sm">Sélectionne une note ou crées-en une.</p>
        )}
      </section>
    </div>
  );
}
