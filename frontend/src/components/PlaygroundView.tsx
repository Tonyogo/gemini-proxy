import React, { useState } from 'react';

export default function PlaygroundView() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('Hello! Please introduce yourself.');
  const [response, setResponse] = useState('');
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

    setLoading(true);
    setResponse('Sending request to /v1/messages...');
    const startTime = Date.now();

    try {
      const payload: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      };

      if (systemPrompt.trim()) {
        payload.system = systemPrompt;
      }

      const res = await fetch('/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      const elapsed = Date.now() - startTime;
      setLatency(elapsed);

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResponse(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">API Playground</h2>
          <p className="text-xs text-slate-400 mt-0.5">Test Claude-to-Gemini API translation live against standard /v1/messages endpoint</p>
        </div>
        {latency !== null && (
          <span className="text-xs font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 px-3 py-1 rounded-full">
            Response Latency: {latency} ms
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl shadow-md">
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
          />
          <p className="text-[10px] text-slate-500 mt-1">Saved locally in your browser LocalStorage only.</p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl shadow-md">
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">Target Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
          />
          <p className="text-[10px] text-slate-500 mt-1">e.g. claude-3-5-sonnet-20241022, gemini-flash-latest</p>
        </div>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl shadow-md space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">System Instruction (Optional)</label>
          <input
            type="text"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="e.g. You are a helpful assistant..."
            className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1.5">User Prompt</label>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg font-semibold text-xs text-white transition-colors shadow-lg"
        >
          {loading ? 'Processing Stream/Request...' : 'Send API Request'}
        </button>
      </div>

      <div className="bg-slate-800/80 border border-slate-700/60 p-5 rounded-xl shadow-md">
        <label className="text-xs font-semibold text-slate-300 block mb-2">API JSON Response Payload</label>
        <pre className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-96 leading-relaxed">
          {response || '// API response will appear here...'}
        </pre>
      </div>
    </div>
  );
}
