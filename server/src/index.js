import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import { db } from './db.js';
import { login, logout, isAuthed, requireAuth } from './auth.js';
import { record, cardText, summarize, hunks } from './history.js';
import { schedule, previews } from './srs.js';

const app = express();
app.set('trust proxy', 1); // un seul proxy devant (nginx en prod, Vite en dev)
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const NEW_PER_DAY = Number(process.env.NEW_CARDS_PER_DAY || 20);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---------- Auth ----------
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', (req, res) => res.json({ authed: isAuthed(req) }));
app.use('/api', requireAuth);

const str = (v, max = 100_000) => (typeof v === 'string' ? v : '').slice(0, max);
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// ---------- Notes ----------
app.get('/api/notes', (req, res) => {
  const q = str(req.query.q, 200).trim();
  const rows = q
    ? db.prepare(`SELECT id, title, updated_at, substr(content, 1, 160) AS excerpt FROM notes
                  WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC`).all(`%${q}%`, `%${q}%`)
    : db.prepare(`SELECT id, title, updated_at, substr(content, 1, 160) AS excerpt FROM notes ORDER BY updated_at DESC`).all();
  res.json(rows);
});

app.get('/api/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });
  res.json(note);
});

app.post('/api/notes', (req, res) => {
  const title = str(req.body.title, 200).trim() || 'Sans titre';
  const content = str(req.body.content);
  const now = Date.now();
  const { lastInsertRowid: id } = db.prepare(
    'INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(title, content, now, now);
  record({ type: 'note', id, action: 'create', label: title, after: `# ${title}\n\n${content}` });
  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
});

app.put('/api/notes/:id', (req, res) => {
  const old = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Note introuvable' });
  const title = str(req.body.title ?? old.title, 200).trim() || 'Sans titre';
  const content = str(req.body.content ?? old.content);
  if (title === old.title && content === old.content) return res.json(old);
  db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?')
    .run(title, content, Date.now(), old.id);
  record({
    type: 'note', id: old.id, action: 'update', label: title,
    before: `# ${old.title}\n\n${old.content}`, after: `# ${title}\n\n${content}`,
  });
  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(old.id));
});

app.delete('/api/notes/:id', (req, res) => {
  const old = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Note introuvable' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(old.id);
  record({ type: 'note', id: old.id, action: 'delete', label: old.title, before: `# ${old.title}\n\n${old.content}` });
  res.json({ ok: true });
});

// ---------- Cartes ----------
function cardFields(body, fallback = {}) {
  return {
    front: str(body.front ?? fallback.front, 500).trim(),
    back: str(body.back ?? fallback.back, 1000).trim(),
    example: str(body.example ?? fallback.example ?? '', 2000).trim(),
    tags: str(body.tags ?? fallback.tags ?? '', 300).trim(),
  };
}

app.get('/api/cards', (req, res) => {
  const q = str(req.query.q, 200).trim();
  const base = `SELECT * FROM cards`;
  const rows = q
    ? db.prepare(`${base} WHERE front LIKE ? OR back LIKE ? OR tags LIKE ? ORDER BY created_at DESC`).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare(`${base} ORDER BY created_at DESC`).all();
  res.json(rows);
});

app.post('/api/cards', (req, res) => {
  const f = cardFields(req.body);
  if (!f.front || !f.back) return res.status(400).json({ error: 'Recto et verso requis' });
  const now = Date.now();
  const { lastInsertRowid: id } = db.prepare(
    `INSERT INTO cards (front, back, example, tags, due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(f.front, f.back, f.example, f.tags, now, now, now);
  record({ type: 'card', id, action: 'create', label: f.front, after: cardText(f) });
  res.status(201).json(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
});

// Import en masse : une carte par ligne, "vietnamien ; français [; exemple]"
app.post('/api/cards/import', (req, res) => {
  const lines = str(req.body.text, 500_000).split('\n').map((l) => l.trim()).filter(Boolean);
  const tags = str(req.body.tags, 300).trim();
  const now = Date.now();
  const ins = db.prepare(
    `INSERT INTO cards (front, back, example, tags, due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const created = [];
  db.transaction(() => {
    for (const line of lines) {
      const [front, back, example = ''] = line.split(/\s*[;\t|]\s*/);
      if (!front || !back) continue;
      ins.run(front, back, example, tags, now, now, now);
      created.push({ front, back, example, tags });
    }
  })();
  if (created.length) {
    record({ type: 'import', id: null, action: 'import', label: `${created.length} cartes`,
      after: created.map((c) => `${c.front} — ${c.back}`).join('\n') + '\n' });
  }
  res.json({ imported: created.length, skipped: lines.length - created.length });
});

app.put('/api/cards/:id', (req, res) => {
  const old = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Carte introuvable' });
  const f = cardFields(req.body, old);
  if (!f.front || !f.back) return res.status(400).json({ error: 'Recto et verso requis' });
  db.prepare('UPDATE cards SET front = ?, back = ?, example = ?, tags = ?, updated_at = ? WHERE id = ?')
    .run(f.front, f.back, f.example, f.tags, Date.now(), old.id);
  record({ type: 'card', id: old.id, action: 'update', label: f.front, before: cardText(old), after: cardText(f) });
  res.json(db.prepare('SELECT * FROM cards WHERE id = ?').get(old.id));
});

app.delete('/api/cards/:id', (req, res) => {
  const old = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Carte introuvable' });
  db.prepare('DELETE FROM cards WHERE id = ?').run(old.id);
  record({ type: 'card', id: old.id, action: 'delete', label: old.front, before: cardText(old) });
  res.json({ ok: true });
});

// ---------- Révision ----------
function reviewStats() {
  const now = Date.now();
  const today = startOfDay();
  const newIntroducedToday = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT card_id, MIN(reviewed_at) AS first FROM reviews GROUP BY card_id
    ) WHERE first >= ?`).get(today).n;
  const newLeft = Math.max(0, NEW_PER_DAY - newIntroducedToday);
  const due = db.prepare(`SELECT COUNT(*) AS n FROM cards c WHERE due <= ? AND EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id)`).get(now).n;
  const newTotal = db.prepare(`SELECT COUNT(*) AS n FROM cards c WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id)`).get().n;
  const reviewedToday = db.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE reviewed_at >= ?`).get(today).n;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM cards`).get().n;

  // série de jours consécutifs avec au moins une révision
  const days = new Set(db.prepare(`SELECT reviewed_at FROM reviews WHERE reviewed_at >= ?`)
    .all(now - 400 * 86400000).map((r) => startOfDay(r.reviewed_at)));
  let streak = 0;
  let d = today;
  if (!days.has(d)) d -= 86400000; // la série n'est pas cassée si on n'a pas encore révisé aujourd'hui
  while (days.has(d)) { streak++; d = startOfDay(d - 12 * 3600000); }

  return { due, newToday: Math.min(newLeft, newTotal), newTotal, reviewedToday, total, streak };
}

app.get('/api/review/next', (_req, res) => {
  const now = Date.now();
  const stats = reviewStats();
  let card = db.prepare(`
    SELECT * FROM cards c WHERE due <= ? AND EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id)
    ORDER BY due LIMIT 1`).get(now);
  if (!card && stats.newToday > 0) {
    card = db.prepare(`
      SELECT * FROM cards c WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id)
      ORDER BY created_at, id LIMIT 1`).get();
  }
  const nextDue = card ? null : db.prepare(`
    SELECT MIN(due) AS t FROM cards c WHERE EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = c.id)`).get().t;
  res.json({ card: card || null, previews: card ? previews(card, now) : null, stats, nextDue });
});

app.post('/api/review/:id', (req, res) => {
  const rating = Number(req.body.rating);
  if (![1, 2, 3, 4].includes(rating)) return res.status(400).json({ error: 'Note invalide' });
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Carte introuvable' });
  const now = Date.now();
  const s = schedule(card, rating, now);
  db.transaction(() => {
    db.prepare('UPDATE cards SET interval = ?, ease = ?, reps = ?, lapses = ?, due = ? WHERE id = ?')
      .run(s.interval, s.ease, s.reps, s.lapses, s.due, card.id);
    db.prepare('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (?, ?, ?)').run(card.id, rating, now);
  })();
  res.json({ ok: true });
});

app.get('/api/stats', (_req, res) => res.json(reviewStats()));

// ---------- Historique ----------
app.get('/api/history', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.prepare(`SELECT * FROM history WHERE updated_at < ? ORDER BY updated_at DESC LIMIT ?`).all(before, limit);

  const entries = rows.map((r) => ({
    id: r.id, type: r.entity_type, entityId: r.entity_id, action: r.action, label: r.label,
    summary: summarize(r), added: r.added, removed: r.removed,
    createdAt: r.created_at, updatedAt: r.updated_at,
    hunks: hunks(r.before_text, r.after_text),
  }));

  // Révisions par jour sur la plage couverte, pour le résumé quotidien
  const from = rows.length ? startOfDay(rows[rows.length - 1].updated_at) : startOfDay() - 30 * 86400000;
  const reviews = db.prepare(`SELECT reviewed_at, rating FROM reviews WHERE reviewed_at >= ? AND reviewed_at < ?`).all(from, before);
  const reviewsByDay = {};
  for (const r of reviews) {
    const d = startOfDay(r.reviewed_at);
    const e = (reviewsByDay[d] ??= { total: 0, again: 0 });
    e.total++;
    if (r.rating === 1) e.again++;
  }

  res.json({ entries, reviewsByDay, hasMore: rows.length === limit, nextBefore: rows.at(-1)?.updated_at ?? null });
});

// ---------- Front statique (prod) ----------
const STATIC_DIR = process.env.STATIC_DIR && path.resolve(process.env.STATIC_DIR);
if (STATIC_DIR && fs.existsSync(STATIC_DIR)) {
  app.use('/assets', express.static(path.join(STATIC_DIR, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(STATIC_DIR, { index: false, maxAge: 0 }));
  // fallback SPA : toute route hors /api renvoie index.html
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => console.log(`API sur :${PORT}`));
