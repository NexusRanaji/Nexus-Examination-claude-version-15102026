import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserCredential } from '../types';

export async function fetchUsersFromSupabase(): Promise<UserCredential[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
      console.warn('Supabase fetchUsers error:', error.message);
      return [];
    }
    return (data as UserCredential[]) || [];
  } catch (err) {
    console.warn('Supabase fetchUsers exception:', err);
    return [];
  }
}

export async function fetchUserByIdFromSupabase(id: string): Promise<UserCredential | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return null;
  }
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data as UserCredential;
  } catch {
    return null;
  }
}

export function subscribeToUsers(callback: (users: UserCredential[]) => void): () => void {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {};
  }
  try {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        async () => {
          const fresh = await fetchUsersFromSupabase();
          callback(fresh);
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}
