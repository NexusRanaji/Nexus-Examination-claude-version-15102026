import React, { useState } from 'react';
import { 
  ShieldCheck, 
  GraduationCap, 
  BookOpen, 
  Users, 
  Eye, 
  EyeOff, 
  Lock, 
  User, 
  ArrowRight, 
  Sparkles, 
  AlertCircle,
  Award,
  Smartphone,
  Sun,
  Moon,
  X,
  HelpCircle,
  Info
} from 'lucide-react';
import { UserCredential } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { setAuthSession } from '../../services/auth';
import { apiClient } from '../../lib/apiClient';

interface LoginPageProps {
  onLoginSuccess: (user: UserCredential, token?: string) => void;
  allUsers?: UserCredential[];
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, allUsers = [] }) => {
  const { theme, toggleTheme } = useTheme();
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher' | 'superadmin' | 'parent'>('student');
  const [identifier, setIdentifier] = useState('student.rohan');
  const [password, setPassword] = useState('StudentPass#101');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);
  const [needHelpModalOpen, setNeedHelpModalOpen] = useState(false);

  const roleHeadings: Record<string, string> = {
    student: 'Student Sign In',
    teacher: 'Faculty Sign In',
    superadmin: 'Admin Sign In',
    parent: 'Parent Sign In',
  };

  const roleSubtitles: Record<string, string> = {
    student: 'Enter your institutional ID and password to access proctored exams.',
    teacher: 'Enter your faculty credentials to manage examinations and grade rosters.',
    superadmin: 'Administrative access for school governance and examination control.',
    parent: 'Guardian access to review student scores, attendance, and progress.',
  };

  const roleButtonText: Record<string, string> = {
    student: 'Student Sign In',
    teacher: 'Faculty Sign In',
    superadmin: 'Admin Sign In',
    parent: 'Parent Sign In',
  };

  // Quick preset logins combining core accounts with dynamically registered users from directory
  const basePresets = [
    {
      role: 'student',
      label: 'Student (Rohan - Class 10A)',
      id: 'student.rohan',
      pass: 'StudentPass#101',
      badge: 'SSC Candidate',
      accent: 'border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20',
    },
    {
      role: 'student',
      label: 'Student (Aarav - Class 10A)',
      id: 'student.aarav',
      pass: 'StudentPass#101',
      badge: 'SSC Candidate',
      accent: 'border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20',
    },
    {
      role: 'student',
      label: 'Student Legacy (John Doe)',
      id: 'john@student.com',
      pass: 'student123',
      badge: 'Legacy Student',
      accent: 'border-cyan-300 dark:border-cyan-500/40 text-cyan-900 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/10 hover:bg-cyan-100 dark:hover:bg-cyan-500/20',
    },
    {
      role: 'teacher',
      label: 'Faculty (Prof. Sharma - Physics)',
      id: 'teacher.sharma',
      pass: 'NexusTeacher#2025',
      badge: 'Senior Faculty',
      accent: 'border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20',
    },
    {
      role: 'teacher',
      label: 'Faculty Legacy (Examiner)',
      id: 'teacher@school.com',
      pass: 'teacher123',
      badge: 'Legacy Faculty',
      accent: 'border-teal-300 dark:border-teal-500/40 text-teal-900 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/10 hover:bg-teal-100 dark:hover:bg-teal-500/20',
    },
    {
      role: 'superadmin',
      label: 'Super Admin (Dr. Deshmukh)',
      id: 'admin',
      pass: 'Admin@Nexus2025!',
      badge: 'Principal & Director',
      accent: 'border-rose-300 dark:border-rose-500/40 text-rose-900 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20',
    },
    {
      role: 'superadmin',
      label: 'Admin Legacy (Principal)',
      id: 'admin@school.com',
      pass: 'admin123',
      badge: 'Legacy Admin',
      accent: 'border-purple-300 dark:border-purple-500/40 text-purple-900 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20',
    },
    {
      role: 'parent',
      label: 'Parent (Mr. Rajesh Sharma)',
      id: 'parent.sharma',
      pass: 'ParentPass#2025',
      badge: 'Guardian of Rohan & Ananya',
      accent: 'border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20',
    },
    {
      role: 'superadmin',
      label: 'Director / Evaluator (theoneandonlyking999)',
      id: 'theoneandonlyking999@gmail.com',
      pass: 'Admin@Nexus2025!',
      badge: 'Evaluation Lead',
      accent: 'border-violet-300 dark:border-violet-500/40 text-violet-900 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 hover:bg-violet-100 dark:hover:bg-violet-500/20',
    },
  ];

  // Dynamic presets for newly registered directory accounts
  const existingPresetIds = new Set(basePresets.map((p) => p.id.toLowerCase()));
  const dynamicPresets = (allUsers || [])
    .filter((u) => u.username && !existingPresetIds.has(u.username.toLowerCase()) && !existingPresetIds.has((u.email || '').toLowerCase()))
    .map((u) => {
      const defaultPass = u.role === 'student' ? 'StudentPass#101' :
        u.role === 'teacher' ? 'NexusTeacher#2025' :
        u.role === 'parent' ? 'ParentPass#2025' : 'Admin@Nexus2025!';
      return {
        role: u.role,
        label: `${u.name} (${u.role === 'student' ? (u.rollNo || 'Student') : u.role})`,
        id: u.username || u.rollNo || u.email || u.id,
        // Never trust passwords from public-users API (they are not returned). Use role defaults for demo quick-login only.
        pass: defaultPass,
        badge: u.rollNo ? `Roll: ${u.rollNo}` : 'New Account',
        accent: u.role === 'student'
          ? 'border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20'
          : u.role === 'teacher'
          ? 'border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
          : u.role === 'superadmin'
          ? 'border-rose-300 dark:border-rose-500/40 text-rose-900 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20'
          : 'border-blue-300 dark:border-blue-500/40 text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20',
      };
    });

  const allPresets = [...basePresets, ...dynamicPresets];
  // Filter presets to show matching active role first, followed by others
  const quickPresets = allPresets.filter((p) => p.role === selectedRole).concat(allPresets.filter((p) => p.role !== selectedRole));

  const handleRoleSelect = (role: 'student' | 'teacher' | 'superadmin' | 'parent') => {
    setSelectedRole(role);
    setError(null);
    if (role === 'student') {
      setIdentifier('student.rohan');
      setPassword('StudentPass#101');
    } else if (role === 'teacher') {
      setIdentifier('teacher.sharma');
      setPassword('NexusTeacher#2025');
    } else if (role === 'superadmin') {
      setIdentifier('admin');
      setPassword('Admin@Nexus2025!');
    } else if (role === 'parent') {
      setIdentifier('parent.sharma');
      setPassword('ParentPass#2025');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Please enter your institutional ID and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.post('/api/auth/login', {
        username: identifier.trim(),
        password,
      });

      const data = res.data;

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify your credentials.');
      }

      if (data.token && data.user) {
        setAuthSession(data.token, data.user);
      }

      onLoginSuccess(data.user, data.token);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid school credentials or network connection issue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950 relative overflow-x-hidden transition-colors duration-200">
      
      {/* Background Decorative Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/5 dark:bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Institutional Top Brand Bar */}
      <header className="w-full max-w-full border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/80 backdrop-blur-md px-3 sm:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 z-20 shadow-xs transition-colors overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-800 to-indigo-900 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-md shadow-purple-900/30 shrink-0">
            <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h1 className="font-serif font-black text-xs xs:text-sm sm:text-base text-slate-900 dark:text-slate-100 tracking-wide uppercase truncate leading-tight">
              Nexus Ranaji English School
            </h1>
            <p className="text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 font-mono tracking-wider font-semibold truncate">
              CBSE AFFILIATION #41029 • SCHOOL CODE: 10482
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Portal Active 2025-26
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-xs dark:border-slate-800 dark:bg-slate-900/90 dark:hover:bg-slate-800 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer shrink-0"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Login Workspace */}
      <main className="flex-1 flex items-center justify-center p-3 sm:p-6 md:p-8 z-10 w-full">
        <div className="w-full max-w-lg mx-auto">
          <div className="bg-white/95 border border-slate-200 rounded-3xl p-5 sm:p-8 shadow-xl shadow-slate-300/40 dark:bg-slate-950/90 dark:border-slate-800 dark:shadow-2xl dark:shadow-purple-950/20 backdrop-blur-xl space-y-5 transition-colors">
            
            {/* Centered Institutional School Branding */}
            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-900 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg shadow-purple-900/30 mx-auto">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div className="pt-1.5">
                <h2 className="font-serif font-black text-xl sm:text-2xl text-slate-900 dark:text-slate-100 tracking-wider uppercase leading-tight">
                  NEXUS RANAJI
                </h2>
                <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400 font-mono tracking-widest font-bold uppercase">
                  ENGLISH SCHOOL
                </p>
              </div>
              <div className="pt-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-serif">
                  {roleHeadings[selectedRole]}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                  {roleSubtitles[selectedRole]}
                </p>
              </div>
            </div>

            {/* Institutional Role Options in a Single Row of 4 Selectable Cards */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 text-center sm:text-left">
                Select Institutional Role:
              </p>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors">
                <button
                  type="button"
                  onClick={() => handleRoleSelect('student')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedRole === 'student'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs truncate">Student</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('teacher')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedRole === 'teacher'
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs truncate">Faculty</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('superadmin')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedRole === 'superadmin'
                      ? 'bg-rose-600 dark:bg-rose-500 text-white shadow-md shadow-rose-500/20'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs truncate">Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('parent')}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
                    selectedRole === 'parent'
                      ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] sm:text-xs truncate">Parent</span>
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex flex-col gap-1.5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="font-semibold">{error}</span>
                </div>
                <div className="text-[11px] text-amber-800 dark:text-amber-300/90 pl-6">
                  Tip: Use the 1-Click Demo Fill accounts below to quickly sign in with sample credentials.
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-identifier" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Username, Roll No, Mobile, or Email</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono hidden sm:inline">e.g. student.rohan, NRES-10A-01, or phone</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    id="login-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Username, Roll No (e.g. NRES-10A-01), Phone, or Email"
                    className="w-full bg-slate-50 border border-slate-300 dark:bg-slate-900 dark:border-slate-800 rounded-2xl pl-10 pr-3.5 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 focus-visible:ring-2 focus-visible:ring-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Password</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Case-sensitive</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-slate-50 border border-slate-300 dark:bg-slate-900 dark:border-slate-800 rounded-2xl pl-10 pr-10 py-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 focus-visible:ring-2 focus-visible:ring-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-100 border-slate-300 text-amber-500 focus:ring-0 focus:ring-offset-0 dark:bg-slate-900 dark:border-slate-700"
                  />
                  <span>Remember this station</span>
                </label>

                <span className="text-[11px] text-amber-700 dark:text-amber-400/90 font-medium">Authorized access only</span>
              </div>

              {/* Dynamic Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm rounded-2xl shadow-xl shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>{roleButtonText[selectedRole]}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Two Separate Links Directly Below Sign In Button */}
              <div className="flex items-center justify-between pt-1 px-1 text-xs">
                <button
                  type="button"
                  onClick={() => setForgotPasswordModalOpen(true)}
                  className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
                >
                  Forgot Password?
                </button>
                <button
                  type="button"
                  onClick={() => setNeedHelpModalOpen(true)}
                  className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
                >
                  Need Help?
                </button>
              </div>
            </form>

            {/* 1-Click Demo Fill Section for Testing & Evaluators */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  ⚡ Instant Demo Fill Accounts:
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">1-Click Test</span>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {quickPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedRole(preset.role as any);
                      setIdentifier(preset.id);
                      setPassword(preset.pass);
                    }}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer flex flex-col justify-between hover:scale-101 ${preset.accent}`}
                  >
                    <div className="font-bold text-[11px] truncate">{preset.label}</div>
                    <div className="flex items-center justify-between mt-1 text-[9px] opacity-90 font-mono">
                      <span className="truncate">{preset.id}</span>
                      <span className="font-sans px-1 rounded bg-black/10 dark:bg-black/30 text-[8px] font-medium">{preset.badge}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Forgot Password Assistance Modal */}
        {forgotPasswordModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                  <Lock className="w-4 h-4" />
                  <span>Institutional Password Assistance</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForgotPasswordModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1">Institutional Exam Security Notice:</p>
                  <p>In accordance with high school examination standards, automated self-service password resets are restricted during examination terms to prevent unauthorized account access.</p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">How to recover or reset your password:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
                    <li><strong className="text-slate-900 dark:text-slate-100">Students &amp; Parents:</strong> Report to the School Examination Department (Room 102, Admin Wing) with your Student ID card.</li>
                    <li><strong className="text-slate-900 dark:text-slate-100">Faculty Members:</strong> Contact the System Administrator or Director's Office for an authorized credential reissuance.</li>
                    <li><strong className="text-slate-900 dark:text-slate-100">Helpline:</strong> +91 98201 11000 (Mon–Sat, 8:00 AM – 4:30 PM IST)</li>
                  </ul>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setForgotPasswordModalOpen(false)}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  I Understand
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Need Help Assistance Modal */}
        {needHelpModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-indigo-500 font-bold text-sm">
                  <HelpCircle className="w-4 h-4" />
                  <span>Examination Portal Help &amp; Guidelines</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNeedHelpModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <div className="space-y-1.5">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">Supported Login Identifiers:</h4>
                  <p>You can sign in using any of the following registered identifiers:</p>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="text-amber-600 dark:text-amber-400 font-bold block">Username</span>
                      <span>student.rohan</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="text-amber-600 dark:text-amber-400 font-bold block">Roll Number</span>
                      <span>NRES-10A-01</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="text-amber-600 dark:text-amber-400 font-bold block">Email</span>
                      <span>user@school.com</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                      <span className="text-amber-600 dark:text-amber-400 font-bold block">Mobile</span>
                      <span>+91 98201 11000</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-900 dark:text-blue-300 space-y-1">
                  <p className="font-semibold">Exam Browser Requirements:</p>
                  <p>Ensure your browser is up to date (Chrome 110+, Edge 110+, Firefox 115+, Safari 16+). Keep notifications and cookies enabled.</p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setNeedHelpModalOpen(false)}
                  className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Close Help
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950 px-4 sm:px-8 py-4 text-center text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 z-10 transition-colors">
        <div>
          © 2025–2026 Nexus Ranaji English High School. All rights reserved.
        </div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <span>CBSE Curriculum Standard</span>
          <span>•</span>
          <span>Anti-Malpractice Monitored</span>
          <span>•</span>
          <span>Terms &amp; Academic Regulations</span>
        </div>
      </footer>

    </div>
  );
};
