import React, { useState } from 'react';

export default function PlaygroundView() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');
  const [prompt, setPrompt] = useState('Hello! Who are you?');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem('geminiApiKey', val);
  };

  const handleSend = async () => {
    setLoading(true);
    setResponse('Sending request...');

    try {
      const res = await fetch('/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000
        })
      });

      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResponse(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h2 className="text-xl font-bold text-white">API Playground</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-400">Gemini API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400">User Prompt</label>
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-white"
        />
      </div>
      <button
        onClick={handleSend}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded font-semibold text-sm text-white"
      >
        {loading ? 'Sending...' : 'Send Request'}
      </button>

      <div className="mt-6">
        <label className="text-xs text-slate-400">Response</label>
        <pre className="bg-slate-800 border border-slate-700 rounded p-4 text-xs font-mono text-green-400 overflow-auto max-h-96">
          {response}
        </pre>
      </div>
    </div>
  );
}
