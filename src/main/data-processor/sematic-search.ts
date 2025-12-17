// semanticSearch.ts
// Place this in your electron main folder

import Database from 'better-sqlite3';
import { embed, generateAIAnswer } from './ai-processor';

// ============================================================================
// TYPES
// ============================================================================

interface Memory {
  id: number;
  url: string;
  title: string;
  content: string;
  summary: string;
  embedding: Buffer;
  created_at: string;
  source_type: string | null;
}

interface SearchResult {
  id: string;
  url: string;
  title: string;
  summary: string;
  visitCount: number | null;
  createdAt: Date;
  similarity: number;
}

export interface AIResponse {
  answer: string;
  sources: SearchResult[];
  confidence?: 'high' | 'medium' | 'low';
  usedAI?: boolean;
}

export interface RankedMemory extends Memory {
  similarity: number;
  recencyScore: number;
  finalScore: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  TOP_K_RESULTS: 50,
  MAX_RESULTS_TO_USER: 5,

  MIN_SIMILARITY: 0.3, // ← Moderate (was 0.25 in my fix, 0.4 original)
  WEAK_MATCH_THRESHOLD: 0.42, // ← Conservative (was 0.35 in my fix, 0.5 original)
  CONFIDENT_MATCH_THRESHOLD: 0.68, // ← Still lower than 0.75, but higher than 0.65

  SIMILARITY_WEIGHT: 0.7,
  RECENCY_WEIGHT: 0.25, // ← Middle ground
  RECENCY_DECAY_DAYS: 60 // ← Middle ground
};

const AI_GATE = {
  // Max sources to send to AI
  MAX_SOURCES_FOR_AI: 5
};

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

function bufferToEmbedding(buffer: Buffer): number[] {
  const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  return Array.from(float32Array);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

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

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dotProduct / (magA * magB);
}

// ============================================================================
// VECTOR SIMILARITY SEARCH
// ============================================================================

function searchSimilarMemories(
  db: Database.Database,
  queryEmbedding: number[],
  userId: string
): RankedMemory[] {
  const stmt = db.prepare(`
    SELECT
      id, url, title, content, summary, embedding, created_at, source_type
    FROM memories
    WHERE user_id = ?
  `);

  const memories = stmt.all(userId) as Memory[];

  if (memories.length === 0) {
    return [];
  }

  const now = Date.now();
  const results: RankedMemory[] = [];

  for (const memory of memories) {
    try {
      // Skip if no embedding
      if (!memory.embedding) {
        continue;
      }

      const memoryEmbedding = bufferToEmbedding(memory.embedding);

      // Check dimension mismatch
      if (memoryEmbedding.length !== queryEmbedding.length) {
        continue;
      }

      // Calculate similarity
      const similarity = cosineSimilarity(queryEmbedding, memoryEmbedding);

      // Skip if below minimum threshold
      if (similarity < CONFIG.MIN_SIMILARITY) {
        continue;
      }

      // Calculate recency score (exponential decay)
      const createdAt = new Date(memory.created_at).getTime();
      const daysSince = (now - createdAt) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.exp(-daysSince / CONFIG.RECENCY_DECAY_DAYS);

      // Calculate final score (weighted combination)
      const finalScore =
        similarity * CONFIG.SIMILARITY_WEIGHT + recencyScore * CONFIG.RECENCY_WEIGHT;

      results.push({
        ...memory,
        similarity,
        recencyScore,
        finalScore
      });
    } catch (error) {
      continue;
    }
  }

  // Sort by final score and return top K
  results.sort((a, b) => b.finalScore - a.finalScore);

  return results.slice(0, CONFIG.TOP_K_RESULTS);
}

// ============================================================================
// SMART DEDUPLICATION (Only if titles are very similar)
// ============================================================================

function calculateTitleSimilarity(title1: string, title2: string): number {
  const words1 = new Set(
    title1
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const words2 = new Set(
    title2
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

function deduplicateResults(memories: RankedMemory[]): RankedMemory[] {
  const kept: RankedMemory[] = [];

  for (const memory of memories) {
    // Check if this memory is a duplicate of any kept memory
    const isDuplicate = kept.some((existing) => {
      // Same domain AND very similar title = duplicate
      try {
        const sameDomain = new URL(memory.url).hostname === new URL(existing.url).hostname;
        const titleSimilarity = calculateTitleSimilarity(memory.title, existing.title);

        return sameDomain && titleSimilarity > 0.8; // 80% title overlap
      } catch {
        return false;
      }
    });

    if (!isDuplicate) {
      kept.push(memory);
    }
  }

  return kept;
}

// ============================================================================
// SYNTHESIS INTENT DETECTION
// ============================================================================

function hasSynthesisIntent(query: string): boolean {
  const synthesisKeywords = [
    'compare',
    'difference between',
    'pros and cons',
    'tradeoff',
    'summarize all',
    'summarize', // ← ADD THIS
    'synthesize',
    'connect',
    'what did i learn', // ← ADD THIS TOO
    'tell me about' // ← AND THIS
  ];

  const lowerQuery = query.toLowerCase();

  return synthesisKeywords.some((keyword) => lowerQuery.includes(keyword));
}

// ============================================================================
// FORMAT RESULTS
// ============================================================================

function formatSource(memory: RankedMemory): SearchResult {
  return {
    id: memory.id.toString(),
    url: memory.url,
    title: memory.title,
    summary: memory.summary,
    visitCount: null,
    createdAt: new Date(memory.created_at),
    similarity: memory.similarity
  };
}

function formatRecallOnlyResponse(memories: RankedMemory[]): AIResponse {
  const sources = memories.slice(0, CONFIG.MAX_RESULTS_TO_USER).map(formatSource);

  return {
    answer: "Here's what I found in your saved articles:",
    sources,
    confidence: 'high',
    usedAI: false
  };
}

function formatWeakMatchResponse(query: string, memories: RankedMemory[]): AIResponse {
  const sources = memories.slice(0, 3).map(formatSource);

  return {
    answer: `I found some loosely related articles, but I'm not very confident they match "${query}". Consider saving more specific content about this topic.`,
    sources,
    confidence: 'low',
    usedAI: false
  };
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

export async function semanticSearch(
  dbPath: string,
  userId: string,
  query: string
): Promise<AIResponse> {
  let db: Database.Database | null = null;

  try {
    db = new Database(dbPath, { readonly: true });

    // ========================================
    // STEP 1: Generate query embedding
    // ========================================
    const queryEmbedding = await embed(query);

    // ========================================
    // STEP 2: Vector similarity search
    // ========================================
    const ranked = searchSimilarMemories(db, queryEmbedding, userId);

    // ========================================
    // STEP 3: Handle no results
    // ========================================
    if (ranked.length === 0) {
      return {
        answer:
          "I couldn't find any relevant articles. Try saving more content to build your memory!",
        sources: [],
        confidence: 'low',
        usedAI: false
      };
    }

    // ========================================
    // STEP 4: Deduplicate results
    // ========================================
    const deduped = deduplicateResults(ranked);

    const topResult = deduped[0];
    const secondResult = deduped[1];

    const dominance = secondResult ? topResult.similarity - secondResult.similarity : 1;

    // ========================================
    // STEP 5: Handle weak matches
    // ========================================
    if (topResult.similarity < CONFIG.WEAK_MATCH_THRESHOLD) {
      return formatWeakMatchResponse(query, deduped);
    }

    // ========================================
    // STEP 6: Check if we need AI synthesis
    // ========================================
    const synthesisIntent = hasSynthesisIntent(query);
    const HARD_NO_AI =
      topResult.similarity >= CONFIG.CONFIDENT_MATCH_THRESHOLD && dominance >= 0.08;
    const isConfidentMatch =
      topResult.similarity >= CONFIG.CONFIDENT_MATCH_THRESHOLD &&
      (!secondResult || topResult.similarity - secondResult.similarity >= 0.08);

    // Decision: Use AI or not?
    // const shouldUseAI =
    //   !HARD_NO_AI &&
    //   // Medium similarity ambiguity
    //   ((topResult.similarity >= 0.55 && topResult.similarity <= 0.75) ||
    //     // Multiple close results → synthesis helps
    //     dominance < 0.05 ||
    //     // Explicit synthesis request AND not confident
    //     (synthesisIntent && topResult.similarity < CONFIG.CONFIDENT_MATCH_THRESHOLD));

    const shouldUseAI =
      !HARD_NO_AI &&
      // ONLY use AI if explicit synthesis request
      ((synthesisIntent && deduped.length >= 2) ||
        // OR ambiguous results (multiple close matches)
        (deduped.length >= 3 && secondResult && dominance < 0.05) ||
        // OR medium similarity with multiple results (needs interpretation)
        (topResult.similarity >= 0.42 && topResult.similarity <= 0.65 && deduped.length >= 3));

    // ========================================
    // STEP 7A: High confidence, no synthesis needed
    // ========================================
    if (isConfidentMatch && !synthesisIntent) {
      return formatRecallOnlyResponse(deduped);
    }

    // ========================================
    // STEP 7B: Use AI to synthesize answer
    // ========================================
    if (shouldUseAI) {
      const aiMemories = deduped.slice(0, AI_GATE.MAX_SOURCES_FOR_AI);
      const { answer, sourceIndices } = await generateAIAnswer(query, aiMemories);
      const sources = sourceIndices.map((index) => formatSource(aiMemories[index]));

      // If AI didn't cite any sources, use top results
      if (sources.length === 0) {
        return formatRecallOnlyResponse(deduped);
      }
      return {
        answer,
        sources,
        confidence: topResult.similarity >= CONFIG.CONFIDENT_MATCH_THRESHOLD ? 'high' : 'medium',
        usedAI: true
      };
    }

    // ========================================
    // STEP 7C: Medium confidence, no AI needed
    // ========================================
    return {
      answer: "Here's what I found in your saved articles:",
      sources: deduped.slice(0, CONFIG.MAX_RESULTS_TO_USER).map(formatSource),
      confidence: 'medium',
      usedAI: false
    };
  } catch (error) {
    console.error('❌ Search error:', error);
    throw error;
  } finally {
    if (db) db.close();
  }
}

// ============================================================================
// HELPER: Get Search Stats
// ============================================================================

export function getSearchStats(
  dbPath: string,
  userId: string
): {
  totalMemories: number;
  avgEmbeddingSize: number;
} {
  const db = new Database(dbPath, { readonly: true });

  try {
    const result = db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        AVG(LENGTH(embedding)) as avgSize
      FROM memories
      WHERE user_id = ?
    `
      )
      .get(userId) as any;

    return {
      totalMemories: result.total || 0,
      avgEmbeddingSize: result.avgSize || 0
    };
  } finally {
    db.close();
  }
}
