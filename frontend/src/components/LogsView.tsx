import React, { useEffect, useState } from 'react';
import JsonTreeView from './JsonTreeView';
import SseStreamPreview from './SseStreamPreview';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [tree, setTree] = useState<Record<string, Record<string, number>>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Chrome DevTools States (Removed 'all')
  const [activeTab, setActiveTab] = useState<'payload' | 'response'>('payload');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  const fetchLogs = () => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/logs?limit=100', { headers })
      .then(r => r.json())
      .then(data => {
        const logTree = data.tree || {};
        setLogs(data.logs || []);
        setTree(logTree);

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

  // Helper to detect if payload is streaming SSE data
  const isStreamPayload = (payload: any) => {
    if (Array.isArray(payload) && payload.length > 0 && (payload[0]?.type || payload[0]?.candidates)) {
      return true;
    }
    if (typeof payload === 'string' && payload.includes('data: ')) {
      return true;
    }
    return false;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {/* Left Sidebar */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md flex flex-col h-[820px]">
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

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs border-t border-slate-700/40 pt-2">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-xs">Loading logs...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-500 text-xs text-center p-4">
              No logs found for selected date/hour.
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

      {/* Main Inspector Column */}
      <div className="lg:col-span-3 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-md flex flex-col h-[820px]">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between pb-3 mb-4 border-b border-slate-700/60 gap-3">
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('payload')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5 ${
                activeTab === 'payload' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📤</span>
              <span>Payload (Request)</span>
            </button>
            <button
              onClick={() => setActiveTab('response')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5 ${
                activeTab === 'response' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📥</span>
              <span>Response</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === 'preview' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                👁 Preview Mode
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === 'raw' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                💻 Raw JSON
              </button>
            </div>

            {selectedLog?.duration && (
              <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-3 py-1 rounded-full">
                Latency: {selectedLog.duration}ms
              </span>
            )}
          </div>
        </div>

        {/* Content Panel */}
        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">Loading transaction log...</div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Payload Tab */}
            {activeTab === 'payload' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-blue-400 mb-1.5">Claude Client Request (client_req)</div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.client_req} />
                  ) : (
                    <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-auto max-h-[680px]">
                      {JSON.stringify(selectedLog.client_req, null, 2)}
                    </pre>
                  )}
                </div>

                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1.5">Gemini Upstream Request (gem_req)</div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.gem_req} />
                  ) : (
                    <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-auto max-h-[680px]">
                      {JSON.stringify(selectedLog.gem_req, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Response Tab */}
            {activeTab === 'response' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-amber-400 mb-1.5 flex items-center justify-between">
                    <span>Claude Final Response (claude_res)</span>
                    {isStreamPayload(selectedLog.claude_res) && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                        SSE Stream
                      </span>
                    )}
                  </div>
                  {viewMode === 'preview' ? (
                    isStreamPayload(selectedLog.claude_res) ? (
                      <SseStreamPreview streamData={selectedLog.claude_res} />
                    ) : (
                      <JsonTreeView data={selectedLog.claude_res} />
                    )
                  ) : (
                    <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-auto max-h-[680px]">
                      {JSON.stringify(selectedLog.claude_res, null, 2)}
                    </pre>
                  )}
                </div>

                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-purple-400 mb-1.5 flex items-center justify-between">
                    <span>Gemini Upstream Response (gem_res)</span>
                    {isStreamPayload(selectedLog.gem_res) && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                        SSE Stream
                      </span>
                    )}
                  </div>
                  {viewMode === 'preview' ? (
                    isStreamPayload(selectedLog.gem_res) ? (
                      <SseStreamPreview streamData={selectedLog.gem_res} />
                    ) : (
                      <JsonTreeView data={selectedLog.gem_res} />
                    )
                  ) : (
                    <pre className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 overflow-auto max-h-[680px]">
                      {JSON.stringify(selectedLog.gem_res, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
            Select a log entry on the left to inspect side-by-side JSON payloads.
          </div>
        )}
      </div>
    </div>
  );
}
