import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserCredential, SchoolClass, Division, Subject, ExamSubmission, SchoolNotice } from '../types';

export interface SupabaseUserRow {
  id: string;
  role: 'superadmin' | 'teacher' | 'student' | 'parent';
  name: string;
  username: string;
  email?: string;
  phone?: string;
  employee_id?: string;
  roll_no?: string;
  class_id?: string;
  division_id?: string;
  parent_id?: string;
  bonus_points?: number;
  must_change_password?: boolean;
  created_at: string;
}

// Convert Supabase DB Row to UserCredential format
export function mapSupabaseUserToCredential(row: any): UserCredential {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    username: row.username,
    email: row.email || '',
    phone: row.phone,
    employeeId: row.employee_id || row.employeeId,
    rollNo: row.roll_no || row.rollNo,
    classId: row.class_id || row.classId,
    divisionId: row.division_id || row.divisionId,
    parentId: row.parent_id || row.parentId,
    bonusPoints: row.bonus_points ?? row.bonusPoints ?? 0,
    mustChangePassword: row.must_change_password ?? row.mustChangePassword ?? false,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// 1. Fetch Users from Supabase
export async function fetchUsersFromSupabase(): Promise<UserCredential[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Supabase] Failed to fetch users:', error.message);
    throw error;
  }

  return (data || []).map(mapSupabaseUserToCredential);
}

// 2. Fetch Single User by ID or Email/Username
export async function fetchUserByIdFromSupabase(userId: string): Promise<UserCredential | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .is('deleted_at', null)
    .single();

  if (error) {
    console.warn('[Supabase] User not found:', error.message);
    return null;
  }

  return data ? mapSupabaseUserToCredential(data) : null;
}

// 3. Insert or Update User in Supabase
export async function saveUserToSupabase(user: Partial<UserCredential>): Promise<UserCredential> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase client is not configured.');
  }

  const row = {
    id: user.id || crypto.randomUUID(),
    role: user.role,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    employee_id: user.employeeId,
    roll_no: user.rollNo,
    class_id: user.classId,
    division_id: user.divisionId,
    parent_id: user.parentId,
    bonus_points: user.bonusPoints ?? 0,
    must_change_password: user.mustChangePassword ?? false,
    created_at: user.createdAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('users')
    .upsert(row)
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Failed to upsert user:', error.message);
    throw error;
  }

  return mapSupabaseUserToCredential(data);
}

// 4. Fetch School Notices from Supabase
export async function fetchNoticesFromSupabase(): Promise<SchoolNotice[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('school_notices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[Supabase] Failed to fetch notices:', error.message);
    return [];
  }

  return (data || []).map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: (n.category as any) || 'General Announcement',
    targetAudience: (n.target_audience as any) || 'All',
    authorName: n.author_name || 'Institutional Administration',
    authorRole: (n.author_role as any) || 'superadmin',
    createdAt: n.created_at || new Date().toISOString(),
  }));
}

// 5. Realtime subscription helper
export function subscribeToUsers(onUpdate: (users: UserCredential[]) => void) {
  if (!isSupabaseConfigured()) return () => {};

  const channel = supabase
    .channel('public:users')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      async () => {
        try {
          const updated = await fetchUsersFromSupabase();
          onUpdate(updated);
        } catch (err) {
          console.error('[Supabase Realtime] Error refetching users:', err);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
