import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { openDb } from '../src/db/index.js';
import { countChanges, createHistory, hunks, MERGE_WINDOW } from '../src/services/history.js';

describe('diff helpers', () => {
  it('counts added and removed lines', () => {
    assert.deepEqual(countChanges('a\nb\n', 'a\nc\nd\n'), { added: 2, removed: 1 });
  });

  it('produces prefixed hunk lines', () => {
    const [hunk] = hunks('a\nb\n', 'a\nc\n');
    assert.deepEqual(hunk.lines, [' a', '-b', '+c']);
  });
});

describe('history.record', () => {
  let db;
  let history;
  const rows = () => db.prepare('SELECT * FROM history ORDER BY id').all();
  const t0 = 1_700_000_000_000;

  beforeEach(() => {
    db = openDb(':memory:');
    history = createHistory(db);
  });

  it('merges successive updates within the window into one diff', () => {
    history.record({
      type: 'note',
      id: 1,
      action: 'update',
      label: 'n',
      before: 'a\n',
      after: 'b\n',
      now: t0,
    });
    history.record({
      type: 'note',
      id: 1,
      action: 'update',
      label: 'n',
      before: 'b\n',
      after: 'c\n',
      now: t0 + 1000,
    });

    const [entry, ...rest] = rows();
    assert.equal(rest.length, 0);
    assert.equal(entry.before_text, 'a\n');
    assert.equal(entry.after_text, 'c\n');
  });

  it('starts a new entry once the window has passed', () => {
    history.record({
      type: 'note',
      id: 1,
      action: 'update',
      label: 'n',
      before: 'a\n',
      after: 'b\n',
      now: t0,
    });
    history.record({
      type: 'note',
      id: 1,
      action: 'update',
      label: 'n',
      before: 'b\n',
      after: 'c\n',
      now: t0 + MERGE_WINDOW + 1,
    });
    assert.equal(rows().length, 2);
  });

  it('drops the entry when edits cancel out', () => {
    history.record({
      type: 'note',
      id: 1,
      action: 'update',
      label: 'n',
      before: 'a\n',
      after: 'b\n',
      now: t0,
    });
    history.record({
      type: 'note',
      id: 1,
      action: 'update',
      label: 'n',
      before: 'b\n',
      after: 'a\n',
      now: t0 + 1,
    });
    assert.equal(rows().length, 0);
  });

  it('ignores no-op updates', () => {
    history.record({
      type: 'card',
      id: 1,
      action: 'update',
      label: 'c',
      before: 'x\n',
      after: 'x\n',
      now: t0,
    });
    assert.equal(rows().length, 0);
  });
});
