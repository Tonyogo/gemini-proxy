import React, { useEffect, useState } from 'react';

export default function DashboardView({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [models, setModels] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Editable Form State
  const [systemRoleToInstruction, setSystemRoleToInstruction] = useState<boolean>(false);
  const [runtimeContextTag, setRuntimeContextTag] = useState<string>('runtime-context');
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  const loadData = () => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    Promise.all([
      fetch('/api/admin/status', { headers }).then(r => r.json()).catch(() => null),
      fetch('/api/admin/stats', { headers }).then(r => r.json()).catch(() => null),
      fetch('/api/admin/models', { headers }).then(r => r.json()).catch(() => null),
    ]).then(([statusData, statsData, modelsData]) => {
      setStatus(statusData);
      setStats(statsData);
      setModels(modelsData);

      if (statusData?.config) {
        setSystemRoleToInstruction(Boolean(statusData.config.systemRoleToInstruction));
        setRuntimeContextTag(statusData.config.runtimeContextTag || 'runtime-context');
        setCustomSystemInstruction(statusData.config.customSystemInstruction || '');
        setUpstreamTimeoutMs(statusData.config.upstreamTimeoutMs || 180000);
        setLogLevel(statusData.config.logLevel || 'info');
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [adminKey]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToastMessage('');

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {})
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemRoleToInstruction,
          runtimeContextTag,
          customSystemInstruction,
          upstreamTimeoutMs,
          logLevel
        })
      });

      if (res.ok) {
        setToastMessage('✓ Configuration updated live!');
        setTimeout(() => setToastMessage(''), 4000);
        loadData();
      } else {
        alert('Failed to save configuration');
      }
    } catch (err: any) {
      alert(`Error saving configuration: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        Loading metrics and configurations...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Metrics Banner */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 mb-4 tracking-tight">Proxy System Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Server Status</div>
            <div className="flex items-center space-x-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xl font-bold text-emerald-400">Online</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">Uptime: {status ? `${Math.floor(status.uptime)}s` : 'N/A'}</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Total Transactions</div>
            <div className="text-2xl font-extrabold text-blue-400">{stats ? stats.totalLogs : 0}</div>
            <div className="text-xs text-slate-500 mt-2">Sampled: {stats ? stats.sampleSize : 0} recent requests</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Average Latency</div>
            <div className="text-2xl font-extrabold text-purple-400">{stats ? `${stats.avgDurationMs}` : 0} <span className="text-sm font-normal text-slate-400">ms</span></div>
            <div className="text-xs text-slate-500 mt-2">Upstream timeout limit: {status?.config?.upstreamTimeoutMs || 180000}ms</div>
          </div>

          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">Success vs Errors</div>
            <div className="flex items-center space-x-3 mt-1">
              <span className="text-lg font-bold text-emerald-400">✓ {stats?.successCount || 0}</span>
              <span className="text-slate-600">/</span>
              <span className="text-lg font-bold text-rose-400">✗ {stats?.errorCount || 0}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">Recent 100 requests ratio</div>
          </div>
        </div>
      </div>

      {/* Interactive Settings Form */}
      <form onSubmit={handleSaveConfig} className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-lg space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
          <div>
            <h3 className="text-md font-bold text-slate-100">Live Runtime Configuration</h3>
            <p className="text-xs text-slate-400 mt-0.5">Tweak transformation rules and timeouts on the fly without server restart</p>
          </div>
          {toastMessage && (
            <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-full animate-bounce">
              {toastMessage}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs font-semibold text-slate-200 uppercase">SYSTEM_ROLE_TO_INSTRUCTION</span>
              <input
                type="checkbox"
                checked={systemRoleToInstruction}
                onChange={(e) => setSystemRoleToInstruction(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-500 bg-slate-950"
              />
            </label>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When enabled, converts inline system message history roles into Gemini <code className="text-blue-400 font-mono">systemInstruction</code>.
            </p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-200 uppercase block">RUNTIME_CONTEXT_TAG</label>
            <input
              type="text"
              value={runtimeContextTag}
              onChange={(e) => setRuntimeContextTag(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-400">Wraps system prompt blocks inside custom XML tags.</p>
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-200 uppercase block">UPSTREAM_TIMEOUT_MS</label>
            <input
              type="number"
              value={upstreamTimeoutMs}
              onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
            <label className="text-xs font-semibold text-slate-200 uppercase block">LOG_LEVEL</label>
            <select
              value={logLevel}
              onChange={(e) => setLogLevel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            >
              <option value="error">error</option>
              <option value="warn">warn</option>
              <option value="info">info</option>
              <option value="debug">debug</option>
            </select>
          </div>
        </div>

        <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-2">
          <label className="text-xs font-semibold text-slate-200 uppercase block">CUSTOM_SYSTEM_INSTRUCTION</label>
          <textarea
            rows={4}
            value={customSystemInstruction}
            onChange={(e) => setCustomSystemInstruction(e.target.value)}
            placeholder="Supplementary constraints injected into all upstream calls..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-xl font-bold text-xs text-white transition-colors shadow-md"
        >
          {saving ? 'Saving...' : 'Save & Apply Live'}
        </button>
      </form>

      {/* Model Mappings & Supported Models */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 shadow-md">
        <h3 className="text-md font-bold text-slate-200 mb-4">Supported Models & Mappings</h3>
        <div className="bg-slate-950/80 p-4 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 overflow-auto max-h-80 leading-relaxed">
          <pre>{JSON.stringify(models, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
