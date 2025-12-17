import React from 'react';
import { User, ChevronRight, ArrowLeft, DownloadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@renderer/context/AuthContext';
import { Loading } from '@renderer/components/Loading';

const SettingsPage: React.FC = () => {
  const { session, loading } = useAuth();

  const checkForUpdates = async (): Promise<void> => {
    // Implement update check logic here
    await window.electronAPI.updater.checkForUpdates();
  };

  return (
    <>
      {loading && !session ? (
        <Loading IsOpen={loading} />
      ) : (
        <div className="min-h-screen bg-background">
          {/* Header */}
          <div className="border-b border-border">
            <div className="flex items-center max-w-4xl mx-auto px-6 py-4">
              <Link
                to="/"
                className="p-1.5 hover:bg-secondary rounded-md transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="w-5 h-5 text-foreground" />
              </Link>
              <h1 className="text-2xl font-semibold text-foreground ml-1">Settings</h1>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* Account Section */}
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                Account
              </h2>

              <div className="bg-background border border-border rounded-lg hover:bg-secondary transition-colors">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Email</p>
                      <p className="text-sm text-secondary-foreground">{session!.user.email}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-foreground" />
                </div>
              </div>
            </section>

            {/*<section className="mb-10">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                Appearance
              </h2>

              <div className="flex items-center justify-between bg-background p-4 border border-border rounded-lg transition-colors">
                <div>
                  <p className="font-medium text-foreground ">Theme</p>
                  <p className="text-sm text-foreground">Choose your preferred color scheme</p>
                </div>
                <ThemeToggle />
              </div>
            </section>*/}

            {/* Support Section */}
            <section className="mt-10">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                Update
              </h2>

              <div
                className="bg-background border border-border rounded-lg hover:bg-secondary transition-colors"
                onClick={() => {
                  checkForUpdates();
                }}
              >
                <a
                  href="mailto:support@yourapp.com"
                  className="p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <DownloadCloud className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Check For Updates</p>
                      {/*<p className="text-sm text-secondary-foreground">support@yourapp.com</p>*/}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-foreground" />
                </a>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
};

export default SettingsPage;
