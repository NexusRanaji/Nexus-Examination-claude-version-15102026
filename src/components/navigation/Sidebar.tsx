import React, { useState } from 'react';
import { 
  Home,
  GraduationCap,
  BookOpen,
  Award,
  Bot,
  Bell,
  Users,
  ShieldCheck,
  FileCheck2,
  TrendingUp,
  FolderOpen,
  CheckCircle2,
  HelpCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  Layers,
  BarChart3,
  X,
  FileText,
  KeyRound,
  UserCheck
} from 'lucide-react';
import { UserCredential } from '../../types';
import { UserAvatar } from '../common/UserAvatar';

interface SidebarProps {
  currentUser: UserCredential;
  allUsers: UserCredential[];
  activeTab: string;
  onNavigateTab: (tab: string) => void;
  onSwitchUser: (user: UserCredential) => void;
  onLogout: () => void;
  onOpenGeminiChat?: () => void;
  onOpenChangePassword?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  allUsers,
  activeTab,
  onNavigateTab,
  onSwitchUser,
  onLogout,
  onOpenGeminiChat,
  onOpenChangePassword,
  isOpen = false,
  onClose,
  isMobile = false,
}) => {
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  // Define navigational links for each role
  const getNavLinks = () => {
    switch (currentUser.role) {
      case 'superadmin':
        return [
          { id: 'home', label: 'Overview', icon: Home, badge: 'Live' },
          { id: 'stats', label: 'School Analytics', icon: BarChart3 },
          { id: 'academic', label: 'Classes & Divisions', icon: Layers },
          { id: 'credentials', label: 'User Directory', icon: KeyRound },
          { id: 'audits', label: 'Security & Audits', icon: ShieldCheck, badge: 'Malpractice' },
          { id: 'notices', label: 'Notice Board Admin', icon: Bell },
        ];
      case 'teacher':
        return [
          { id: 'home', label: 'Faculty Dashboard', icon: Home },
          { id: 'exams', label: 'Exams & Authoring', icon: FileCheck2, badge: 'Active' },
          { id: 'questionBank', label: 'Question Bank', icon: BookOpen },
          { id: 'submissions', label: 'Grading & Review', icon: Award },
          { id: 'students', label: 'Student Roster', icon: Users },
          { id: 'materials', label: 'Study Resources', icon: FolderOpen },
          { id: 'standings', label: 'Merit Standings', icon: TrendingUp },
          { id: 'tickets', label: 'Parent Helpdesk', icon: HelpCircle },
          { id: 'notices', label: 'Notice Board', icon: Bell },
        ];
      case 'student':
        return [
          { id: 'home', label: 'Student Home', icon: Home },
          { id: 'exams', label: 'My Examinations', icon: FileCheck2, badge: 'Timed' },
          { id: 'materials', label: 'Curriculum Notes', icon: BookOpen },
          { id: 'achievements', label: 'Honors & Certificate', icon: Award, badge: 'PDF' },
          { id: 'chatbot', label: 'AI Study Tutor', icon: Bot, badge: 'AI' },
          { id: 'notices', label: 'Official Circulars', icon: Bell },
        ];
      case 'parent':
        return [
          { id: 'home', label: 'Family Dashboard', icon: Home },
          { id: 'submissions', label: 'Examination Results', icon: Award },
          { id: 'overview', label: 'Academic Standing', icon: TrendingUp },
          { id: 'helpdesk', label: 'Teacher Helpdesk', icon: HelpCircle },
          { id: 'notices', label: 'School Notices', icon: Bell },
        ];
      default:
        return [{ id: 'home', label: 'Home', icon: Home }];
    }
  };

  const navLinks = getNavLinks();

  const handleLinkClick = (tabId: string) => {
    onNavigateTab(tabId);
    if (onClose) onClose();
  };

  const roleMeta = {
    superadmin: {
      title: 'Super Administrator',
      badge: 'Directorate',
      color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    },
    teacher: {
      title: 'Senior Faculty',
      badge: 'Examiner',
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    },
    student: {
      title: 'Enrolled Scholar',
      badge: currentUser.rollNo || 'SSC Candidate',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    },
    parent: {
      title: 'Parent / Guardian',
      badge: 'Family Account',
      color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    },
  }[currentUser.role] || {
    title: 'User',
    badge: 'Member',
    color: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 select-none">
      
      {/* Header with School Crest */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-800 to-indigo-900 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-md shadow-purple-950/20 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif font-black text-sm text-slate-900 dark:text-slate-100 uppercase tracking-wide truncate">
              Nexus Ranaji
            </h2>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold tracking-wider truncate">
              EXAM PORTAL
            </p>
          </div>
        </div>

        {isMobile && onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* User Identity Card */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="flex items-center gap-3">
          <UserAvatar name={currentUser.name} role={currentUser.role} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {currentUser.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${roleMeta.color}`}>
                {currentUser.role}
              </span>
              <span className="text-[10px] text-slate-400 font-mono truncate">
                {roleMeta.badge}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Role Switcher Trigger */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
            className="w-full py-1.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-left text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center justify-between hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-500" />
              <span>Switch Testing Role</span>
            </span>
            <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${roleSwitcherOpen ? 'rotate-90' : ''}`} />
          </button>

          {roleSwitcherOpen && (
            <div className="mt-2 space-y-1 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto">
              <p className="text-[9px] font-bold text-slate-400 uppercase px-2 py-0.5">Switch Persona:</p>
              {allUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    onSwitchUser(u);
                    setRoleSwitcherOpen(false);
                    if (isMobile && onClose) onClose();
                  }}
                  className={`w-full p-1.5 rounded-lg text-left text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    u.id === currentUser.id 
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold' 
                      : 'hover:bg-slate-200 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="truncate text-[11px]">{u.name}</span>
                  <span className="text-[9px] font-mono px-1 rounded bg-black/10 dark:bg-white/10 uppercase">
                    {u.role}
                  </span>
                </button>
              ))}
            </div>
          )}

          {onOpenChangePassword && (
            <button
              type="button"
              onClick={() => {
                if (isMobile && onClose) onClose();
                onOpenChangePassword();
              }}
              className="w-full mt-2 py-1.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-left text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center justify-between hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>Change Password</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Menu Links */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
          Navigation Menu
        </p>

        {navLinks.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleLinkClick(item.id)}
              className={`w-full px-3 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                isActive
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? 'bg-slate-950 text-amber-400'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Actions: AI Chat, Theme Toggle & Sign Out */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 bg-slate-50/50 dark:bg-slate-950/20">
        {onOpenGeminiChat && (
          <button
            onClick={() => {
              onOpenGeminiChat();
              if (isMobile && onClose) onClose();
            }}
            className="w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/20 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="truncate">Ask AI Study Assistant</span>
          </button>
        )}

        <div className="pt-1">
          <button
            onClick={onLogout}
            title="Sign Out to Login Page"
            className="w-full px-3 py-2 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

    </div>
  );

  // If mobile drawer mode
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex md:hidden">
        {/* Backdrop */}
        <div 
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity animate-in fade-in" 
        />
        {/* Drawer panel */}
        <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
          {sidebarContent}
        </div>
      </div>
    );
  }

  // Desktop sidebar
  return (
    <aside className="hidden md:flex flex-col w-64 lg:w-72 min-h-dvh h-dvh sticky top-0 shrink-0 z-30">
      {sidebarContent}
    </aside>
  );
};
