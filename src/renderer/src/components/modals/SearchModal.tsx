// SearchModal.tsx
import { useState, useEffect, useRef, type FC } from 'react';
import {
  Search,
  X,
  Clock,
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
  Calendar,
  BarChart3
} from 'lucide-react';
import { useAuth } from '@renderer/context/AuthContext';
import { PROFILE_ID } from '@renderer/types/profileId';

interface SearchResult {
  id: string;
  url: string;
  title: string;
  summary: string;
  visitCount: number;
  createdAt: Date;
  similarity?: number;
}

interface AIResponse {
  answer: string;
  sources: SearchResult[];
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<Array<{ query: string; date: string }>>([]);
  const { session } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    const loadRecentSearches = async (): Promise<void> => {
      if (!session?.user?.id) return;

      try {
        const result = await window.electronAPI.search.getRecentSearches(PROFILE_ID);
        if (result.success && result.data) {
          setRecentSearches(result.data);
        }
      } catch (error) {
        console.error('Failed to load recent searches:', error);
      }
    };
    if (isOpen) {
      inputRef.current?.focus();
      loadRecentSearches();
    } else {
      // Reset state when modal closes
      setQuery('');
      setAiResponse(null);
      setError(null);
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (!isOpen) {
          // You'll trigger this from parent component
        }
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSearch = async (searchQuery?: string): Promise<void> => {
    const queryToSearch = searchQuery || query;

    if (!queryToSearch.trim()) return;
    if (!session?.user?.id) {
      setError('Please sign in to search');
      return;
    }

    setIsSearching(true);
    setError(null);
    setAiResponse(null);

    try {
      // Call the real API
      const result = await window.electronAPI.search.semanticSearch(PROFILE_ID, queryToSearch);

      if (result.success && result.data) {
        setAiResponse(result.data);
      } else {
        setError(result.error || 'Search failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRecentSearchClick = (recentQuery: string): void => {
    setQuery(recentQuery);
    handleSearch(recentQuery);
  };

  const handleClearSearch = (): void => {
    setQuery('');
    setAiResponse(null);
    setError(null);
    inputRef.current?.focus();
  };

  const formatDate = (date: Date): any => {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-background rounded-2xl shadow-2xl animate-in zoom-in-95 slide-in-from-top-4 duration-200">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="w-5 h-5 text-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="Ask about your saved articles..."
            className="flex-1 text-base text-foreground placeholder-foreground outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={handleClearSearch}
              className="p-1 hover:bg-secondary rounded-md transition-colors"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Loading State */}
          {isSearching && (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <div className="relative">
                <Sparkles className="w-12 h-12 text-blue-500 animate-pulse" />
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm text-foreground mt-4">Searching your memories...</p>
              <p className="text-xs text-secondary-foreground mt-1">Analyzing saved articles</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mx-4 my-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Search failed</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* AI Response */}
          {aiResponse && !isSearching && (
            <div className="p-6 space-y-6">
              {/* Answer */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkles className="w-4 h-4" />
                  <span>Summary</span>
                </div>
                <p className="text-base text-foreground leading-relaxed">{aiResponse.answer}</p>
              </div>

              {/* Sources */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span>Sources ({aiResponse.sources.length})</span>
                </div>

                <div className="space-y-3">
                  {aiResponse.sources.map((source) => (
                    <div
                      key={source.id}
                      className="group p-4 border border-border rounded-xl hover:border-border hover:shadow-sm transition-all duration-200"
                    >
                      {/* Title & URL */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-foreground mb-1 line-clamp-1">
                            {source.title}
                          </h3>
                          <p className="text-xs text-foreground truncate">
                            {new URL(source.url).hostname}
                          </p>
                        </div>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 hover:bg-secondary rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <ExternalLink className="w-4 h-4 text-foreground" />
                        </a>
                      </div>

                      {/* Summary */}
                      <p className="text-sm text-foreground mb-3 line-clamp-2">{source.summary}</p>

                      {/* Metadata */}
                      <div className="flex items-center gap-4 text-xs text-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(new Date(source.createdAt))}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          <span>
                            {source.visitCount} {source.visitCount === 1 ? 'visit' : 'visits'}
                          </span>
                        </div>
                        {source.similarity && (
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span>{Math.round(source.similarity * 100)}% match</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty State - Recent Searches */}
          {!isSearching && !aiResponse && !error && (
            <div className="p-6 space-y-6">
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Recent Searches</span>
                  </div>
                  <div className="space-y-2">
                    {recentSearches.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => handleRecentSearchClick(item.query)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm text-foreground hover:bg-secondary rounded-lg transition-colors group"
                      >
                        <span className="truncate flex-1">{item.query}</span>
                        <span className="text-xs text-foreground ml-2">
                          {formatDate(new Date(item.date))}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Try asking:</div>
                <div className="space-y-2">
                  {[
                    'What did I read about cooking steak?',
                    'Articles about React optimization',
                    'Where did I see that productivity tip?'
                  ].map((example, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setQuery(example);
                        handleSearch(example);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary rounded-lg transition-colors border border-border hover:border-border"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-secondary rounded-b-2xl">
          <div className="flex items-center justify-between text-xs text-foreground">
            <div className="flex items-center gap-4">
              <span>
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-foreground font-mono">
                  Enter
                </kbd>{' '}
                to search
              </span>
              <span>
                Press{' '}
                <kbd className="px-1.5 py-0.5 bg-background border border-border rounded text-foreground font-mono">
                  Esc
                </kbd>{' '}
                to close
              </span>
            </div>
            <span className="text-foreground">AI-powered semantic search</span>
          </div>
        </div>
      </div>
    </div>
  );
};
