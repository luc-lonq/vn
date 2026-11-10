import { structuredPatch } from 'diff';
import { db } from './db.js';

// Les modifications successives d'un même élément dans cette fenêtre
// sont fusionnées en une seule entrée (diff entre l'état initial et l'état final).
const MERGE_WINDOW = 30 * 60 * 1000;

export function countChanges(before, after) {
  const patch = structuredPatch('a', 'b', before, after, '', '', { context: 0 });
  let added = 0, removed = 0;
  for (const h of patch.hunks) for (const l of h.lines) {
    if (l[0] === '+') added++;
    else if (l[0] === '-') removed++;
  }
  return { added, removed };
}

export function hunks(before, after, context = 3) {
  const patch = structuredPatch('a', 'b', before, after, '', '', { context });
  return patch.hunks.map((h) => ({
    oldStart: h.oldStart, oldLines: h.oldLines, newStart: h.newStart, newLines: h.newLines,
    lines: h.lines.filter((l) => !l.startsWith('\\')),
  }));
}

export function record({ type, id, action, label, before = '', after = '' }) {
  const now = Date.now();

  if (action === 'update') {
    const last = db.prepare(
      `SELECT * FROM history WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1`
    ).get(type, id);
    if (last && (last.action === 'update' || last.action === 'create') && now - last.updated_at < MERGE_WINDOW) {
      const base = last.before_text;
      const { added, removed } = countChanges(base, after);
      if (last.action === 'update' && base === after) {
        // revenu à l'état initial : l'entrée n'a plus de sens
        db.prepare('DELETE FROM history WHERE id = ?').run(last.id);
        return;
      }
      db.prepare(
        `UPDATE history SET label = ?, after_text = ?, added = ?, removed = ?, updated_at = ? WHERE id = ?`
      ).run(label, after, added, removed, now, last.id);
      return;
    }
    if (before === after) return;
  }

  const { added, removed } = countChanges(before, after);
  db.prepare(
    `INSERT INTO history (entity_type, entity_id, action, label, before_text, after_text, added, removed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(type, id ?? null, action, label, before, after, added, removed, now, now);
}

// Représentation texte d'une carte pour le diff
export function cardText(c) {
  return [
    `vi: ${c.front}`,
    `fr: ${c.back}`,
    c.example ? `ex: ${c.example}` : null,
    c.tags ? `tags: ${c.tags}` : null,
  ].filter(Boolean).join('\n') + '\n';
}

export function summarize(row) {
  const kind = { note: 'Note', card: 'Carte', import: 'Import' }[row.entity_type] || row.entity_type;
  const verb = { create: 'créée', update: 'modifiée', delete: 'supprimée', import: '' }[row.action] ?? row.action;
  if (row.action === 'import') return `Import de ${row.added} carte${row.added > 1 ? 's' : ''}`;
  return `${kind} ${verb} — ${row.label}`;
}
