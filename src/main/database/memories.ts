import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';

const db = new Database(path.join(app.getPath('userData'), 'memory-layer.db'));

export const createMemoriesTable = (): void => {
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        url TEXT,
        canonical_url TEXT,
        title TEXT,
        content TEXT DEFAULT NULL,
        summary TEXT,
        embedding BLOB DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_type TEXT DEFAULT NULL
      )
    `
  ).run();
  db.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_user_canonical_url
      ON memories (user_id, canonical_url);
  `
  ).run();
};

export const createMemoriesIndex = (): void => {
  db.prepare(
    `
    CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
    `
  ).run();
  db.prepare(
    `
    CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
     `
  );
};

export const createCacheTable = (): void => {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS recent_searches (
      user_id TEXT NOT NULL,
      normalized_query TEXT NOT NULL,
      original_query TEXT NOT NULL,

      response_json TEXT NOT NULL,
      top_similarity REAL NOT NULL,
      used_ai INTEGER NOT NULL,

      memory_snapshot_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (user_id, normalized_query)
    );

    `
  ).run();
};

export const createCacheIndex = (): void => {
  db.prepare(
    `
    CREATE INDEX IF NOT EXISTS idx_recent_searches_user
      ON recent_searches(user_id, created_at DESC);
    `
  ).run();
};

export const deleteMemoryById = (id: number): void => {
  db.prepare(
    `
    DELETE FROM memories WHERE id = ?;
    `
  ).run(id);
};
