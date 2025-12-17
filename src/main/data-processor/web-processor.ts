/* data-processor/web-processor.ts
 */

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import type { IPCRequest, IPCResponse } from '../ipc-server';
import { findByCanonicalUrl, saveToDb } from '../database/savedb';
import { PROFILE_ID } from '../types';

const sanitizeContentSingleLine = (s: string): string => {
  if (!s) return '';
  // return s.replace(/\s+/g, ' ').trim();
  return s.trim();
};

export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    url.hash = '';

    const params = new URLSearchParams(url.search);
    const allowed = new URLSearchParams();
    for (const [k, v] of params.entries()) {
      if (!k.startsWith('utm_') && k !== 'ref') {
        allowed.append(k, v);
      }
    }

    url.search = allowed.toString()
      ? '?' +
        [...allowed.entries()]
          .sort()
          .map(([k, v]) => `${k}=${v}`)
          .join('&')
      : '';

    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return raw;
  }
}

const processWithReadability = (html: string, url: string): any => {
  try {
    const dom = new JSDOM(html, { url });
    const r = new Readability(dom.window.document);
    const article = r.parse();
    if (!article) return null;
    const text = article.textContent || '';
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const readingTime = Math.ceil(wordCount / 200);
    return {
      title: article.title,
      byline: article.byline,
      content: text,
      htmlContent: article.content,
      excerpt: article.excerpt,
      wordCount,
      readingTime
    };
  } catch {
    return null;
  }
};

export function timeAgo(from: Date | number | string): string {
  const now = Date.now();
  const past = new Date(from).getTime();
  const diff = Math.max(0, now - past);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)} minutes ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hours ago`;
  if (diff < week) return `${Math.floor(diff / day)} days ago`;
  if (diff < month) return `${Math.floor(diff / week)} weeks ago`;
  return `${Math.floor(diff / month)} months ago`;
}

export const processedIncomingWebData = async (req: IPCRequest): Promise<IPCResponse | null> => {
  // Process asynchronously
  try {
    let content = req.text || '';
    let title = req.title || '';
    let byline: string | undefined = undefined;
    let excerpt: string | undefined = undefined;
    let wordCount = req.wordCount || 0;
    let readingTime: number | undefined = undefined;

    const canonicalUrl = req.url ? canonicalizeUrl(req.url) : null;

    if (canonicalUrl && !req.selectedOnly) {
      const existing = await findByCanonicalUrl(canonicalUrl, PROFILE_ID);
      if (existing) {
        const ago = timeAgo(existing.created_at);
        return {
          id: req.id,
          ok: false,
          reason: `You saved this ${ago}.`,
          processed: {
            savedId: existing.id
          }
        };
      }
    }

    if (req.html && req.html.length > 0) {
      const processed = processWithReadability(req.html, req.url!);
      if (processed) {
        title = processed.title || title;
        content = processed.content || content;
        byline = processed.byline || undefined;
        excerpt = processed.excerpt || undefined;
        wordCount = processed.wordCount || wordCount;
        readingTime = processed.readingTime;
      }
    }

    // Fallback excerpt
    if (!excerpt) {
      excerpt = (content || '').slice(0, 300);
    }

    // sanitize content to single-line before sending back to native host
    const singleLineContent = sanitizeContentSingleLine(content);
    const singleLineExcerpt = sanitizeContentSingleLine(excerpt);

    const response: IPCResponse = {
      id: req.id,
      ok: true,
      processed: {
        url: req.url,
        canonicalUrl,
        title,
        content: singleLineContent,
        wordCount,
        excerpt: singleLineExcerpt,
        byline: byline || undefined,
        readingTime,
        savedId: ''
      }
    };
    await saveToDb(response!.processed!, 'web', PROFILE_ID);
    return response;
  } catch (err) {
    console.log('Processing error: ' + String(err));
    return null;
  }
};
