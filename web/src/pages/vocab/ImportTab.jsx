import { useState } from 'react';
import { api } from '../../lib/api.js';
import { plural } from '../../lib/format.js';

const PLACEHOLDER = 'cảm ơn ; merci\nnước ; eau ; Tôi muốn uống nước.\nbao nhiêu ; combien';

export default function ImportTab({ onChange }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [result, setResult] = useState(null);

  const lineCount = text.split('\n').filter((l) => l.trim()).length;

  const submit = async () => {
    const res = await api('/cards/import', { method: 'POST', body: { text, tags } });
    setResult(res);
    if (res.imported) {
      setText('');
      onChange();
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted">
        Une carte par ligne : <code className="text-fg">vietnamien ; français ; exemple</code>.
        Séparateurs acceptés : <code className="text-fg">;</code> <code className="text-fg">|</code>{' '}
        ou tabulation (copier-coller depuis un tableur fonctionne).
      </p>

      <textarea
        className="input min-h-72 leading-relaxed"
        spellCheck={false}
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult(null);
        }}
      />

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="label" htmlFor="import-tags">
            tags pour tout l'import
          </label>
          <input
            id="import-tags"
            className="input"
            placeholder="leçon-1"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={!lineCount} onClick={submit}>
          importer {lineCount || ''} {plural(lineCount, 'ligne')}
        </button>
      </div>

      {result && <ImportResult {...result} />}
    </div>
  );
}

function ImportResult({ imported, skipped }) {
  return (
    <p className="text-sm border border-line px-3 py-2">
      {imported} {plural(imported, 'carte')} {plural(imported, 'importée')}
      {skipped > 0 &&
        ` · ${skipped} ${plural(skipped, 'ligne')} ${plural(skipped, 'ignorée')} (format invalide)`}
    </p>
  );
}
