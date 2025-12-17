import OpenAI from 'openai';
import 'dotenv/config';
import { BrowserHistoryEntry } from '../browser-history-service';
import { CONFIG } from './history-processor';
import { RankedMemory } from './sematic-search';
import crypto from 'crypto';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY
});

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 1000;
const MAX_CACHE_SIZE = 1000;

const summaryCache = new Map<string, string>();
const embeddingCache = new Map<string, number[]>();

const ensureRateLimit = async (key: string): Promise<void> => {
  const now = Date.now();
  const lastCall = rateLimitMap.get(key) || 0;
  const timeSinceLastCall = now - lastCall;

  if (timeSinceLastCall < RATE_LIMIT_MS) {
    const waitTime = RATE_LIMIT_MS - timeSinceLastCall;
    // console.log(`⏳ Rate limit: waiting ${waitTime}ms...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  rateLimitMap.set(key, Date.now());
};

const buildSystemPrompt = (): string => {
  return `
  You are selecting URLs for a "second brain" app that helps users remember content they'll FORGET where they found it.

  CRITICAL DISTINCTION:
  - SAVE: Content from random websites users will forget the location of
  - IGNORE: Official documentation/sites users can easily find again by searching

  ✅ INCLUDE (Worth Remembering):
  - Blog articles on specific topics (cooking, optimization, debugging, etc.)
  - Personal experience posts (Medium, Dev.to, personal blogs)
  - News articles (sports, tech news, stories)
  - Case studies, startup stories, failure stories
  - Tutorials from random blogs (not official docs)
  - Forum answers (Stack Overflow specific answers, Reddit threads)
  - Opinion pieces, think pieces
  - "How I solved X" type articles
  - Product reviews, comparisons

  ❌ EXCLUDE (Easy to Find Again):
  - Official documentation (React docs, Supabase docs, OpenAI docs, etc.)
  - Any URL containing: /docs/, /guide/, /documentation/, /api/, /reference/
  - Sites ending in: .dev/guide, .io/docs
  - Getting started pages (/getting-started, /quickstart)
  - GitHub repositories, code files, or tree views
  - Company websites (homepages, about pages, pricing)
  - Google Docs, Google Drive
  - Product landing pages
  - Tool/framework official sites (electron-vite.org, tailwindcss.com)

  REASONING:
  If user needs React docs, they'll Google "React docs" - always findable.
  If user read "how I debugged a weird React issue" on some blog - they'll forget the URL.

  Consider:
  1. Is this from an OFFICIAL site? → EXCLUDE
  2. Is this a PERSONAL/BLOG article? → INCLUDE
  3. Is this NEWS or OPINION? → INCLUDE
  4. Would user forget where they found this? → INCLUDE
  5. Can user easily Google this again? → EXCLUDE

  Respond ONLY with a JSON array:
  ["url1", "url2", "url3", ...]

  Return exactly ${CONFIG.AI_DESIRED_SELECTION} URLs, ordered by quality (best first).
  `;
};

const buildUserPrompt = (urlData: string): string => {
  return `
  Here are the URLs to analyze (ordered by recency, most recent first):

  ${urlData}

  Select the top ${CONFIG.AI_DESIRED_SELECTION} or even fewer but URLs must contain the most valuable, informative content for a personal knowledge base.
  `;
};

const prepareUrlsForAI = (entries: BrowserHistoryEntry[]): string => {
  // Sort by recency (most recent first) - this gives AI context
  const sorted = [...entries].sort((a, b) => b.visitTime.getTime() - a.visitTime.getTime());

  // Take top N to avoid token limits
  const toSend = sorted.slice(0, CONFIG.MAX_URLS_TO_SEND_AI);

  // Format as JSON array for AI
  const urlData = toSend.map((entry, index) => ({
    index: index + 1,
    url: entry.url,
    title: entry.title,
    visitCount: entry.visitCount
  }));

  return JSON.stringify(urlData, null, 2);
};

function formatSourcesForAI(memories: RankedMemory[]): string {
  return memories
    .map((memory, index) => {
      return `[${index + 1}] ${memory.title}
URL: ${memory.url}
Summary: ${memory.summary}`;
    })
    .join('\n\n');
}

export const getTopRankedUrls = async (entries: BrowserHistoryEntry[]): Promise<string[]> => {
  const systemPrompt = buildSystemPrompt();
  const urlData = prepareUrlsForAI(entries);
  const userPrompt = buildUserPrompt(urlData);
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    temperature: 0.1,
    max_completion_tokens: 1500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  });
  const raw = response.choices[0].message.content ?? '[]';
  try {
    return JSON.parse(raw);
  } catch (err) {
    // console.error('Failed to parse AI output', err);
    return [];
  }
};

export const generateAIAnswer = async (
  query: string,
  memories: RankedMemory[]
): Promise<{ answer: string; sourceIndices: number[] }> => {
  const sourcesText = formatSourcesForAI(memories);
  const systemPrompt = `You are a helpful assistant that answers questions based on the user's saved articles.

IMPORTANT RULES:
1. ONLY use information from the provided sources
2. Cite sources by their number [1], [2], etc.
3. If sources don't contain the answer, say so clearly
4. Keep answers concise (2-3 sentences)
5. Always reference which sources you used

Example:
User: "What did I read about cooking steak?"
Assistant: "Based on your saved articles, the reverse sear method is recommended [1][2]. Cook the steak in the oven at low temperature until it reaches 125°F, then sear in a hot pan for 1-2 minutes per side [1]."`;
  const userPrompt = `Here are the user's saved articles:

${sourcesText}

User's question: ${query}

Provide a helpful answer based ONLY on the sources above. Cite sources using [1], [2], etc.`;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_completion_tokens: 500
    });
    const answer = response.choices[0].message.content;
    if (!answer || answer.trim().length === 0) {
      return {
        answer: "I couldn't find an answer in your saved articles.",
        sourceIndices: []
      };
    }

    // Extract which sources were cited
    const citationRegex = /\[?(\d+)\]?/g;
    const citations = new Set<number>();

    let match: RegExpExecArray | null;

    while ((match = citationRegex.exec(answer)) !== null) {
      const index = parseInt(match[1], 10) - 1; // Convert to 0-based index
      if (index >= 0 && index < memories.length) {
        citations.add(index);
      }
    }
    if (citations.size === 0) {
      return {
        answer: "I couldn't find an answer in your saved articles.",
        sourceIndices: []
      };
    }

    return {
      answer,
      sourceIndices: Array.from(citations).sort((a, b) => a - b)
    };
  } catch (err) {
    throw new Error(
      `Failed to generate AI answer: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
};

export const summarize = async (text: string): Promise<any> => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  if (text.trim().length > 20000) {
    throw new Error('Text too long. Maximum 20,000 characters');
  }

  // check cache
  const cacheKey = crypto.createHash('sha256').update(text).digest('hex');
  if (summaryCache.has(cacheKey)) {
    // console.log('✅ Returning cached summary');
    return summaryCache.get(cacheKey);
  }

  await ensureRateLimit('summarize');

  try {
    // console.log('🔄 Calling OpenAI API for summary...');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates concise summaries.'
        },
        {
          role: 'user',
          content: `Summarize this in 2-3 sentences: ${text}`
        }
      ],
      max_completion_tokens: 150,
      temperature: 0.5
    });
    const summary = response.choices[0].message.content;
    summaryCache.set(cacheKey, summary!);
    // console.log('✅ Summary generated');
    return summary;
  } catch (error) {
    // console.error('❌ Summarization error:', (error as Error).message);
    throw new Error(`OpenAI API error: ${(error as Error).message}`);
  }
};

export const embed = async (text: string): Promise<number[]> => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  if (text.length > 20000) {
    // Embedding limits
    throw new Error('Text too long. Maximum 20,000 characters.');
  }

  // Rate limiting

  // Check cache
  const cacheKey = crypto.createHash('sha256').update(text).digest('hex');
  // Simple cap-based cache eviction (MVP)
  // Clears entire cache when limit is reached
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    embeddingCache.clear();
  }
  await ensureRateLimit('embed');
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // console.log('🔄 Calling OpenAI API for embedding...');
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });

    const embedding = response.data[0].embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error('Invalid embedding returned from OpenAI');
    }

    embeddingCache.set(cacheKey, embedding);
    // console.log('✅ Embedding generated');
    return embedding;
  } catch (error: any) {
    // console.error('❌ Embedding error:', error.message);
    throw new Error(`OpenAI API error: ${error.message}`);
  }
};
