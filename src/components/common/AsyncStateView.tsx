import React from 'react';
import { AlertCircle, FolderOpen, RefreshCw, Loader2 } from 'lucide-react';

interface AsyncStateViewProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}

export const AsyncStateView: React.FC<AsyncStateViewProps> = ({
  loading,
  error,
  empty,
  emptyTitle = 'No records found',
  emptyMessage = 'There is currently no data available for this view.',
  loadingMessage = 'Loading data...',
  errorMessage,
  onRetry,
  children,
}) => {
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center p-12 space-y-4 text-center min-h-[220px]"
      >
        <div className="relative">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" aria-hidden="true" />
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {loadingMessage}
        </p>
        <span className="sr-only">Content is loading, please wait</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex flex-col items-center justify-center p-8 my-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-center space-y-3 min-h-[200px]"
      >
        <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Failed to load data
          </h4>
          <p className="text-xs text-rose-700 dark:text-rose-300">
            {errorMessage || error}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs rounded-xl shadow-sm hover:opacity-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div
        role="region"
        aria-label="Empty state"
        className="flex flex-col items-center justify-center p-10 my-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-3 min-h-[200px]"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400">
          <FolderOpen className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="space-y-1 max-w-xs">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {emptyTitle}
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {emptyMessage}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            <span>Refresh</span>
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
};

export default AsyncStateView;
