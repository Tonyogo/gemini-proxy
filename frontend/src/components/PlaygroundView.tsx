import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import JsonTreeView from './JsonTreeView';
import SseStreamPreview from './SseStreamPreview';

const defaultRequestBody = {
  model: "gemini-flash-lite-latest",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello! Who are you?" }
  ],
  stream: true
};

export default function PlaygroundView() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [requestBody, setRequestBody] = useState<string>(JSON.stringify(defaultRequestBody, null, 2));
  const [responseRaw, setResponseRaw] = useState<string>('// API response will appear here...');
  const [responseJson, setResponseJson] = useState<any>(null);
  const [responseStreamChunks, setResponseStreamChunks] = useState<any[]>([]);
  const [isStreamingActive, setIsStreamingActive] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem('geminiApiKey', val);
  };

  const handleSend = async () => {
    if (!apiKey) {
      alert('Please enter your Gemini API Key first.');
      return;
    }

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(requestBody);
    } catch (err: any) {
      alert(`Invalid Request JSON Body: ${err.message}`);
      return;
    }

    setLoading(true);
    setResponseRaw('Connecting and sending request to /v1/messages...');
    setResponseJson(null);
    setResponseStreamChunks([]);
    setIsStreamingActive(false);
    setLatency(null);

    const startTime = Date.now();
    const isStream = parsedPayload.stream === true;

    try {
      const res = await fetch('/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(parsedPayload)
      });

      setLatency(Date.now() - startTime);

      if (!res.ok) {
        const errText = await res.text();
        const errorMsg = `HTTP Error (Status ${res.status}):\n${errText}`;
        setResponseRaw(errorMsg);
        setResponseJson({ error: `HTTP ${res.status}`, details: errText });
        setLoading(false);
        return;
      }

      if (isStream) {
        setIsStreamingActive(true);
        const reader = res.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullStreamOutput = '';
        const accumulatedChunks: any[] = [];

        setResponseRaw('Connected. Streaming events...\n\n');

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const rawJson = trimmed.substring(6).trim();
                fullStreamOutput += trimmed + '\n';
                setResponseRaw(fullStreamOutput);

                if (rawJson === '[DONE]') continue;
                try {
                  const chunk = JSON.parse(rawJson);
                  accumulatedChunks.push(chunk);
                  // Update reactive array of JSON objects for SseStreamPreview
                  setResponseStreamChunks([...accumulatedChunks]);
                } catch {
                  // ignore chunk parse errors
                }
              }
            }
          }
        }
      } else {
        // Non-stream response
        const data = await res.json();
        setResponseJson(data);
        setResponseRaw(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      setResponseRaw(`Connection Error:\n${err.message}`);
      setResponseJson({ error: 'Connection Error', details: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 h-[780px] flex flex-col font-sans">
      {/* Top Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-700/40">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm font-mono">
            PG
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Raw Request Debugger</h2>
            <p className="text-[10px] text-slate-400">Post custom payloads directly to local proxy /v1/messages</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Gemini Key:</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="AIzaSy..."
              className="bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono w-44"
            />
          </div>

          {latency !== null && (
            <span className="text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-1 rounded-full">
              Latency: {latency} ms
            </span>
          )}

          <button
            onClick={handleSend}
            disabled={loading}
            className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-lg font-bold text-xs text-white transition-colors shadow-md animate-pulse"
          >
            {loading ? 'Sending Stream...' : 'Send API Request'}
          </button>
        </div>
      </div>

      {/* Main Request / Response Panels (50% / 50%) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 overflow-hidden">
        {/* Left Column: Request Builder */}
        <div className="bg-slate-850 border border-slate-700/50 rounded-xl p-4 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="font-bold text-blue-400 text-xs uppercase flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>Raw JSON Request Body</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">POST /v1/messages</span>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-slate-800">
            <Editor
              height="100%"
              language="json"
              theme="vs-dark"
              value={requestBody}
              onChange={(val) => setRequestBody(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                automaticLayout: true
              }}
            />
          </div>
        </div>

        {/* Right Column: Output Viewer */}
        <div className="bg-slate-850 border border-slate-700/50 rounded-xl p-4 flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="font-bold text-emerald-400 text-xs uppercase flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>HTTP Response Output</span>
            </span>

            {/* View Mode Selectors */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('preview')}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === 'preview' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                👁 Preview
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  viewMode === 'raw' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                💻 Raw Text
              </button>
            </div>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-slate-800 overflow-y-auto">
            {viewMode === 'preview' ? (
              isStreamingActive ? (
                <SseStreamPreview streamData={responseStreamChunks} />
              ) : (
                <JsonTreeView data={responseJson} />
              )
            ) : (
              <Editor
                height="100%"
                language={responseRaw.startsWith('{') ? 'json' : 'plaintext'}
                theme="vs-dark"
                value={responseRaw}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}