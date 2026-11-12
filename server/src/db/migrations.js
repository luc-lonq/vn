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
