import { useCallback, useEffect, useState } from 'react';
import Markdown from '../../components/Markdown.jsx';
import { useKeyboard } from '../../hooks/useKeyboard.js';

export default function NoteEditor({ note, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState({ title: note.title, content: note.content });
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  const dirty = draft.title !== note.title || draft.content !== note.content;

  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, onSave]);

  useKeyboard(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    },
    { includeInputs: true }
  );

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const finish = async () => {
    await save();
    onClose();
  };

  const cancel = () => {
    if (dirty && !confirm('Abandonner les modifications ?')) return;
    onClose();
  };

  const update = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });

  return (
    <div className="space-y-4">
      <input
        className="input text-lg font-semibold"
        placeholder="titre"
        value={draft.title}
        onChange={update('title')}
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button className="btn-ghost" onClick={() => setShowPreview((p) => !p)}>
          {showPreview ? 'masquer aperçu' : 'aperçu'}
        </button>
        <button className="btn-ghost" onClick={onDelete}>
          supprimer
        </button>
        <button className="btn-secondary" onClick={cancel}>
          annuler
        </button>
        <button className="btn-secondary" onClick={save} disabled={!dirty || saving}>
          {saving ? '…' : dirty ? 'enregistrer' : 'enregistré'}
          <span className="kbd">ctrl s</span>
        </button>
        <button className="btn-primary" onClick={finish}>
          terminer
        </button>
      </div>

      <div className={`grid gap-6 ${showPreview ? 'lg:grid-cols-2' : ''}`}>
        <textarea
          className="input min-h-[65vh] leading-relaxed resize-y"
          spellCheck={false}
          value={draft.content}
          onChange={update('content')}
        />
        {showPreview && (
          <div className="border border-line p-5 min-h-[65vh] overflow-auto">
            <Markdown>{draft.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
