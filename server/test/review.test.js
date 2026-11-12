import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { openDb } from '../src/db/index.js';
import { SCHEMA } from '../src/db/schema.js';
import { createReviewService } from '../src/services/review.js';
import { createScheduler, Rating, State } from '../src/services/srs.js';
import { MINUTE } from '../src/utils/time.js';

const NOW = new Date(2023, 10, 14, 14, 0).getTime();

describe('review session', () => {
  let db;
  let review;
  const addCard = (front) =>
    db
      .prepare(
        'INSERT INTO cards (front, back, due, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(front, front, NOW, NOW, NOW).lastInsertRowid;
  const front = (t) => review.next(t).card?.front ?? null;

  beforeEach(() => {
    db = openDb(':memory:');
    review = createReviewService(db, { newCardsPerDay: 20, scheduler: createScheduler() });
  });

  it('brings a failed card back later in the same session', () => {
    const a = addCard('a');
    addCard('b');

    review.answer(a, Rating.AGAIN, NOW);
    assert.equal(front(NOW), 'b', 'other cards come first while the step runs');

    review.answer(2, Rating.GOOD, NOW);
    // Nothing else left: learning cards due within 20 min are shown early.
    assert.equal(front(NOW), 'a');
  });

  it('keeps a card in the session until it graduates', () => {
    const a = addCard('a');
    let t = NOW;
    for (const rating of [Rating.AGAIN, Rating.GOOD, Rating.GOOD]) {
      assert.equal(front(t), 'a');
      review.answer(a, rating, t);
      t += MINUTE;
    }
    assert.equal(front(t), null, 'graduated: not due until tomorrow');
    assert.equal(db.prepare('SELECT state FROM cards').get().state, State.REVIEW);
  });

  it('counts learning, review and new cards separately', () => {
    const a = addCard('a');
    addCard('b');
    review.answer(a, Rating.AGAIN, NOW);
    const stats = review.stats(NOW);
    assert.equal(stats.learning, 1);
    assert.equal(stats.newToday, 1);
    assert.equal(stats.due, 0);
  });

  it('respects the daily new card limit', () => {
    review = createReviewService(db, { newCardsPerDay: 1, scheduler: createScheduler() });
    const a = addCard('a');
    addCard('b');
    review.answer(a, Rating.EASY, NOW);
    assert.equal(front(NOW), null);
    assert.equal(review.stats(NOW).newTotal, 1);
  });
});

describe('migration from the first schema', () => {
  it('assigns states to existing cards', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'viet-')), 'old.db');
    const old = new Database(file);
    old.exec(SCHEMA); // version 0, without the state/step columns
    const insert = old.prepare(
      'INSERT INTO cards (front, back, interval, due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insert.run('never seen', '-', 0, NOW, NOW, NOW);
    insert.run('failed', '-', 0, NOW, NOW, NOW);
    insert.run('graduated', '-', 6, NOW, NOW, NOW);
    old.exec('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (2, 1, 0), (3, 3, 0)');
    old.close();

    const db = openDb(file);
    const states = db.prepare('SELECT front, state FROM cards ORDER BY id').all();
    assert.deepEqual(states, [
      { front: 'never seen', state: State.NEW },
      { front: 'failed', state: State.LEARNING },
      { front: 'graduated', state: State.REVIEW },
    ]);
    assert.equal(db.pragma('user_version', { simple: true }), 1);

    db.close();
    assert.doesNotThrow(() => openDb(file).close(), 'migrations run only once');
  });
});
