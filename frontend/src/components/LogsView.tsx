import React, { useEffect, useState, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  FileText,
  RefreshCw,
  Copy,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Calendar,
  Clock,
  Filter,
  Layers,
  Code,
  Eye,
  Zap,
  Activity,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  Terminal,
  MessageSquare,
  ArrowLeft
} from 'lucide-react';
import JsonTreeView from './JsonTreeView';
import SseStreamPreview from './SseStreamPreview';
import ConversationView from './ConversationView';
import { defineGeminiProxyTheme } from '../utils/monacoTheme';
import { useTranslation } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';

export default function LogsView({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'gemini-proxy-dark' : 'gemini-proxy-light';
  const detailCacheRef = useRef<Map<string, any>>(new Map());
  const [logs, setLogs] = useState<any[]>([]);
  const [tree, setTree] = useState<Record<string, Record<string, number>>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Status Filter: 'all' | '2xx' | '4xx' | '5xx'
  const [statusFilter, setStatusFilter] = useState<'all' | '2xx' | '4xx' | '5xx'>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'payload' | 'response' | 'chat'>('payload');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(false);
  const [hourCount, setHourCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [totalLogs, setTotalLogs] = useState<number>(0);
  const [geminiBaseUrl, setGeminiBaseUrl] = useState<string>('https://generativelanguage.googleapis.com');

  // Copy feedback states
  const [copiedClaudeCurl, setCopiedClaudeCurl] = useState(false);
  const [copiedGeminiCurl, setCopiedGeminiCurl] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedFileIndex, setCopiedFileIndex] = useState<number | null>(null);
  const [copiedDetailFile, setCopiedDetailFile] = useState(false);

  const handleCopyFilename = (e: React.MouseEvent, filename: string, index: number) => {
    e.stopPropagation();
    navigator.clipboard.writeText(filename);
    setCopiedFileIndex(index);
    setTimeout(() => setCopiedFileIndex(null), 1500);
  };
  
  const handleCopyDetailFilename = () => {
    if (!selectedLog || !selectedLog.filename) return;
    navigator.clipboard.writeText(selectedLog.filename);
    setCopiedDetailFile(true);
    setTimeout(() => setCopiedDetailFile(false), 1500);
  };

  const fetchLogs = (forceAutoJump = false, customDate?: string, customHour?: string, pageNum = page, limitNum = limit) => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};

    const targetDate = customDate !== undefined ? customDate : selectedDate;
    const targetHour = customHour !== undefined ? customHour : selectedHour;

    let query = `/api/admin/logs?page=${pageNum}&limit=${limitNum}`;
    if (!forceAutoJump) {
      if (targetDate) query += `&date=${targetDate}`;
      if (targetHour) query += `&hour=${targetHour}`;
    }

    fetch(query, { headers })
      .then(r => r.json())
      .then(data => {
        const logTree = data.tree || {};
        setTree(logTree);
        const totalCount = data.hourCount !== undefined ? data.hourCount : (data.total || 0);
        setHourCount(totalCount);
        setTotalLogs(totalCount);
        setPage(data.page || pageNum);
        setLimit(data.limit || limitNum);
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
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/status', { headers })
      .then(r => r.json())
      .then(data => {
        if (data?.config?.geminiBaseUrl) {
          setGeminiBaseUrl(data.config.geminiBaseUrl);
        }
      })
      .catch(() => {});
  }, [adminKey]);

  const loadDetail = (log: any) => {
    setSelectedFile(log.path);
    setMobileDetailOpen(true);
    if (detailCacheRef.current.has(log.path)) {
      setSelectedLog(detailCacheRef.current.get(log.path));
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch(`/api/admin/logs/${log.date}/${log.hour}/${log.filename}`, { headers })
      .then(async r => {
        if (!r.ok) {
          // If detailed transaction JSON was not found, synthesize a fallback payload from log metadata
          return {
            timestamp: log.timestamp || new Date().toISOString(),
            status: log.status || 200,
            duration: log.duration,
            path: log.reqPath || '/v1/messages',
            model: log.model,
            is_stream: log.isStream,
            client_req: {
              info: "Detailed transaction body file not found on disk. Showing indexed metadata.",
              path: log.reqPath || '/v1/messages',
              model: log.model || 'unknown',
              stream: Boolean(log.isStream)
            },
            gem_req: {
              model: log.model,
              upstreamStatus: log.status
            },
            claude_res: {
              status: log.status,
              duration: log.duration
            },
            gem_res: null
          };
        }
        return r.json();
      })
      .then(data => {
        const enriched = {
          ...data,
          filename: log.filename || data.filename,
          model: log.model || data.model || data.client_req?.model,
          isStream: data.isStream !== undefined ? data.isStream : (data.is_stream !== undefined ? data.is_stream : log.isStream)
        };
        detailCacheRef.current.set(log.path, enriched);
        setSelectedLog(enriched);
      })
      .catch(() => {
        const fallback = {
          timestamp: log.timestamp || new Date().toISOString(),
          status: log.status || 200,
          duration: log.duration,
          path: log.reqPath || '/v1/messages',
          filename: log.filename,
          model: log.model,
          is_stream: log.isStream,
          client_req: {
            path: log.reqPath || '/v1/messages',
            model: log.model || 'unknown',
            stream: Boolean(log.isStream)
          },
          gem_req: null,
          claude_res: null,
          gem_res: null
        };
        setSelectedLog(fallback);
      })
      .finally(() => setDetailLoading(false));
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    const hours = Object.keys(tree[date] || {})
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    const newHour = hours.length > 0 ? hours[0] : '';
    setSelectedHour(newHour);
    setPage(1);
    fetchLogs(false, date, newHour, 1, limit);
  };

  const handleHourChange = (hour: string) => {
    setSelectedHour(hour);
    setPage(1);
    fetchLogs(false, selectedDate, hour, 1, limit);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchLogs(false, selectedDate, selectedHour, newPage, limit);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
    fetchLogs(false, selectedDate, selectedHour, 1, newLimit);
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

  // Filter logs locally based on status filter & search string
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Status filtering
      if (statusFilter === '2xx') {
        if (!log.status || log.status < 200 || log.status >= 300) return false;
      } else if (statusFilter === '4xx') {
        if (!log.status || log.status < 400 || log.status >= 500) return false;
      } else if (statusFilter === '5xx') {
        if (!log.status || log.status < 500) return false;
      }

      // Search keyword
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        const model = (log.model || '').toLowerCase();
        const path = (log.reqPath || log.path || '').toLowerCase();
        const filename = (log.filename || '').toLowerCase();
        const logId = (log.filename || '').replace(/\.json$/, '').replace(/^\d{4}_/, '').replace(/^transaction_/, '').toLowerCase();

        if (!model.includes(query) && !path.includes(query) && !filename.includes(query) && !logId.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [logs, statusFilter, searchFilter]);

  // Copy Claude cURL command for current log
  const handleCopyClaudeCurl = () => {
    if (!selectedLog) return;
    try {
      const origin = window.location.origin;
      const targetUrl = `${origin}${selectedLog.path || '/v1/messages'}`;
      const method = selectedLog.method || 'POST';
      const body = selectedLog.client_req ? JSON.stringify(selectedLog.client_req, null, 2) : '';
      const apiKeyToUse = adminKey || 'YOUR_API_KEY';

      const curlCmd = `curl -X ${method} "${targetUrl}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${apiKeyToUse}"${
        body ? ` \\\n  -d '${body.replace(/'/g, "'\\''")}'` : ''
      }`;

      navigator.clipboard.writeText(curlCmd);
      setCopiedClaudeCurl(true);
      setTimeout(() => setCopiedClaudeCurl(false), 2000);
    } catch {
      // fallback
    }
  };

  // Copy Upstream Gemini cURL command for current log
  const handleCopyGeminiCurl = () => {
    if (!selectedLog) return;
    try {
      const baseUrl = (geminiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
      const cleanModelName = (selectedLog.model || 'gemini-2.5-pro').replace(/^models\//, '');
      const reqPath = selectedLog.path || selectedLog.reqPath || '/v1/messages';
      const isStream = Boolean(selectedLog.is_stream || selectedLog.isStream || selectedLog.client_req?.stream);
      const apiKeyToUse = adminKey || 'YOUR_GEMINI_API_KEY';

      let targetUrl = `${baseUrl}/v1beta/models/${cleanModelName}:generateContent`;
      let method = 'POST';
      let bodyData = selectedLog.gem_req;

      if (reqPath.startsWith('/v1/models')) {
        method = 'GET';
        if (reqPath === '/v1/models' || reqPath === '/v1/models/') {
          targetUrl = `${baseUrl}/v1beta/models`;
        } else {
          const modelId = reqPath.replace(/^\/v1\/models\/?/, '');
          targetUrl = `${baseUrl}/v1beta/models/${modelId}`;
        }
        bodyData = null;
      } else if (reqPath.includes('count_tokens')) {
        targetUrl = `${baseUrl}/v1beta/models/${cleanModelName}:countTokens`;
      } else if (isStream) {
        targetUrl = `${baseUrl}/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`;
      }

      const body = bodyData ? JSON.stringify(bodyData, null, 2) : '';
      const headers = [
        '-H "Content-Type: application/json"',
        `-H "x-goog-api-key: ${apiKeyToUse}"`
      ];

      const curlCmd = `curl -X ${method} "${targetUrl}" \\\n  ${headers.join(' \\\n  ')}${
        body && method !== 'GET' ? ` \\\n  -d '${body.replace(/'/g, "'\\''")}'` : ''
      }`;

      navigator.clipboard.writeText(curlCmd);
      setCopiedGeminiCurl(true);
      setTimeout(() => setCopiedGeminiCurl(false), 2000);
    } catch {
      // fallback
    }
  };

  // Copy selected log JSON
  const handleCopyJson = () => {
    if (!selectedLog) return;
    try {
      navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col md:flex-row gap-4 items-stretch h-full min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
      {/* Left Column (Request Master List) */}
      {!sidebarCollapsed && (
        <div className={`w-full md:w-80 lg:w-[360px] xl:w-[380px] shrink-0 ui-card p-3.5 flex flex-col h-[520px] md:h-full transition-all ${
          mobileDetailOpen ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-white/[0.08]">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">
                {t('logs.title')}
              </h3>
              {hourCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  {hourCount}
                </span>
              )}
            </div>

            <button
              onClick={() => {
                detailCacheRef.current.clear();
                fetchLogs(true);
              }}
              className="text-[11px] ui-btn-secondary px-2.5 py-1 flex items-center space-x-1.5"
              title="Refresh logs list"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{t('logs.refresh')}</span>
            </button>
          </div>

          {/* Date & Hour Dropdown Pickers */}
          <div className="grid grid-cols-2 gap-2 mb-2.5">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center space-x-1">
                <Calendar className="w-2.5 h-2.5 text-slate-500" />
                <span>{t('logs.dateLabel')}</span>
              </label>
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full ui-input p-1.5 text-xs appearance-none cursor-pointer"
              >
                {Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center space-x-1">
                <Clock className="w-2.5 h-2.5 text-slate-500" />
                <span>{t('logs.hourLabel')}</span>
              </label>
              <select
                value={selectedHour}
                onChange={(e) => handleHourChange(e.target.value)}
                className="w-full ui-input p-1.5 text-xs appearance-none cursor-pointer"
              >
                {availableHours.map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter Pills & Quick Search */}
          <div className="space-y-2 mb-2.5 pb-2.5 border-b border-white/[0.08]">
            {/* Filter Pills */}
            <div className="ui-tab-container p-0.5 text-[10px] font-medium space-x-0.5">
              <button
                onClick={() => setStatusFilter('all')}
                className={`ui-tab-pill flex-1 py-1 text-center ${
                  statusFilter === 'all'
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('2xx')}
                className={`ui-tab-pill flex-1 py-1 text-center ${
                  statusFilter === '2xx'
                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 shadow-sm'
                    : 'hover:text-emerald-300'
                }`}
              >
                2xx
              </button>
              <button
                onClick={() => setStatusFilter('4xx')}
                className={`ui-tab-pill flex-1 py-1 text-center ${
                  statusFilter === '4xx'
                    ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-sm'
                    : 'hover:text-amber-300'
                }`}
              >
                4xx
              </button>
              <button
                onClick={() => setStatusFilter('5xx')}
                className={`ui-tab-pill flex-1 py-1 text-center ${
                  statusFilter === '5xx'
                    ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40 shadow-sm'
                    : 'hover:text-rose-300'
                }`}
              >
                5xx
              </button>
            </div>

            {/* Quick Search Box */}
            <div className="relative">
              <input
                type="text"
                placeholder={t('logs.searchPlaceholder', 'Filter model / path / filename...')}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full ui-input pl-7 pr-2.5 py-1 text-[11px]"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Master Log Entries List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                <span>{t('logs.loadingLogs')}</span>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs text-center p-4">
                <FileText className="w-8 h-8 text-slate-700 mb-2" />
                <span>{t('logs.noLogsFound')}</span>
              </div>
            ) : (
              filteredLogs.map((log, idx) => {
                const isSelected = selectedFile === log.path;

                // Format local time from timestamp
                let formattedTime = `${log.hour}:00`;
                if (log.timestamp) {
                  try {
                    const d = new Date(log.timestamp);
                    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                  } catch (e) { /* ignore */ }
                }

                // Format Path Label
                let pathLabel = '';
                let pathBadgeColor = 'bg-slate-800 text-slate-300 border-slate-700/60';
                if (log.reqPath) {
                  const rawPath = log.reqPath.split('?')[0];
                  if (rawPath.endsWith('/messages')) {
                    pathLabel = '/messages';
                    pathBadgeColor = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
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

                // Format Latency
                let durationElem = null;
                if (log.duration !== null && log.duration !== undefined) {
                  const durationSec = log.duration / 1000;
                  let durationColorClass = '';
                  if (durationSec < 1) {
                    durationColorClass = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20';
                  } else if (durationSec < 5) {
                    durationColorClass = 'bg-amber-500/10 text-amber-300 border-amber-500/20';
                  } else {
                    durationColorClass = 'bg-rose-500/10 text-rose-300 border-rose-500/20';
                  }
                  durationElem = (
                    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold ${durationColorClass}`}>
                      {durationSec.toFixed(2)}s
                    </span>
                  );
                }

                const displayId = log.filename
                  ? '...' + log.filename.replace(/^transaction_/, '').replace(/\.json$/, '')
                  : '';

                return (
                  <div
                    key={idx}
                    onClick={() => loadDetail(log)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all border relative overflow-hidden group ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/80 text-indigo-100 shadow-md ring-1 ring-indigo-500/30'
                        : 'ui-card-sub hover:bg-[var(--bg-surface-hover)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {/* Purple active indicator bar on selected item */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-sm" />
                    )}

                    {/* Row 1 (Top) */}
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                        <span className="text-slate-400 shrink-0 font-medium">{formattedTime}</span>
                        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700/60">
                          {log.method || 'POST'}
                        </span>
                        {pathLabel && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0 ${pathBadgeColor}`}>
                            {pathLabel}
                          </span>
                        )}
                        {log.model && (
                          <span
                            className="px-1.5 py-0.5 rounded border text-[9px] font-mono font-medium bg-purple-500/10 text-purple-300 border-purple-500/20 truncate max-w-[90px]"
                            title={log.model}
                          >
                            {log.model}
                          </span>
                        )}
                      </div>
                      {durationElem}
                    </div>

                    {/* Row 2 (Bottom) */}
                    <div className="flex items-center justify-between mt-1.5 font-mono text-[10px]">
                      <div
                        className="flex items-center space-x-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer group/file"
                        onClick={(e) => { e.stopPropagation(); handleCopyFilename(e, log.filename || displayId, idx); }}
                        title={t('logs.copyFilename', 'Copy filename')}
                      >
                        <span className="truncate max-w-[120px]">
                          {displayId}
                        </span>
                        <span className="opacity-0 group-hover:opacity-100 group-hover/file:opacity-100 transition-opacity">
                          {copiedFileIndex === idx ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {log.isStream && (
                          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-blue-500/10 text-blue-300 border-blue-500/20">
                            STREAM
                          </span>
                        )}
                        {log.status !== null && log.status !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                            log.status >= 200 && log.status < 300 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                            log.status >= 400 && log.status < 500 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                            'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}>
                            {log.status} {log.status === 200 ? 'OK' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Pagination Bar */}
          {totalLogs > 0 && (
            <div className="pt-2.5 mt-2 border-t border-slate-800/80 flex flex-col gap-2 font-mono text-[11px] text-slate-400 shrink-0">
              <div className="flex items-center justify-between">
                <span>
                  {t('logs.showingRange', `{start}-{end} of {total}`)
                    .replace('{start}', String((page - 1) * limit + 1))
                    .replace('{end}', String(Math.min(page * limit, totalLogs)))
                    .replace('{total}', String(totalLogs))}
                </span>
                <select
                  value={limit}
                  onChange={(e) => handleLimitChange(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none focus:border-indigo-500"
                >
                  <option value={30}>30/page</option>
                  <option value={50}>50/page</option>
                  <option value={100}>100/page</option>
                  <option value={200}>200/page</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-1">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700/60 transition-colors text-[10px]"
                >
                  ‹ {t('logs.prevPage', 'Prev')}
                </button>

                <span className="text-slate-300 font-semibold text-[10px]">
                  {page} / {Math.ceil(totalLogs / limit) || 1}
                </span>

                <button
                  disabled={page >= Math.ceil(totalLogs / limit) || loading}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-slate-700/60 transition-colors text-[10px]"
                >
                  {t('logs.nextPage', 'Next')} ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right Column (Detail Inspector) */}
      <div className={`flex-1 min-w-0 ui-card p-3 sm:p-4 flex flex-col h-full min-h-[500px] ${
        !mobileDetailOpen ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Top Header & Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between pb-3 mb-3.5 border-b border-white/[0.08] gap-2.5">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {/* Mobile back to list button */}
            <button
              onClick={() => setMobileDetailOpen(false)}
              className="md:hidden p-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 flex items-center space-x-1 text-xs shrink-0"
              title="Back to Logs List"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="font-semibold">{t('logs.backToList', '返回列表')}</span>
            </button>

            {/* Desktop Sidebar toggle button */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`hidden md:flex p-1.5 rounded-lg border text-xs transition-colors items-center justify-center ${
                sidebarCollapsed
                  ? 'bg-indigo-600/20 border-indigo-500/80 text-indigo-300'
                  : 'ui-btn-secondary'
              }`}
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            {/* Subtabs: Payload vs Response vs Chat */}
            <div className="ui-tab-container overflow-x-auto">
              <button
                onClick={() => setActiveTab('payload')}
                className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === 'payload'
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <span>📤</span>
                <span className="text-[11px] sm:text-xs">{t('logs.payloadRequest')}</span>
              </button>
              <button
                onClick={() => setActiveTab('response')}
                className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === 'response'
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <span>📥</span>
                <span className="text-[11px] sm:text-xs">{t('logs.response')}</span>
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === 'chat'
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">{t('logs.chatTab', '对话视图')}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* Preview vs Raw JSON mode toggle */}
            <div className="ui-tab-container text-xs font-medium">
              <button
                onClick={() => setViewMode('preview')}
                className={`ui-tab-pill flex items-center space-x-1 ${
                  viewMode === 'preview'
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">{t('logs.previewMode', 'Preview')}</span>
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`ui-tab-pill flex items-center space-x-1 ${
                  viewMode === 'raw'
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">{t('logs.rawJsonTab', 'Raw JSON')}</span>
              </button>
            </div>

            {/* Quick Copy Action Buttons */}
            {selectedLog && (
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                <button
                  onClick={handleCopyClaudeCurl}
                  className="px-2 sm:px-2.5 py-1.5 ui-btn-secondary text-[11px] sm:text-xs font-mono flex items-center space-x-1"
                  title="Copy Claude proxy cURL command"
                >
                  {copiedClaudeCurl ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">{t('logs.claudeCurlCopied', '已复制')}</span>
                    </>
                  ) : (
                    <>
                      <Terminal className="w-3 h-3 text-indigo-400" />
                      <span>Claude cURL</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleCopyGeminiCurl}
                  className="px-2 sm:px-2.5 py-1.5 ui-btn-secondary text-[11px] sm:text-xs font-mono flex items-center space-x-1"
                  title="Copy upstream Gemini cURL command"
                >
                  {copiedGeminiCurl ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">{t('logs.geminiCurlCopied', '已复制')}</span>
                    </>
                  ) : (
                    <>
                      <Terminal className="w-3 h-3 text-emerald-400" />
                      <span>Gemini cURL</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleCopyJson}
                  className="px-2 sm:px-2.5 py-1.5 ui-btn-secondary text-[11px] sm:text-xs font-mono flex items-center space-x-1"
                  title="Copy full transaction JSON"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">JSON ✓</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>JSON</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Metadata Summary Header Ribbon */}
        {selectedLog && (
          <div className="ui-card-sub p-2.5 mb-3.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center space-x-2 flex-wrap">
              {selectedLog.status !== null && selectedLog.status !== undefined && (
                <span className={`px-2 py-0.5 rounded-md font-bold border ${
                  selectedLog.status >= 200 && selectedLog.status < 300 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                  selectedLog.status >= 400 && selectedLog.status < 500 ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                  'bg-rose-500/15 text-rose-300 border-rose-500/30'
                }`}>
                  {selectedLog.status} {selectedLog.status === 200 ? 'OK' : ''}
                </span>
              )}

              {selectedLog.filename && (
                <div
                  onClick={handleCopyDetailFilename}
                  className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-300 hover:border-slate-700 cursor-pointer transition-colors"
                  title={t('logs.copyFilename', 'Copy filename')}
                >
                  <span className="text-slate-500 font-semibold">{t('logs.fileLabel', 'File')}:</span>
                  <span>{selectedLog.filename}</span>
                  {copiedDetailFile ? (
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-500 shrink-0" />
                  )}
                </div>
              )}

              {selectedLog.path && (
                <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-md font-medium">
                  {selectedLog.path}
                </span>
              )}

              {selectedLog.isStream && (
                <span className="bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-md font-bold">
                  STREAM
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 text-slate-400">
              {selectedLog.model && (
                <span className="bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-md font-medium">
                  Model: {selectedLog.model}
                </span>
              )}

              {selectedLog.duration !== undefined && selectedLog.duration !== null && (
                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-300">
                  Latency: {selectedLog.duration}ms
                </span>
              )}

              {selectedLog.timestamp && (
                <span className="bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-400">
                  {new Date(selectedLog.timestamp).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Content Inspector Panel */}
        {detailLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 text-slate-400 text-xs space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span>{t('logs.loadingDetail')}</span>
          </div>
        ) : selectedLog ? (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 flex flex-col min-h-0">
            {activeTab === 'payload' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Claude Client Request */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="text-[11px] font-semibold text-indigo-400 mb-1.5 flex items-center space-x-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span>{t('logs.claudeClientReq')}</span>
                  </div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.client_req} />
                  ) : (
                    <div className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner bg-[var(--code-bg)]">
                      <Editor
                        height="100%"
                        language="json"
                        theme={monacoTheme}
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

                {/* Gemini Upstream Request */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="text-[11px] font-semibold text-emerald-400 mb-1.5 flex items-center space-x-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>{t('logs.geminiUpstreamReq')}</span>
                  </div>
                  {viewMode === 'preview' ? (
                    <JsonTreeView data={selectedLog.gem_req} />
                  ) : (
                    <div className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner bg-[var(--code-bg)]">
                      <Editor
                        height="100%"
                        language="json"
                        theme={monacoTheme}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Claude Final Response */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="text-[11px] font-semibold text-amber-400 mb-1.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span>{t('logs.claudeFinalRes')}</span>
                    </div>
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
                    <div className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner bg-[var(--code-bg)]">
                      <Editor
                        height="100%"
                        language="json"
                        theme={monacoTheme}
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

                {/* Gemini Upstream Response */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="text-[11px] font-semibold text-purple-400 mb-1.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      <span>{t('logs.geminiUpstreamRes')}</span>
                    </div>
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
                    <div className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-[var(--border-subtle)] shadow-inner bg-[var(--code-bg)]">
                      <Editor
                        height="100%"
                        language="json"
                        theme={monacoTheme}
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

            {activeTab === 'chat' && (
              <ConversationView log={selectedLog} />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-slate-500 text-xs space-y-2">
            <FileText className="w-10 h-10 text-slate-700" />
            <span>{t('logs.selectPrompt')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
