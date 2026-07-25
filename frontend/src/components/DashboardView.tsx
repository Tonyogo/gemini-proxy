import React, { useEffect, useState } from 'react';

export default function DashboardView({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [models, setModels] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [adminKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        Loading metrics and configurations...
      </div>
    );
  }

  const cfg = status?.config || {};

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans">
      {/* Top Banner: Status & Metrics */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 mb-4 tracking-tight">Proxy System Overview</h2>
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
            <div className="text-xs text-slate-500 mt-2">Upstream timeout limit: {cfg.upstreamTimeoutMs || 180000}ms</div>
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

      {/* Categorized Config Cards */}
      <div className="space-y-6">
        <h3 className="text-md font-bold text-slate-200 border-b border-slate-700/60 pb-2 uppercase tracking-wider text-xs">
          Categorized Environment Configuration
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category 1: System & Server Base Settings */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-lg space-y-4">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>1. System & Core Settings</span>
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold">LOG_LEVEL</span>
                <span className="text-amber-400 font-semibold uppercase">{cfg.logLevel || 'info'}</span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold">TIME_ZONE</span>
                <span className="text-blue-300 font-semibold">{cfg.timeZone || 'Asia/Shanghai'}</span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold">UPSTREAM_TIMEOUT_MS</span>
                <span className="text-purple-300 font-semibold">{cfg.upstreamTimeoutMs || 180000} ms</span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold">ENABLE_UI</span>
                <span className="text-emerald-400 font-semibold">{String(cfg.enableUi !== false)}</span>
              </div>
            </div>
          </div>

          {/* Category 2: Translation & Context Strategy */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-lg space-y-4">
            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>2. Translation Rules & Strategy</span>
            </h4>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold">SYSTEM_ROLE_TO_INSTRUCTION</span>
                <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${cfg.systemRoleToInstruction ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                  {String(Boolean(cfg.systemRoleToInstruction))}
                </span>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 block mb-1 text-[10px] uppercase font-bold">RUNTIME_CONTEXT_TAG</span>
                <span className="text-blue-400 font-semibold">&lt;{cfg.runtimeContextTag || 'runtime-context'}&gt;</span>
              </div>
            </div>
          </div>
        </div>

        {/* Category 2.1: Custom System Instruction */}
        <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-lg space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/40">
            <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
              CUSTOM_SYSTEM_INSTRUCTION
            </span>
            <span className="text-[10px] text-slate-500 font-sans">Injected Into All Gemini Upstream Calls</span>
          </div>

          {cfg.customSystemInstruction ? (
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-200 text-xs whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {cfg.customSystemInstruction}
            </pre>
          ) : (
            <div className="text-slate-500 text-xs italic p-2 bg-slate-950/60 rounded-lg border border-slate-900">
              No custom system instructions specified.
            </div>
          )}
        </div>
      </div>

      {/* Category 3: Model Routing & Mappings */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-6 shadow-md space-y-4">
        <h3 className="text-md font-bold text-slate-200 uppercase tracking-wider text-xs">
          3. Supported Models & Active Mappings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase font-mono">Declared Model Mappings</div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-amber-300 overflow-auto max-h-60 leading-relaxed">
              {JSON.stringify(cfg.modelMappings || {}, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-1.5 uppercase font-mono">Supported Models Definition (models.json)</div>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-auto max-h-60 leading-relaxed">
              {JSON.stringify(models?.models || {}, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
