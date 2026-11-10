import { Router } from 'express';
import { noteText } from '../services/history.js';
import { likePattern, notFound, text } from '../utils/input.js';

const LIST_COLUMNS = 'id, title, updated_at, substr(content, 1, 160) AS excerpt';

export function notesRouter(db, history) {
  const stmt = {
    list: db.prepare(`SELECT ${LIST_COLUMNS} FROM notes ORDER BY updated_at DESC`),
    search: db.prepare(`
      SELECT ${LIST_COLUMNS} FROM notes
      WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC`),
    get: db.prepare('SELECT * FROM notes WHERE id = ?'),
    insert: db.prepare(
      'INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ),
    update: db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?'),
    remove: db.prepare('DELETE FROM notes WHERE id = ?'),
  };

  const findOr404 = (id) => {
    const note = stmt.get.get(id);
    if (!note) throw notFound('Note');
    return note;
  };
  const readFields = (body, fallback = {}) => ({
    title: text(body.title ?? fallback.title, 200).trim() || 'Sans titre',
    content: text(body.content ?? fallback.content),
  });

  const router = Router();

  router.get('/', (req, res) => {
    const q = text(req.query.q, 200).trim();
    res.json(q ? stmt.search.all(likePattern(q), likePattern(q)) : stmt.list.all());
  });

  router.get('/:id', (req, res) => {
    res.json(findOr404(req.params.id));
  });

  router.post('/', (req, res) => {
    const note = readFields(req.body);
    const now = Date.now();
    const { lastInsertRowid: id } = stmt.insert.run(note.title, note.content, now, now);
    history.record({
      type: 'note',
      id,
      action: 'create',
      label: note.title,
      after: noteText(note),
    });
    res.status(201).json(stmt.get.get(id));
  });

  router.put('/:id', (req, res) => {
    const old = findOr404(req.params.id);
    const note = readFields(req.body, old);
    if (note.title === old.title && note.content === old.content) return res.json(old);

    stmt.update.run(note.title, note.content, Date.now(), old.id);
    history.record({
      type: 'note',
      id: old.id,
      action: 'update',
      label: note.title,
      before: noteText(old),
      after: noteText(note),
    });
    res.json(stmt.get.get(old.id));
  });

  router.delete('/:id', (req, res) => {
    const old = findOr404(req.params.id);
    stmt.remove.run(old.id);
    history.record({
      type: 'note',
      id: old.id,
      action: 'delete',
      label: old.title,
      before: noteText(old),
    });
    res.json({ ok: true });
  });

  return router;
}
