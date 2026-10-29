import React, { useState, useEffect, Suspense, lazy } from 'react';
import { UserCredential } from './types';
import { Sidebar } from './components/navigation/Sidebar';
import { TopBar } from './components/navigation/TopBar';
import { LoginPage } from './components/auth/LoginPage';
import { LoginModal } from './components/auth/LoginModal';
import { ChangePasswordModal } from './components/auth/ChangePasswordModal';
import { MobileBottomNav } from './components/mobile/MobileBottomNav';
import { getAuthUser, setAuthSession, clearAuthSession, getAuthToken } from './services/auth';
import { apiClient } from './lib/apiClient';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { DashboardSkeleton } from './components/common/DashboardSkeleton';

// Role Dashboards Lazy-Loaded for Code-Splitting Optimization
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const TeacherDashboard = lazy(() =>
  import('./components/teacher/TeacherDashboard').then((m) => ({ default: m.TeacherDashboard }))
);
const StudentDashboard = lazy(() =>
  import('./components/student/StudentDashboard').then((m) => ({ default: m.StudentDashboard }))
);
const ParentDashboard = lazy(() =>
  import('./components/parent/ParentDashboard').then((m) => ({ default: m.ParentDashboard }))
);
const GeminiChatbot = lazy(() =>
  import('./components/chat/GeminiChatbot').then((m) => ({ default: m.GeminiChatbot }))
);
import { 
  ShieldCheck, 
  GraduationCap, 
  Smartphone, 
  Server, 
  ExternalLink,
  Database
} from 'lucide-react';
import { 
  fetchUsersFromSupabase, 
  subscribeToUsers, 
  fetchUserByIdFromSupabase 
} from './services/supabaseService';
import { isSupabaseConfigured } from './lib/supabase';

const DEFAULT_USERS: UserCredential[] = [
  {
    id: 'usr-admin-1',
    name: 'Dr. R. K. Deshmukh',
    username: 'admin',
    email: 'admin@nexusrana.edu',
    role: 'superadmin',
    employeeId: 'NRES-DIR-001',
    createdAt: '2025-01-10T08:00:00Z',
  },
  {
    id: 'usr-teach-1',
    name: 'Prof. Vikram Sharma',
    username: 'teacher.sharma',
    email: 'vikram.sharma@nexusrana.edu',
    role: 'teacher',
    employeeId: 'NRES-FAC-104',
    createdAt: '2025-01-15T09:00:00Z',
  },
  {
    id: 'usr-stud-1',
    name: 'Aarav Sharma',
    username: 'student.aarav',
    email: 'aarav.sharma@student.nexusrana.edu',
    role: 'student',
    rollNo: 'NRES-10A-01',
    classId: 'cls-10',
    divisionId: 'div-10a',
    parentId: 'usr-parent-1',
    bonusPoints: 260,
    createdAt: '2025-02-01T08:30:00Z',
  },
  {
    id: 'usr-stud-2',
    name: 'Rohan Patel',
    username: 'student.rohan',
    email: 'rohan.patel@student.nexusrana.edu',
    role: 'student',
    rollNo: 'NRES-10A-02',
    classId: 'cls-10',
    divisionId: 'div-10a',
    parentId: 'usr-parent-2',
    bonusPoints: 175,
    createdAt: '2025-02-01T08:30:00Z',
  },
  {
    id: 'usr-parent-1',
    name: 'Mr. Rajesh Sharma',
    username: 'parent.sharma',
    email: 'rajesh.sharma@parent.nexusrana.edu',
    role: 'parent',
    childrenIds: ['usr-stud-1', 'usr-stud-3'],
    phone: '+91 98201 44521',
    createdAt: '2025-02-01T08:30:00Z',
  },
];

export default function App() {
  // If Supabase is configured, initialize with empty array and fetch from cloud; otherwise fallback to seed presets
  const [allUsers, setAllUsers] = useState<UserCredential[]>(() => {
    return isSupabaseConfigured() ? [] : DEFAULT_USERS;
  });
  
  // Read stored user from sessionStorage if previously authenticated
  const [currentUser, setCurrentUser] = useState<UserCredential | null>(() => {
    return getAuthUser();
  });

  const [loading, setLoading] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [roleTabs, setRoleTabs] = useState<Record<string, string>>({
    student: 'home',
    teacher: 'home',
    superadmin: 'home',
    parent: 'home',
  });

  const getRoleHashPrefix = (role: string) => (role === 'superadmin' ? 'admin' : role);
  const getRoleFromPrefix = (prefix: string) => (prefix === 'admin' ? 'superadmin' : prefix);

  const handleTabChange = (newTab: string) => {
    if (!currentUser) return;
    setRoleTabs((prev) => ({
      ...prev,
      [currentUser.role]: newTab,
    }));
    const prefix = getRoleHashPrefix(currentUser.role);
    const targetHash = newTab === 'home' ? `#/${prefix}` : `#/${prefix}/${newTab}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState({ role: currentUser.role, tab: newTab }, '', targetHash);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // 1. Direct Supabase Client Query
      if (isSupabaseConfigured()) {
        const supabaseUsers = await fetchUsersFromSupabase();
        if (supabaseUsers && supabaseUsers.length > 0) {
          setAllUsers(supabaseUsers);
          if (currentUser) {
            const found = supabaseUsers.find((u) => u.id === currentUser.id);
            if (found) setCurrentUser(found);
          }
          return;
        }
      }

      // 2. Server API fallback: respect user role and authentication boundaries
      if (currentUser?.role === 'superadmin') {
        // Superadmin has permission to view full credentials directory
        const res = await apiClient.get('/api/admin/credentials');
        if (res.ok && res.data) {
          const users = res.data.users || [];
          if (users.length > 0) {
            const uniqueUsers = Array.from(new Map(users.map((u: UserCredential) => [u.id, u])).values()) as UserCredential[];
            setAllUsers(uniqueUsers);
            if (currentUser) {
              const found = uniqueUsers.find((u) => u.id === currentUser.id);
              if (found) setCurrentUser(found);
            }
          }
        }
      } else if (currentUser) {
        // Authenticated faculty/teacher, student, or parent: refresh their own profile via /api/auth/me
        const res = await apiClient.get('/api/auth/me');
        if (res.ok && res.data?.user) {
          setCurrentUser((prev) => (prev ? { ...prev, ...res.data.user } : res.data.user));
        }
      } else {
        // Unauthenticated visitor on login page: load public demo directory safely without credentials
        const res = await apiClient.get('/api/auth/public-users', { skipAuth: true });
        if (res.ok && res.data) {
          const users = res.data.users || [];
          if (users.length > 0) {
            const uniqueUsers = Array.from(new Map(users.map((u: UserCredential) => [u.id, u])).values()) as UserCredential[];
            setAllUsers(uniqueUsers);
          }
        }
      }
    } catch (err: any) {
      if (err?.status !== 401 && err?.status !== 403) {
        console.error('[Supabase/API] Failed to load user list:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  // Initial Data Hydration & Live Realtime Supabase Subscription
  useEffect(() => {
    fetchUsers();

    // Subscribe to live user database changes in Supabase
    if (isSupabaseConfigured()) {
      const unsubscribe = subscribeToUsers((updatedUsers) => {
        if (updatedUsers && updatedUsers.length > 0) {
          setAllUsers(updatedUsers);
          if (currentUser) {
            const found = updatedUsers.find((u) => u.id === currentUser.id);
            if (found) setCurrentUser(found);
          }
        }
      });
      return () => unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'superadmin') {
      fetchUsers();
    }
  }, [currentUser?.role]);

  // Handle unauthorized event across any API call
  useEffect(() => {
    const handleUnauthorized = () => {
      handleLogout();
    };
    window.addEventListener('nexus:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('nexus:unauthorized', handleUnauthorized);
  }, []);

  // Listen to browser navigation (back/forward button, Android hardware back, URL hash updates)
  useEffect(() => {
    const handleUrlSync = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (!hash || !currentUser) return;
      const [rolePrefix, tabSegment] = hash.split('/');
      const role = getRoleFromPrefix(rolePrefix);
      const tab = tabSegment || 'home';

      // Keep tabs in sync for the currently authenticated user role only
      if (currentUser.role === role) {
        setRoleTabs((prev) => ({
          ...prev,
          [role]: tab,
        }));
      }
    };

    window.addEventListener('hashchange', handleUrlSync);
    window.addEventListener('popstate', handleUrlSync);

    handleUrlSync();

    return () => {
      window.removeEventListener('hashchange', handleUrlSync);
      window.removeEventListener('popstate', handleUrlSync);
    };
  }, [currentUser]);

  const handleSwitchUser = (_targetUser?: UserCredential) => {
    setLoginModalOpen(true);
  };

  const handleLoginSuccess = (user: UserCredential, token?: string) => {
    setCurrentUser(user);
    if (token) {
      setAuthSession(token, user);
    }
    const prefix = getRoleHashPrefix(user.role);
    const targetHash = `#/${prefix}`;
    window.history.pushState({ role: user.role, tab: 'home' }, '', targetHash);
    setLoginModalOpen(false);
  };

  const handleLogout = () => {
    clearAuthSession();
    setCurrentUser(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  // Human-readable titles for the active tab
  const getActiveTabTitle = () => {
    if (!currentUser) return 'Nexus Ranaji Portal';
    const activeTab = roleTabs[currentUser.role] || 'home';

    if (currentUser.role === 'student') {
      switch (activeTab) {
        case 'exams': return 'Examinations & Timed Tests';
        case 'materials': return 'Curriculum Study Materials';
        case 'achievements': return 'Scholastic Honors & Completion Certificate';
        case 'chatbot': return 'AI Study Assistant Tutor';
        case 'notices': return 'Official Circulars & Notice Board';
        default: return 'Student Academic Workspace';
      }
    } else if (currentUser.role === 'teacher') {
      switch (activeTab) {
        case 'exams': return 'Exam Authoring & Assessments';
        case 'questionBank': return 'Institutional Question Bank';
        case 'submissions': return 'Examinee Grading & Review';
        case 'students': return 'Student Class Rosters';
        case 'materials': return 'Study Resource Management';
        case 'standings': return 'Academic Standing Rules';
        case 'tickets': return 'Parent-Teacher Helpdesk';
        case 'notices': return 'Notice Board Administration';
        default: return 'Faculty Examination Workspace';
      }
    } else if (currentUser.role === 'superadmin') {
      switch (activeTab) {
        case 'stats': return 'Institutional Analytics & School Reports';
        case 'academic': return 'Classes, Divisions & Curriculums';
        case 'credentials': return 'User Directory & Password Management';
        case 'audits': return 'Security Audits & Anti-Cheating Logs';
        case 'notices': return 'Notice Board Administration';
        default: return 'Directorate Super Administrator Workspace';
      }
    } else if (currentUser.role === 'parent') {
      switch (activeTab) {
        case 'submissions': return 'Ward Examination Results & Scorecards';
        case 'overview': return 'Academic Progress & Attendance';
        case 'helpdesk': return 'Parent-Teacher Inquiry Desk';
        case 'notices': return 'School Notices & Circulars';
        default: return 'Parent & Family Portal';
      }
    }
    return 'Nexus Ranaji Portal';
  };

  useEffect(() => {
    if (!currentUser) {
      document.title = 'Login - Nexus Ranaji School Exam System';
    } else {
      document.title = `${getActiveTabTitle()} - Nexus Ranaji English School`;
    }
  }, [currentUser, roleTabs]);

  // INITIAL WEB PAGE: If user is not authenticated, display the dedicated full-page LoginPage!
  if (!currentUser) {
    return (
      <ErrorBoundary fallbackTitle="Authentication Screen Error">
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          allUsers={allUsers}
        />
      </ErrorBoundary>
    );
  }

  const activeTab = roleTabs[currentUser.role] || 'home';

  return (
    <ErrorBoundary fallbackTitle="Nexus School Application Error">
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-row selection:bg-amber-500 selection:text-slate-950 transition-colors duration-200 w-full max-w-full">
        {/* WCAG Skip to Main Content Landmark */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-slate-950 focus:font-bold focus:rounded-xl focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-slate-950"
        >
          Skip to main content
        </a>
        
        {/* Desktop Persistent Side Menu Bar */}
        <Sidebar
          currentUser={currentUser}
          allUsers={allUsers}
          activeTab={activeTab}
          onNavigateTab={handleTabChange}
          onSwitchUser={handleSwitchUser}
          onLogout={handleLogout}
          onOpenGeminiChat={() => setIsChatOpen((prev) => !prev)}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          isMobile={false}
        />

        {/* Mobile Slide-Over Drawer Side Menu Bar */}
        <Sidebar
          currentUser={currentUser}
          allUsers={allUsers}
          activeTab={activeTab}
          onNavigateTab={handleTabChange}
          onSwitchUser={handleSwitchUser}
          onLogout={handleLogout}
          onOpenGeminiChat={() => setIsChatOpen((prev) => !prev)}
          onOpenChangePassword={() => setIsChangePasswordOpen(true)}
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          isMobile={true}
        />

        {/* Main Content Area beside the Side Menu Bar */}
        <div className="flex-1 flex flex-col min-w-0 w-full">
          
          {/* Top Header Bar */}
          <TopBar
            currentUser={currentUser}
            activeTabTitle={getActiveTabTitle()}
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onOpenGeminiChat={() => setIsChatOpen((prev) => !prev)}
            onLogout={handleLogout}
            onSwitchUser={handleSwitchUser}
            onOpenChangePassword={() => setIsChangePasswordOpen(true)}
            allUsers={allUsers}
          />

          {/* Dynamic Role Workspaces */}
          <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8 focus:outline-none">
            {currentUser.role === 'superadmin' && (
              <ErrorBoundary fallbackTitle="Admin Workspace Error">
                <Suspense fallback={<DashboardSkeleton roleName="Admin Portal" />}>
                  <AdminDashboard 
                    currentUser={currentUser} 
                    onRefreshUsers={fetchUsers} 
                    activeTab={roleTabs.superadmin as any}
                    onTabChange={(t) => handleTabChange(t)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {currentUser.role === 'teacher' && (
              <ErrorBoundary fallbackTitle="Faculty Workspace Error">
                <Suspense fallback={<DashboardSkeleton roleName="Teacher Portal" />}>
                  <TeacherDashboard 
                    currentUser={currentUser} 
                    activeTab={roleTabs.teacher as any}
                    onTabChange={(t) => handleTabChange(t)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {currentUser.role === 'student' && (
              <ErrorBoundary fallbackTitle="Student Workspace Error">
                <Suspense fallback={<DashboardSkeleton roleName="Student Portal" />}>
                  <StudentDashboard
                    currentUser={currentUser}
                    onRefreshUser={fetchUsers}
                    activeTab={roleTabs.student as any}
                    onTabChange={(t) => handleTabChange(t)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {currentUser.role === 'parent' && (
              <ErrorBoundary fallbackTitle="Parent Workspace Error">
                <Suspense fallback={<DashboardSkeleton roleName="Parent Portal" />}>
                  <ParentDashboard 
                    currentUser={currentUser} 
                    activeTab={roleTabs.parent as any}
                    onTabChange={(t) => handleTabChange(t)}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
          </main>

          {/* Institutional Footer */}
          <footer className="bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 py-4 sm:py-6 px-4 sm:px-6 lg:px-8 mt-auto mb-16 md:mb-0 text-xs text-slate-500 dark:text-slate-400">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-left">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-serif font-bold text-slate-800 dark:text-slate-200 text-xs">
                    Nexus Ranaji English School &bull; Online Examination System
                  </p>
                  <p className="text-[10px] text-slate-400">
                    CBSE Affiliated Institutional Code #41029 &bull; Academic Year 2025–2026
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <Server className="w-3 h-3" aria-hidden="true" />
                  REST API Ready
                </span>
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                  Anti-Cheating Guard
                </span>
                <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  <Smartphone className="w-3 h-3" aria-hidden="true" />
                  Mobile Responsive
                </span>
              </div>
            </div>
          </footer>

          {/* Mobile Bottom Navigation Bar for 1-Thumb Reachability */}
          <MobileBottomNav
            currentUser={currentUser}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onOpenChat={() => setIsChatOpen((prev) => !prev)}
            isChatOpen={isChatOpen}
          />

          {/* Modal for In-App Credential Changes */}
          <LoginModal
            isOpen={loginModalOpen}
            onClose={() => setLoginModalOpen(false)}
            onLoginSuccess={handleLoginSuccess}
          />

          {/* Profile-Initiated Password Change Modal */}
          {currentUser && isChangePasswordOpen && (
            <ChangePasswordModal
              user={currentUser}
              isOpen={isChangePasswordOpen}
              onClose={() => setIsChangePasswordOpen(false)}
              onPasswordChanged={(updatedUser) => {
                setCurrentUser(updatedUser);
                const tok = getAuthToken();
                if (tok) {
                  setAuthSession(tok, updatedUser);
                }
                setIsChangePasswordOpen(false);
              }}
            />
          )}

          {/* Gemini Multi-Turn AI Chatbot Component */}
          <Suspense fallback={null}>
            <GeminiChatbot
              currentUser={currentUser}
              isOpen={isChatOpen}
              onToggleOpen={() => setIsChatOpen((prev) => !prev)}
            />
          </Suspense>
        </div>
      </div>
    </ErrorBoundary>
  );
}
