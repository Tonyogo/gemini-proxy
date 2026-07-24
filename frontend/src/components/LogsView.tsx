import React, { useEffect, useState } from 'react';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [tree, setTree] = useState<Record<string, Record<string, number>>>({});
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
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
        setLogs(data.logs || []);
        setTree(data.tree || {});

        // Default expand first date
        const dateKeys = Object.keys(data.tree || {});
        if (dateKeys.length > 0) {
          setExpandedDates(prev => ({ ...prev, [dateKeys[0]]: true }));
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

  const toggleDate = (date: string) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
    if (selectedDate === date && selectedHour === null) {
      setSelectedDate(null);
    } else {
      setSelectedDate(date);
      setSelectedHour(null);
    }
  };

  const selectHourFilter = (date: string, hour: string) => {
    setSelectedDate(date);
    setSelectedHour(hour);
  };

  const filteredLogs = logs.filter(log => {
    if (selectedDate && log.date !== selectedDate) return false;
    if (selectedHour && log.hour !== selectedHour) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {/* Date & Hour Tree Filter Panel */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md flex flex-col h-[750px]">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Date History</h3>
          <button
            onClick={fetchLogs}
            className="text-[10px] bg-slate-700/80 hover:bg-slate-700 text-slate-200 px-2 py-1 rounded transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="overflow-y-auto space-y-1.5 flex-1 pr-1 text-xs">
          {Object.keys(tree).length === 0 ? (
            <div className="text-slate-500 text-center py-6 text-xs">No historical dates</div>
          ) : (
            Object.keys(tree).map(date => {
              const isExpanded = expandedDates[date];
              const hours = tree[date];
              const totalForDate = Object.values(hours).reduce((a, b) => a + b, 0);

              return (
                <div key={date} className="space-y-1">
                  <div
                    onClick={() => toggleDate(date)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer font-mono font-semibold transition-colors ${
                      selectedDate === date && !selectedHour ? 'bg-blue-600/30 text-blue-300' : 'hover:bg-slate-700/50 text-slate-200'
                    }`}
                  >
                    <span className="flex items-center space-x-1.5">
                      <span className="text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                      <span>📅 {date}</span>
                    </span>
                    <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 font-normal">{totalForDate}</span>
                  </div>

                  {isExpanded && (
                    <div className="pl-4 space-y-1 border-l border-slate-700/60 ml-2">
                      <div
                        onClick={() => { setSelectedDate(date); setSelectedHour(null); }}
                        className={`p-1.5 rounded cursor-pointer text-[11px] font-mono ${
                          selectedDate === date && !selectedHour ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        • All Hours
                      </div>
                      {Object.keys(hours).map(hour => (
                        <div
                          key={hour}
                          onClick={() => selectHourFilter(date, hour)}
                          className={`flex items-center justify-between p-1.5 rounded cursor-pointer text-[11px] font-mono ${
                            selectedDate === date && selectedHour === hour ? 'bg-blue-500/20 text-blue-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>🕒 {hour}:00</span>
                          <span className="text-[10px] text-slate-500">{hours[hour]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Log Files Panel */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md flex flex-col h-[750px]">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Log Entries</h3>
          <span className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">{filteredLogs.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">Loading...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs text-center p-4">
            No transaction logs found for selected filter.
          </div>
        ) : (
          <div className="overflow-y-auto space-y-2 pr-1 flex-1 text-xs">
            {filteredLogs.map((log, idx) => {
              const isSelected = selectedFile === log.path;
              return (
                <div
                  key={idx}
                  onClick={() => loadDetail(log)}
                  className={`p-2.5 rounded-lg cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500/80 text-blue-200'
                      : 'bg-slate-900/60 border-slate-700/40 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-mono text-[11px] truncate font-semibold">{log.filename}</div>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>{log.date}</span>
                    <span>{log.hour}:00</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Payload Inspector Panel */}
      <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-md flex flex-col h-[750px]">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-700/60">
          <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Payload Inspector</h3>
          {selectedLog?.duration && (
            <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-full">
              Latency: {selectedLog.duration}ms
            </span>
          )}
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">Loading payload...</div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 font-mono text-xs pr-1">
            <div>
              <div className="text-xs font-semibold text-blue-400 mb-1 flex items-center">
                <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-blue-500/30">Client Req</span>
                Incoming Claude API Payload
              </div>
              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-44">
                {JSON.stringify(selectedLog.client_req, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-1 flex items-center">
                <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-emerald-500/30">Translated</span>
                Upstream Gemini Request Payload
              </div>
              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-44">
                {JSON.stringify(selectedLog.gem_req, null, 2)}
              </pre>
            </div>

            <div>
              <div className="text-xs font-semibold text-amber-400 mb-1 flex items-center">
                <span className="bg-amber-500/20 px-2 py-0.5 rounded text-[10px] uppercase mr-2 border border-amber-500/30">Claude Res</span>
                Final Response Payload
              </div>
              <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto max-h-44">
                {JSON.stringify(selectedLog.claude_res, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
            Select a transaction log entry to inspect translated payloads.
          </div>
        )}
      </div>
    </div>
  );
}
