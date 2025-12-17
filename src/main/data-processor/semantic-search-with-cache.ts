import Database from 'better-sqlite3';
import { AIResponse, semanticSearch } from './sematic-search';

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getUserMemorySnapshot(db: Database.Database, userId: string): string {
  const row = db
    .prepare(
      `
      SELECT MAX(created_at) as last_update
      FROM memories
      WHERE user_id = ?
    `
    )
    .get(userId) as any;

  return row?.last_update ?? '1970-01-01';
}

export const semanticSearchWithCache = async (
  dbPath: string,
  userId: string,
  query: string
): Promise<AIResponse> => {
  const db = new Database(dbPath);

  try {
    const normalizedQuery = normalizeQuery(query);
    const memorySnapshot = getUserMemorySnapshot(db, userId);

    // ==================================================
    // 1. CACHE LOOKUP
    // ==================================================
    const cached = db
      .prepare(
        `
        SELECT response_json, memory_snapshot_at
        FROM recent_searches
        WHERE user_id = ?
          AND normalized_query = ?
        LIMIT 1
      `
      )
      .get(userId, normalizedQuery) as any;

    if (cached && cached.memory_snapshot_at === memorySnapshot) {
      return JSON.parse(cached.response_json);
    }

    // ==================================================
    // 2. CACHE MISS → REAL SEARCH
    // ==================================================
    const result = await semanticSearch(dbPath, userId, query);

    // ==================================================
    // 3. STORE RESULT
    // ==================================================
    db.prepare(
      `
      INSERT OR REPLACE INTO recent_searches (
        user_id,
        normalized_query,
        original_query,
        response_json,
        top_similarity,
        used_ai,
        memory_snapshot_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      userId,
      normalizedQuery,
      query,
      JSON.stringify(result),
      result.sources[0]?.similarity ?? 0,
      result.answer !== 'Here’s what I found in your saved articles' ? 1 : 0,
      memorySnapshot
    );

    return result;
  } finally {
    db.close();
  }
};
