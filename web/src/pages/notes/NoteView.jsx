import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Markdown from '../../components/Markdown.jsx';
import { api } from '../../lib/api.js';
import { relativeTime } from '../../lib/format.js';
import NoteEditor from './NoteEditor.jsx';

/** Shows a note, or its editor when `?edit` is in the URL or "modifier" is clicked. */
export default function NoteView({ id, onChange, onDeleted }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [note, setNote] = useState(null);
  const [editing, setEditing] = useState(params.has('edit'));

  useEffect(() => {
    api(`/notes/${id}`).then(setNote);
  }, [id]);

  const save = useCallback(
    async (draft) => {
      const saved = await api(`/notes/${id}`, { method: 'PUT', body: draft });
      setNote(saved);
      onChange();
    },
    [id, onChange]
  );

  const remove = async () => {
    if (!confirm(`Supprimer « ${note.title} » ?`)) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    onDeleted();
  };

  const closeEditor = () => {
    setEditing(false);
    navigate(`/notes/${id}`, { replace: true });
  };

  if (!note) return null;

  if (editing) {
    return <NoteEditor note={note} onSave={save} onDelete={remove} onClose={closeEditor} />;
  }

  return (
    <article>
      <div className="flex items-start gap-4 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight flex-1">{note.title}</h1>
        <button className="btn-secondary" onClick={() => setEditing(true)}>
          modifier
        </button>
      </div>
      <Markdown>{note.content}</Markdown>
      <p className="text-xs text-muted mt-12">modifiée {relativeTime(note.updated_at)}</p>
    </article>
  );
}
