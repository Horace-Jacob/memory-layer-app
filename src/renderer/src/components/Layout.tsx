import { useEffect, useState, type FC } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { X, ChevronDown, LogOut, Settings, Sidebar as SidebarIcon, Chromium } from 'lucide-react';
import { Sidebar } from './sidebar/Sidebar';
import { Loading } from './Loading';
import { useAuth } from '@renderer/context/AuthContext';
import { useShowOnboardBtn } from '@renderer/hooks/useShowOnboardBtn';

export const Layout: FC = () => {
  // const sidebarToggle = localStorage.getItem('isSidebarOpen');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    return localStorage.getItem('isSidebarOpen') === 'true';
  });

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState<boolean>(false);
  const { session, loading, signOut } = useAuth();

  const showImportButton = useShowOnboardBtn();

  useEffect(() => {
    setIsUserMenuOpen(false);
  }, []);

  const handleLogout = async (): Promise<void> => {
    setIsUserMenuOpen(false);
    setLogoutLoading(true);
    await signOut();
    setLogoutLoading(false);
  };

  const toggleSidebar = (): void => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('isSidebarOpen', next.toString());
      return next;
    });
  };

  return (
    <>
      {loading && !session ? (
        <Loading IsOpen={loading} />
      ) : (
        <div className="flex h-screen bg-background">
          <Sidebar isOpen={isSidebarOpen} />

          <div className="flex-1 flex flex-col">
            {/* Top Bar */}
            <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-background">
              {/* Left Side - Toggle Button */}
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-md hover:bg-secondary transition-colors text-foreground"
                aria-label="Toggle Sidebar"
              >
                {isSidebarOpen ? <X size={20} /> : <SidebarIcon size={20} />}
              </button>

              {/* Right Side - Notifications & User Menu */}
              <div className="flex items-center space-x-2">
                {/* Notifications */}
                {/*<button
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-600 relative"
                >
                  <Bell size={20} />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>*/}

                {/* User Menu */}
                <div key={session?.user?.id} className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center space-x-2 px-2 py-1.5 rounded-md hover:bg-secondary transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center">
                      <span className="text-xs font-semibold text-foreground">
                        <img
                          src={session!.user.user_metadata.avatar_url}
                          alt="user profile"
                          className="rounded-full"
                        />
                      </span>
                    </div>

                    <span className="text-sm font-medium text-foreground">
                      {session!.user.user_metadata.name}
                    </span>

                    <ChevronDown size={16} className="text-foreground" />
                  </button>

                  {/* User Dropdown Menu */}
                  {isUserMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsUserMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-2 w-64 bg-background rounded-lg shadow-lg border border-border py-2 z-20">
                        {/* User Info */}
                        <div className="px-4 py-3 border-b border-border">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full  flex items-center justify-center">
                              <span className="text-sm font-semibold text-foreground">
                                <img
                                  src={session!.user.user_metadata.avatar_url}
                                  alt="user profile"
                                  className="rounded-full"
                                />
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium  text-foreground">
                                {session!.user.user_metadata.name}
                              </p>
                              <p className="text-xs text-foreground">{session!.user.email}</p>
                            </div>
                          </div>
                        </div>

                        {/* Menu Items */}
                        <div className="py-1">
                          {showImportButton ? (
                            <Link to="/onboarding">
                              <button className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
                                <Chromium size={16} />
                                <span>Complete onboarding</span>
                              </button>
                            </Link>
                          ) : null}
                          <Link to="/settings">
                            <button className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-foreground hover:bg-secondary transition-colors">
                              <Settings size={16} />
                              <span>Settings</span>
                            </button>
                          </Link>
                        </div>

                        <div className="border-t border-border py-1" onClick={handleLogout}>
                          <button className="w-full flex items-center space-x-3 px-4 py-2 text-sm text-red-600 hover:bg-secondary transition-colors">
                            <LogOut size={16} />
                            <span>Log out</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </header>
            {logoutLoading && <Loading IsOpen={logoutLoading} />}
            {/* Main Content Area */}
            <main className="flex-1 overflow-auto bg-background ">
              <Outlet />
            </main>
          </div>
        </div>
      )}
    </>
  );
};
