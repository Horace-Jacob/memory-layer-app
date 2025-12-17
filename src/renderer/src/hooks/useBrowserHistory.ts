import { useAuth } from '@renderer/context/AuthContext';
import { completeOnboarding } from '@renderer/services/onboardingService';
import { PROFILE_ID } from '@renderer/types/profileId';
import { useCallback, useEffect, useState } from 'react';

interface HistoryRetrievalResult {
  success: boolean;
  entries: BrowserHistoryEntry[];
  browser: BrowserInfo;
  error?: string;
  totalEntries: number;
  dateRange: {
    from: Date;
    to: Date;
  };
}

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  visitTime: Date;
  visitCount: number;
  typedCount?: number;
  lastVisitTime?: Date;
}

export interface BrowserInfo {
  name: 'chrome' | 'firefox' | 'edge' | 'safari' | 'brave' | 'opera' | 'unknown';
  profilePath: string;
  historyDbPath: string;
}

export interface ProcessedHistoryEntry {
  url: string;
  normalizedUrl: string;
  title: string;
  content: string;
  contentLength: number;
  wordCount: number;
  visitCount: number;
  visitTime: Date;
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface ProcessingProgress {
  stage: 'filtering' | 'ai-selection' | 'fetching' | 'complete' | 'error';
  message: string;
  progress: number; // 0-100
  currentUrl?: string;
  stats?: Partial<ProcessingResult['stats']>;
}

export interface ScoreBreakdown {
  visitCountScore: number;
  recencyScore: number;
  titleQualityScore: number;
  contentQualityScore: number;
  urlStructureScore: number;
  totalScore: number;
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

export const useBrowserHistory = (): {
  importHistory: (days: number) => Promise<void>;
  loading: boolean;
  error: string | null;
  result: HistoryRetrievalResult | null;
  progress: ProcessingProgress | null;
  processingComplete: boolean;
} => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HistoryRetrievalResult | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [processingComplete, setProcessingComplete] = useState(false);
  const { session } = useAuth();

  // Listen for progress updates
  useEffect(() => {
    const handleProgress = (progressData: ProcessingProgress): void => {
      console.log('Progress update:', progressData);
      setProgress(progressData);
    };

    const handleComplete = async (processingResult: ProcessingResult): Promise<void> => {
      console.log('Processing complete:', processingResult);

      if (processingResult.success && session) {
        try {
          await completeOnboarding(session.user.id);
        } catch (err) {
          console.error('Failed to complete onboarding:', err);
        }
      }

      setProcessingComplete(true);
      setLoading(false);
    };

    const handleError = (error: Error): void => {
      console.error('Processing error:', error);
      setError(error.message);
      setLoading(false);
    };

    // Register listeners
    window.electronAPI.browser.onProcessingProgress(handleProgress);
    window.electronAPI.browser.onProcessingComplete(handleComplete);
    window.electronAPI.browser.onProcessingError(handleError);

    // Cleanup
    return () => {
      window.electronAPI.browser.offProcessingProgress(handleProgress);
      window.electronAPI.browser.offProcessingComplete(handleComplete);
      window.electronAPI.browser.offProcessingError(handleError);
    };
  }, [session]);

  const importHistory = useCallback(async (days: number): Promise<void> => {
    setLoading(true);
    setError(null);
    setProgress(null);
    setProcessingComplete(false);

    try {
      // Step 1: Get browser history (fast, doesn't block)
      const data = await window.electronAPI.browser.getBrowserHistory(days);
      setResult(data);

      if (!data.success) {
        setError(data.error || 'Failed to import history');
        setLoading(false);
        return;
      }

      // Step 2: Start processing in background (non-blocking)
      // This returns immediately, processing continues in background
      window.electronAPI.browser.startProcessingHistory(PROFILE_ID, data.entries);

      // Don't await! Let it run in background
      // Progress updates will come via events
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setLoading(false);
    }
  }, []);

  return {
    importHistory,
    loading,
    error,
    result,
    progress,
    processingComplete
  };
};
