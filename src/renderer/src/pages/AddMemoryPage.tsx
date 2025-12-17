import { type FC, JSX, useState } from 'react';
import { Loader2, Link as LinkIcon, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface ProcessingState {
  isProcessing: boolean;
  stage: 'idle' | 'validating' | 'fetching' | 'saving' | 'complete' | 'error';
  message: string;
  progress: number;
}

export const AddMemoryPage: FC = () => {
  const [url, setUrl] = useState('');
  const [state, setState] = useState<ProcessingState>({
    isProcessing: false,
    stage: 'idle',
    message: '',
    progress: 0
  });

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!url.trim()) {
      setState({
        isProcessing: false,
        stage: 'error',
        message: 'Please enter a URL',
        progress: 0
      });
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      setState({
        isProcessing: false,
        stage: 'error',
        message: 'Invalid URL format',
        progress: 0
      });
      return;
    }

    setState({
      isProcessing: true,
      stage: 'validating',
      message: 'Validating URL...',
      progress: 10
    });

    try {
      // Call the electron API to process single URL
      const result = await window.electronAPI.ui.processSingleUrl(url);

      if (result.success) {
        setState({
          isProcessing: false,
          stage: 'complete',
          message: result.message || 'Memory saved successfully!',
          progress: 100
        });

        // Clear the input after success
        setTimeout(() => {
          setUrl('');
          setState({
            isProcessing: false,
            stage: 'idle',
            message: '',
            progress: 0
          });
        }, 3000);
      } else {
        setUrl('');
        setState({
          isProcessing: false,
          stage: 'error',
          message: result.error || 'Failed to process URL',
          progress: 0
        });
      }
    } catch (error) {
      setUrl('');
      setState({
        isProcessing: false,
        stage: 'error',
        message: error instanceof Error ? error.message : 'An error occurred',
        progress: 0
      });
    }
  };

  const getStatusIcon = (): JSX.Element | null => {
    switch (state.stage) {
      case 'complete':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'validating':
      case 'fetching':
      case 'saving':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusColor = (): string => {
    switch (state.stage) {
      case 'complete':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'validating':
      case 'fetching':
      case 'saving':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-3xl mx-auto px-12 py-8">
          <h1 className="text-4xl font-semibold text-card-foreground mb-2">Add Memory</h1>
          <p className="text-sm text-card-foreground">
            Save a webpage to your memory by entering its URL
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-12 py-12">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* URL Input */}
          <div className="space-y-2">
            <label htmlFor="url" className="block text-sm font-medium text-card-foreground">
              Webpage URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <LinkIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                disabled={state.isProcessing}
                className="block w-full pl-10 pr-3 py-3 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent  disabled:cursor-not-allowed text-card-foreground bg-background"
              />
            </div>
            <p className="text-xs text-card-foreground">Enter the full URL including https://</p>
          </div>

          {/* Status Message */}
          {state.stage !== 'idle' && state.message && (
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${getStatusColor()}`}>
              {getStatusIcon()}
              <div className="flex-1">
                <p className="text-sm font-medium">{state.message}</p>
                {state.isProcessing && (
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${state.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={state.isProcessing || !url.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {state.isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <LinkIcon className="w-5 h-5" />
                Add Memory
              </>
            )}
          </button>
        </form>

        {/* Info Section */}
        <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-blue-900">What gets saved?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• The webpage title and main content</li>
                <li>• Automatically filtered for quality and relevance</li>
                <li>• Indexed for semantic search</li>
              </ul>
              <p className="text-xs text-blue-700 mt-3">
                Note: Social media, login pages, and documentation sites are automatically filtered
                out.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
