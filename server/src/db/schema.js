export const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  content    TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  front      TEXT    NOT NULL,              -- Vietnamese
  back       TEXT    NOT NULL,              -- translation
  example    TEXT    NOT NULL DEFAULT '',
  tags       TEXT    NOT NULL DEFAULT '',
  due        INTEGER NOT NULL,              -- epoch ms
  interval   REAL    NOT NULL DEFAULT 0,    -- days
  ease       REAL    NOT NULL DEFAULT 2.5,
  reps       INTEGER NOT NULL DEFAULT 0,
  lapses     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reviews_card ON reviews(card_id);
CREATE INDEX IF NOT EXISTS idx_reviews_at ON reviews(reviewed_at);

-- Each entry keeps the before/after snapshots so the diff can be recomputed.
CREATE TABLE IF NOT EXISTS history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT    NOT NULL,             -- 'note' | 'card' | 'import'
  entity_id   INTEGER,
  action      TEXT    NOT NULL,             -- 'create' | 'update' | 'delete' | 'import'
  label       TEXT    NOT NULL,
  before_text TEXT    NOT NULL DEFAULT '',
  after_text  TEXT    NOT NULL DEFAULT '',
  added       INTEGER NOT NULL DEFAULT 0,
  removed     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_updated ON history(updated_at);
CREATE INDEX IF NOT EXISTS idx_history_entity ON history(entity_type, entity_id);
`;
