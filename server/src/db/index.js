import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from './migrations.js';
import { SCHEMA } from './schema.js';

/** Opens (and creates if needed) the SQLite database. Pass ':memory:' for tests. */
export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // The base schema is version 0; later versions drop some of its columns, so
  // it must only run on new (or never-migrated) databases.
  if (db.pragma('user_version', { simple: true }) === 0) db.exec(SCHEMA);
  migrate(db);
  return db;
}
