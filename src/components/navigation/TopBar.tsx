import React, { useState, useRef, useEffect } from 'react';
import { 
  Menu, 
  Sparkles, 
  Bell, 
  ShieldCheck, 
  ChevronDown, 
  LogOut, 
  User, 
  GraduationCap, 
  KeyRound, 
  Sun, 
  Moon
} from 'lucide-react';
import { UserCredential } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { UserAvatar } from '../common/UserAvatar';
import { NotificationCenter } from '../common/NotificationCenter';
import { AccountDetailsModal } from '../common/AccountDetailsModal';

interface TopBarProps {
  currentUser: UserCredential;
  activeTabTitle: string;
  onOpenMobileSidebar: () => void;
  onOpenGeminiChat?: () => void;
  onLogout: () => void;
  onSwitchUser?: (user: UserCredential) => void;
  onOpenLoginModal?: () => void;
  onOpenChangePassword?: () => void;
  allUsers?: UserCredential[];
}

export const TopBar: React.FC<TopBarProps> = ({
  currentUser,
  activeTabTitle,
  onOpenMobileSidebar,
  onOpenGeminiChat,
  onLogout,
  onSwitchUser,
  onOpenLoginModal,
  onOpenChangePassword,
  allUsers = [],
}) => {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [profileDropdownOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 w-full max-w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-4 md:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-1.5 sm:gap-3 transition-colors shadow-2xs overflow-visible flex-shrink-0">
        
        {/* Left Section: Mobile Hamburger, Emblem & Page Title (Responsive & Zero Overflow) */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 flex-shrink-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors cursor-pointer flex-shrink-0 shrink-0"
            aria-label="Open Navigation Menu"
            title="Open Navigation Menu"
          >
            <Menu className="w-5 h-5 flex-shrink-0 shrink-0" />
          </button>

          <div className="md:hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-purple-800 to-indigo-900 border border-amber-500/40 text-amber-400 flex items-center justify-center flex-shrink-0 shrink-0 shadow-2xs">
            <GraduationCap className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 shrink-0" />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden flex-shrink-0">
            <h1 className="text-xs sm:text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 font-serif truncate leading-tight flex-shrink-0">
              {activeTabTitle || 'Examination System'}
            </h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 hidden md:block truncate flex-shrink-0">
              Nexus Ranaji English School • Academic Session 2025-26
            </p>
          </div>
        </div>

        {/* Right Section: AI Assistant, Notifications, Theme Switcher & User Avatar (Mobile Screen Friendly) */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 shrink-0 ml-1 sm:ml-2">
          
          {/* AI Tutor Button */}
          {onOpenGeminiChat && (
            <button
              id="navbar-gemini-chat-btn"
              type="button"
              onClick={onOpenGeminiChat}
              className="flex items-center justify-center h-8 px-2 sm:px-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-semibold gap-1.5 transition-all flex-shrink-0 shrink-0 cursor-pointer active:scale-95"
              title="Open AI Academic Tutor"
              aria-label="Open AI Academic Tutor"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0 shrink-0" />
              <span className="hidden sm:inline flex-shrink-0">Ask AI</span>
            </button>
          )}

          {/* Institutional Notifications */}
          <div className="flex-shrink-0 shrink-0">
            <NotificationCenter
              currentUserId={currentUser.id}
              currentUserRole={currentUser.role}
            />
          </div>

          {/* System-wide Light/Dark Theme Switcher */}
          <button
            id="theme-toggle-btn"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            className="flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors text-xs flex-shrink-0 shrink-0 cursor-pointer active:scale-95 shadow-2xs"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 shrink-0" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300 flex-shrink-0 shrink-0" />
            )}
          </button>

          {/* User Profile Pill & Dropdown */}
          <div ref={profileDropdownRef} className="relative flex-shrink-0 shrink-0 z-50">
            <button
              id="navbar-user-profile-btn"
              type="button"
              onClick={() => setProfileDropdownOpen((prev) => !prev)}
              className="relative z-50 flex items-center gap-1 sm:gap-2 p-0.5 sm:px-2 sm:py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors cursor-pointer flex-shrink-0 shrink-0 active:scale-95"
              title="Account Menu"
              aria-label="Account menu"
              aria-expanded={profileDropdownOpen}
            >
              <UserAvatar name={currentUser.name} role={currentUser.role} size="sm" className="flex-shrink-0 shrink-0" />
              <div className="text-left hidden lg:block min-w-0 flex-shrink-0">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-none truncate max-w-[120px] flex-shrink-0">
                  {currentUser.name}
                </p>
                <p className="text-[9px] text-slate-400 uppercase font-mono mt-0.5 flex-shrink-0">
                  {currentUser.role}
                </p>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 hidden sm:block flex-shrink-0 shrink-0 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileDropdownOpen && (
              <div 
                className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-20px)] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-100 text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{currentUser.email || currentUser.username}</p>
                  <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {currentUser.role}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setAccountDetailsOpen(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer text-left transition-colors"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>My Account Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    if (onOpenChangePassword) onOpenChangePassword();
                  }}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer text-left transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  <span>Change Password</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTheme()}
                  className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
                    <span>Appearance</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    {theme}
                  </span>
                </button>

                <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2 cursor-pointer text-left transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out to Login Page</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </header>

      {/* Account Details Modal */}
      {accountDetailsOpen && (
        <AccountDetailsModal
          isOpen={accountDetailsOpen}
          onClose={() => setAccountDetailsOpen(false)}
          currentUser={currentUser}
          allUsers={allUsers}
          onSwitchUser={onSwitchUser || (() => {})}
          onOpenLoginModal={onOpenLoginModal || (() => {})}
          onOpenChangePassword={onOpenChangePassword}
          onLogout={onLogout}
        />
      )}
    </>
  );
};
