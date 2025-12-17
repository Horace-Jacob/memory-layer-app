import type { BrowserHistoryEntry } from '../browser-history-service';
import { applyBlocklist } from './history-processor';
import { findByCanonicalUrl, saveToDb } from '../database/savedb';
import { ipcMain } from 'electron';
import path from 'path';
import { Worker } from 'worker_threads';
import { PROFILE_ID } from '../types';
import { canonicalizeUrl, timeAgo } from './web-processor';

export const registerContentFetchHandler = (): void => {
  ipcMain.handle('process-single-url', async (_event, url: string) => {
    try {
      // Create a mock history entry for the single URL
      const mockEntry: BrowserHistoryEntry = {
        url: url,
        title: '', // Will be extracted from the page
        visitCount: 1,
        visitTime: new Date()
      };

      const canonicalUrl = canonicalizeUrl(url);

      // Check if URL is blocked
      const filtered = applyBlocklist([mockEntry]);

      if (filtered.length === 0) {
        return {
          success: false,
          error:
            'This URL is blocked (social media, login pages, or documentation sites are filtered out)'
        };
      }

      // Fetch the content using the same worker logic
      const workerPath = path.join(__dirname, 'content-fetch-worker.js');

      return new Promise((resolve) => {
        const worker = new Worker(workerPath);
        worker.on('message', async (result: any) => {
          worker.terminate();
          if (!result.success || !result.content) {
            resolve({
              success: false,
              error:
                'Failed to fetch content from URL. The page might be inaccessible or contain insufficient content.'
            });
            return;
          }

          const existing = await findByCanonicalUrl(canonicalUrl, PROFILE_ID);
          if (existing) {
            const ago = timeAgo(existing.created_at);
            resolve({
              success: false,
              error: `You saved this ${ago}.`
            });
            return;
          }

          try {
            const userId = PROFILE_ID;

            await saveToDb(
              {
                url: url,
                canonicalUrl,
                title: result.title || 'Untitled',
                content: result.content.content
              },
              'manual',
              userId
            );

            resolve({
              success: true,
              message: 'Memory saved successfully!'
            });
          } catch (err) {
            console.error('Failed to save to database:', err);
            resolve({
              success: false,
              error: 'Failed to save to database'
            });
          }
        });

        worker.on('error', (error: Error) => {
          console.error('Worker error:', error);
          worker.terminate();
          resolve({
            success: false,
            error: 'Failed to process URL'
          });
        });

        worker.postMessage({ url, index: 0 });

        // Timeout after 30 seconds
        setTimeout(() => {
          worker.terminate();
          resolve({
            success: false,
            error: 'Request timeout - the page took too long to load'
          });
        }, 30000);
      });
    } catch (error) {
      console.error('Error processing single URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  });
};
