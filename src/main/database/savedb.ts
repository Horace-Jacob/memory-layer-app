import Database from 'better-sqlite3';
import path from 'path';
import type { Processed } from '../ipc-server';
import { summarize, embed } from '../data-processor/ai-processor';
import { app } from 'electron';

const db = new Database(path.join(app.getPath('userData'), 'memory-layer.db'));

export function cleanContent(text: string): string {
  return text
    .replace(/\s+/g, ' ') // collapse whitespace
    .replace(/Copyright.*$/i, '') // common footer noise
    .replace(/All rights reserved.*$/i, '') // more footer noise
    .replace(/subscribe to our newsletter.*/i, '') // newsletter prompts
    .replace(/follow us on.*$/i, '') // social prompts
    .replace(/sign up to read more.*/i, '') // paywall prompts
    .trim();
}

export function trimForProcessing(text: string): string {
  const MAX_LEN = 20000;
  if (text.length <= MAX_LEN) return text;
  return text.slice(0, MAX_LEN);
}

export const findByCanonicalUrl = async (canonicalUrl: string, profileId: string): Promise<any> => {
  return db
    .prepare(
      `
      SELECT id, created_at
      FROM memories
      WHERE user_id = ? AND canonical_url = ?
      LIMIT 1
    `
    )
    .get(profileId, canonicalUrl);
};

export const saveToDb = async (
  data: Processed,
  sourceType: string,
  userId: string
): Promise<void> => {
  try {
    let embeddingBuf: any;
    const cleaned = cleanContent(data.content!);

    const trimmed = trimForProcessing(cleaned);
    const summary = await summarize(trimmed);
    const embedding = await embed(summary);
    if (embedding) {
      const arr = new Float32Array(embedding);
      embeddingBuf = Buffer.from(arr.buffer);
    }
    const current_time = Date.now();
    db.prepare(
      `INSERT INTO memories (user_id, url, canonical_url, title, summary, embedding, content, created_at, source_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      data.url!,
      data.canonicalUrl,
      data.title!,
      summary,
      embeddingBuf,
      data.content!,
      current_time,
      sourceType
    );
  } catch (error) {
    throw new Error((error as Error).message);
  }
};
