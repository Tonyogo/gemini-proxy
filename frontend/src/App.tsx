import React, { useState, useEffect } from 'react';
import DashboardView from './components/DashboardView';
import LogsView from './components/LogsView';
import PlaygroundView from './components/PlaygroundView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'playground'>('dashboard');
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');
  const [inputKey, setInputKey] = useState(localStorage.getItem('adminKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // Validate admin key against /api/admin/status
  const verifyAuth = async (keyToTest: string) => {
    setLoading(true);
    setAuthError('');
    try {
      const headers: Record<string, string> = keyToTest ? { 'x-admin-key': keyToTest } : {};
      const res = await fetch('/api/admin/status', { headers });

      if (res.ok) {
        setIsAuthenticated(true);
        setAdminKey(keyToTest);
        localStorage.setItem('adminKey', keyToTest);
      } else if (res.status === 401) {
        setIsAuthenticated(false);
        setAuthError('Invalid Admin Secret Key. Access Denied (401).');
      } else {
        // Other server error or unexpected response
        setIsAuthenticated(false);
        setAuthError(`Authentication failed: Server returned ${res.status}`);
      }
    } catch (err: any) {
      setIsAuthenticated(false);
      setAuthError(`Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyAuth(adminKey);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    verifyAuth(inputKey);
  };

  const handleLogout = () => {
    setAdminKey('');
    setInputKey('');
    localStorage.removeItem('adminKey');
    setIsAuthenticated(false);
  };

  // Loading state during initial verification
  if (loading && isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-300 font-mono text-xs">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        Verifying Security Credentials...
      </div>
    );
  }

  // Render Fullscreen Login Gate if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 mb-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 002-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-100 tracking-tight">Gemini Proxy Console</h1>
            <p className="text-xs text-slate-400">Enter Admin Secret Key to access Dashboard & Debugger</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Admin Secret Key</label>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="Enter ADMIN_SECRET_KEY"
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs text-center font-medium">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-xl font-semibold text-xs text-white transition-all shadow-lg"
            >
              {loading ? 'Authenticating...' : 'Unlock Console'}
            </button>
          </form>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            Note: If <code className="text-slate-400 font-mono">ADMIN_SECRET_KEY</code> is not set in backend .env, leave blank and click Unlock directly.
          </p>
        </div>
      </div>
    );
  }

  // Render Full Dashboard Interface when Authenticated
  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800/80 px-6 py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-sm">
            GP
          </div>
          <span className="font-bold text-md text-slate-100 tracking-tight">Gemini Proxy</span>
          <span className="text-[10px] uppercase font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full">
            Authenticated
          </span>
        </div>

        <nav className="flex space-x-2 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          {(['dashboard', 'logs', 'playground'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="px-3 py-1.5 bg-slate-800/80 hover:bg-rose-600/20 hover:border-rose-500/40 border border-slate-700/60 rounded-lg text-xs text-slate-300 hover:text-rose-300 transition-all flex items-center space-x-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Lock Console</span>
        </button>
      </header>

      <main className="flex-1 p-6">
        {activeTab === 'dashboard' && <DashboardView adminKey={adminKey} />}
        {activeTab === 'logs' && <LogsView adminKey={adminKey} />}
        {activeTab === 'playground' && <PlaygroundView />}
      </main>
    </div>
  );
}
