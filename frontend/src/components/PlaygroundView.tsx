import React, { useState } from 'react';
import Editor from '@monaco-editor/react';

const defaultRequestBody = {
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  messages: [
    { role: "user", content: "Hello! Who are you?" }
  ],
  stream: true
};

export default function PlaygroundView() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [requestBody, setRequestBody] = useState<string>(JSON.stringify(defaultRequestBody, null, 2));
  const [response, setResponse] = useState<string>('// API response will appear here...');
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

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
    setResponse('Connecting and sending request to /v1/messages...');
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
        setResponse(`HTTP Error (Status ${res.status}):\n${errText}`);
        setLoading(false);
        return;
      }

      if (isStream) {
        // Live Typewriter Chunk Reader
        const reader = res.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullStreamOutput = '';
        setResponse('Connected. Streaming events...\n\n');

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
                if (rawJson === '[DONE]') {
                  fullStreamOutput += '\n\n[DONE]';
                  setResponse(fullStreamOutput);
                  continue;
                }
                try {
                  const chunk = JSON.parse(rawJson);

                  // Extract text or thinking delta
                  if (chunk.type === 'content_block_delta') {
                    if (chunk.delta?.type === 'text_delta') {
                      fullStreamOutput += chunk.delta.text || '';
                    } else if (chunk.delta?.type === 'thinking_delta') {
                      fullStreamOutput += chunk.delta.thinking || '';
                    }
                  }

                  setResponse(fullStreamOutput || JSON.stringify(chunk));
                } catch {
                  // Fallback to show raw line if parsing fails
                  fullStreamOutput += trimmed + '\n';
                  setResponse(fullStreamOutput);
                }
              }
            }
          }
        }
      } else {
        // Non-stream response
        const data = await res.json();
        setResponse(JSON.stringify(data, null, 2));
      }
    } catch (err: any) {
      setResponse(`Connection Error:\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 h-[760px] flex flex-col font-sans">
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
            className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-lg font-bold text-xs text-white transition-colors shadow-md"
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
            <span className="text-[10px] text-slate-500 font-mono">SSE / JSON</span>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-slate-800">
            <Editor
              height="100%"
              language={response.startsWith('{') ? 'json' : 'plaintext'}
              theme="vs-dark"
              value={response}
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
          </div>
        </div>
      </div>
    </div>
  );
}
