import { createClient } from '@supabase/supabase-js';

// if (!import.meta.env.SUPABASE_URL || !import.meta.env.SUPABASE_PUBLIC_KEY) {
//   throw new Error('Missing Supabase environment variables');
// }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLIC_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const ElectronSecureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    // 1. Get the encrypted hex string from localStorage
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;

    // 2. Ask Electron Main process to decrypt it
    const decrypted = await window.electronAPI.auth.decrypt(key, encrypted);
    return decrypted;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    // 1. Ask Electron Main process to encrypt the value
    const encrypted = await window.electronAPI.auth.encrypt(key, value);

    // 2. Store the encrypted string in localStorage
    localStorage.setItem(key, encrypted);
  },

  removeItem: async (key: string): Promise<void> => {
    localStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ElectronSecureStorage, // <--- Inject our custom storage
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false // We handle URL parsing manually via Deep Link
  }
});
