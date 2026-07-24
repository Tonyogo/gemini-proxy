import React, { useEffect, useState } from 'react';

export default function DashboardView({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [models, setModels] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      setLoading(false);
    });
  }, [adminKey]);

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

      {/* System Settings Grid */}
      {status?.config && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 shadow-md">
          <h3 className="text-md font-bold text-slate-200 mb-4">Active Configuration Environment</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block mb-1">SYSTEM_ROLE_TO_INSTRUCTION</span>
              <span className={`px-2 py-0.5 rounded font-bold ${status.config.systemRoleToInstruction ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                {String(status.config.systemRoleToInstruction)}
              </span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block mb-1">RUNTIME_CONTEXT_TAG</span>
              <span className="text-blue-400 font-semibold">&lt;{status.config.runtimeContextTag}&gt;</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-700/40">
              <span className="text-slate-400 block mb-1">LOG_LEVEL</span>
              <span className="text-amber-400 font-semibold uppercase">{status.config.logLevel}</span>
            </div>
          </div>
        </div>
      )}

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
