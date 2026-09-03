import React, { useState } from 'react';
import {
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  X,
  Play,
  RefreshCw,
  Sparkles,
  Sliders,
  Flame,
  Layers,
  ArrowUpRight,
  AlertTriangle
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface ConcurrentTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUrl: string;
  targetMethod: string;
  parsedPayload: any;
  apiKey: string;
}

interface RequestResult {
  id: number;
  status: number | null;
  latency: number;
  success: boolean;
  error?: string;
}

export default function ConcurrentTestModal({
  isOpen,
  onClose,
  targetUrl,
  targetMethod,
  parsedPayload,
  apiKey
}: ConcurrentTestModalProps) {
  const { t } = useTranslation();
  const [concurrency, setConcurrency] = useState<number>(5);
  const [totalRequests, setTotalRequests] = useState<number>(10);
  const [targetModel, setTargetModel] = useState<string>(parsedPayload?.model || 'gemini-3.1-flash-lite');

  const [testing, setTesting] = useState(false);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [results, setResults] = useState<RequestResult[]>([]);
  const [totalDuration, setTotalDuration] = useState<number | null>(null);

  if (!isOpen) return null;

  const runTest = async () => {
    setTesting(true);
    setCompletedCount(0);
    setResults([]);
    setTotalDuration(null);

    const startTime = Date.now();
    const requestList: RequestResult[] = [];
    let completed = 0;

    // Deep clone payload, assign model and ensure stream is false for accurate response latency
    const testPayload = parsedPayload ? JSON.parse(JSON.stringify(parsedPayload)) : {};
    if (testPayload && typeof testPayload === 'object') {
      testPayload.stream = false;
      if (targetModel) {
        testPayload.model = targetModel;
      }
    }

    const executeSingleRequest = async (id: number): Promise<RequestResult> => {
      const reqStart = Date.now();
      try {
        const fetchOptions: RequestInit = {
          method: targetMethod,
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'x-admin-key': apiKey
          }
        };

        if (targetMethod !== 'GET' && targetMethod !== 'HEAD' && testPayload !== null) {
          fetchOptions.body = JSON.stringify(testPayload);
        }

        const res = await fetch(targetUrl, fetchOptions);
        const reqLatency = Date.now() - reqStart;

        const result: RequestResult = {
          id,
          status: res.status,
          latency: reqLatency,
          success: res.ok
        };

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          result.error = `HTTP ${res.status}: ${errText.substring(0, 100)}`;
        } else {
          await res.json().catch(() => {});
        }

        return result;
      } catch (err: any) {
        return {
          id,
          status: null,
          latency: Date.now() - reqStart,
          success: false,
          error: err.message || 'Connection Failed'
        };
      } finally {
        completed++;
        setCompletedCount(completed);
      }
    };

    // Queue worker
    let currentIndex = 0;
    const worker = async () => {
      while (currentIndex < totalRequests) {
        const idx = ++currentIndex;
        const res = await executeSingleRequest(idx);
        requestList.push(res);
        setResults([...requestList]);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, totalRequests) }, () => worker());
    await Promise.all(workers);

    const elapsed = Date.now() - startTime;
    setTotalDuration(elapsed);
    setTesting(false);
  };

  const successCount = results.filter(r => r.success).length;
  const rateLimit429Count = results.filter(r => r.status === 429).length;
  const failedCount = results.filter(r => !r.success).length;
  const otherErrorCount = failedCount - rateLimit429Count;

  const latencies = results.map(r => r.latency);
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const qps = totalDuration && totalDuration > 0 ? ((completedCount / (totalDuration / 1000))).toFixed(1) : '0';

  const progressPercent = totalRequests > 0 ? Math.round((completedCount / totalRequests) * 100) : 0;

  return (
    <div className="backdrop-blur-xl bg-black/60 fixed inset-0 flex items-center justify-center z-50 p-2 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="ui-card rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header with benchmark title and warning badge */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-purple-600/30 to-pink-600/30 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold shadow-inner shrink-0">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 truncate">
                <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">{t('concurrentTest.title')}</h3>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 dark:text-amber-300 border border-amber-500/30 items-center space-x-1 shrink-0">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Pressure Benchmark</span>
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] truncate">
                {t('concurrentTest.sub').replace('{method}', targetMethod).replace('{url}', targetUrl)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Configuration Controls */}
          <div className="ui-card-sub p-5 space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
              <Sliders className="w-3.5 h-3.5 text-purple-400" />
              <span>Benchmark Configuration</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Concurrency slider & input */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-200">{t('concurrentTest.concurrencyLabel')}</label>
                  <span className="text-xs font-mono font-bold text-purple-300">{concurrency}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  disabled={testing}
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value, 10) || 1)}
                  className="w-full accent-purple-500 cursor-pointer h-1.5 bg-black/10 dark:bg-white/10 rounded-lg"
                />
              </div>

              {/* Request Count */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">{t('concurrentTest.totalRequestsLabel')}</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  disabled={testing}
                  value={totalRequests}
                  onChange={(e) => setTotalRequests(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full ui-input p-2 text-xs font-mono"
                />
              </div>

              {/* Target Model Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">Target Model</label>
                <select
                  value={targetModel}
                  disabled={testing}
                  onChange={(e) => setTargetModel(e.target.value)}
                  className="w-full ui-input p-2 text-xs font-mono cursor-pointer"
                >
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                  <option value="gemini-2.5-flash-thinking">gemini-2.5-flash-thinking</option>
                </select>
              </div>
            </div>

            {/* Run Action Button */}
            <div className="pt-2">
              <button
                onClick={runTest}
                disabled={testing}
                className="w-full py-2.5 bg-gradient-to-r from-purple-500 via-indigo-600 to-pink-500 hover:from-purple-600 hover:via-indigo-700 hover:to-pink-600 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-[0_0_20px_rgba(168,85,247,0.35)] transition-all flex items-center justify-center space-x-2"
              >
                {testing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('concurrentTest.testingButton')}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>{t('concurrentTest.runButton')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Execution Dashboard */}
          {(results.length > 0 || testing) && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Progress bar with glowing gradient */}
              <div className="ui-card-sub p-4 space-y-2">
                <div className="flex justify-between text-xs text-[var(--text-secondary)] font-mono">
                  <span className="flex items-center space-x-1.5 font-sans font-semibold text-[var(--text-primary)]">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('concurrentTest.progress')}</span>
                  </span>
                  <span>{completedCount} / {totalRequests} ({progressPercent}%)</span>
                </div>
                <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2.5 overflow-hidden border border-[var(--border-subtle)]">
                  <div
                    className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 h-full transition-all duration-150 shadow-[0_0_12px_rgba(168,85,247,0.5)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* KPI Badges Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {/* Success / Failure */}
                <div className="ui-card-sub p-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center justify-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Success</span>
                  </div>
                  <div className="text-base font-bold font-mono mt-1 text-emerald-500 dark:text-emerald-400">
                    {successCount}
                  </div>
                </div>

                {/* 429 Rate Limit / Other Errors */}
                <div className="ui-card-sub p-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center justify-center space-x-1">
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span>429 / Failed</span>
                  </div>
                  <div className="text-base font-bold font-mono mt-1">
                    <span className="text-amber-500 dark:text-amber-400" title="429 Rate Limit Errors">{rateLimit429Count}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-rose-500 dark:text-rose-400" title="Other Failures">{otherErrorCount}</span>
                  </div>
                </div>

                {/* Avg Latency */}
                <div className="ui-card-sub p-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center justify-center space-x-1">
                    <Clock className="w-3 h-3 text-purple-400" />
                    <span>{t('concurrentTest.avgLatency')}</span>
                  </div>
                  <div className="text-base font-bold font-mono mt-1 text-purple-600 dark:text-purple-300">
                    {avgLatency} <span className="text-xs font-normal text-[var(--text-muted)]">ms</span>
                  </div>
                </div>

                {/* Live Throughput QPS */}
                <div className="ui-card-sub p-3.5">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-semibold flex items-center justify-center space-x-1">
                    <TrendingUp className="w-3 h-3 text-indigo-400" />
                    <span>RPS (QPS)</span>
                  </div>
                  <div className="text-base font-bold font-mono mt-1 text-indigo-600 dark:text-indigo-300">
                    {qps} <span className="text-xs font-normal text-[var(--text-muted)]">req/s</span>
                  </div>
                </div>
              </div>

              {/* Request Timeline / Latency Distribution List */}
              <div className="ui-card-sub overflow-hidden">
                <div className="p-3 bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                  <div className="flex items-center space-x-1.5 text-[var(--text-primary)]">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Request Execution Timeline</span>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-muted)]">
                    Min: {minLatency}ms | Max: {maxLatency}ms
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-white/[0.04]">
                  {results.map((r) => {
                    const is429 = r.status === 429;
                    return (
                      <div key={r.id} className="p-2.5 flex items-center justify-between font-mono text-xs hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center space-x-3 min-w-0 pr-2">
                          <span className="text-slate-500 text-[11px] w-8">#{r.id}</span>
                          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                            r.success
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : is429
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}>
                            {r.status || 'ERR'}
                          </span>
                          <span className="text-slate-400 truncate max-w-sm font-sans text-xs">
                            {r.error || 'Request Succeeded'}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3 shrink-0">
                          <span className="text-purple-300 font-mono text-xs">{r.latency}ms</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
