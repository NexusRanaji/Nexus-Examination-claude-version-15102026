import { createClient, SupabaseClient } from '@supabase/supabase-js';

const RUNTIME_URL_KEY = 'nexus_supabase_url';
const RUNTIME_KEY_KEY = 'nexus_supabase_anon_key';

export function getSupabaseCredentials(): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  keyMasked: string;
} {
  try {
    const runtimeUrl = localStorage.getItem(RUNTIME_URL_KEY) || '';
    const runtimeKey = localStorage.getItem(RUNTIME_KEY_KEY) || '';
    const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
    const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
    const url = runtimeUrl || envUrl;
    const anonKey = runtimeKey || envKey;
    const isConfigured = Boolean(
      url &&
      url.trim().length > 0 &&
      anonKey &&
      anonKey.trim().length > 0 &&
      !url.includes('your-project')
    );
    const keyMasked = anonKey ? `${anonKey.slice(0, 8)}...${anonKey.slice(-4)}` : '';
    return {
      url,
      anonKey,
      isConfigured,
      keyMasked,
    };
  } catch {
    return { url: '', anonKey: '', isConfigured: false, keyMasked: '' };
  }
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  try {
    localStorage.setItem(RUNTIME_URL_KEY, url);
    localStorage.setItem(RUNTIME_KEY_KEY, anonKey);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (e) {
    console.error('Failed to save Supabase config to localStorage:', e);
  }
}

export function clearRuntimeSupabaseConfig(): void {
  try {
    localStorage.removeItem(RUNTIME_URL_KEY);
    localStorage.removeItem(RUNTIME_KEY_KEY);
  } catch (e) {
    console.error('Failed to clear Supabase config from localStorage:', e);
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseCredentials().isConfigured;
}

const creds = getSupabaseCredentials();
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(creds.url, creds.anonKey)
  : null;
