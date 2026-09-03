import React, { useState, useEffect, useRef, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play,
  Copy,
  Check,
  Zap,
  Sparkles,
  RefreshCw,
  Code,
  Terminal,
  Activity,
  Layers,
  Flame,
  Send,
  Eye,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Key,
  Globe,
  Braces,
  RotateCcw,
  AlignLeft,
  ChevronDown
} from 'lucide-react';
import JsonTreeView from './JsonTreeView';
import SseStreamPreview from './SseStreamPreview';
import ConcurrentTestModal from './ConcurrentTestModal';
import { defineGeminiProxyTheme } from '../utils/monacoTheme';
import { useTranslation } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';

type EndpointOption = 'messages' | 'count_tokens' | 'custom';
type ViewMode = 'preview' | 'raw';
type PresetKey = 'basicChat' | 'toolUse' | 'vision' | 'thinkingMode';

const PRESETS: Record<PresetKey, any> = {
  basicChat: {
    model: "gemini-3.1-flash-lite",
    max_tokens: 1024,
    messages: [
      { role: "user", content: "Hello! Explain quantum computing in simple terms." }
    ],
    stream: true
  },
  toolUse: {
    model: "gemini-flash-latest",
    max_tokens: 1024,
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City and state, e.g. San Francisco, CA" },
            unit: { type: "string", enum: ["celsius", "fahrenheit"] }
          },
          required: ["location"]
        }
      }
    ],
    messages: [
      { role: "user", content: "What is the weather in Tokyo right now?" }
    ],
    stream: false
  },
  vision: {
    model: "gemini-flash-latest",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
          },
          {
            type: "text",
            text: "Describe this 1x1 red pixel image."
          }
        ]
      }
    ],
    stream: true
  },
  thinkingMode: {
    model: "gemini-pro-latest",
    max_tokens: 2048,
    thinking: {
      type: "enabled",
      budget_tokens: 1024
    },
    messages: [
      { role: "user", content: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" }
    ],
    stream: true
  }
};

const DEFAULT_PRESETS: Record<EndpointOption, any> = {
  messages: PRESETS.basicChat,
  count_tokens: {
    model: "gemini-3.1-flash-lite",
    messages: [
      { role: "user", content: "Hello! Count the tokens in this message." }
    ]
  },
  custom: {
    model: "gemini-3.1-flash-lite",
    messages: [
      { role: "user", content: "Test custom endpoint payload" }
    ]
  }
};

export default function PlaygroundView() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'gemini-proxy-dark' : 'gemini-proxy-light';
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [endpointOption, setEndpointOption] = useState<EndpointOption>('messages');
  const [customMethod, setCustomMethod] = useState<string>('POST');
  const [customPath, setCustomPath] = useState<string>('/v1/models');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite');

  const [requestBody, setRequestBody] = useState<string>(JSON.stringify(DEFAULT_PRESETS.messages, null, 2));
  const [responseRaw, setResponseRaw] = useState<string>(() => t('playground.initialResponse'));
  const [responseJson, setResponseJson] = useState<any>(null);
  const [responseStreamChunks, setResponseStreamChunks] = useState<any[]>([]);
  const [isStreamingActive, setIsStreamingActive] = useState<boolean>(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [mobileActiveTab, setMobileActiveTab] = useState<'editor' | 'response'>('editor');
  const [copiedCurl, setCopiedCurl] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);
  const [copiedAnswer, setCopiedAnswer] = useState<boolean>(false);
  const [showConcurrentModal, setShowConcurrentModal] = useState<boolean>(false);
  const [showPresetsDropdown, setShowPresetsDropdown] = useState<boolean>(false);
  const presetsRef = useRef<HTMLDivElement>(null);

  // Sync selected model from JSON body on mount or change
  useEffect(() => {
    try {
      const parsed = JSON.parse(requestBody);
      if (parsed && parsed.model && parsed.model !== selectedModel) {
        setSelectedModel(parsed.model);
      }
    } catch {
      // ignore
    }
  }, [requestBody]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (presetsRef.current && !presetsRef.current.contains(e.target as Node)) {
        setShowPresetsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyChange = (val: string) => {
    setApiKey(val);
    localStorage.setItem('geminiApiKey', val);
  };

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName);
    try {
      const parsed = JSON.parse(requestBody);
      parsed.model = modelName;
      setRequestBody(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  };

  const handleToggleStreamInBody = () => {
    try {
      const parsed = JSON.parse(requestBody);
      parsed.stream = !parsed.stream;
      setRequestBody(JSON.stringify(parsed, null, 2));
    } catch {
      // ignore
    }
  };

  const isStreamChecked = (() => {
    try {
      const parsed = JSON.parse(requestBody);
      return parsed.stream === true;
    } catch {
      return false;
    }
  })();

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(requestBody);
      setRequestBody(JSON.stringify(parsed, null, 2));
    } catch (err: any) {
      alert(`${t('playground.alertInvalidJson')}${err.message}`);
    }
  };

  const handleResetJson = () => {
    setRequestBody(JSON.stringify(DEFAULT_PRESETS[endpointOption], null, 2));
  };

  const handleSelectPreset = (key: PresetKey) => {
    const preset = PRESETS[key];
    setRequestBody(JSON.stringify(preset, null, 2));
    setSelectedModel(preset.model || 'gemini-3.1-flash-lite');
    setEndpointOption('messages');
    setShowPresetsDropdown(false);
  };

  const handleEndpointOptionChange = (option: EndpointOption) => {
    setEndpointOption(option);
    if (option === 'messages' || option === 'count_tokens') {
      setRequestBody(JSON.stringify(DEFAULT_PRESETS[option], null, 2));
    }
  };

  const handleCopyCurl = () => {
    const origin = window.location.origin;
    let targetUrl = `${origin}/v1/messages`;
    let targetMethod = 'POST';

    if (endpointOption === 'count_tokens') {
      targetUrl = `${origin}/v1/messages/count_tokens`;
      targetMethod = 'POST';
    } else if (endpointOption === 'custom') {
      const cleanPath = customPath.startsWith('/') ? customPath : `/${customPath}`;
      targetUrl = `${origin}${cleanPath}`;
      targetMethod = customMethod;
    }

    const headers = [
      `-H "x-api-key: ${apiKey || 'YOUR_API_KEY'}"`,
      `-H "Content-Type: application/json"`
    ];

    let bodyFlag = '';
    if (targetMethod !== 'GET' && targetMethod !== 'HEAD' && requestBody.trim()) {
      const sanitizedBody = requestBody.replace(/'/g, "'\\''");
      bodyFlag = `-d '${sanitizedBody}'`;
    }

    const curlCmd = `curl -X ${targetMethod} "${targetUrl}" \\\n  ${headers.join(' \\\n  ')}${bodyFlag ? ` \\\n  ${bodyFlag}` : ''}`;

    navigator.clipboard.writeText(curlCmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleCopyResponse = () => {
    navigator.clipboard.writeText(responseRaw);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  // Extract structured message parts (text, thinking, tool calls) from response
  const parsedMessageView = useMemo(() => {
    let text = '';
    let thinking = '';
    const toolCalls: any[] = [];

    if (isStreamingActive && responseStreamChunks.length > 0) {
      for (const chunk of responseStreamChunks) {
        // Claude Stream delta
        if (chunk.type === 'content_block_delta') {
          if (chunk.delta?.type === 'text_delta') {
            text += chunk.delta.text || '';
          } else if (chunk.delta?.type === 'thinking_delta') {
            thinking += chunk.delta.thinking || '';
          }
        }
        // Gemini Stream parts
        if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.text) text += part.text;
            if (part.thought) thinking += part.thought;
            if (part.functionCall) toolCalls.push(part.functionCall);
          }
        }
      }
    } else if (responseJson) {
      // Claude Non-Stream format
      if (Array.isArray(responseJson.content)) {
        for (const block of responseJson.content) {
          if (block.type === 'text') {
            text += block.text || '';
          } else if (block.type === 'thinking') {
            thinking += block.thinking || '';
          } else if (block.type === 'tool_use') {
            toolCalls.push({ name: block.name, args: block.input });
          }
        }
      }
      // Gemini Non-Stream format
      if (responseJson.candidates && responseJson.candidates[0]?.content?.parts) {
        for (const part of responseJson.candidates[0].content.parts) {
          if (part.text) text += part.text;
          if (part.thought) thinking += part.thought;
          if (part.functionCall) toolCalls.push(part.functionCall);
        }
      }
      // Error format
      if (!text && responseJson.error) {
        text = typeof responseJson.error === 'string'
          ? responseJson.error
          : responseJson.error.message || JSON.stringify(responseJson.error, null, 2);
      }
    }

    return { text: text.trim(), thinking: thinking.trim(), toolCalls };
  }, [isStreamingActive, responseStreamChunks, responseJson]);

  const handleCopyAnswer = () => {
    const content = parsedMessageView.text || responseRaw;
    navigator.clipboard.writeText(content);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  const handleSend = async () => {
    if (!apiKey) {
      alert(t('playground.alertKeyRequired'));
      return;
    }

    let parsedPayload: any = null;
    try {
      if (requestBody.trim()) {
        parsedPayload = JSON.parse(requestBody);
      }
    } catch (err: any) {
      alert(`${t('playground.alertInvalidJson')}${err.message}`);
      return;
    }

    let targetUrl = '/v1/messages';
    let targetMethod = 'POST';

    if (endpointOption === 'count_tokens') {
      targetUrl = '/v1/messages/count_tokens';
      targetMethod = 'POST';
    } else if (endpointOption === 'custom') {
      targetUrl = customPath.startsWith('/') ? customPath : `/${customPath}`;
      targetMethod = customMethod;
    }

    setLoading(true);
    setResponseRaw(t('playground.connecting').replace('{method}', targetMethod).replace('{url}', targetUrl));
    setResponseJson(null);
    setResponseStreamChunks([]);
    setIsStreamingActive(false);
    setLatency(null);
    setStatusCode(null);
    setTokenCount(null);

    const startTime = Date.now();
    const isStream = targetMethod === 'POST' && parsedPayload && parsedPayload.stream === true;

    try {
      const fetchOptions: RequestInit = {
        method: targetMethod,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey
        }
      };

      if (targetMethod !== 'GET' && targetMethod !== 'HEAD' && parsedPayload !== null) {
        fetchOptions.body = JSON.stringify(parsedPayload);
      }

      const res = await fetch(targetUrl, fetchOptions);
      setStatusCode(res.status);
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
        let totalOutTokens = 0;

        setResponseRaw(t('playground.connectedStreaming'));

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
                  setResponseStreamChunks([...accumulatedChunks]);

                  if (chunk.usage?.output_tokens) {
                    totalOutTokens = chunk.usage.output_tokens;
                  } else if (chunk.usageMetadata?.candidatesTokenCount) {
                    totalOutTokens = chunk.usageMetadata.candidatesTokenCount;
                  }
                  if (totalOutTokens > 0) {
                    setTokenCount(totalOutTokens);
                  }
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
        if (data?.usage?.output_tokens) {
          setTokenCount(data.usage.output_tokens);
        } else if (data?.input_tokens) {
          setTokenCount(data.input_tokens);
        }
      }
    } catch (err: any) {
      setResponseRaw(`Connection Error:\n${err.message}`);
      setResponseJson({ error: 'Connection Error', details: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 space-y-4 flex flex-col font-sans min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
      {/* Top Controls Header Workbench */}
      <div className="ui-card p-3.5 flex flex-wrap items-center justify-between gap-3 relative z-30">
        {/* Left Side: Brand badge & Key input */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-inner shrink-0">
              <Terminal className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-xs font-bold text-white tracking-wide uppercase truncate">{t('playground.title')}</h2>
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">
                  v1.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">{t('playground.subtitle')}</p>
            </div>
          </div>

          <div className="h-6 w-[1px] bg-white/[0.08] mx-1 hidden lg:block" />

          {/* Gemini API Key input with icon */}
          <div className="relative flex items-center w-full sm:w-64 lg:w-48">
            <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder={t('playground.apiKeyPlaceholder')}
              className="ui-input pl-8 pr-2.5 py-1.5 w-full"
            />
          </div>
        </div>

        {/* Right Side: Workbench Selectors & Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          {/* Model Selector */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2.5 py-1 flex-1 sm:flex-none">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer"
            >
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
              <option value="gemini-pro-latest">gemini-pro-latest</option>
              <option value="gemini-flash-latest">gemini-flash-latest</option>
              <option value="gemini-flash-lite-latest">gemini-flash-lite-latest</option>
            </select>
          </div>

          {/* Endpoint selector */}
          <div className="flex items-center space-x-1.5 ui-card-sub px-2.5 py-1 flex-1 sm:flex-none">
            <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={endpointOption}
              onChange={(e) => handleEndpointOptionChange(e.target.value as EndpointOption)}
              className="w-full bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer"
            >
              <option value="messages">POST /v1/messages</option>
              <option value="count_tokens">POST /v1/messages/count_tokens</option>
              <option value="custom">{t('playground.customEndpoint')}</option>
            </select>

            {endpointOption === 'custom' && (
              <div className="flex items-center space-x-1 pl-1.5 border-l border-[var(--border-subtle)]">
                <select
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  className="bg-transparent text-xs text-indigo-500 dark:text-indigo-400 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="/v1/..."
                  className="ui-input py-0.5 px-2 text-xs font-mono w-28 sm:w-44"
                />
              </div>
            )}
          </div>

          {/* Stream Toggle Pill */}
          {endpointOption !== 'custom' && (
            <button
              type="button"
              onClick={handleToggleStreamInBody}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all border ${
                isStreamChecked
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                  : 'ui-btn-secondary text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle stream: true/false in payload"
            >
              <Zap className={`w-3 h-3 ${isStreamChecked ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span>Stream</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isStreamChecked ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
            </button>
          )}

          {/* Quick Fill Presets Dropdown */}
          {endpointOption !== 'custom' && (
            <div className="relative" ref={presetsRef}>
              <button
                onClick={() => setShowPresetsDropdown(!showPresetsDropdown)}
                className="px-2.5 py-1 ui-btn-secondary flex items-center space-x-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>{t('playground.presetsBtn')}</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              {showPresetsDropdown && (
                <div className="absolute right-0 mt-2 w-48 ui-card p-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/[0.06]">
                    {t('playground.presetsTitle')}
                  </div>
                  <button
                    onClick={() => handleSelectPreset('basicChat')}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{t('playground.presetBasicChat')}</span>
                  </button>
                  <button
                    onClick={() => handleSelectPreset('toolUse')}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Code className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t('playground.presetToolUse')}</span>
                  </button>
                  <button
                    onClick={() => handleSelectPreset('vision')}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('playground.presetVision')}</span>
                  </button>
                  <button
                    onClick={() => handleSelectPreset('thinkingMode')}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span>{t('playground.presetThinking')}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Copy cURL */}
          <button
            onClick={handleCopyCurl}
            className="px-2.5 py-1 ui-btn-secondary flex items-center space-x-1.5"
            title="Copy as cURL command"
          >
            {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
            <span>{copiedCurl ? t('playground.copied') : t('playground.copyCurl')}</span>
          </button>

          {/* Concurrent Test Modal Trigger */}
          <button
            onClick={() => {
              if (!apiKey) {
                alert(t('playground.alertKeyRequired'));
                return;
              }
              setShowConcurrentModal(true);
            }}
            className="px-3 py-1 ui-btn-secondary text-purple-300 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 flex items-center space-x-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>{t('playground.concurrentTest')}</span>
          </button>

          {/* Send Request Action Button */}
          <button
            onClick={handleSend}
            disabled={loading}
            className="px-4 py-1.5 ui-btn-primary flex items-center space-x-1.5 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t('playground.sending')}</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>{t('playground.runTest')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher (Editor vs Response) */}
      <div className="ui-tab-container md:hidden text-xs font-semibold">
        <button
          type="button"
          onClick={() => setMobileActiveTab('editor')}
          className={`ui-tab-pill flex-1 py-1.5 flex items-center justify-center space-x-1.5 ${
            mobileActiveTab === 'editor'
              ? 'ui-tab-pill-active'
              : ''
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>{t('playground.rawJsonRequest')}</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileActiveTab('response')}
          className={`ui-tab-pill flex-1 py-1.5 flex items-center justify-center space-x-1.5 ${
            mobileActiveTab === 'response'
              ? 'bg-emerald-600 text-white shadow-md'
              : ''
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('playground.responseOutput')}</span>
          {statusCode !== null && (
            <span className={`text-[9px] font-mono px-1 rounded ${
              statusCode >= 200 && statusCode < 300 ? 'bg-black/30 text-emerald-200' : 'bg-black/30 text-rose-200'
            }`}>
              {statusCode}
            </span>
          )}
        </button>
      </div>

      {/* Main Dual-Column Monaco Editor Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-[460px]">
        {/* Left Column: Request JSON Editor */}
        <div className={`ui-card p-3 sm:p-4 flex flex-col h-full overflow-hidden ${
          mobileActiveTab !== 'editor' ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.06]">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              <span className="font-bold text-indigo-400 text-xs uppercase tracking-wider">
                {t('playground.rawJsonRequest')}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/[0.05] border border-white/[0.08] text-slate-400">
                JSON
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleFormatJson}
                className="px-2.5 py-1 ui-btn-secondary text-[11px] flex items-center space-x-1"
                title="Format JSON payload"
              >
                <AlignLeft className="w-3 h-3 text-indigo-400" />
                <span>Format</span>
              </button>
              <button
                onClick={handleResetJson}
                className="px-2.5 py-1 ui-btn-secondary text-[11px] text-slate-400 hover:text-slate-200 flex items-center space-x-1"
                title="Reset to default payload"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
            <Editor
              height="100%"
              language="json"
              theme={monacoTheme}
              beforeMount={defineGeminiProxyTheme}
              value={requestBody}
              onChange={(val) => setRequestBody(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                automaticLayout: true,
                padding: { top: 10, bottom: 10 }
              }}
            />
          </div>
        </div>

        {/* Right Column: Response Preview Panel */}
        <div className={`ui-card p-3 sm:p-4 flex flex-col h-full overflow-hidden ${
          mobileActiveTab !== 'response' ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/[0.06] gap-2 min-w-0">
            {/* Left side: title and compact status badges */}
            <div className="flex items-center space-x-2 min-w-0 flex-wrap gap-y-1">
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                <span className="font-bold text-emerald-400 text-xs uppercase tracking-wider">
                  {t('playground.responseOutput')}
                </span>
              </div>

              {/* Status Code Badge */}
              {statusCode !== null && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border shrink-0 ${
                  statusCode >= 200 && statusCode < 300
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : statusCode === 429
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}>
                  {statusCode}
                </span>
              )}

              {/* Latency badge */}
              {latency !== null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center space-x-1 shrink-0">
                  <Clock className="w-2.5 h-2.5 text-purple-400" />
                  <span>{latency}ms</span>
                </span>
              )}

              {/* Token Counter badge */}
              {tokenCount !== null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center space-x-1 shrink-0">
                  <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                  <span>{tokenCount} tok</span>
                </span>
              )}
            </div>

            {/* Right side: Clean 2-Mode Toggle & Copy */}
            <div className="flex items-center space-x-2 shrink-0">
              <div className="ui-tab-container text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`ui-tab-pill px-2.5 py-1 text-[11px] flex items-center space-x-1.5 ${
                    viewMode === 'preview'
                      ? 'ui-tab-pill-active font-semibold'
                      : ''
                  }`}
                  title="Render clean preview output"
                >
                  <Eye className="w-3 h-3" />
                  <span>{t('playground.preview')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={`ui-tab-pill px-2.5 py-1 text-[11px] flex items-center space-x-1.5 ${
                    viewMode === 'raw'
                      ? 'ui-tab-pill-active font-semibold'
                      : ''
                  }`}
                  title="View raw transport string"
                >
                  <Code className="w-3 h-3" />
                  <span>{t('playground.rawText')}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyResponse}
                className="p-1.5 ui-btn-secondary shrink-0"
                title="Copy response body"
              >
                {copiedResponse ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--code-bg)] overflow-y-auto p-2 sm:p-3">
            {viewMode === 'preview' ? (
              isStreamingActive ? (
                <div className="p-1">
                  <SseStreamPreview streamData={responseStreamChunks} />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Thinking Process Bubble (if model returned thinking) */}
                  {parsedMessageView.thinking && (
                    <details className="bg-purple-950/25 border border-purple-800/40 rounded-xl p-3 text-purple-200 transition-all group open:shadow-inner" open>
                      <summary className="font-bold text-xs uppercase cursor-pointer text-purple-300 flex items-center justify-between select-none">
                        <div className="flex items-center space-x-2">
                          <Flame className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                          <span>{t('playground.thinkingProcess')}</span>
                        </div>
                        <span className="text-[10px] font-mono font-normal text-purple-400/80 bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-700/30">
                          {t('playground.thinkingChars').replace('{count}', String(parsedMessageView.thinking.length))}
                        </span>
                      </summary>
                      <div className="mt-2.5 font-mono text-xs text-purple-200 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto bg-purple-950/50 p-3 rounded-lg border border-purple-800/40">
                        {parsedMessageView.thinking}
                      </div>
                    </details>
                  )}

                  {/* Tool Calls Rendering */}
                  {parsedMessageView.toolCalls.length > 0 && (
                    <div className="space-y-2">
                      {parsedMessageView.toolCalls.map((tc, idx) => (
                        <div key={idx} className="bg-blue-950/20 border border-blue-800/40 rounded-xl p-3 space-y-1.5 font-mono text-xs">
                          <div className="flex items-center space-x-2 text-blue-300 font-bold">
                            <Code className="w-3.5 h-3.5 text-blue-400" />
                            <span>{t('playground.toolCall').replace('{name}', tc.name || 'unknown')}</span>
                          </div>
                          <div className="bg-black/10 dark:bg-[#0A0E1A] p-2.5 rounded-lg border border-blue-900/40 overflow-x-auto text-[11px] text-blue-700 dark:text-blue-200">
                            <pre>{JSON.stringify(tc.args || tc.input || {}, null, 2)}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Main Text Content */}
                  {parsedMessageView.text ? (
                    <div className="bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] font-sans text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-inner selection:bg-indigo-500 selection:text-white">
                      {parsedMessageView.text}
                    </div>
                  ) : responseJson ? (
                    <div className="p-1">
                      <JsonTreeView data={responseJson} />
                    </div>
                  ) : (
                    <div className="text-slate-500 font-mono text-xs italic p-4 text-center">
                      {responseRaw && responseRaw !== t('playground.initialResponse') ? responseRaw : t('playground.noContent')}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="flex-1 rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]">
                <Editor
                  height="100%"
                  language={responseRaw.startsWith('{') ? 'json' : 'plaintext'}
                  theme={monacoTheme}
                  beforeMount={defineGeminiProxyTheme}
                value={responseRaw}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 12,
                  scrollBeyondLastLine: false,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                  padding: { top: 10, bottom: 10 }
                }}
              />
            </div>
          )}
          </div>
        </div>
      </div>

      <ConcurrentTestModal
        isOpen={showConcurrentModal}
        onClose={() => setShowConcurrentModal(false)}
        targetUrl={endpointOption === 'count_tokens' ? '/v1/messages/count_tokens' : endpointOption === 'custom' ? (customPath.startsWith('/') ? customPath : `/${customPath}`) : '/v1/messages'}
        targetMethod={endpointOption === 'custom' ? customMethod : 'POST'}
        parsedPayload={requestBody.trim() ? (() => { try { return JSON.parse(requestBody); } catch { return null; } })() : null}
        apiKey={apiKey}
      />
    </div>
  );
}
