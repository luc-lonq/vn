import { Router } from 'express';
import { cardText } from '../services/history.js';
import { DIRECTIONS } from '../services/review.js';
import { badRequest, likePattern, notFound, text } from '../utils/input.js';

// Bulk import: one card per line, "vietnamese ; translation [; example]".
const IMPORT_SEPARATOR = /\s*[;\t|]\s*/;

function readFields(body, fallback = {}) {
  const card = {
    front: text(body.front ?? fallback.front, 500).trim(),
    back: text(body.back ?? fallback.back, 1000).trim(),
    example: text(body.example ?? fallback.example ?? '', 2000).trim(),
    tags: text(body.tags ?? fallback.tags ?? '', 300).trim(),
  };
  if (!card.front || !card.back) throw badRequest('Recto et verso requis');
  return card;
}

export function cardsRouter(db, history) {
  const stmt = {
    list: db.prepare('SELECT * FROM cards ORDER BY created_at DESC, id DESC'),
    states: db.prepare('SELECT card_id, direction, state, due, interval FROM card_states'),
    insertState: db.prepare(
      'INSERT INTO card_states (card_id, direction, due) VALUES (@cardId, @direction, @now)'
    ),
    search: db.prepare(`
      SELECT * FROM cards
      WHERE front LIKE ? ESCAPE '\\' OR back LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC, id DESC`),
    get: db.prepare('SELECT * FROM cards WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO cards (front, back, example, tags, created_at, updated_at)
      VALUES (@front, @back, @example, @tags, @now, @now)`),
    update: db.prepare(`
      UPDATE cards SET front = @front, back = @back, example = @example, tags = @tags, updated_at = @now
      WHERE id = @id`),
    remove: db.prepare('DELETE FROM cards WHERE id = ?'),
  };

  const findOr404 = (id) => {
    const card = stmt.get.get(id);
    if (!card) throw notFound('Carte');
    return card;
  };

  /** Inserts a card and one review item per direction; returns the card id. */
  const insertCard = (card, now) => {
    const { lastInsertRowid: cardId } = stmt.insert.run({ ...card, now });
    for (const direction of DIRECTIONS) stmt.insertState.run({ cardId, direction, now });
    return cardId;
  };
  const insertOne = db.transaction(insertCard);
  const insertMany = db.transaction((cards, now) => {
    for (const card of cards) insertCard(card, now);
  });

  /** Adds each card's per-direction progress: { 'vi-fr': {state, due, interval}, ... }. */
  const withProgress = (cards) => {
    const byCard = new Map();
    for (const { card_id, direction, ...progress } of stmt.states.all()) {
      if (!byCard.has(card_id)) byCard.set(card_id, {});
      byCard.get(card_id)[direction] = progress;
    }
    return cards.map((card) => ({ ...card, progress: byCard.get(card.id) ?? {} }));
  };

  const router = Router();

  router.get('/', (req, res) => {
    const q = text(req.query.q, 200).trim();
    const p = likePattern(q);
    res.json(withProgress(q ? stmt.search.all(p, p, p) : stmt.list.all()));
  });

  router.post('/', (req, res) => {
    const card = readFields(req.body);
    const id = insertOne(card, Date.now());
    history.record({
      type: 'card',
      id,
      action: 'create',
      label: card.front,
      after: cardText(card),
    });
    res.status(201).json(stmt.get.get(id));
  });

  router.post('/import', (req, res) => {
    const tags = text(req.body.tags, 300).trim();
    const lines = text(req.body.text, 500_000)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const cards = lines
      .map((line) => line.split(IMPORT_SEPARATOR))
      .filter(([front, back]) => front && back)
      .map(([front, back, example = '']) => ({ front, back, example, tags }));

    insertMany(cards, Date.now());
    if (cards.length) {
      history.record({
        type: 'import',
        action: 'import',
        label: `${cards.length} cartes`,
        after: cards.map((c) => `${c.front} — ${c.back}`).join('\n') + '\n',
      });
    }
    res.json({ imported: cards.length, skipped: lines.length - cards.length });
  });

  router.put('/:id', (req, res) => {
    const old = findOr404(req.params.id);
    const card = readFields(req.body, old);
    stmt.update.run({ ...card, now: Date.now(), id: old.id });
    history.record({
      type: 'card',
      id: old.id,
      action: 'update',
      label: card.front,
      before: cardText(old),
      after: cardText(card),
    });
    res.json(stmt.get.get(old.id));
  });

  router.delete('/:id', (req, res) => {
    const old = findOr404(req.params.id);
    stmt.remove.run(old.id);
    history.record({
      type: 'card',
      id: old.id,
      action: 'delete',
      label: old.front,
      before: cardText(old),
    });
    res.json({ ok: true });
  });

  return router;
}
