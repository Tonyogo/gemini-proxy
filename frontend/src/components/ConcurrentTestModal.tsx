import React, { useState } from 'react';

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
  const [concurrency, setConcurrency] = useState<number>(5);
  const [totalRequests, setTotalRequests] = useState<number>(10);

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

    // Deep clone payload and ensure stream is false for accurate response latency
    const testPayload = parsedPayload ? JSON.parse(JSON.stringify(parsedPayload)) : null;
    if (testPayload && typeof testPayload === 'object') {
      testPayload.stream = false;
    }

    const executeSingleRequest = async (id: number): Promise<RequestResult> => {
      const reqStart = Date.now();
      try {
        const fetchOptions: RequestInit = {
          method: targetMethod,
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey
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
  const failedCount = results.filter(r => !r.success).length;
  const latencies = results.map(r => r.latency);
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const qps = totalDuration && totalDuration > 0 ? ((successCount / (totalDuration / 1000))).toFixed(1) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-5 text-slate-100 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-base font-bold text-slate-100">Concurrency Load Test</h3>
              <p className="text-xs text-slate-400">Dispatch parallel requests to {targetMethod} {targetUrl}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-lg font-mono">✕</button>
        </div>

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Concurrency (Parallel)</label>
            <input
              type="number"
              min={1}
              max={50}
              disabled={testing}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">Total Requests</label>
            <input
              type="number"
              min={1}
              max={200}
              disabled={testing}
              value={totalRequests}
              onChange={(e) => setTotalRequests(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={runTest}
              disabled={testing}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-lg font-bold text-xs text-white transition-colors shadow-md flex items-center justify-center space-x-1.5"
            >
              <span>{testing ? 'Testing...' : '▶ Run Test'}</span>
            </button>
          </div>
        </div>

        {/* Progress & Stats Dashboard */}
        {(results.length > 0 || testing) && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1 font-mono">
                <span>Progress</span>
                <span>{completedCount} / {totalRequests} ({Math.round((completedCount / totalRequests) * 100)}%)</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-blue-500 h-full transition-all duration-150"
                  style={{ width: `${(completedCount / totalRequests) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Success / Failed</div>
                <div className="text-sm font-bold font-mono mt-1">
                  <span className="text-emerald-400">{successCount}</span> / <span className="text-rose-400">{failedCount}</span>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Avg Latency</div>
                <div className="text-sm font-bold font-mono mt-1 text-purple-300">{avgLatency} ms</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Min / Max Latency</div>
                <div className="text-xs font-bold font-mono mt-1 text-slate-200">{minLatency}ms / {maxLatency}ms</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">QPS / Total Time</div>
                <div className="text-xs font-bold font-mono mt-1 text-amber-300">
                  {qps} req/s <span className="text-slate-500">({totalDuration ? (totalDuration / 1000).toFixed(1) : 0}s)</span>
                </div>
              </div>
            </div>

            {/* Details Table */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 sticky top-0">
                  <tr>
                    <th className="p-2.5">Req #</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Latency</th>
                    <th className="p-2.5">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {results.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/40">
                      <td className="p-2.5 text-slate-400">#{r.id}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                          r.success ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        }`}>
                          {r.status || 'ERR'}
                        </span>
                      </td>
                      <td className="p-2.5 text-purple-300">{r.latency} ms</td>
                      <td className="p-2.5 text-slate-400 truncate max-w-xs">{r.error || 'OK'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
