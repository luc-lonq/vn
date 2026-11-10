import { useState } from 'react';
import { Link } from 'react-router-dom';
import ChangeCounts from './ChangeCounts.jsx';
import Diff from './Diff.jsx';

// Diffs up to this many lines are expanded by default.
const AUTO_EXPAND_LINES = 14;

export default function HistoryEntry({ entry }) {
  const lineCount = entry.hunks.reduce((n, h) => n + h.lines.length, 0);
  const [open, setOpen] = useState(lineCount <= AUTO_EXPAND_LINES);

  const time = new Date(entry.updatedAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const noteLink =
    entry.type === 'note' && entry.action !== 'delete' ? `/notes/${entry.entityId}` : null;

  return (
    <div className="border border-line">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-soft"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted w-3">{open ? '▾' : '▸'}</span>
        <span className="flex-1 truncate">{entry.summary}</span>
        <ChangeCounts added={entry.added} removed={entry.removed} />
        <span className="text-xs text-muted tabular-nums">{time}</span>
      </button>

      {open && (
        <div className="border-t border-line">
          <Diff hunks={entry.hunks} />
          {noteLink && (
            <div className="px-3 py-2 border-t border-line text-xs">
              <Link to={noteLink} className="text-muted hover:text-fg">
                ouvrir la note →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
