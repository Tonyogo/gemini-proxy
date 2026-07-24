import React, { useEffect, useState } from 'react';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [tree, setTree] = useState<Record<string, Record<string, number>>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchLogs = () => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/logs?limit=100', { headers })
      .then(r => r.json())
      .then(data => {
        const logTree = data.tree || {};
        setLogs(data.logs || []);
        setTree(logTree);

        // Auto-select latest date & latest hour if not set
        const dates = Object.keys(logTree);
        if (dates.length > 0) {
          const latestDate = dates[0];
          setSelectedDate(prev => prev || latestDate);

          const hours = Object.keys(logTree[latestDate] || {});
          if (hours.length > 0) {
            const latestHour = hours[0];
            setSelectedHour(prev => prev || latestHour);
          }
        }

        if (data.logs && data.logs.length > 0 && !selectedFile) {
          loadDetail(data.logs[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
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

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    const hours = Object.keys(tree[date] || {});
    if (hours.length > 0) {
      setSelectedHour(hours[0]);
    } else {
      setSelectedHour('');
    }
  };

  const filteredLogs = logs.filter(log => {
    if (selectedDate && log.date !== selectedDate) return false;
    if (selectedHour && selectedHour !== 'all' && log.hour !== selectedHour) return false;
    return true;
  });

  const availableHours = selectedDate && tree[selectedDate] ? Object.keys(tree[selectedDate]) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
      {/* Left Sidebar (1/3 width): Filter Controls + Log Card List */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md flex flex-col h-[780px]">
        {/* Top Header & Refresh */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Transaction Logs</h3>
          <button
            onClick={fetchLogs}
            className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded transition-colors flex items-center space-x-1"
          >
            <span>↻</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Date & Hour Dropdown Selector Bar */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 block mb-1">Date</label>
            <select
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            >
              {Object.keys(tree).map(d => (
                <option key={d} value={d}>📅 {d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 block mb-1">Hour</label>
            <select
              value={selectedHour}
              onChange={(e) => setSelectedHour(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            >
              <option value="all">🕒 All Hours</option>
              {availableHours.map(h => (
                <option key={h} value={h}>🕒 {h}:00 ({tree[selectedDate][h]})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Log File Cards List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs border-t border-slate-700/40 pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-xs">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-500 text-xs text-center p-4">
              No transaction logs found for selected filter.
            </div>
          ) : (
            filteredLogs.map((log, idx) => {
              const isSelected = selectedFile === log.path;
              return (
                <div
                  key={idx}
                  onClick={() => loadDetail(log)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500/80 text-blue-200 shadow-md'
                      : 'bg-slate-900/60 border-slate-700/40 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-mono text-[11px] truncate font-semibold">{log.filename}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5 flex items-center justify-between font-mono">
                    <span>{log.date}</span>
                    <span className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60">{log.hour}:00</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Main Column (2/3 width): Payload Inspector */}
      <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-md flex flex-col h-[780px]">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Payload Inspector</h3>
          {selectedLog?.duration && (
            <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-3 py-1 rounded-full">
              Latency: {selectedLog.duration}ms
            </span>
          )}
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">Loading payload details...</div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 font-mono text-xs pr-1">
            <div>
              <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center">
                <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-blue-500/30">Client Req</span>
                Incoming Claude API Payload
              </div>
              <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(selectedLog.client_req, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-1 flex items-center">
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-emerald-500/30">Translated</span>
                Upstream Gemini Request Payload
              </div>
              <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(selectedLog.gem_req, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-xs font-semibold text-amber-400 mb-1 flex items-center">
                <span className="bg-amber-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-amber-500/30">Claude Res</span>
                Final Response Payload
              </div>
              <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
                {JSON.stringify(selectedLog.claude_res, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
            Select a transaction log entry from the left list to inspect translated payloads.
          </div>
        )}
      </div>
    </div>
  );
}
