import React from 'react';

export const DashboardSkeleton: React.FC<{ roleName?: string }> = ({ roleName = 'Dashboard' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${roleName}`}
      className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto animate-pulse"
    >
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-4 w-72 bg-slate-100 dark:bg-slate-850 rounded-lg" />
        </div>
        <div className="h-10 w-28 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3"
          >
            <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-8 w-16 bg-slate-300 dark:bg-slate-700 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-4">
        <div className="h-5 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading {roleName} content, please wait...</span>
    </div>
  );
};

export default DashboardSkeleton;
