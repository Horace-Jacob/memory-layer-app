import { Loading } from '@renderer/components/Loading';
import { useAuth } from '@renderer/context/AuthContext';
import { useBrowserHistory } from '@renderer/hooks/useBrowserHistory';
import { type FC, useEffect, useState } from 'react';
import {
  Sparkles,
  Globe,
  Shield,
  Zap,
  ArrowRight,
  Check,
  AlertCircle,
  FileText,
  Clock,
  Chromium
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { skipOnboarding } from '@renderer/services/onboardingService';

export const OnBoardingPage: FC = () => {
  const { session, loading } = useAuth();
  const {
    importHistory,
    loading: importing,
    error,
    result,
    progress,
    processingComplete
  } = useBrowserHistory();
  const [currentStep, setCurrentStep] = useState<'welcome' | 'importing' | 'success'>('welcome');
  const navigate = useNavigate();

  useEffect(() => {
    if (processingComplete && currentStep === 'importing') {
      setCurrentStep('success');

      // Redirect after success
      setTimeout(() => {
        navigate('/');
      }, 2000);
    }
  }, [processingComplete, currentStep, navigate]);

  const handleImport = async (): Promise<void> => {
    setCurrentStep('importing');

    // This returns immediately, processing happens in background
    await importHistory(10);

    // Don't wait for processing to complete, it happens via events
    // The useEffect above will handle the transition to success
  };

  const handleSkip = (): void => {
    // Navigate to main page
    skipOnboarding();
    navigate('/');
  };

  if (loading && !session) {
    return <Loading IsOpen={loading} />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Welcome Step */}
        {currentStep === 'welcome' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-blue-500 to-purple-600 mb-4">
                <Sparkles className="w-8 h-8 text-foreground" />
              </div>
              <h1 className="text-4xl font-semibold text-foreground tracking-tight">
                Welcome to Memory Layer
              </h1>
              <p className="text-lg text-secondary-foreground max-w-md mx-auto">
                Lets personalize your experience by importing your browsing history
              </p>
            </div>

            {/* Feature Cards */}
            <div className="grid gap-4 mt-12">
              <FeatureCard
                icon={<Globe className="w-5 h-5" />}
                title="Smart Context"
                description="We'll analyze your browsing patterns to provide relevant suggestions"
              />
              <FeatureCard
                icon={<Shield className="w-5 h-5" />}
                title="Privacy First"
                description="Your data stays on your device. Nothing is sent to external servers"
              />
              <FeatureCard
                icon={<Zap className="w-5 h-5" />}
                title="Instant Setup"
                description="Takes only a moment to import the last 10 days of history"
              />
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3 mt-12">
              <button
                onClick={handleImport}
                disabled={importing}
                className="group relative w-full px-6 py-4 bg-background hover:bg-secondary text-foreground rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-gray-900/10 hover:shadow-xl hover:shadow-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Chromium className="w-5 h-5" />
                <span>Import Browser History</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={handleSkip}
                className="w-full px-6 py-4 text-foreground hover:text-secondary-foreground hover:bg-secondary rounded-xl font-medium transition-all duration-200"
              >
                Skip for now
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-background border border-border rounded-xl mt-6 animate-in fade-in duration-300">
                <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Import failed</p>
                  <p className="text-sm text-error mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Footer Note */}
            <p className="text-center text-sm text-secondary-foreground mt-8">
              You can always import your history later from settings
            </p>
          </div>
        )}

        {/* Importing Step */}
        {currentStep === 'importing' && (
          <div className="text-center space-y-8 animate-in fade-in duration-500">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-blue-500 to-purple-600 mb-4">
              <div className="relative">
                <Chromium className="w-10 h-10 text-foreground animate-pulse" />
                <div className="absolute -top-1 -right-1">
                  <div className="w-3 h-3 bg-background rounded-full animate-ping" />
                  <div className="absolute top-0 right-0 w-3 h-3 bg-background rounded-full" />
                </div>
              </div>
            </div>

            {/*<div className="space-y-3">
              <h2 className="text-2xl font-semibold text-gray-900">Importing your history...</h2>
              <p className="text-gray-600">This will only take a moment</p>
            </div>*/}

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-foreground">
                {progress?.message || 'Processing...'}
              </h2>
              <p className="text-gray-600">
                {progress?.stage === 'filtering' && 'Filtering your browsing history'}
                {progress?.stage === 'ai-selection' && 'Selecting quality content'}
                {progress?.stage === 'fetching' && 'Extracting content from articles'}
                {progress?.stage === 'complete' && 'Finishing up...'}
              </p>
            </div>

            <div className="max-w-xs mx-auto mt-8">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-linear-to-br from-blue-500 to-purple-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress?.progress || 0}%` }}
                />
              </div>
              <p className="text-xs text-secondary-foreground mt-2">{progress?.progress || 0}%</p>
            </div>

            {/* Current URL being processed */}
            {progress?.currentUrl && (
              <div className="mt-6 p-3 bg-secondary rounded-lg">
                <p className="text-xs text-secondary-foreground truncate">{progress.currentUrl}</p>
              </div>
            )}

            {/* Import Stats */}
            {result && (
              <div className="mt-12 space-y-3">
                <div className="flex items-center justify-center gap-2 text-sm text-secondary-foreground">
                  <Clock className="w-4 h-4" />
                  <span>Scanning last 10 days</span>
                </div>
                {result.totalEntries > 0 && (
                  <div className="flex items-center justify-center gap-2 text-sm text-secondary-foreground">
                    <FileText className="w-4 h-4" />
                    <span>{result.totalEntries} entries found</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Success Step */}
        {currentStep === 'success' && (
          <div className="text-center space-y-8 animate-in fade-in duration-500">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-green-500 to-emerald-600 mb-4">
              <Check className="w-10 h-10 text-foreground" strokeWidth={3} />
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-foreground">All set! 🎉</h2>
              <p className="text-secondary-foreground">
                Successfully imported {result?.totalEntries || 0} entries from{' '}
                {result?.browser.name || 'your browser'}
              </p>
            </div>

            {/* Success Stats */}
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mt-8">
              <StatCard value={result?.totalEntries || 0} label="Entries" />
              <StatCard value="30" label="Days" />
              <StatCard value={result?.browser.name || 'Browser'} label="Source" capitalize />
            </div>

            <p className="text-sm text-secondary-foreground mt-8">
              Redirecting to your workspace...
            </p>
          </div>
        )}
      </div>

      {/* Add custom animation keyframes via style tag */}
      <style>{`
        @keyframes loading {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
};

// Feature Card Component
const FeatureCard: FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border hover:border-border hover:bg-secondary transition-all duration-200 group">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-secondary group-hover:bg-background flex items-center justify-center text-secondary-foreground transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-medium text-foreground mb-1">{title}</h3>
        <p className="text-sm text-secondary-foreground leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard: FC<{
  value: string | number;
  label: string;
  capitalize?: boolean;
}> = ({ value, label, capitalize = false }) => {
  return (
    <div className="p-4 rounded-xl bg-secondary border border-border">
      <div
        className={`text-2xl font-semibold text-foreground mb-1 ${capitalize ? 'capitalize' : ''}`}
      >
        {value}
      </div>
      <div className="text-xs text-secondary-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
};
