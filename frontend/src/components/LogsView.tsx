import React, { useEffect, useState } from 'react';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/logs?limit=30', { headers })
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs || []);
        if (data.logs && data.logs.length > 0) {
          loadDetail(data.logs[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminKey]);

  const loadDetail = (log: any) => {
    setSelectedFile(log.path);
    setDetailLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch(`/api/admin/logs/${log.date}/${log.hour}/${log.filename}`, { headers })
      .then(r => r.json())
      .then(setSelectedLog)
      .catch(() => setSelectedLog(null))
      .finally(() => setDetailLoading(false));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
      {/* Sidebar: Log List */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md flex flex-col h-[750px]">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-sm">Transaction Logs</h3>
          <span className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">{logs.length} files</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">
            Loading log entries...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
            No transaction logs found in directory.
          </div>
        ) : (
          <div className="overflow-y-auto space-y-2 pr-1 flex-1 text-xs">
            {logs.map((log, idx) => {
              const isSelected = selectedFile === log.path;
              return (
                <div
                  key={idx}
                  onClick={() => loadDetail(log)}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500/80 text-blue-200'
                      : 'bg-slate-900/60 border-slate-700/40 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-mono text-[11px] truncate font-semibold">{log.filename}</div>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Date: {log.date}</span>
                    <span>Hour: {log.hour}:00</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content: Payload Detail Inspector */}
      <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-md flex flex-col h-[750px]">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-sm">Log Detail & Payload Translation Inspection</h3>
          {selectedLog?.duration && (
            <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded">
              Latency: {selectedLog.duration}ms
            </span>
          )}
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">
            Loading payload inspector...
          </div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 font-mono text-xs pr-1">
            <div>
              <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center">
                <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-blue-500/30">Client Req</span>
                Incoming Claude API Payload
              </div>
              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-48">
                {JSON.stringify(selectedLog.client_req, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-1 flex items-center">
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-emerald-500/30">Translated</span>
                Upstream Gemini Request Payload
              </div>
              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-48">
                {JSON.stringify(selectedLog.gem_req, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-xs font-semibold text-amber-400 mb-1 flex items-center">
                <span className="bg-amber-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-amber-500/30">Claude Res</span>
                Final Response Payload
              </div>
              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-48">
                {JSON.stringify(selectedLog.claude_res, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
            Select a transaction log file from the left panel to inspect payload details.
          </div>
        )}
      </div>
    </div>
  );
}
