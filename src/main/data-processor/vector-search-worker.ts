// vector-search.worker.ts
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';

// 1. Receive data from the main thread
const { dbPath, userId, queryEmbedding, config } = workerData;

interface Memory {
  id: number;
  url: string;
  title: string;
  content: string;
  summary: string;
  embedding: Buffer | null;
  created_at: string;
  source_type: string | null;
}

interface RankedMemory extends Memory {
  similarity: number;
  recencyScore: number;
  finalScore: number;
}

// 2. Optimized Math Helper (TypedArrays for speed)
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return magA && magB ? dotProduct / (magA * magB) : 0;
}

try {
  // 3. Open DB (Read-only is faster and safer here)
  const db = new Database(dbPath, { readonly: true });

  const stmt = db.prepare(`
    SELECT id, url, title, content, summary, embedding, created_at, source_type
    FROM memories
    WHERE user_id = ?
  `);

  const memories = stmt.all(userId) as Memory[];
  const results: RankedMemory[] = [];
  const queryVector = new Float32Array(queryEmbedding);
  const now = Date.now();

  // 4. The Heavy Loop
  for (const memory of memories) {
    if (!memory.embedding) continue;

    // Zero-copy view of the buffer
    const memoryVector = new Float32Array(
      memory.embedding.buffer,
      memory.embedding.byteOffset,
      memory.embedding.length / 4
    );

    if (memoryVector.length !== queryVector.length) continue;

    const similarity = cosineSimilarity(queryVector, memoryVector);

    if (similarity < config.MIN_SIMILARITY) continue;

    // Recency Score
    const createdAt = new Date(memory.created_at).getTime();
    const daysSince = (now - createdAt) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-daysSince / config.RECENCY_DECAY_DAYS);

    const finalScore = similarity * config.SIMILARITY_WEIGHT + recencyScore * config.RECENCY_WEIGHT;

    results.push({
      ...memory,
      embedding: null, // Don't send heavy buffer back to main thread
      similarity,
      recencyScore,
      finalScore
    });
  }

  // 5. Sort and Slice
  results.sort((a, b) => b.finalScore - a.finalScore);
  const topResults = results.slice(0, config.TOP_K_RESULTS);

  // 6. Send results back
  parentPort?.postMessage(topResults);
  db.close();
} catch (error) {
  console.error('Worker Error:', error);
  throw error;
}
