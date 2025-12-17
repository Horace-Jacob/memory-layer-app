import React, { createContext, JSX, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase'; // Your configured supabase client

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  signOut: async () => {}
});

export const useAuth = (): AuthContextType => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }): JSX.Element => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on startup
    const initSession = async (): Promise<void> => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    initSession();

    // 2. Listen for auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // 3. Listen for Deep Links (Electron Main -> Renderer)
    window.electronAPI.auth.onAuthCallback(async (url: string) => {
      // Parse token from URL hash
      const hashIndex = url.indexOf('#');
      if (hashIndex !== -1) {
        const params = new URLSearchParams(url.substring(hashIndex + 1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) console.error('Deep link session error:', error);
          // The onAuthStateChange above will catch the update automatically
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {!loading && children}
      {/* Critical: We render children only after loading is done.
         This prevents "flashing" the login page to a user who is actually logged in.
         You could render a <LoadingSpinner /> here instead of nothing.
      */}
    </AuthContext.Provider>
  );
};
