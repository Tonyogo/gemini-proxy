import React, { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  rawJson?: string;
}

export default function PlaygroundView() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('claude-3-5-sonnet-20241022');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState<number>(1.0);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [streamMode, setStreamMode] = useState<boolean>(true);

  // Thinking Chain Configurations
  const [enableThinking, setEnableThinking] = useState<boolean>(true);
  const [thinkingBudget, setThinkingBudget] = useState<number>(2048);

  // Chat conversation state
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  // Active assistant tabs state per message index
  const [activeTabs, setActiveTabs] = useState<Record<number, 'text' | 'thinking' | 'json'>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Dynamically fetch models list from backend
  useEffect(() => {
    fetch('/api/admin/models')
      .then((r) => r.json())
      .then((data) => {
        if (data.models && typeof data.models === 'object') {
          const fetchedNames = Object.keys(data.models);
          if (fetchedNames.length > 0) {
            setModels(fetchedNames);
            setSelectedModel(fetchedNames[0]);
          }
        }
      })
      .catch(() => {
        // Fallbacks if backend fails
        setModels(['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'gemini-1.5-pro', 'gemini-1.5-flash']);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, loading]);

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem('geminiApiKey', val);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiKey) {
      alert('Please enter your Gemini API Key in the left panel first.');
      return;
    }
    if (!inputText.trim()) return;

    const userMsg: Message = { role: 'user', content: inputText };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setInputText('');
    setLoading(true);
    setLatency(null);

    const startTime = Date.now();

    // Setup payload structure
    const payload: any = {
      model: selectedModel,
      messages: updatedHistory.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      temperature: temperature,
      stream: streamMode
    };

    if (systemPrompt.trim()) {
      payload.system = systemPrompt;
    }

    if (enableThinking) {
      payload.thinking = {
        type: 'enabled',
        budget_tokens: thinkingBudget
      };
    }

    try {
      const res = await fetch('/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      setLatency(Date.now() - startTime);

      if (!res.ok) {
        const errorText = await res.text();
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: `API Error (Status ${res.status}): ${errorText}` }
        ]);
        setLoading(false);
        return;
      }

      if (streamMode) {
        // Streaming Event Source Handler (Chunked Reader)
        const reader = res.body?.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        let assistantContent = '';
        let assistantThinking = '';

        // Append initial empty assistant bubble
        const assistantMsgIndex = updatedHistory.length;
        setChatHistory((prev) => [
          ...prev,
          { role: 'assistant', content: '', thinking: '', rawJson: '// Live SSE stream chunks compiling...' }
        ]);
        setActiveTabs((prev) => ({ ...prev, [assistantMsgIndex]: 'text' }));

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep partial line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                const rawJson = trimmed.substring(6).trim();
                if (rawJson === '[DONE]') continue;
                try {
                  const chunk = JSON.parse(rawJson);
                  if (chunk.type === 'content_block_delta') {
                    if (chunk.delta?.type === 'text_delta') {
                      assistantContent += chunk.delta.text || '';
                    } else if (chunk.delta?.type === 'thinking_delta') {
                      assistantThinking += chunk.delta.thinking || '';
                      // Auto switch view tab to thinking if active thinking streams in
                      setActiveTabs((prev) => ({ ...prev, [assistantMsgIndex]: 'thinking' }));
                    }
                  }

                  // Live-update latest streamed message
                  setChatHistory((prev) => {
                    const next = [...prev];
                    next[assistantMsgIndex] = {
                      role: 'assistant',
                      content: assistantContent,
                      thinking: assistantThinking,
                      rawJson: JSON.stringify(chunk, null, 2)
                    };
                    return next;
                  });
                } catch {
                  // ignore parse error
                }
              }
            }
          }
        }
      } else {
        // Non-stream handler
        const data = await res.json();
        const contentBlock = data.content?.[0];
        const contentText = contentBlock?.text || '';
        const contentThinking = contentBlock?.thinking || '';

        setChatHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: contentText,
            thinking: contentThinking,
            rawJson: JSON.stringify(data, null, 2)
          }
        ]);
        setActiveTabs((prev) => ({ ...prev, [updatedHistory.length]: contentThinking ? 'thinking' : 'text' }));
      }
    } catch (err: any) {
      setChatHistory((prev) => [
        ...prev,
        { role: 'assistant', content: `Network Connection Error: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setChatHistory([]);
    setLatency(null);
    setActiveTabs({});
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto h-[840px]">
      {/* Left Tuning Panel (1/3 width) */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-lg flex flex-col justify-between h-full overflow-y-auto space-y-4">
        <div className="space-y-4">
          <div className="pb-3 border-b border-slate-700/60 flex items-center justify-between">
            <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Playground Settings</h3>
            <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-400 font-mono">
              /v1/messages
            </span>
          </div>

          {/* API Key */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase">Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Model selection */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase">Target Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* System Instructions */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase">System Instructions</label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful coding assistant..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase mb-1.5">
              <span>Temperature</span>
              <span className="font-mono text-blue-400">{temperature}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
            />
          </div>

          {/* Max Output Tokens */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 block mb-1.5 uppercase">Max Tokens</label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Thinking Budget */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/40 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-300 uppercase">Enable Thinking (CoT)</label>
              <input
                type="checkbox"
                checked={enableThinking}
                onChange={(e) => setEnableThinking(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-500 bg-slate-950"
              />
            </div>
            {enableThinking && (
              <div>
                <label className="text-[9px] font-semibold text-slate-400 block mb-1 uppercase">Thinking Budget (Tokens)</label>
                <input
                  type="number"
                  min="1024"
                  value={thinkingBudget}
                  onChange={(e) => setThinkingBudget(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            )}
          </div>
        </div>

        {/* Stream Toggle Switch */}
        <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Stream Response</span>
          <button
            onClick={() => setStreamMode(!streamMode)}
            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
              streamMode ? 'bg-emerald-600' : 'bg-slate-900 border border-slate-700'
            }`}
          >
            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${streamMode ? 'translate-x-6' : ''}`}></div>
          </button>
        </div>
      </div>

      {/* Right Chat Canvas Area (2/3 width) */}
      <div className="lg:col-span-2 bg-slate-800/80 border border-slate-700/60 rounded-xl p-5 shadow-lg flex flex-col h-full overflow-hidden">
        {/* Chat Canvas Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/60 mb-4">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Chat Console Canvas</h3>
          </div>
          {latency !== null && (
            <span className="text-[10px] font-mono bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
              Latency: {latency} ms
            </span>
          )}
        </div>

        {/* Chat Conversation History Panel */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
          {chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs py-20 text-center space-y-2">
              <div className="text-3xl">🤖</div>
              <div>Conversation history is empty.</div>
              <div className="text-[10px]">Type a prompt below to launch a conversational session.</div>
            </div>
          ) : (
            chatHistory.map((msg, idx) => {
              const isUser = msg.role === 'user';
              if (isUser) {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow font-sans">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Assistant message Tabs Control
              const activeTab = activeTabs[idx] || 'text';
              return (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3 max-w-[90%]">
                  {/* Assistant response sub-tabs */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                    <div className="flex space-x-1.5 text-[10px] font-bold">
                      <button
                        onClick={() => setActiveTabs((prev) => ({ ...prev, [idx]: 'text' }))}
                        className={`px-2.5 py-1 rounded transition-all ${
                          activeTab === 'text' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        💬 Chat View
                      </button>
                      {msg.thinking && (
                        <button
                          onClick={() => setActiveTabs((prev) => ({ ...prev, [idx]: 'thinking' }))}
                          className={`px-2.5 py-1 rounded transition-all ${
                            activeTab === 'thinking' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          💭 Thinking
                        </button>
                      )}
                      <button
                        onClick={() => setActiveTabs((prev) => ({ ...prev, [idx]: 'json' }))}
                        className={`px-2.5 py-1 rounded transition-all ${
                          activeTab === 'json' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        💻 JSON Chunks
                      </button>
                    </div>
                  </div>

                  {/* Rendering Active Tab Content */}
                  <div className="font-mono text-xs leading-relaxed overflow-x-auto">
                    {activeTab === 'text' && (
                      <div className="font-sans text-slate-100 text-xs leading-relaxed whitespace-pre-wrap">
                        {msg.content || (loading && idx === chatHistory.length - 1 ? 'Streaming content...' : 'Empty content')}
                      </div>
                    )}

                    {activeTab === 'thinking' && (
                      <div className="text-purple-300 whitespace-pre-wrap leading-relaxed font-sans">
                        {msg.thinking}
                      </div>
                    )}

                    {activeTab === 'json' && (
                      <pre className="text-[10px] text-emerald-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 overflow-x-auto">
                        {msg.rawJson}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Bottom Message Input Console */}
        <form onSubmit={handleSend} className="border-t border-slate-700/60 pt-4 flex items-center space-x-3 mt-auto">
          <button
            type="button"
            onClick={clearChat}
            className="px-3.5 py-2 bg-slate-900 border border-slate-700/80 hover:bg-slate-800 rounded-xl text-xs text-slate-300 hover:text-white transition-colors"
          >
            Clear Chat
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
            placeholder={loading ? 'Streaming responses, please wait...' : 'Type a prompt... (Press Enter to send)'}
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={loading || !inputText.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-xl font-semibold text-xs text-white transition-colors shadow-md"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}