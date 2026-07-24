import React, { useEffect, useState } from 'react';

// Sub-component for rendering Claude Protocol Preview
function ClaudePreview({ req, res }: { req: any; res: any }) {
  if (!req && !res) return <div className="text-slate-500 text-xs italic">No Claude payload</div>;

  const system = req?.system;
  const messages = req?.messages || [];

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* System Prompt Card */}
      {system && (
        <div className="bg-purple-950/40 border border-purple-800/50 rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1">System Prompt</div>
          <div className="text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
            {typeof system === 'string' ? system : JSON.stringify(system, null, 2)}
          </div>
        </div>
      )}

      {/* Messages Flow */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Request Messages</div>
        {messages.map((msg: any, idx: number) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              className={`p-3 rounded-xl border ${
                isUser ? 'bg-slate-900 border-slate-700/80 text-slate-200' : 'bg-blue-950/30 border-blue-800/40 text-blue-100'
              }`}
            >
              <div className="text-[10px] font-bold uppercase mb-1 text-slate-400 flex items-center justify-between">
                <span>{msg.role}</span>
              </div>
              <div className="font-mono text-[11px] whitespace-pre-wrap">
                {typeof msg.content === 'string'
                  ? msg.content
                  : JSON.stringify(msg.content, null, 2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Response Card */}
      {res && (
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span>Claude Response</span>
            {res.usage && (
              <span className="font-mono text-[10px] text-emerald-300/80">
                In: {res.usage.input_tokens} | Out: {res.usage.output_tokens}
              </span>
            )}
          </div>

          {res.content && Array.isArray(res.content) && res.content.map((block: any, bIdx: number) => {
            if (block.type === 'thinking') {
              return (
                <details key={bIdx} className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-2 text-purple-200">
                  <summary className="font-bold text-[10px] uppercase cursor-pointer text-purple-400">
                    💭 Thinking Chain ({block.thinking?.length || 0} chars)
                  </summary>
                  <pre className="mt-2 font-mono text-[10px] whitespace-pre-wrap text-purple-300 leading-relaxed max-h-40 overflow-y-auto">
                    {block.thinking}
                  </pre>
                </details>
              );
            }
            if (block.type === 'text') {
              return (
                <div key={bIdx} className="font-mono text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {block.text}
                </div>
              );
            }
            return (
              <pre key={bIdx} className="font-mono text-[10px] text-slate-300">
                {JSON.stringify(block, null, 2)}
              </pre>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sub-component for rendering Gemini Protocol Preview
function GeminiPreview({ req, res }: { req: any; res: any }) {
  if (!req && !res) return <div className="text-slate-500 text-xs italic">No Gemini payload</div>;

  const sysInstruction = req?.systemInstruction;
  const contents = req?.contents || [];
  const genConfig = req?.generationConfig;

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* Mapped systemInstruction */}
      {sysInstruction && (
        <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-xl p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">
            Gemini systemInstruction
          </div>
          <div className="text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
            {sysInstruction.parts?.map((p: any) => p.text).join('\n') || JSON.stringify(sysInstruction, null, 2)}
          </div>
        </div>
      )}

      {/* Generation Config Badge Bar */}
      {genConfig && (
        <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
          {genConfig.temperature !== undefined && (
            <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-slate-300">
              Temp: {genConfig.temperature}
            </span>
          )}
          {genConfig.thinkingConfig && (
            <span className="bg-purple-950 border border-purple-700 px-2 py-0.5 rounded text-purple-300">
              Thinking Budget: {genConfig.thinkingConfig.thinkingBudget}
            </span>
          )}
        </div>
      )}

      {/* Converted Contents */}
      <div className="space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gemini Contents (Parts)</div>
        {contents.map((item: any, idx: number) => (
          <div key={idx} className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[10px] font-bold uppercase text-slate-500">{item.role}</div>
            {item.parts?.map((part: any, pIdx: number) => (
              <div key={pIdx} className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                {part.text && <div>{part.text}</div>}
                {part.inlineData && (
                  <div className="text-[10px] text-blue-400">
                    [Inline Data: {part.inlineData.mimeType}]
                  </div>
                )}
                {part.functionCall && (
                  <div className="text-[10px] text-emerald-400 bg-slate-950 p-2 rounded border border-slate-800">
                    Function Call: {part.functionCall.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Gemini Native Response */}
      {res && (
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-3 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span>Gemini Raw Candidates</span>
            {res.usageMetadata && (
              <span className="font-mono text-[10px] text-emerald-300/80">
                Prompt: {res.usageMetadata.promptTokenCount} | Candidates: {res.usageMetadata.candidatesTokenCount}
              </span>
            )}
          </div>
          <pre className="font-mono text-[10px] text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
            {JSON.stringify(res.candidates || res, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function LogsView({ adminKey }: { adminKey: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [tree, setTree] = useState<Record<string, Record<string, number>>>({});
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {/* Left Sidebar (1/4 width) */}
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

      {/* Main Split Inspector (3/4 width) */}
      <div className="lg:col-span-3 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-md flex flex-col h-[820px]">
        {/* Toolbar Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/60">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Side-by-Side Payload Inspector</h3>
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  viewMode === 'preview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                👁 Preview Mode
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all ${
                  viewMode === 'raw' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                💻 Raw JSON
              </button>
            </div>
          </div>

          {selectedLog?.duration && (
            <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-3 py-1 rounded-full">
              Latency: {selectedLog.duration}ms
            </span>
          )}
        </div>

        {/* Content Inspector Grid */}
        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 text-slate-400 text-xs">Loading transaction details...</div>
        ) : selectedLog ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 overflow-hidden">
            {/* Left Column: Claude Protocol */}
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                <span className="font-bold text-blue-400 text-xs uppercase flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span>Claude API Protocol</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Client Request / Output</span>
              </div>

              <div className="flex-1 overflow-y-auto pr-1">
                {viewMode === 'preview' ? (
                  <ClaudePreview req={selectedLog.client_req} res={selectedLog.claude_res} />
                ) : (
                  <div className="space-y-4 font-mono text-[10px]">
                    <div>
                      <div className="text-blue-400 font-semibold mb-1">client_req</div>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto">
                        {JSON.stringify(selectedLog.client_req, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-amber-400 font-semibold mb-1">claude_res</div>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto">
                        {JSON.stringify(selectedLog.claude_res, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Gemini Protocol */}
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                <span className="font-bold text-emerald-400 text-xs uppercase flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Gemini Upstream Protocol</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Translated Request / Response</span>
              </div>

              <div className="flex-1 overflow-y-auto pr-1">
                {viewMode === 'preview' ? (
                  <GeminiPreview req={selectedLog.gem_req} res={selectedLog.gem_res} />
                ) : (
                  <div className="space-y-4 font-mono text-[10px]">
                    <div>
                      <div className="text-emerald-400 font-semibold mb-1">gem_req</div>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto">
                        {JSON.stringify(selectedLog.gem_req, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-purple-400 font-semibold mb-1">gem_res</div>
                      <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-300 overflow-x-auto">
                        {JSON.stringify(selectedLog.gem_res, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-slate-500 text-xs">
            Select a transaction log file from the left list to inspect side-by-side payloads.
          </div>
        )}
      </div>
    </div>
  );
}
