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
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft
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
  const [mobilePayloadSubtab, setMobilePayloadSubtab] = useState<'client' | 'upstream'>('client');
  const [mobileResponseSubtab, setMobileResponseSubtab] = useState<'client' | 'upstream'>('client');
  const [clientViewMode, setClientViewMode] = useState<'preview' | 'raw'>('preview');
  const [upstreamViewMode, setUpstreamViewMode] = useState<'preview' | 'raw'>('preview');
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
          loadDetail(fetchedLogs[0], false);
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

  const loadDetail = (log: any, openMobile = true) => {
    setSelectedFile(log.path);
    if (openMobile) {
      setMobileDetailOpen(true);
    }
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
    <div className="w-full flex-1 min-h-0 h-full flex flex-col md:flex-row gap-4 items-stretch overflow-hidden">
      {/* Left Column (Request Master List) */}
      {!sidebarCollapsed && (
        <div className={`w-full md:w-80 lg:w-[360px] xl:w-[380px] shrink-0 ui-card p-3.5 flex flex-col min-h-0 h-full overflow-hidden transition-all ${
          mobileDetailOpen ? 'hidden md:flex' : 'flex'
        }`}>
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-white/[0.08] shrink-0">
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
          <div className="grid grid-cols-2 gap-2 mb-2.5 shrink-0">
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
          <div className="space-y-2 mb-2.5 pb-2.5 border-b border-white/[0.08] shrink-0">
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
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 text-xs">
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
                let pathBadgeColor = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60';
                if (log.reqPath) {
                  const rawPath = log.reqPath.split('?')[0];
                  if (rawPath.endsWith('/messages')) {
                    pathLabel = '/messages';
                    pathBadgeColor = 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20';
                  } else if (rawPath.endsWith('/count_tokens')) {
                    pathLabel = '/count_tokens';
                    pathBadgeColor = 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20';
                  } else if (rawPath.endsWith('/models')) {
                    pathLabel = '/models';
                    pathBadgeColor = 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20';
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
                    durationColorClass = 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/20';
                  } else if (durationSec < 5) {
                    durationColorClass = 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20';
                  } else {
                    durationColorClass = 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/20';
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
                    onClick={() => loadDetail(log, true)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all border relative overflow-hidden group ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-400 text-indigo-950 dark:bg-indigo-600/15 dark:border-indigo-500/80 dark:text-indigo-100 shadow-sm ring-1 ring-indigo-400/30'
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
                        <span className="text-slate-500 dark:text-slate-400 shrink-0 font-medium">{formattedTime}</span>
                        <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
                          {log.method || 'POST'}
                        </span>
                        {pathLabel && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold shrink-0 ${pathBadgeColor}`}>
                            {pathLabel}
                          </span>
                        )}
                        {log.model && (
                          <span
                            className="px-1.5 py-0.5 rounded border text-[9px] font-mono font-medium bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20 truncate max-w-[90px]"
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
                        className="flex items-center space-x-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer group/file"
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
                          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20">
                            STREAM
                          </span>
                        )}
                        {log.status !== null && log.status !== undefined && (
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${
                            log.status >= 200 && log.status < 300 ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30' :
                            log.status >= 400 && log.status < 500 ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30' :
                            'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30'
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
            <div className="pt-2.5 mt-2 border-t border-[var(--border-subtle)] flex flex-col gap-2 font-mono text-[11px] text-[var(--text-secondary)] shrink-0">
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
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--text-primary)] text-[10px] focus:outline-none focus:border-indigo-500 cursor-pointer"
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
                  className="px-2.5 py-1 rounded-lg ui-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed text-[10px] transition-colors"
                >
                  ‹ {t('logs.prevPage', 'Prev')}
                </button>

                <span className="text-[var(--text-primary)] font-semibold text-[10px]">
                  {page} / {Math.ceil(totalLogs / limit) || 1}
                </span>

                <button
                  disabled={page >= Math.ceil(totalLogs / limit) || loading}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-2.5 py-1 rounded-lg ui-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed text-[10px] transition-colors"
                >
                  {t('logs.nextPage', 'Next')} ›
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Right Column (Detail Inspector) */}
      <div className={`flex-1 min-w-0 ui-card p-3 sm:p-4 flex flex-col min-h-0 h-full overflow-hidden ${
        !mobileDetailOpen ? 'hidden md:flex' : 'flex'
      }`}>
        {/* Top Header & Navigation Bar */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08] gap-2.5 shrink-0">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {/* Mobile back to list button */}
            <button
              onClick={() => setMobileDetailOpen(false)}
              className="md:hidden p-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 flex items-center justify-center text-xs shrink-0 active:scale-95 transition-transform"
              title={t('logs.backToList', '返回列表')}
            >
              <ArrowLeft className="w-4 h-4" />
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
                  activeTab === 'payload' ? 'ui-tab-pill-active font-semibold' : ''
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] sm:text-xs">{t('logs.payloadRequest')}</span>
              </button>
              <button
                onClick={() => setActiveTab('response')}
                className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === 'response' ? 'ui-tab-pill-active font-semibold' : ''
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] sm:text-xs">{t('logs.response')}</span>
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`ui-tab-pill flex items-center space-x-1.5 whitespace-nowrap ${
                  activeTab === 'chat' ? 'ui-tab-pill-active font-semibold' : ''
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-[11px] sm:text-xs">{t('logs.chatTab', '对话视图')}</span>
              </button>
            </div>
          </div>

          {/* Global Action: Full Transaction JSON */}
          {selectedLog && (
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                onClick={handleCopyJson}
                className="px-2 sm:px-2.5 py-1.5 ui-btn-secondary text-[11px] sm:text-xs font-mono flex items-center space-x-1"
                title="Copy full transaction JSON"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold hidden sm:inline">{t('logs.copied', '已复制')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">JSON</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Metadata Summary Header Ribbon (Single-line Compact) */}
        {selectedLog && (
          <div className="ui-card-sub px-3 py-1.5 mb-3 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">
            <div className="flex items-center space-x-2 shrink-0">
              {/* 1. Status Code */}
              {selectedLog.status !== null && selectedLog.status !== undefined && (
                <span className={`px-2 py-0.5 rounded font-bold border text-[10px] ${
                  selectedLog.status >= 200 && selectedLog.status < 300 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' :
                  selectedLog.status >= 400 && selectedLog.status < 500 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30' :
                  'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30'
                }`}>
                  {selectedLog.status} {selectedLog.status === 200 ? 'OK' : ''}
                </span>
              )}

              {/* 2. File Name Chip */}
              {selectedLog.filename && (
                <div
                  onClick={handleCopyDetailFilename}
                  className="flex items-center space-x-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                  title={`${t('logs.copyFilename', 'Copy filename')}: ${selectedLog.filename}`}
                >
                  <FileText className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span className="max-w-[130px] truncate">
                    {selectedLog.filename.replace(/^transaction_/, '').replace(/\.json$/, '')}
                  </span>
                  {copiedDetailFile ? (
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                  )}
                </div>
              )}

              {/* 3. Path */}
              {selectedLog.path && (
                <span className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-medium">
                  {selectedLog.path}
                </span>
              )}

              {/* 4. Stream Badge */}
              {selectedLog.isStream && (
                <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-bold text-[10px]">
                  STREAM
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400 shrink-0">
              {/* 5. Model */}
              {selectedLog.model && (
                <span
                  className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded font-medium max-w-[180px] truncate"
                  title={selectedLog.model}
                >
                  {selectedLog.model}
                </span>
              )}

              {/* 6. Latency */}
              {selectedLog.duration !== undefined && selectedLog.duration !== null && (
                <span className={`border px-2 py-0.5 rounded font-medium ${
                  selectedLog.duration < 1000
                    ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/20'
                    : selectedLog.duration < 5000
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/20'
                    : 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/20'
                }`}>
                  {selectedLog.duration < 1000 ? `${selectedLog.duration}ms` : `${(selectedLog.duration / 1000).toFixed(2)}s`}
                </span>
              )}

              {/* 7. Timestamp */}
              {selectedLog.timestamp && (
                <span
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400"
                  title={new Date(selectedLog.timestamp).toLocaleString()}
                >
                  {new Date(selectedLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
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
          <div className={`flex-1 min-h-0 flex flex-col pr-1 ${
            activeTab === 'chat' ? 'overflow-y-auto space-y-4' : 'overflow-hidden'
          }`}>
            {activeTab === 'payload' && (
              <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                {/* Mobile Sub-tab Segmented Control */}
                <div className="md:hidden flex items-center p-0.5 mb-2 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setMobilePayloadSubtab('client')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                      mobilePayloadSubtab === 'client'
                        ? 'bg-[var(--bg-surface)] text-indigo-500 dark:text-indigo-400 shadow-sm font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                    <span>{t('logs.clientReqTab', '客户端请求')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobilePayloadSubtab('upstream')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                      mobilePayloadSubtab === 'upstream'
                        ? 'bg-[var(--bg-surface)] text-emerald-500 dark:text-emerald-400 shadow-sm font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                    <span>{t('logs.upstreamReqTab', '上游请求')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 h-full overflow-hidden">
                  {/* Left Column: Claude Client Request */}
                  <div className={`min-h-0 h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] ${
                    mobilePayloadSubtab === 'client' ? 'flex flex-1' : 'hidden md:flex md:flex-1'
                  }`}>
                    {/* VS Code Style Header Bar */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
                      <div className="flex items-center space-x-2 text-[11px] font-semibold text-indigo-400">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span>{t('logs.claudeClientReq')}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* View Mode Pill */}
                        <div className="ui-tab-container text-[10px] font-medium p-0.5">
                          <button
                            onClick={() => setClientViewMode('preview')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              clientViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t('logs.previewMode', 'Preview')}</span>
                          </button>
                          <button
                            onClick={() => setClientViewMode('raw')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              clientViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Code className="w-3 h-3" />
                            <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
                          </button>
                        </div>

                        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

                        {/* Action: Claude cURL */}
                        <button
                          onClick={handleCopyClaudeCurl}
                          className="px-2 py-0.5 ui-btn-secondary text-[10px] font-mono flex items-center space-x-1"
                          title="Copy Claude proxy cURL command"
                        >
                          {copiedClaudeCurl ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 hidden sm:inline">{t('logs.claudeCurlCopied', '已复制')}</span>
                            </>
                          ) : (
                            <>
                              <Terminal className="w-3 h-3 text-indigo-400" />
                              <span className="hidden sm:inline">Claude cURL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Body Viewport */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {clientViewMode === 'preview' ? (
                        <JsonTreeView data={selectedLog.client_req} />
                      ) : (
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
                      )}
                    </div>
                  </div>

                  {/* Right Column: Gemini Upstream Request */}
                  <div className={`min-h-0 h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] ${
                    mobilePayloadSubtab === 'upstream' ? 'flex flex-1' : 'hidden md:flex md:flex-1'
                  }`}>
                    {/* VS Code Style Header Bar */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
                      <div className="flex items-center space-x-2 text-[11px] font-semibold text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>{t('logs.geminiUpstreamReq')}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* View Mode Pill */}
                        <div className="ui-tab-container text-[10px] font-medium p-0.5">
                          <button
                            onClick={() => setUpstreamViewMode('preview')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              upstreamViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t('logs.previewMode', 'Preview')}</span>
                          </button>
                          <button
                            onClick={() => setUpstreamViewMode('raw')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              upstreamViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Code className="w-3 h-3" />
                            <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
                          </button>
                        </div>

                        <div className="w-[1px] h-3 bg-[var(--border-subtle)]" />

                        {/* Action: Gemini cURL */}
                        <button
                          onClick={handleCopyGeminiCurl}
                          className="px-2 py-0.5 ui-btn-secondary text-[10px] font-mono flex items-center space-x-1"
                          title="Copy upstream Gemini cURL command"
                        >
                          {copiedGeminiCurl ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 hidden sm:inline">{t('logs.geminiCurlCopied', '已复制')}</span>
                            </>
                          ) : (
                            <>
                              <Terminal className="w-3 h-3 text-emerald-400" />
                              <span className="hidden sm:inline">Gemini cURL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Body Viewport */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {upstreamViewMode === 'preview' ? (
                        <JsonTreeView data={selectedLog.gem_req} />
                      ) : (
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
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'response' && (
              <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden">
                {/* Mobile Sub-tab Segmented Control */}
                <div className="md:hidden flex items-center p-0.5 mb-2 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => setMobileResponseSubtab('client')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                      mobileResponseSubtab === 'client'
                        ? 'bg-[var(--bg-surface)] text-amber-500 dark:text-amber-400 shadow-sm font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                    <span>{t('logs.clientResTab', '客户端响应')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileResponseSubtab('upstream')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center space-x-1.5 ${
                      mobileResponseSubtab === 'upstream'
                        ? 'bg-[var(--bg-surface)] text-purple-500 dark:text-purple-400 shadow-sm font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-purple-500 dark:bg-purple-400" />
                    <span>{t('logs.upstreamResTab', '上游响应')}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 h-full overflow-hidden">
                  {/* Left Column: Claude Final Response */}
                  <div className={`min-h-0 h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] ${
                    mobileResponseSubtab === 'client' ? 'flex flex-1' : 'hidden md:flex md:flex-1'
                  }`}>
                    {/* VS Code Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
                      <div className="flex items-center space-x-2 text-[11px] font-semibold text-amber-400">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>{t('logs.claudeFinalRes')}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {isStreamPayload(selectedLog.claude_res) && (
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">
                            SSE Stream
                          </span>
                        )}
                        <div className="ui-tab-container text-[10px] font-medium p-0.5">
                          <button
                            onClick={() => setClientViewMode('preview')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              clientViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t('logs.previewMode', 'Preview')}</span>
                          </button>
                          <button
                            onClick={() => setClientViewMode('raw')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              clientViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Code className="w-3 h-3" />
                            <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Body Viewport */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {clientViewMode === 'preview' ? (
                        isStreamPayload(selectedLog.claude_res) ? (
                          <div className="flex-1 min-h-0 h-full overflow-y-auto pr-1">
                            <SseStreamPreview streamData={selectedLog.claude_res} />
                          </div>
                        ) : (
                          <JsonTreeView data={selectedLog.claude_res} />
                        )
                      ) : (
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
                      )}
                    </div>
                  </div>

                  {/* Right Column: Gemini Upstream Response */}
                  <div className={`min-h-0 h-full flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] ${
                    mobileResponseSubtab === 'upstream' ? 'flex flex-1' : 'hidden md:flex md:flex-1'
                  }`}>
                    {/* VS Code Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0 select-none">
                      <div className="flex items-center space-x-2 text-[11px] font-semibold text-purple-400">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        <span>{t('logs.geminiUpstreamRes')}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {isStreamPayload(selectedLog.gem_res) && (
                          <span className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 font-semibold">
                            SSE Stream
                          </span>
                        )}
                        <div className="ui-tab-container text-[10px] font-medium p-0.5">
                          <button
                            onClick={() => setUpstreamViewMode('preview')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              upstreamViewMode === 'preview' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t('logs.previewMode', 'Preview')}</span>
                          </button>
                          <button
                            onClick={() => setUpstreamViewMode('raw')}
                            className={`px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                              upstreamViewMode === 'raw' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Code className="w-3 h-3" />
                            <span>{t('logs.rawJsonTab', 'Raw JSON')}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Body Viewport */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {upstreamViewMode === 'preview' ? (
                        isStreamPayload(selectedLog.gem_res) ? (
                          <div className="flex-1 min-h-0 h-full overflow-y-auto pr-1">
                            <SseStreamPreview streamData={selectedLog.gem_res} />
                          </div>
                        ) : (
                          <JsonTreeView data={selectedLog.gem_res} />
                        )
                      ) : (
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
                      )}
                    </div>
                  </div>
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
