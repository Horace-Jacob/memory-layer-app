import { useEffect, useState, useRef, useCallback, type FC } from 'react';
import { Timer, Globe2, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { timeAgo } from '@renderer/utils';

interface IMemory {
  id: number;
  title: string;
  summary: string;
  url: string;
  createdAt?: string;
  source_type: string;
}

const PAGE_SIZE = 10;

export const DashboardPage: FC = () => {
  const [memories, setMemories] = useState<IMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const observerTarget = useRef<HTMLDivElement>(null);

  const openLink = (url: string): void => {
    window.open(url, '_blank');
  };

  const fetchMemories = useCallback(
    async (currentOffset: number): Promise<void> => {
      if (loading || !hasMore) return;

      setLoading(true);
      try {
        const rows: IMemory[] = (await window.electronAPI.db.query(
          `SELECT id, title, summary, url, source_type, created_at as createdAt
         FROM memories
         ORDER BY created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${currentOffset}`
        )) as IMemory[];

        if (rows.length < PAGE_SIZE) {
          setHasMore(false);
        }

        setMemories((prev) => [...prev, ...rows]);
        setOffset(currentOffset + PAGE_SIZE);
      } catch (err) {
        console.error('Failed to load memories:', err);
      } finally {
        setLoading(false);
      }
    },
    [loading, hasMore]
  );

  // Refresh function - resets everything and loads from scratch
  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    setMemories([]);
    setOffset(0);
    setHasMore(true);

    try {
      const rows: IMemory[] = (await window.electronAPI.db.query(
        `SELECT id, title, summary, url, source_type, created_at as createdAt
         FROM memories
         ORDER BY created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET 0`
      )) as IMemory[];

      if (rows.length < PAGE_SIZE) {
        setHasMore(false);
      }

      setMemories(rows);
      setOffset(PAGE_SIZE);
    } catch (err) {
      console.error('Failed to refresh memories:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchMemories(0);
  }, []);

  const handleDelete = async (id: number): Promise<void> => {
    if (!confirm('Delete this memory? This cannot be undone.')) return;

    try {
      await window.electronAPI.db.deleteMemoryById(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Failed to delete memory. Please try again.');
    }
  };

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchMemories(offset);
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [offset, hasMore, loading, fetchMemories]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header - Notion style with subtle border */}
      <div className="border-b border-border">
        <div className="max-w-5xl mx-auto px-12 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-semibold text-card-foreground mb-2">Home</h1>
              <p className="text-sm text-card-foreground">Your memories</p>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh memories"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm text-card-foreground">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-12 py-6">
        {memories.length > 0 ? (
          <div className="space-y-1">
            {memories.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="group w-full px-3 py-2 hover:bg-secondary rounded transition-colors cursor-pointer relative"
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-error rounded-md text-gray-400 hover:text-card-foreground"
                  title="Delete memory"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                {/* Title */}
                <div className="text-sm font-medium text-card-foreground mb-1 pr-8">
                  {item.title}
                </div>

                {/* Summary */}
                <div className="text-sm text-card-foreground mb-2 line-clamp-2">{item.summary}</div>

                {/* Metadata row */}
                <div className="flex items-center gap-4 text-xs text-card-foreground">
                  {item.createdAt && (
                    <div className="flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5" />
                      <span>{timeAgo(item.createdAt)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5" />
                    <span>{item.source_type}</span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLink(item.url);
                    }}
                  >
                    <Globe2 className="w-3.5 h-3.5" />
                    <span className="truncate max-w-xs">{item.url}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-card-foreground" />
              </div>
            )}

            {/* Intersection observer target */}
            <div ref={observerTarget} className="h-4" />

            {/* End of results message */}
            {!hasMore && memories.length > 0 && (
              <div className="text-center py-8 text-xs text-card-foreground">End of memories</div>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-card-foreground" />
          </div>
        ) : (
          <div className="text-center py-16 text-sm text-card-foreground">No memories yet</div>
        )}
      </div>
    </div>
  );
};
