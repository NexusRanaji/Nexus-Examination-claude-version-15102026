import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Server, 
  ShieldCheck, 
  ExternalLink, 
  Copy, 
  Eye, 
  EyeOff, 
  Zap, 
  X,
  FileCode2,
  HardDrive,
  HelpCircle,
  KeyRound,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { 
  getSupabaseCredentials, 
  saveRuntimeSupabaseConfig, 
  clearRuntimeSupabaseConfig 
} from '../../lib/supabase';

interface DatabaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DatabaseStatus {
  configured: boolean;
  connected: boolean;
  engine: string;
  host: string;
  healthy: boolean;
  stats?: {
    users: number;
    exams: number;
    submissions: number;
    questions: number;
    notices: number;
  };
}

export const DatabaseSettingsModal: React.FC<DatabaseSettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'uri' | 'builder' | 'client' | 'faq'>('uri');
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  
  // Tab 1: Direct URI
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Tab 2: Guided Builder
  const [builderProjectRef, setBuilderProjectRef] = useState('');
  const [builderPassword, setBuilderPassword] = useState('');
  const [builderRegion, setBuilderRegion] = useState('aws-0-ap-southeast-1');
  const [builderMode, setBuilderMode] = useState<'pooler' | 'direct'>('pooler');
  const [builderShowPassword, setBuilderShowPassword] = useState(false);

  // Tab 3: Supabase Frontend Client Credentials
  const clientCreds = getSupabaseCredentials();
  const [clientUrl, setClientUrl] = useState(clientCreds.url || '');
  const [clientAnonKey, setClientAnonKey] = useState('');

  // UI state
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>('github');

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<DatabaseStatus>('/api/database/status');
      if (res.data) {
        setStatus(res.data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch database status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Real-time URI validation hints
  const getUriValidationHint = (uri: string): { type: 'warning' | 'error' | 'ok'; message: string } | null => {
    const trimmed = uri.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      return {
        type: 'error',
        message: 'This is a Supabase Web/REST URL. You need the PostgreSQL Connection URI starting with "postgresql://". Go to Supabase -> Connect -> URI, or switch to the "Frontend Client" tab.'
      };
    }

    if (/\[YOUR-PASSWORD\]|\[YOUR_PASSWORD\]|<YOUR-PASSWORD>/i.test(trimmed)) {
      return {
        type: 'warning',
        message: 'Replace "[YOUR-PASSWORD]" with your real Supabase database password.'
      };
    }

    if (/:\[([^\]\s]+)\]@/.test(trimmed)) {
      return {
        type: 'warning',
        message: 'Notice: You kept the square brackets "[" and "]" around your password. We will automatically strip them so it authenticates properly!'
      };
    }

    if (trimmed.startsWith('psql ')) {
      return {
        type: 'warning',
        message: 'Detected "psql " command prefix. The app will auto-clean this, but you only need the URI.'
      };
    }

    if (!trimmed.startsWith('postgresql://') && !trimmed.startsWith('postgres://')) {
      return {
        type: 'error',
        message: 'Connection string must begin with "postgresql://"'
      };
    }

    return {
      type: 'ok',
      message: 'Connection string format looks good!'
    };
  };

  const uriHint = getUriValidationHint(databaseUrl);

  const handleConnectUri = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanUrl = databaseUrl.trim();
    if (!cleanUrl) {
      setFeedback({ type: 'error', message: 'Please enter a Supabase PostgreSQL connection URI.' });
      return;
    }

    if (cleanUrl.startsWith('https://') || cleanUrl.startsWith('http://')) {
      setFeedback({ 
        type: 'error', 
        message: 'You pasted a REST API URL. Please copy the PostgreSQL URI from Supabase: Click "Connect" at the top -> select "URI" tab -> copy the "postgresql://..." string.' 
      });
      return;
    }

    if (/\[YOUR-PASSWORD\]/i.test(cleanUrl)) {
      setFeedback({ 
        type: 'error', 
        message: 'Please replace "[YOUR-PASSWORD]" in the connection string with the password you created when making your Supabase project.' 
      });
      return;
    }

    // Auto-strip accidental square brackets around password
    cleanUrl = cleanUrl.replace(/:\[([^\]\s]+)\]@/, ':$1@');

    await executeConnect(cleanUrl);
  };

  const handleConnectBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRef = builderProjectRef.trim().replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '').replace(/^db\./, '');
    const cleanPass = builderPassword.trim();

    if (!cleanRef) {
      setFeedback({ type: 'error', message: 'Please enter your Supabase Project Reference or Host.' });
      return;
    }
    if (!cleanPass) {
      setFeedback({ type: 'error', message: 'Please enter your Supabase Database Password.' });
      return;
    }

    const encodedPass = encodeURIComponent(cleanPass);
    let constructedUri = '';

    if (builderMode === 'pooler') {
      // Session pooler URI (best for cloud apps and IPv4)
      constructedUri = `postgresql://postgres.${cleanRef}:${encodedPass}@${builderRegion}.pooler.supabase.com:6543/postgres`;
    } else {
      // Direct connection URI
      constructedUri = `postgresql://postgres:${encodedPass}@db.${cleanRef}.supabase.co:5432/postgres`;
    }

    await executeConnect(constructedUri);
  };

  const executeConnect = async (targetUri: string) => {
    try {
      setConnecting(true);
      setFeedback(null);
      const res = await apiClient.post<{ success: boolean; message: string; host?: string }>('/api/database/connect', {
        body: { databaseUrl: targetUri }
      });

      if (res.data?.success) {
        setFeedback({ 
          type: 'success', 
          message: res.data.message || 'Successfully connected to Supabase PostgreSQL! All data is permanently saved.' 
        });
        setDatabaseUrl('');
        setBuilderPassword('');
        await fetchStatus();
      } else {
        setFeedback({ type: 'error', message: 'Connection could not be verified.' });
      }
    } catch (err: any) {
      setFeedback({ 
        type: 'error', 
        message: err.data?.error || err.message || 'Failed to connect. Please verify your database password and Supabase status.' 
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSaveClientConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientUrl.trim().startsWith('https://')) {
      setFeedback({ type: 'error', message: 'Supabase URL must start with https:// (e.g., https://xyz.supabase.co)' });
      return;
    }
    if (!clientAnonKey.trim()) {
      setFeedback({ type: 'error', message: 'Please provide the public anon key from Supabase Project Settings -> API.' });
      return;
    }

    saveRuntimeSupabaseConfig(clientUrl.trim(), clientAnonKey.trim());
    setFeedback({ type: 'success', message: 'Frontend Supabase client credentials saved! Reloading application...' });
  };

  const handleClearClientConfig = () => {
    clearRuntimeSupabaseConfig();
    setFeedback({ type: 'success', message: 'Frontend Supabase client credentials cleared.' });
  };

  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      setFeedback(null);
      const res = await apiClient.post<{ success: boolean; message: string }>('/api/database/sync');
      if (res.data?.success) {
        setFeedback({ type: 'success', message: res.data.message });
        await fetchStatus();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.data?.error || err.message || 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleRunMigrations = async () => {
    try {
      setMigrating(true);
      setMigrationLogs([]);
      setFeedback(null);
      const res = await apiClient.post<{ success: boolean; appliedCount: number; logs: string[] }>('/api/database/run-migrations');
      if (res.data) {
        setMigrationLogs(res.data.logs || []);
        setFeedback({ 
          type: 'success', 
          message: `Migrations executed successfully! Applied ${res.data.appliedCount} file(s). Relational tables are ready.` 
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.data?.error || err.message || 'Failed to execute migrations.' });
    } finally {
      setMigrating(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <Database className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Supabase PostgreSQL Connection Center</h2>
              <p className="text-xs text-emerald-100/90 font-medium">Permanent cloud database retention across all reloads & restarts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-2">
          <button
            onClick={() => { setActiveTab('uri'); setFeedback(null); }}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'uri'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Paste Connection URI
          </button>

          <button
            onClick={() => { setActiveTab('builder'); setFeedback(null); }}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'builder'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Guided Builder (No URI)
          </button>

          <button
            onClick={() => { setActiveTab('client'); setFeedback(null); }}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'client'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Frontend Client (URL & Key)
          </button>

          <button
            onClick={() => { setActiveTab('faq'); setFeedback(null); }}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'faq'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
            Supabase Questions & FAQs
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Status Banner */}
          <div className={`p-4 rounded-xl border flex items-start gap-3.5 ${
            status?.configured && status?.connected
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            {status?.configured && status?.connected ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">
                  {status?.configured && status?.connected
                    ? 'Permanent Supabase Cloud Database Connected'
                    : 'Ephemeral Container Storage Active'}
                </h4>
                <button
                  onClick={fetchStatus}
                  disabled={loading}
                  className="text-xs flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              <p className="text-xs mt-1 leading-relaxed opacity-90">
                {status?.configured && status?.connected ? (
                  <>
                    Connected to <strong className="font-mono">{status.host}</strong>. All users, exams, submissions, and proctoring audits are permanently saved. Data survives server reloads and public URL restarts.
                  </>
                ) : (
                  <>
                    Changes are currently stored in temporary container memory. When the application sleeps or reloads, data resets back to initial presets. <strong>Connect Supabase PostgreSQL below to make all data permanent.</strong>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                : 'bg-rose-50 border-rose-300 text-rose-800'
            }`}>
              {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span className="flex-1">{feedback.message}</span>
            </div>
          )}

          {/* TAB 1: PASTE CONNECTION URI */}
          {activeTab === 'uri' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-600" /> Where to get this connection string in Supabase:
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1 leading-relaxed">
                  <li>In your Supabase project dashboard, click the green <strong>"Connect"</strong> button in the top header.</li>
                  <li>In the modal that opens, select the <strong>"URI"</strong> tab (under Connection String).</li>
                  <li>Copy the string (starts with <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">postgresql://...</code>).</li>
                  <li>Replace <code className="bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-mono text-[11px] font-bold">[YOUR-PASSWORD]</code> with your Supabase database password.</li>
                </ol>
              </div>

              <form onSubmit={handleConnectUri} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Supabase PostgreSQL Connection URI
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={databaseUrl}
                      onChange={(e) => setDatabaseUrl(e.target.value)}
                      placeholder="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
                      className="w-full text-xs font-mono px-3.5 py-2.5 pr-20 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors text-xs flex items-center gap-1"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span className="text-[10px] font-medium">{showPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>

                  {/* Real-time hint */}
                  {uriHint && (
                    <div className={`mt-2 p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                      uriHint.type === 'ok' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : uriHint.type === 'warning' 
                        ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {uriHint.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                      <span>{uriHint.message}</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={connecting || !databaseUrl.trim()}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                >
                  {connecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying Connection & Saving Data...
                    </>
                  ) : (
                    <>
                      <Server className="w-3.5 h-3.5" /> Test & Connect to Supabase
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: GUIDED BUILDER (NO URI) */}
          {activeTab === 'builder' && (
            <div className="space-y-4">
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-900 leading-relaxed">
                <strong>Don't want to format the connection string manually?</strong> Enter your Project Reference ID and password below. We will automatically format and encode everything for you.
              </div>

              <form onSubmit={handleConnectBuilder} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Supabase Project Reference ID
                  </label>
                  <input
                    type="text"
                    value={builderProjectRef}
                    onChange={(e) => setBuilderProjectRef(e.target.value)}
                    placeholder="e.g. uahmiva5636hks6hcazzpt or your project URL"
                    className="w-full text-xs font-mono px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Found in your Supabase project URL (<code className="font-mono text-[10px]">https://supabase.com/dashboard/project/&lt;ref&gt;</code>) or Project Settings.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Database Password
                  </label>
                  <div className="relative">
                    <input
                      type={builderShowPassword ? 'text' : 'password'}
                      value={builderPassword}
                      onChange={(e) => setBuilderPassword(e.target.value)}
                      placeholder="Password you chose when creating the project"
                      className="w-full text-xs font-mono px-3.5 py-2.5 pr-20 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setBuilderShowPassword(!builderShowPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors text-xs flex items-center gap-1"
                    >
                      {builderShowPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span className="text-[10px] font-medium">{builderShowPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Forgot your password? Reset it anytime in Supabase: <strong>Project Settings → Database → Reset database password</strong>.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Connection Mode
                    </label>
                    <select
                      value={builderMode}
                      onChange={(e) => setBuilderMode(e.target.value as any)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="pooler">Session Pooler (Port 6543 - Recommended)</option>
                      <option value="direct">Direct Connection (Port 5432)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Pooler Region
                    </label>
                    <select
                      value={builderRegion}
                      onChange={(e) => setBuilderRegion(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="aws-0-ap-south-1">Mumbai (ap-south-1)</option>
                      <option value="aws-0-ap-southeast-1">Singapore (ap-southeast-1)</option>
                      <option value="aws-0-us-east-1">N. Virginia (us-east-1)</option>
                      <option value="aws-0-us-west-1">N. California (us-west-1)</option>
                      <option value="aws-0-eu-central-1">Frankfurt (eu-central-1)</option>
                      <option value="aws-0-eu-west-1">Ireland (eu-west-1)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={connecting || !builderProjectRef.trim() || !builderPassword.trim()}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                >
                  {connecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Auto-Configuring & Connecting...
                    </>
                  ) : (
                    <>
                      <Server className="w-3.5 h-3.5" /> Auto-Construct & Connect
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: FRONTEND CLIENT SDK */}
          {activeTab === 'client' && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" /> Supabase Client SDK (For Real-time Subscriptions)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  If you want the web app to query Supabase directly from the browser using the <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[11px]">@supabase/supabase-js</code> client, enter your Project API credentials below.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Found under: <strong>Project Settings → API → Project URL & Project API Keys (anon public)</strong>
                </p>
              </div>

              <form onSubmit={handleSaveClientConfig} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    value={clientUrl}
                    onChange={(e) => setClientUrl(e.target.value)}
                    placeholder="https://xyzproject.supabase.co"
                    className="w-full text-xs font-mono px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Supabase Anon Public API Key
                  </label>
                  <input
                    type="password"
                    value={clientAnonKey}
                    onChange={(e) => setClientAnonKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full text-xs font-mono px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  {clientCreds.isConfigured && (
                    <div className="mt-1 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Configured (Active Key: {clientCreds.keyMasked})
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
                  >
                    Save Frontend Credentials
                  </button>
                  {clientCreds.isConfigured && (
                    <button
                      type="button"
                      onClick={handleClearClientConfig}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-medium text-xs rounded-xl border border-slate-200 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: FAQS & SUPABASE DOUBTS */}
          {activeTab === 'faq' && (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(expandedFaq === 'github' ? null : 'github')}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors"
                >
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                    Is it mandatory to attach a GitHub repository in Supabase?
                  </span>
                  {expandedFaq === 'github' ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {expandedFaq === 'github' && (
                  <div className="p-4 text-xs text-slate-600 leading-relaxed border-t border-slate-200 bg-white space-y-2">
                    <p className="font-semibold text-emerald-700">
                      NO, it is 100% NOT mandatory to attach GitHub!
                    </p>
                    <p>
                      In Supabase, attaching GitHub is only used if you want to set up optional CI/CD database branching workflows or log in via GitHub. Your database functions completely standalone in Supabase Cloud without any GitHub link.
                    </p>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(expandedFaq === 'createdb' ? null : 'createdb')}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors"
                >
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                    Do I need to create a database in Supabase? What kind is it?
                  </span>
                  {expandedFaq === 'createdb' ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {expandedFaq === 'createdb' && (
                  <div className="p-4 text-xs text-slate-600 leading-relaxed border-t border-slate-200 bg-white space-y-2">
                    <p className="font-semibold text-emerald-700">
                      NO, you do not need to create a database manually!
                    </p>
                    <p>
                      When you create a project in Supabase, Supabase automatically provisions a dedicated <strong>PostgreSQL</strong> database for you. 
                      The default database is named <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">postgres</code> with user <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">postgres</code>.
                    </p>
                    <p>
                      The moment you connect this application to Supabase, our app automatically creates all the tables (<code className="font-mono text-[11px]">nexus_system_state</code>, classes, exams, questions, submissions) for you automatically. You don't have to write any SQL!
                    </p>
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedFaq(expandedFaq === 'whyrejected' ? null : 'whyrejected')}
                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left transition-colors"
                >
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0" />
                    Why was my copied Supabase URL rejected or not accepted?
                  </span>
                  {expandedFaq === 'whyrejected' ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>
                {expandedFaq === 'whyrejected' && (
                  <div className="p-4 text-xs text-slate-600 leading-relaxed border-t border-slate-200 bg-white space-y-2.5">
                    <p>There are 3 common reasons why Supabase strings are rejected:</p>
                    <div className="space-y-2">
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
                        <strong className="text-rose-900 block font-semibold">1. Pasted Project URL instead of Database Connection URI:</strong>
                        <span className="text-rose-800 text-[11px]">
                          If your URL starts with <code className="font-mono font-bold">https://[ref].supabase.co</code>, that is the REST API URL. PostgreSQL database connections must start with <code className="font-mono font-bold">postgresql://...</code>.
                        </span>
                      </div>
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                        <strong className="text-amber-900 block font-semibold">2. Left [YOUR-PASSWORD] in the string:</strong>
                        <span className="text-amber-800 text-[11px]">
                          Supabase puts literal text <code className="font-mono">[YOUR-PASSWORD]</code> inside the URI as a placeholder. You must replace it with your real password.
                        </span>
                      </div>
                      <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <strong className="text-indigo-900 block font-semibold">3. Copied with 'psql' or quotes:</strong>
                        <span className="text-indigo-800 text-[11px]">
                          If you copied from the CLI tab, it looks like <code className="font-mono">psql "postgresql://..."</code>. Use the "URI" tab instead.
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action Tools for Connected Database */}
          {status?.configured && status?.connected && (
            <div className="border-t border-slate-200 pt-5 space-y-3">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-indigo-600" /> Connected Cloud Storage Actions
              </h5>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 transition-all text-left flex items-start gap-2.5 group"
                >
                  <RefreshCw className={`w-4 h-4 text-indigo-600 shrink-0 mt-0.5 ${syncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Sync Current System Data</span>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                      Upload users ({status.stats?.users || 0}), exams ({status.stats?.exams || 0}), and submissions to Supabase.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleRunMigrations}
                  disabled={migrating}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50/50 hover:border-emerald-200 transition-all text-left flex items-start gap-2.5 group"
                >
                  <FileCode2 className={`w-4 h-4 text-emerald-600 shrink-0 mt-0.5 ${migrating ? 'animate-spin' : ''}`} />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">Run Schema Migrations</span>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                      Create structured relational tables (<code className="text-[10px]">users</code>, <code className="text-[10px]">exams</code>, etc.) in Supabase.
                    </span>
                  </div>
                </button>
              </div>

              {migrationLogs.length > 0 && (
                <div className="bg-slate-900 text-slate-100 p-3 rounded-xl font-mono text-[11px] max-h-36 overflow-y-auto space-y-1">
                  <div className="text-emerald-400 font-bold mb-1">Migration Output:</div>
                  {migrationLogs.map((log, idx) => (
                    <div key={idx} className="text-slate-300">{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Connection credentials stay encrypted in server environment</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
