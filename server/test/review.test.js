import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { openDb } from '../src/db/index.js';
import { MIGRATIONS } from '../src/db/migrations.js';
import { SCHEMA } from '../src/db/schema.js';
import { createReviewService } from '../src/services/review.js';
import { createScheduler, Rating, State } from '../src/services/srs.js';
import { addDays, MINUTE } from '../src/utils/time.js';

const NOW = new Date(2023, 10, 14, 14, 0).getTime();
const TOMORROW = addDays(NOW, 1);

function setup({ newCardsPerDay = 20 } = {}) {
  const db = openDb(':memory:');
  const review = createReviewService(db, { newCardsPerDay, scheduler: createScheduler() });
  const addCard = (front) => {
    const { lastInsertRowid: id } = db
      .prepare('INSERT INTO cards (front, back, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(front, `${front} (fr)`, NOW, NOW);
    for (const direction of ['vi-fr', 'fr-vi']) {
      db.prepare('INSERT INTO card_states (card_id, direction, due) VALUES (?, ?, ?)').run(
        id,
        direction,
        NOW
      );
    }
  };
  /** Next item as "front/direction", or null. */
  const peek = (t) => {
    const { card } = review.next(t);
    return card ? `${card.front}/${card.direction}` : null;
  };
  const answer = (t, rating) => review.answer(review.next(t).card.id, rating, t);
  return { db, review, addCard, peek, answer };
}

describe('review session', () => {
  let ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('brings a failed card back later in the same session', () => {
    ctx.addCard('a');
    ctx.addCard('b');

    ctx.answer(NOW, Rating.AGAIN); // a/vi-fr → 1 min
    assert.equal(ctx.peek(NOW), 'b/vi-fr', 'other cards come first while the step runs');

    ctx.answer(NOW, Rating.GOOD); // b/vi-fr → 10 min
    // Nothing else is due now: learning items due within 20 min are shown early.
    assert.equal(ctx.peek(NOW), 'a/vi-fr');
  });

  it('keeps an item in the session until it graduates', () => {
    ctx.addCard('a');
    let t = NOW;
    for (const rating of [Rating.AGAIN, Rating.GOOD, Rating.GOOD]) {
      assert.equal(ctx.peek(t), 'a/vi-fr');
      ctx.answer(t, rating);
      t += MINUTE;
    }
    const state = ctx.db.prepare("SELECT state FROM card_states WHERE direction = 'vi-fr'").get();
    assert.equal(state.state, State.REVIEW);
  });

  it('schedules each direction independently', () => {
    ctx.addCard('a');
    let t = NOW;
    ctx.answer(t, Rating.GOOD);
    ctx.answer(t, Rating.GOOD); // vi-fr graduates to tomorrow

    // fr-vi waits until tomorrow (it would give the answer away), then comes as new.
    assert.equal(ctx.peek(t), null);
    const stats = ctx.review.stats(t);
    assert.equal(stats.newToday, 0, 'waiting directions are not counted as available');
    assert.equal(stats.newWaitingForSibling, 1);
    assert.equal(stats.newLimitReached, false);
    t = TOMORROW;
    assert.equal(ctx.peek(t), 'a/vi-fr', 'reviews come before new items');
    ctx.answer(t, Rating.GOOD);
    assert.equal(ctx.peek(t), 'a/fr-vi');
  });

  it('counts learning, review and new items separately', () => {
    ctx.addCard('a');
    ctx.addCard('b');
    ctx.answer(NOW, Rating.AGAIN);
    const stats = ctx.review.stats(NOW);
    assert.equal(stats.learning, 1);
    assert.equal(stats.newTotal, 3);
    assert.equal(stats.due, 0);
    assert.equal(stats.total, 2, 'total counts words, not directions');
  });

  it('respects the daily new item limit', () => {
    ctx = setup({ newCardsPerDay: 1 });
    ctx.addCard('a');
    ctx.addCard('b');
    ctx.answer(NOW, Rating.GOOD);
    ctx.answer(NOW, Rating.GOOD);
    assert.equal(ctx.peek(NOW), null);
    assert.equal(ctx.review.stats(NOW).newToday, 0);
    assert.equal(ctx.review.stats(NOW).newLimitReached, true);
  });
});

describe('migrations', () => {
  /** Builds a database at an older schema version with three cards. */
  function oldDatabase(version) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'viet-')), 'old.db');
    const db = new Database(file);
    db.exec(SCHEMA);
    MIGRATIONS.slice(0, version).forEach((m) => m(db));
    db.pragma(`user_version = ${version}`);
    const insert = db.prepare(
      'INSERT INTO cards (front, back, interval, due, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insert.run('never seen', '-', 0, NOW, NOW, NOW);
    insert.run('failed', '-', 0, NOW, NOW, NOW);
    insert.run('graduated', '-', 6, NOW, NOW, NOW);
    db.exec('INSERT INTO reviews (card_id, rating, reviewed_at) VALUES (2, 1, 0), (3, 3, 0)');
    if (version >= 1) {
      db.exec(`UPDATE cards SET state = 'learning' WHERE id = 2;
               UPDATE cards SET state = 'review' WHERE id = 3;`);
    }
    db.close();
    return file;
  }

  for (const version of [0, 1]) {
    it(`upgrades a version ${version} database: progress kept for vi→fr, fr→vi new`, () => {
      const file = oldDatabase(version);
      const db = openDb(file);
      const states = db
        .prepare(
          `SELECT c.front, s.direction, s.state, s.interval FROM card_states s
           JOIN cards c ON c.id = s.card_id ORDER BY c.id, s.direction DESC`
        )
        .all()
        .map((r) => `${r.front} ${r.direction} ${r.state} ${r.interval}`);

      assert.deepEqual(states, [
        'never seen vi-fr new 0',
        'never seen fr-vi new 0',
        'failed vi-fr learning 0',
        'failed fr-vi new 0',
        'graduated vi-fr review 6',
        'graduated fr-vi new 0',
      ]);
      assert.equal(db.pragma('user_version', { simple: true }), MIGRATIONS.length);
      const columns = db
        .prepare('PRAGMA table_info(cards)')
        .all()
        .map((c) => c.name);
      assert.ok(!columns.includes('due'), 'scheduling columns left the cards table');

      db.close();
      assert.doesNotThrow(() => openDb(file).close(), 'reopening an up-to-date database works');
    });
  }
});
