import type { BrowserHistoryEntry } from '../browser-history-service';
import { getTopRankedUrls } from './ai-processor';
import { saveToDb } from '../database/savedb';
import { Worker } from 'worker_threads';
import * as path from 'path';

export interface ProcessedHistoryEntry {
  url: string;
  title: string;
  content: string;
  contentLength: number;
  wordCount: number;
  visitCount: number;
  visitTime: Date;
}

export interface ProcessingProgress {
  stage: 'filtering' | 'ai-selection' | 'fetching' | 'complete' | 'error';
  message: string;
  progress: number; // 0-100
  currentUrl?: string;
  stats?: Partial<ProcessingResult['stats']>;
}

export interface ProcessingResult {
  success: boolean;
  processedEntries: ProcessedHistoryEntry[];
  stats: {
    totalInput: number;
    afterBlocklist: number;
    sentToAI: number;
    aiSelected: number;
    successfullyFetched: number;
    finalCount: number;
  };
  message?: string;
  error?: string;
}

export const CONFIG = {
  DAYS_TO_FETCH: 10,
  MAX_URLS_TO_SEND_AI: 500, // Send max 800 URLs to AI
  AI_DESIRED_SELECTION: 20, // Ask AI to select top 30
  FINAL_PROCESS_TARGET: 20, // Try to get at least 20 successfully fetched
  MIN_CONTENT_LENGTH: 400,
  FETCH_TIMEOUT: 10000,
  RATE_LIMIT_DELAY: 2000,
  PARALLEL_BATCH_SIZE: 5,
  OPENAI_MODEL: 'gpt-4o-mini'
};

const BLOCKED_DOMAINS = [
  // Social Media
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'reddit.com',
  'tiktok.com',
  'snapchat.com',
  'pinterest.com',

  // Video Platforms
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'vimeo.com',

  // Email & Communication
  'mail.google.com',
  'outlook.live.com',
  'outlook.office.com',
  'yahoo.com/mail',
  'slack.com',
  'discord.com',
  'teams.microsoft.com',
  'zoom.us',

  // Cloud Storage
  'drive.google.com',
  'dropbox.com',
  'onedrive.live.com',
  'docs.google.com', // Google Docs

  // Dev Package Managers
  'npmjs.com',
  'npm.io',
  'cdnjs.com',
  'unpkg.com',
  'jsdelivr.net',

  // Icon Libraries
  'lucide.dev',
  'fontawesome.com',
  'heroicons.com',
  'flaticon.com',

  // Search Engines (results pages)
  'google.com/search',
  'bing.com/search',
  'duckduckgo.com/',

  // Analytics
  'analytics.google.com',

  // Version Control
  'github.com',
  'gitlab.com',
  'bitbucket.org'
];

const BLOCKED_URL_PATTERNS = [
  // Auth flows
  /\/(login|signin|sign-in|signup|sign-up|register|auth|oauth|sso|callback|logout)/i,

  // API endpoints
  /\/api\//i,
  /\/graphql/i,

  // Documentation patterns (official docs)
  /\/docs?\//i,
  /\/documentation\//i,
  /\/guide/i,
  /\/guides\//i,
  /\/reference/i,
  /\/getting-started/i,
  /\/quickstart/i,
  /readthedocs\.io/i,

  // File downloads
  /\.(pdf|zip|rar|tar|gz|exe|dmg|pkg|deb|rpm)$/i,

  // Media files
  /\.(jpg|jpeg|png|gif|svg|webp|mp4|mp3|wav|avi|mov)$/i,

  // Development
  /localhost/i,
  /127\.0\.0\.1/i,
  /192\.168\./i,
  /\.local/i,
  /^file:\/\//i,

  // Query params indicating redirects
  /[?&](redirect|return|returnUrl|next|continue|callback)=/i
];

export function applyBlocklist(entries: BrowserHistoryEntry[]): BrowserHistoryEntry[] {
  return entries.filter((entry) => {
    const url = entry.url.toLowerCase();

    // Check blocked domains
    const isDomainBlocked = BLOCKED_DOMAINS.some((domain) => url.includes(domain));
    if (isDomainBlocked) return false;

    // Check blocked patterns
    const isPatternBlocked = BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(entry.url));
    if (isPatternBlocked) return false;

    return true;
  });
}

function deduplicateByUrl(entries: BrowserHistoryEntry[]): BrowserHistoryEntry[] {
  const seenUrls = new Map<string, BrowserHistoryEntry>();

  entries.forEach((entry) => {
    const normalizedUrl = entry.url.toLowerCase().replace(/\/$/, ''); // Remove trailing slash

    if (seenUrls.has(normalizedUrl)) {
      const existing = seenUrls.get(normalizedUrl)!;
      if (entry.visitCount > existing.visitCount) {
        seenUrls.set(normalizedUrl, entry);
      }
    } else {
      seenUrls.set(normalizedUrl, entry);
    }
  });

  return Array.from(seenUrls.values());
}

async function selectQualityUrlsWithAI(entries: BrowserHistoryEntry[]): Promise<string[]> {
  try {
    const topRankedURLs = await getTopRankedUrls(entries);
    return topRankedURLs;
  } catch {
    throw new Error('Failed to fetch URL data');
  }
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// STEP 6: CHECK INTERNET CONNECTION
// ============================================================================

async function checkInternetConnection(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('https://www.google.com', 5000);
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchContentInBatchesWithProgress(
  urls: string[],
  originalEntries: BrowserHistoryEntry[],
  progressCallback: (current: number, total: number) => void
): Promise<ProcessedHistoryEntry[]> {
  const processed: ProcessedHistoryEntry[] = [];
  const entryMap = new Map<string, BrowserHistoryEntry>();

  originalEntries.forEach((entry) => {
    entryMap.set(entry.url.toLowerCase().replace(/\/$/, ''), entry);
  });

  return new Promise((resolve) => {
    const results: Map<number, any> = new Map();
    let completed = 0;
    let activeWorkers = 0;
    let currentIndex = 0;

    const MAX_WORKERS = 5; // 5 parallel workers
    const workerPath = path.join(__dirname, 'content-fetch-worker.js');

    function createWorker(): any {
      if (currentIndex >= urls.length || activeWorkers >= MAX_WORKERS) {
        return;
      }

      const url = urls[currentIndex];
      const index = currentIndex;
      currentIndex++;
      activeWorkers++;

      const worker = new Worker(workerPath);

      worker.on('message', (result: any) => {
        results.set(result.index, result);
        completed++;
        activeWorkers--;

        progressCallback(completed, urls.length);

        // Process successful result
        if (result.success && result.content) {
          const normalizedUrl = result.url.toLowerCase().replace(/\/$/, '');
          const originalEntry = entryMap.get(normalizedUrl);

          if (originalEntry) {
            processed.push({
              url: originalEntry.url,
              title: originalEntry.title,
              content: result.content.content,
              contentLength: result.content.contentLength,
              wordCount: result.content.wordCount,
              visitCount: originalEntry.visitCount,
              visitTime: originalEntry.visitTime
            });
          }
        }

        worker.terminate();

        // Check if we're done
        if (completed === urls.length) {
          resolve(processed);
        } else {
          // Start next worker
          createWorker();
        }
      });

      worker.on('error', (_error) => {
        completed++;
        activeWorkers--;
        worker.terminate();

        if (completed === urls.length) {
          resolve(processed);
        } else {
          createWorker();
        }
      });

      // Send job to worker
      worker.postMessage({ url, index });
    }

    // Start initial batch of workers
    for (let i = 0; i < Math.min(MAX_WORKERS, urls.length); i++) {
      createWorker();
    }
  });
}

export async function processHistoryForOnboardingWithProgress(
  userId: string,
  historyEntries: BrowserHistoryEntry[],
  progressCallback: (progress: ProcessingProgress) => void
): Promise<ProcessingResult> {
  const stats = {
    totalInput: historyEntries.length,
    afterBlocklist: 0,
    sentToAI: 0,
    aiSelected: 0,
    successfullyFetched: 0,
    finalCount: 0
  };

  try {
    // Progress: Starting
    progressCallback({
      stage: 'filtering',
      message: 'Filtering browsing history...',
      progress: 10,
      stats
    });

    // Check internet
    progressCallback({
      stage: 'filtering',
      message: 'Checking internet connection...',
      progress: 15
    });

    const isConnected = await checkInternetConnection();
    if (!isConnected) {
      throw new Error('No internet connection');
    }

    // Apply blocklist
    progressCallback({
      stage: 'filtering',
      message: 'Applying filters...',
      progress: 20
    });

    let filtered = applyBlocklist(historyEntries);
    stats.afterBlocklist = filtered.length;

    if (filtered.length === 0) {
      progressCallback({
        stage: 'complete',
        message: 'No processable history found',
        progress: 100,
        stats
      });
      return {
        success: true,
        processedEntries: [],
        stats,
        message: 'No processable browsing history found.'
      };
    }

    // Deduplicate
    filtered = deduplicateByUrl(filtered);
    stats.sentToAI = Math.min(filtered.length, CONFIG.MAX_URLS_TO_SEND_AI);

    // AI selection
    progressCallback({
      stage: 'ai-selection',
      message: `Analyzing ${stats.sentToAI} URLs...`,
      progress: 30,
      stats
    });

    const selectedUrls = await selectQualityUrlsWithAI(filtered);
    stats.aiSelected = selectedUrls.length;

    if (selectedUrls.length === 0) {
      progressCallback({
        stage: 'complete',
        message: 'No quality content found',
        progress: 100,
        stats
      });
      return {
        success: true,
        processedEntries: [],
        stats,
        message: 'No quality content found in browsing history.'
      };
    }

    progressCallback({
      stage: 'ai-selection',
      message: `Selected ${selectedUrls.length} quality URLs`,
      progress: 40,
      stats
    });

    // Fetch content with progress updates
    progressCallback({
      stage: 'fetching',
      message: 'Fetching content from selected URLs...',
      progress: 50,
      stats
    });
    const processedEntries = await fetchContentInBatchesWithProgress(
      selectedUrls,
      filtered,
      (current, total) => {
        const fetchProgress = 50 + (current / total) * 45; // 50-95%
        progressCallback({
          stage: 'fetching',
          message: `Fetching content (${current}/${total})...`,
          progress: fetchProgress,
          currentUrl: selectedUrls[current - 1],
          stats
        });
      }
    );

    stats.successfullyFetched = processedEntries.length;
    stats.finalCount = processedEntries.length;

    // Complete
    progressCallback({
      stage: 'complete',
      message: `Successfully processed ${processedEntries.length} articles`,
      progress: 100,
      stats
    });

    const message =
      processedEntries.length === 0
        ? 'Could not extract content from selected URLs.'
        : processedEntries.length < CONFIG.FINAL_PROCESS_TARGET
          ? `Successfully processed ${processedEntries.length} articles.`
          : `Successfully processed ${processedEntries.length} high-quality articles.`;

    // Make summary and embeddings here and save to DB
    for (const entry of processedEntries) {
      try {
        await saveToDb(
          {
            url: entry.url,
            title: entry.title,
            content: entry.content
          },
          'browser-history',
          userId
        );
      } catch (err) {
        console.error(`Failed saving ${entry.url}`, err);
      }
    }

    return {
      success: true,
      processedEntries,
      stats,
      message
    };
  } catch (error) {
    progressCallback({
      stage: 'error',
      message: error instanceof Error ? error.message : 'Processing failed',
      progress: 0,
      stats
    });

    throw error;
  }
}
