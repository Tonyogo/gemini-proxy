import React, { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import JsonTreeView from './JsonTreeView';
import SseStreamPreview from './SseStreamPreview';
import { defineGeminiProxyTheme } from '../utils/monacoTheme';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [tree, setTree] = useState<Record<string, Record<string, number>>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'payload' | 'response'>('payload');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const fetchLogs = (forceAutoJump = false, customDate?: string, customHour?: string) => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};

    const targetDate = customDate !== undefined ? customDate : selectedDate;
    const targetHour = customHour !== undefined ? customHour : selectedHour;

    let query = '/api/admin/logs?limit=100';
    if (!forceAutoJump) {
      if (targetDate) query += `&date=${targetDate}`;
      if (targetHour) query += `&hour=${targetHour}`;
    }

    fetch(query, { headers })
      .then(r => r.json())
      .then(data => {
        const logTree = data.tree || {};
        setTree(logTree);
        setLogs(data.logs || []);

        const dates = Object.keys(logTree).sort((a, b) => b.localeCompare(a));
        if (dates.length > 0) {
          if (forceAutoJump || !targetDate || !logTree[targetDate]) {
            const latestDate = dates[0];
            setSelectedDate(latestDate);

            const hours = Object.keys(logTree[latestDate] || {})
              .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
            if (hours.length > 0) {
              const latestHour = hours[0];
              setSelectedHour(latestHour);
              // Refetch specifically for the auto-jumped date and hour
              fetchSpecificLogs(latestDate, latestHour);
              return;
            }
          }
        }

        if (data.logs && data.logs.length > 0) {
          loadDetail(data.logs[0]);
        } else {
          setSelectedLog(null);
          setSelectedFile('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchSpecificLogs = (d: string, h: string) => {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch(`/api/admin/logs?limit=100&date=${d}&hour=${h}`, { headers })
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs || []);
        if (data.logs && data.logs.length > 0) {
          loadDetail(data.logs[0]);
        } else {
          setSelectedLog(null);
          setSelectedFile('');
        }
      });
  };

  useEffect(() => {
    fetchLogs(true);
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
    const newHour = hours.length > 0 ? hours[0] : '';
    setSelectedHour(newHour);
    fetchLogs(false, date, newHour);
  };

  const handleHourChange = (hour: string) => {
    setSelectedHour(hour);
    fetchLogs(false, selectedDate, hour);
  };

  const availableHours = selectedDate && tree[selectedDate] ? Object.keys(tree[selectedDate]) : [];

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
    <div className="flex gap-6 max-w-7xl mx-auto items-start">
      {/* Left Sidebar */}
      {!sidebarCollapsed && (
        <div className="w-80 shrink-0 bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 shadow-md flex flex-col h-[820px] transition-all">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/60">
            <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Transaction Logs</h3>
            <button
              onClick={() => fetchLogs(true)}
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
                onChange={(e) => handleHourChange(e.target.value)}
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
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-xs text-center p-4">
                No logs found for selected date/hour.
              </div>
            ) : (
              logs.map((log, idx) => {
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
      )}

      {/* Main Inspector Column */}
      <div className="flex-1 min-w-0 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-md flex flex-col h-[820px]">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between pb-3 mb-4 border-b border-slate-700/60 gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center justify-center ${
                sidebarCollapsed
                  ? 'bg-blue-600/20 border-blue-500/80 text-blue-300'
                  : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
              title={sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
              </svg>
            </button>

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
            {selectedLog?.timestamp && (
              <span className="text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/40 px-3 py-1 rounded-full">
                {new Date(selectedLog.timestamp).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Content Panel */}
        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">Loading transaction log...</div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {activeTab === 'payload' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-blue-400 mb-1.5">Claude Client Request (client_req)</div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.client_req} />
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-slate-800">
                      <Editor
                        height="680px"
                        language="json"
                        theme="gemini-proxy-dark"
                        beforeMount={defineGeminiProxyTheme}
                        value={JSON.stringify(selectedLog.client_req, null, 2)}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          folding: true,
                          automaticLayout: true
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1.5">Gemini Upstream Request (gem_req)</div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.gem_req} />
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-slate-800">
                      <Editor
                        height="680px"
                        language="json"
                        theme="gemini-proxy-dark"
                        beforeMount={defineGeminiProxyTheme}
                        value={JSON.stringify(selectedLog.gem_req, null, 2)}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          folding: true,
                          automaticLayout: true
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

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
                    <div className="rounded-xl overflow-hidden border border-slate-800">
                      <Editor
                        height="680px"
                        language="json"
                        theme="gemini-proxy-dark"
                        beforeMount={defineGeminiProxyTheme}
                        value={JSON.stringify(selectedLog.claude_res, null, 2)}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          folding: true,
                          automaticLayout: true
                        }}
                      />
                    </div>
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
                    <div className="rounded-xl overflow-hidden border border-slate-800">
                      <Editor
                        height="680px"
                        language="json"
                        theme="gemini-proxy-dark"
                        beforeMount={defineGeminiProxyTheme}
                        value={JSON.stringify(selectedLog.gem_res, null, 2)}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 12,
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          folding: true,
                          automaticLayout: true
                        }}
                      />
                    </div>
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
