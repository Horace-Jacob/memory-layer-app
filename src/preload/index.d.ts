import { ElectronAPI } from '@electron-toolkit/preload';

export type QueryDBParams = string | number | boolean | null;

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    electronAPI: {
      db: {
        query: (sql: string, params: QueryDBParams[] = []) => Promise<unknown>;
        deleteMemoryById: (id: number) => Promise<void>;
      };
      ml: {
        init: () => Promise<void>;
        summarize: (text: string) => Promise<string>;
        embed: (texts: string[]) => Promise<string[]>;
        answer: (question: string) => Promise<string>;
        seedDummy: () => Promise<void>;
      };
      auth: {
        onAuthCallback: (callback: (url: string) => void) => void;
        openExternalUrl: (url: string) => void;
        encrypt: (key: string, value: string) => Promise<string>;
        decrypt: (key: string, value: string) => Promise<string>;
      };
      local: {
        getLocalSetting: () => Promise<void>;
        updateLocalSetting: (settings: Partial<LocalSetting>) => Promise<void>;
        updateLocalProfileId: (userId: string) => Promise<void>;
        resetLocalSetting: () => Promise<void>;
        skipOnboarding: () => Promise<void>;
      };
      browser: {
        getBrowserHistory: (days: number) => Promise<HistoryRetrievalResult>;
        startProcessingHistory: (userId: string, entries: BrowserHistoryEntry[]) => Promise<void>;
        processHistoryForOnboarding: (
          entries: BrowserHistoryEntry[]
        ) => Promise<ProcessedHistoryEntry[]>;
        onProcessingProgress: (callback: (progress: ProcessingProgress) => void) => void;
        offProcessingProgress: (callback: (progress: ProcessingProgress) => void) => void;
        onProcessingComplete: (callback: (result: ProcessingResult) => void) => void;
        offProcessingComplete: (callback: (result: ProcessingResult) => void) => void;
        onProcessingError: (callback: (error: Error) => void) => void;
        offProcessingError: (callback: (error: Error) => void) => void;
      };
      search: {
        semanticSearch: (
          userId: string,
          query: string
        ) => Promise<{
          success: boolean;
          data?: AIResponse;
          error?: string;
        }>;
        getStats: (userId: string) => Promise<{
          success: boolean;
          data?: SearchStats;
          error?: string;
        }>;
        getRecentSearches: (userId: string) => Promise<{
          success: boolean;
          data?: RecentSearch[];
          error?: string;
        }>;
      };
      updater: {
        checkForUpdates: () => Promise<void>;
      };
      ui: {
        processSingleUrl: (
          url: string
        ) => Promise<{ success: boolean; message?: string; error?: string }>;
      };
    };
  }
}
