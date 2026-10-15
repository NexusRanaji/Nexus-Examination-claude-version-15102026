import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Get credentials from Vite environment variables or dynamic client-side settings
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('nexus_supabase_url') : null;
const storedAnonKey = typeof window !== 'undefined' ? localStorage.getItem('nexus_supabase_anon_key') : null;

const activeUrl = envUrl || storedUrl || '';
const activeKey = envAnonKey || storedAnonKey || '';

export function isSupabaseConfigured(): boolean {
  return Boolean(activeUrl && activeKey && activeUrl.startsWith('https://') && activeKey.length > 20);
}

export function getSupabaseCredentials(): { url: string; keyMasked: string; isConfigured: boolean } {
  return {
    url: activeUrl,
    keyMasked: activeKey ? `${activeKey.slice(0, 6)}...${activeKey.slice(-4)}` : '',
    isConfigured: isSupabaseConfigured()
  };
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('nexus_supabase_url', url.trim());
    localStorage.setItem('nexus_supabase_anon_key', anonKey.trim());
    window.location.reload();
  }
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('nexus_supabase_url');
    localStorage.removeItem('nexus_supabase_anon_key');
    window.location.reload();
  }
}

// Create Supabase client (or safe dummy client if unconfigured)
export const supabase: SupabaseClient = createClient(
  activeUrl || 'https://placeholder-project.supabase.co',
  activeKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
