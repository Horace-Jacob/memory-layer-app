import { parentPort } from 'worker_threads';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

interface FetchJob {
  url: string;
  index: number;
}

interface FetchResult {
  index: number;
  title: string;
  url: string;
  success: boolean;
  content?: {
    content: string;
    contentLength: number;
    wordCount: number;
  };
}

const FETCH_TIMEOUT = 10000;
const MIN_CONTENT_LENGTH = 400;

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

async function extractContent(url: string): Promise<any> {
  try {
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      return null;
    }

    const content = article.textContent.trim();
    const contentLength = content.length;
    const wordCount = content.split(/\s+/).length;

    if (contentLength < MIN_CONTENT_LENGTH) {
      return null;
    }

    return { title: article.title, content, contentLength, wordCount };
  } catch (error) {
    return null;
  }
}

// Listen for jobs from main thread
if (parentPort) {
  parentPort.on('message', async (job: FetchJob) => {
    const extractedContent = await extractContent(job.url);

    const result: FetchResult = {
      index: job.index,
      title: extractedContent.title,
      url: job.url,
      success: !!extractedContent,
      content: extractedContent || undefined
    };

    parentPort!.postMessage(result);
  });
}
