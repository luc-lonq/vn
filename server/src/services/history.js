import { structuredPatch } from 'diff';

/**
 * Consecutive edits of the same entity within this window are merged into a
 * single history entry (diff between the first "before" and the latest "after").
 */
export const MERGE_WINDOW = 30 * 60 * 1000;

function patch(before, after, context) {
  return structuredPatch('a', 'b', before, after, '', '', { context });
}

export function countChanges(before, after) {
  let added = 0;
  let removed = 0;
  for (const hunk of patch(before, after, 0).hunks) {
    for (const line of hunk.lines) {
      if (line[0] === '+') added++;
      else if (line[0] === '-') removed++;
    }
  }
  return { added, removed };
}

/** Unified-diff hunks; each line is prefixed with '+', '-' or ' '. */
export function hunks(before, after, context = 3) {
  return patch(before, after, context).hunks.map((h) => ({
    oldStart: h.oldStart,
    oldLines: h.oldLines,
    newStart: h.newStart,
    newLines: h.newLines,
    lines: h.lines.filter((l) => !l.startsWith('\\')), // drop "\ No newline at end of file"
  }));
}

/** Text snapshot of a note, used for diffs. */
export const noteText = (note) => `# ${note.title}\n\n${note.content}`;

/** Text snapshot of a card, one field per line, used for diffs. */
export function cardText(card) {
  return (
    [
      `vi: ${card.front}`,
      `fr: ${card.back}`,
      card.example ? `ex: ${card.example}` : null,
      card.tags ? `tags: ${card.tags}` : null,
    ]
      .filter(Boolean)
      .join('\n') + '\n'
  );
}

export function createHistory(db) {
  const stmt = {
    last: db.prepare(
      'SELECT * FROM history WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1'
    ),
    insert: db.prepare(`
      INSERT INTO history
        (entity_type, entity_id, action, label, before_text, after_text, added, removed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    merge: db.prepare(
      'UPDATE history SET label = ?, after_text = ?, added = ?, removed = ?, updated_at = ? WHERE id = ?'
    ),
    remove: db.prepare('DELETE FROM history WHERE id = ?'),
  };

  /** Records a change. `update`s are merged into a recent entry for the same entity. */
  function record({ type, id = null, action, label, before = '', after = '', now = Date.now() }) {
    if (action === 'update') {
      const last = stmt.last.get(type, id);
      const mergeable =
        last &&
        (last.action === 'update' || last.action === 'create') &&
        now - last.updated_at < MERGE_WINDOW;

      if (mergeable) {
        // Edits that bring the entity back to its original state cancel out.
        if (last.action === 'update' && last.before_text === after) {
          stmt.remove.run(last.id);
          return;
        }
        const { added, removed } = countChanges(last.before_text, after);
        stmt.merge.run(label, after, added, removed, now, last.id);
        return;
      }
      if (before === after) return;
    }

    const { added, removed } = countChanges(before, after);
    stmt.insert.run(type, id, action, label, before, after, added, removed, now, now);
  }

  return { record };
}

/** One-line description of a history entry (French, shown in the UI). */
export function summarize(row) {
  if (row.action === 'import') {
    return `Import de ${row.added} carte${row.added > 1 ? 's' : ''}`;
  }
  const kind = { note: 'Note', card: 'Carte' }[row.entity_type] ?? row.entity_type;
  const verb =
    { create: 'créée', update: 'modifiée', delete: 'supprimée' }[row.action] ?? row.action;
  return `${kind} ${verb} — ${row.label}`;
}
