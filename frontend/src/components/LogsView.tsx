import React, { useEffect, useState } from 'react';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/logs?limit=10', { headers })
      .then(r => r.json())
      .then(data => setLogs(data.logs || []))
      .catch(() => {});
  }, [adminKey]);

  const loadDetail = (log: any) => {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch(`/api/admin/logs/${log.date}/${log.hour}/${log.filename}`, { headers })
      .then(r => r.json())
      .then(setSelectedLog)
      .catch(() => {});
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-slate-800 p-4 rounded border border-slate-700 space-y-2">
        <h3 className="font-bold text-white mb-4">Transaction Logs</h3>
        {logs.map((log, idx) => (
          <div
            key={idx}
            onClick={() => loadDetail(log)}
            className="p-2 bg-slate-900 rounded cursor-pointer hover:border-blue-500 border border-transparent text-xs text-slate-300"
          >
            <div>{log.path}</div>
          </div>
        ))}
      </div>
      <div className="md:col-span-2 bg-slate-800 p-4 rounded border border-slate-700 font-mono text-xs overflow-auto max-h-[600px]">
        <h3 className="font-bold text-white mb-4">Log Payload Inspection</h3>
        {selectedLog ? (
          <pre>{JSON.stringify(selectedLog, null, 2)}</pre>
        ) : (
          <div className="text-slate-500">Select a log file on the left to inspect its payloads.</div>
        )}
      </div>
    </div>
  );
}
