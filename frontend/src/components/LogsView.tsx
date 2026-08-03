import React, { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import JsonTreeView from './JsonTreeView';
import SseStreamPreview from './SseStreamPreview';
import { defineGeminiProxyTheme } from '../utils/monacoTheme';
import { useTranslation } from '../i18n/LanguageContext';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation();
  const detailCacheRef = useRef<Map<string, any>>(new Map());
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

    let query = '/api/admin/logs?limit=30';
    if (!forceAutoJump) {
      if (targetDate) query += `&date=${targetDate}`;
      if (targetHour) query += `&hour=${targetHour}`;
    }

    fetch(query, { headers })
      .then(r => r.json())
      .then(data => {
        const logTree = data.tree || {};
        setTree(logTree);
        const fetchedLogs = data.logs || [];
        setLogs(fetchedLogs);

        if (fetchedLogs.length > 0) {
          // Sync dropdowns to the top log without secondary refetch
          setSelectedDate(fetchedLogs[0].date);
          setSelectedHour(fetchedLogs[0].hour);
          loadDetail(fetchedLogs[0]);
        } else {
          setSelectedLog(null);
          setSelectedFile('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs(true);
  }, [adminKey]);

  const loadDetail = (log: any) => {
    setSelectedFile(log.path);
    if (detailCacheRef.current.has(log.path)) {
      setSelectedLog(detailCacheRef.current.get(log.path));
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch(`/api/admin/logs/${log.date}/${log.hour}/${log.filename}`, { headers })
      .then(r => r.json())
      .then(data => {
        detailCacheRef.current.set(log.path, data);
        setSelectedLog(data);
      })
      .catch(() => setSelectedLog(null))
      .finally(() => setDetailLoading(false));
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    const hours = Object.keys(tree[date] || {})
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    const newHour = hours.length > 0 ? hours[0] : '';
    setSelectedHour(newHour);
    fetchLogs(false, date, newHour);
  };

  const handleHourChange = (hour: string) => {
    setSelectedHour(hour);
    fetchLogs(false, selectedDate, hour);
  };

  const availableHours = selectedDate && tree[selectedDate]
    ? Object.keys(tree[selectedDate]).sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
    : [];

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
            <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">{t('logs.title')}</h3>
            <button
              onClick={() => {
                detailCacheRef.current.clear();
                fetchLogs(true);
              }}
              className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 px-2 py-1 rounded transition-colors flex items-center space-x-1"
            >
              <span>↻</span>
              <span>{t('logs.refresh')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 block mb-1">{t('logs.dateLabel')}</label>
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              >
                {Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
                  <option key={d} value={d}>📅 {d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 block mb-1">{t('logs.hourLabel')}</label>
              <select
                value={selectedHour}
                onChange={(e) => handleHourChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
              >
                <option value="all">🕒 {t('logs.allHours')}</option>
                {availableHours.map(h => (
                  <option key={h} value={h}>🕒 {h}:00 ({tree[selectedDate][h]})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs border-t border-slate-700/40 pt-2">
            {loading ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-xs">{t('logs.loadingLogs')}</div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-500 text-xs text-center p-4">
                {t('logs.noLogsFound')}
              </div>
            ) : (
              logs.map((log, idx) => {
                const isSelected = selectedFile === log.path;

                // Helper to format exact local time from timestamp
                let formattedTime = `${log.hour}:00`;
                if (log.timestamp) {
                  try {
                    const d = new Date(log.timestamp);
                    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                  } catch (e) { /* ignore */ }
                }

                // Parse human-friendly route name from reqPath (e.g. "/v1/messages" -> "/messages")
                let pathLabel = '';
                let pathBadgeColor = 'bg-slate-800 text-slate-300 border-slate-700/60';
                if (log.reqPath) {
                  const rawPath = log.reqPath.split('?')[0]; // strip query params
                  if (rawPath.endsWith('/messages')) {
                    pathLabel = '/messages';
                    pathBadgeColor = 'bg-blue-500/10 text-blue-300 border-blue-500/20';
                  } else if (rawPath.endsWith('/count_tokens')) {
                    pathLabel = '/count_tokens';
                    pathBadgeColor = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
                  } else if (rawPath.endsWith('/models')) {
                    pathLabel = '/models';
                    pathBadgeColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
                  } else {
                    pathLabel = rawPath.substring(rawPath.lastIndexOf('/'));
                  }
                }

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
                      <div className="flex items-center space-x-1.5">
                        {log.status !== null && log.status !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                            log.status >= 200 && log.status < 300 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                            log.status >= 400 && log.status < 500 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                            'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          }`}>
                            {log.status}
                          </span>
                        )}
                        {log.isStream && (
                          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-blue-500/10 text-blue-300 border-blue-500/20">
                            STREAM
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        {pathLabel && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${pathBadgeColor}`}>
                            {pathLabel}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded border border-slate-700/60 bg-slate-800/80 text-slate-300 font-mono">
                          {formattedTime}
                        </span>
                      </div>
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
                <span>{t('logs.payloadRequest')}</span>
              </button>
              <button
                onClick={() => setActiveTab('response')}
                className={`px-3 py-1.5 rounded-md transition-all flex items-center space-x-1.5 ${
                  activeTab === 'response' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>📥</span>
                <span>{t('logs.response')}</span>
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
                {t('logs.previewMode')}
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                  viewMode === 'raw' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('logs.rawJsonTab')}
              </button>
            </div>

            {selectedLog?.path && (
              <span className="text-xs font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-3 py-1 rounded-full font-semibold">
                Path: {selectedLog.path}
              </span>
            )}
            {selectedLog && selectedLog.status !== null && selectedLog.status !== undefined && (
              <span className={`text-xs font-mono px-3 py-1 rounded-full font-bold border ${
                selectedLog.status >= 200 && selectedLog.status < 300 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                selectedLog.status >= 400 && selectedLog.status < 500 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                'bg-rose-500/10 text-rose-300 border-rose-500/20'
              }`}>
                {selectedLog.status}
              </span>
            )}
            {selectedLog?.isStream && (
              <span className="text-xs font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-3 py-1 rounded-full font-bold">
                STREAM
              </span>
            )}
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
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">{t('logs.loadingDetail')}</div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {activeTab === 'payload' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <div className="text-[11px] font-semibold text-blue-400 mb-1.5">{t('logs.claudeClientReq')}</div>
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
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1.5">{t('logs.geminiUpstreamReq')}</div>
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
                    <span>{t('logs.claudeFinalRes')}</span>
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
                    <span>{t('logs.geminiUpstreamRes')}</span>
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
            {t('logs.selectPrompt')}
          </div>
        )}
      </div>
    </div>
  );
}
