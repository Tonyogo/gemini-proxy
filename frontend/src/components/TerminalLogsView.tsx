import React, { useEffect, useState, useRef } from 'react';

export default function TerminalLogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    const streamUrl = `/api/admin/terminal-logs?stream=true${adminKey ? `&x-admin-key=${encodeURIComponent(adminKey)}` : ''}`;

    eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'history') {
          setLogs(payload.logs || []);
        } else if (payload.type === 'log' && payload.entry) {
          setLogs(prev => [...prev.slice(-99), payload.entry]);
        }
      } catch (err) {
        // ignore parse error
      }
    };

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [adminKey]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter(item => {
    if (levelFilter !== 'ALL' && item.level.toUpperCase() !== levelFilter) {
      return false;
    }
    if (searchTerm && !item.message.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error': return 'text-red-400 font-bold';
      case 'warn': return 'text-yellow-400 font-semibold';
      case 'info': return 'text-emerald-400';
      case 'debug': return 'text-slate-400';
      default: return 'text-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[820px] bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
      {/* Top Toolbar */}
      <div className="bg-slate-800/90 border-b border-slate-700/80 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="font-bold text-slate-200 tracking-wider uppercase text-[11px]">Server Terminal Output</span>
          <div className="flex items-center space-x-1.5 ml-2 bg-slate-950/60 px-2.5 py-1 rounded-full text-[10px]">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className={isConnected ? 'text-emerald-300' : 'text-red-300'}>
              {isConnected ? 'LIVE' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 text-slate-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
          />

          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="bg-slate-950/80 border border-slate-700/80 text-slate-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">ALL LEVELS</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="DEBUG">DEBUG</option>
          </select>

          <label className="flex items-center space-x-1.5 text-slate-300 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>

          <button
            onClick={() => setLogs([])}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-2.5 py-1 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Console Output Window */}
      <div
        ref={containerRef}
        className="flex-1 p-4 overflow-y-auto space-y-1 bg-slate-950/90 selection:bg-cyan-500/30 selection:text-cyan-200"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 italic py-8 text-center">No terminal logs recorded.</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="leading-relaxed break-all flex items-start space-x-2 hover:bg-slate-800/40 px-1 py-0.5 rounded">
              <span className={getLevelColor(log.level)}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
