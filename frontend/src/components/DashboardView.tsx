import React, { useEffect, useState } from 'react';

export default function DashboardView({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [models, setModels] = useState<any>(null);

  useEffect(() => {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/status', { headers }).then(r => r.json()).then(setStatus).catch(() => {});
    fetch('/api/admin/stats', { headers }).then(r => r.json()).then(setStats).catch(() => {});
    fetch('/api/admin/models', { headers }).then(r => r.json()).then(setModels).catch(() => {});
  }, [adminKey]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">System Status</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 p-4 rounded border border-slate-700">
          <div className="text-slate-400 text-sm">Server Uptime</div>
          <div className="text-2xl font-semibold text-blue-400">{status ? `${Math.floor(status.uptime)}s` : 'Loading...'}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded border border-slate-700">
          <div className="text-slate-400 text-sm">Total Logs Processed</div>
          <div className="text-2xl font-semibold text-green-400">{stats ? stats.totalLogs : 'Loading...'}</div>
        </div>
        <div className="bg-slate-800 p-4 rounded border border-slate-700">
          <div className="text-slate-400 text-sm">Average Latency</div>
          <div className="text-2xl font-semibold text-purple-400">{stats ? `${stats.avgDurationMs} ms` : 'Loading...'}</div>
        </div>
      </div>

      <h2 className="text-xl font-bold text-white mt-8">Configured Models</h2>
      <div className="bg-slate-800 p-4 rounded border border-slate-700 text-xs font-mono overflow-auto max-h-64">
        <pre>{JSON.stringify(models, null, 2)}</pre>
      </div>
    </div>
  );
}
