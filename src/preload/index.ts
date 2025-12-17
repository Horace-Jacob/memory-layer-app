import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { LocalSetting } from '../main/database/local-setting';
// import { HistoryRetrievalResult } from '../main/browser-history-service';

// Custom APIs for renderer
const api = {};
type QueryDBParams = string | number | boolean | null;

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
    contextBridge.exposeInMainWorld('electronAPI', {
      db: {
        query: (sql: string, params: QueryDBParams[] = []) =>
          ipcRenderer.invoke('db-query', sql, params),
        deleteMemoryById: (id: number) => ipcRenderer.invoke('delete-memory', id)
      },
      ml: {
        init: () => ipcRenderer.invoke('ml-init'),
        summarize: (text: string) => ipcRenderer.invoke('ml-summarize', text),
        embed: (texts: string[]) => ipcRenderer.invoke('ml-embed', texts),
        answer: (question: string) => ipcRenderer.invoke('ml-answer', question),
        seedDummy: () => ipcRenderer.invoke('ml-seed')
      },
      auth: {
        // Triggered when the main process receives a deep link
        onAuthCallback: (callback: (url: string) => void) => {
          ipcRenderer.on('supabase-auth-callback', (_event, url) => callback(url));
        },

        // Open the system browser for login
        openExternalUrl: (url: string) => ipcRenderer.send('open-external-url', url),
        encrypt: (key: string, value: string) =>
          ipcRenderer.invoke('safe-storage-encrypt', key, value),
        decrypt: (key: string, value: string) =>
          ipcRenderer.invoke('safe-storage-decrypt', key, value)
      },
      local: {
        getLocalSetting: () => ipcRenderer.invoke('get-local-setting'),
        updateLocalSetting: (settings: Partial<LocalSetting>) =>
          ipcRenderer.invoke('update-local-setting', settings),
        updateLocalProfileId: (userId: string) =>
          ipcRenderer.invoke('update-local-profile-id', userId),
        resetLocalSetting: () => ipcRenderer.invoke('reset-local-setting'),
        skipOnboarding: () => ipcRenderer.invoke('skip-onboarding')
      },
      browser: {
        getBrowserHistory: (days: number) => ipcRenderer.invoke('get-browser-history', days),

        // Start processing (non-blocking, returns immediately)
        startProcessingHistory: (userId: string, entries: any[]) =>
          ipcRenderer.send('browser:startProcessingHistory', userId, entries),

        // Progress listener
        onProcessingProgress: (callback: (progress: any) => void) => {
          const listener = (_event: any, progress: any): any => callback(progress);
          ipcRenderer.on('browser:processingProgress', listener);
        },
        offProcessingProgress: (_callback: (progress: any) => void) => {
          ipcRenderer.removeAllListeners('browser:processingProgress');
        },

        // Complete listener
        onProcessingComplete: (callback: (result: any) => void) => {
          const listener = (_event: any, result: any): any => callback(result);
          ipcRenderer.on('browser:processingComplete', listener);
        },
        offProcessingComplete: (_callback: (result: any) => void) => {
          ipcRenderer.removeAllListeners('browser:processingComplete');
        },

        // Error listener
        onProcessingError: (callback: (error: any) => void) => {
          const listener = (_event: any, error: any): any => callback(error);
          ipcRenderer.on('browser:processingError', listener);
        },
        offProcessingError: (_callback: (error: any) => void) => {
          ipcRenderer.removeAllListeners('browser:processingError');
        }
      },
      search: {
        semanticSearch: (userId: string, query: string) =>
          ipcRenderer.invoke('search:semanticSearch', userId, query),

        getStats: (userId: string) => ipcRenderer.invoke('search:getStats', userId),
        getRecentSearches: (userId: string) =>
          ipcRenderer.invoke('search:getRecentSearches', userId)
      },
      updater: {
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates-manual')
      },
      ui: {
        processSingleUrl: (url: string) => ipcRenderer.invoke('process-single-url', url)
      }
    });
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
  // @ts-ignore (define in dts)
  window.electronAPI = {
    db: {
      query: (sql: string, params: QueryDBParams[] = []) =>
        ipcRenderer.invoke('db-query', sql, params)
    },
    ml: {
      init: () => ipcRenderer.invoke('ml-init'),
      summarize: (text: string) => ipcRenderer.invoke('ml-summarize', text),
      embed: (texts: string[]) => ipcRenderer.invoke('ml-embed', texts),
      answer: (question: string) => ipcRenderer.invoke('ml-answer', question),
      seedDummy: () => ipcRenderer.invoke('ml-seed')
    }
  };
}
