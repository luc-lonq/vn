/**
 * Ordered schema migrations, applied on startup. The database's
 * `PRAGMA user_version` stores how many have run. Append only: never edit or
 * reorder a migration once it has shipped.
 */
export const MIGRATIONS = [
  // 1 — Anki-style card states. Before this, a card was "new" until its first
  // review, and every interval (even 10 minutes) was stored in days.
  (db) => {
    db.exec(`
      ALTER TABLE cards ADD COLUMN state TEXT NOT NULL DEFAULT 'new';
      ALTER TABLE cards ADD COLUMN step  INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_cards_state_due ON cards(state, due);
    `);
    const seen = 'EXISTS (SELECT 1 FROM reviews r WHERE r.card_id = cards.id)';
    // Cards with a day-or-more interval graduated; the rest were still being learned.
    db.exec(`
      UPDATE cards SET state = 'review' WHERE ${seen} AND interval >= 1;
      UPDATE cards SET state = 'learning', interval = 0 WHERE ${seen} AND interval < 1;
    `);
  },

  // 2 — Each card is studied in both directions, each with its own schedule.
  // Scheduling moves from `cards` to `card_states`; existing progress becomes
  // the vi→fr direction and fr→vi starts as new.
  (db) => {
    db.exec(`
      CREATE TABLE card_states (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id   INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
        direction TEXT    NOT NULL CHECK (direction IN ('vi-fr', 'fr-vi')),
        state     TEXT    NOT NULL DEFAULT 'new',
        step      INTEGER NOT NULL DEFAULT 0,
        due       INTEGER NOT NULL,              -- epoch ms
        interval  REAL    NOT NULL DEFAULT 0,    -- days (review states)
        ease      REAL    NOT NULL DEFAULT 2.5,
        reps      INTEGER NOT NULL DEFAULT 0,
        lapses    INTEGER NOT NULL DEFAULT 0,
        UNIQUE (card_id, direction)
      );
      CREATE INDEX idx_card_states_queue ON card_states(state, due);

      INSERT INTO card_states (card_id, direction, state, step, due, interval, ease, reps, lapses)
        SELECT id, 'vi-fr', state, step, due, interval, ease, reps, lapses FROM cards;
      INSERT INTO card_states (card_id, direction, due)
        SELECT id, 'fr-vi', created_at FROM cards;

      ALTER TABLE reviews ADD COLUMN direction TEXT NOT NULL DEFAULT 'vi-fr';

      DROP INDEX IF EXISTS idx_cards_due;
      DROP INDEX IF EXISTS idx_cards_state_due;
      ALTER TABLE cards DROP COLUMN due;
      ALTER TABLE cards DROP COLUMN interval;
      ALTER TABLE cards DROP COLUMN ease;
      ALTER TABLE cards DROP COLUMN reps;
      ALTER TABLE cards DROP COLUMN lapses;
      ALTER TABLE cards DROP COLUMN state;
      ALTER TABLE cards DROP COLUMN step;
    `);
  },
];

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  const pending = MIGRATIONS.slice(current);
  if (pending.length === 0) return;

  db.transaction(() => {
    pending.forEach((migration) => migration(db));
    db.pragma(`user_version = ${MIGRATIONS.length}`);
  })();
}
