import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Languages,
  ArrowLeftRight,
  Sparkles,
  Zap,
  Code,
  BookOpen,
  Copy,
  Check,
  Square,
  Play,
  RefreshCw,
  Trash2,
  Clipboard,
  FileText,
  AlertCircle,
  Clock,
  RotateCcw,
  Eye,
  AlignLeft,
  ChevronDown,
  Layers,
  Sliders,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import {
  SUPPORTED_LANGUAGES,
  STYLE_PRESETS,
  detectLanguageClient,
  getLanguageName,
  buildTranslationSystemPrompt,
  StylePresetOption
} from '../utils/translateHelper';

export interface ModelTranslationResult {
  modelId: string;
  status: 'idle' | 'streaming' | 'success' | 'error';
  text: string;
  error?: string;
  durationMs: number;
  tokens: number;
  tokensPerSec: number;
  renderMarkdown: boolean;
  stopReason?: string;
}

const DEFAULT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-pro-latest'
];

export default function TranslateView({ adminKey }: { adminKey: string }) {
  const { lang, t } = useTranslation();
  const isZh = lang === 'zh';

  // Persistence / State setup
  const [sourceLang, setSourceLang] = useState<string>(() => {
    return localStorage.getItem('translate_source_lang') || 'auto';
  });
  const [targetLang, setTargetLang] = useState<string>(() => {
    return localStorage.getItem('translate_target_lang') || (isZh ? 'en' : 'zh');
  });
  const [style, setStyle] = useState<'standard' | 'technical' | 'academic' | 'polished'>(() => {
    const saved = localStorage.getItem('translate_style');
    return (saved as any) || 'standard';
  });
  const [compareMode, setCompareMode] = useState<boolean>(() => {
    return localStorage.getItem('translate_compare_mode') === 'true';
  });
  const [selectedSingleModel, setSelectedSingleModel] = useState<string>(() => {
    return localStorage.getItem('translate_single_model') || 'gemini-2.5-flash';
  });
  const [selectedCompareModels, setSelectedCompareModels] = useState<string[]>(() => {
    const saved = localStorage.getItem('translate_compare_models');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // fallback
      }
    }
    return ['gemini-2.5-flash', 'gemini-2.5-pro'];
  });

  const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_MODELS);
  const [sourceText, setSourceText] = useState<string>('');
  const [detectedLang, setDetectedLang] = useState<string>('en');

  // Results per model
  const [results, setResults] = useState<Record<string, ModelTranslationResult>>({});

  // UI helpers
  const [copiedSource, setCopiedSource] = useState<boolean>(false);
  const [copiedTarget, setCopiedTarget] = useState<Record<string, boolean>>({});
  const [showStyleDropdown, setShowStyleDropdown] = useState<boolean>(false);
  const [showModelDropdown, setShowModelDropdown] = useState<boolean>(false);

  // Controllers map for streaming cancellation
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // Save options to localStorage on change
  useEffect(() => {
    localStorage.setItem('translate_source_lang', sourceLang);
  }, [sourceLang]);

  useEffect(() => {
    localStorage.setItem('translate_target_lang', targetLang);
  }, [targetLang]);

  useEffect(() => {
    localStorage.setItem('translate_style', style);
  }, [style]);

  useEffect(() => {
    localStorage.setItem('translate_compare_mode', String(compareMode));
  }, [compareMode]);

  useEffect(() => {
    localStorage.setItem('translate_single_model', selectedSingleModel);
  }, [selectedSingleModel]);

  useEffect(() => {
    localStorage.setItem('translate_compare_models', JSON.stringify(selectedCompareModels));
  }, [selectedCompareModels]);

  // Fetch models list from API if available
  useEffect(() => {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/models', { headers })
      .then(r => r.json())
      .then(data => {
        if (data && data.mappings) {
          const mappingKeys = Object.keys(data.mappings);
          const mappingValues = Object.values(data.mappings).map((v: any) =>
            typeof v === 'string' ? v : v?.target
          ).filter(Boolean);
          const merged = Array.from(new Set([...DEFAULT_MODELS, ...mappingKeys, ...mappingValues]));
          setAvailableModels(merged);
        }
      })
      .catch(() => {
        // Keep default models
      });
  }, [adminKey]);

  // Detect language whenever sourceText changes
  useEffect(() => {
    if (!sourceText.trim()) {
      setDetectedLang('en');
      return;
    }
    const detected = detectLanguageClient(sourceText);
    setDetectedLang(detected);
  }, [sourceText]);

  // Active models list based on mode
  const activeModelIds = useMemo(() => {
    if (compareMode) {
      return selectedCompareModels.length > 0 ? selectedCompareModels : [selectedSingleModel];
    }
    return [selectedSingleModel];
  }, [compareMode, selectedSingleModel, selectedCompareModels]);

  // Determine if any active stream is running
  const isAnyStreaming = useMemo(() => {
    return Object.values(results).some(r => r.status === 'streaming');
  }, [results]);

  // Swap languages
  const handleSwapLanguages = () => {
    let newSource = targetLang;
    let newTarget = sourceLang;

    if (sourceLang === 'auto') {
      newSource = targetLang;
      newTarget = detectedLang;
    }

    setSourceLang(newSource);
    setTargetLang(newTarget);
  };

  // Single Model selection toggle
  const handleSelectSingleModel = (m: string) => {
    setSelectedSingleModel(m);
    setShowModelDropdown(false);
  };

  // Compare mode model toggle
  const handleToggleCompareModel = (m: string) => {
    if (selectedCompareModels.includes(m)) {
      if (selectedCompareModels.length > 1) {
        setSelectedCompareModels(selectedCompareModels.filter(id => id !== m));
      }
    } else {
      if (selectedCompareModels.length < 3) {
        setSelectedCompareModels([...selectedCompareModels, m]);
      }
    }
  };

  // Stop single model stream
  const handleStopModel = (modelId: string) => {
    const controller = controllersRef.current.get(modelId);
    if (controller) {
      controller.abort();
      controllersRef.current.delete(modelId);
    }
    setResults(prev => {
      const existing = prev[modelId];
      if (!existing) return prev;
      return {
        ...prev,
        [modelId]: {
          ...existing,
          status: existing.text ? 'success' : 'idle'
        }
      };
    });
  };

  // Stop all streaming requests
  const handleStopAll = () => {
    controllersRef.current.forEach(controller => controller.abort());
    controllersRef.current.clear();
    setResults(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(id => {
        if (updated[id].status === 'streaming') {
          updated[id] = {
            ...updated[id],
            status: updated[id].text ? 'success' : 'idle'
          };
        }
      });
      return updated;
    });
  };

  // Single model translation executor
  const translateSingleModel = async (modelId: string, systemPrompt: string, promptText: string) => {
    // Abort existing controller if running
    if (controllersRef.current.has(modelId)) {
      controllersRef.current.get(modelId)?.abort();
    }

    const controller = new AbortController();
    controllersRef.current.set(modelId, controller);

    const startTime = Date.now();

    setResults(prev => ({
      ...prev,
      [modelId]: {
        modelId,
        status: 'streaming',
        text: '',
        durationMs: 0,
        tokens: 0,
        tokensPerSec: 0,
        renderMarkdown: prev[modelId]?.renderMarkdown ?? true
      }
    }));

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (adminKey) {
        headers['x-admin-key'] = adminKey;
      }

      const response = await fetch('/v1/messages', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: promptText }],
          system: systemPrompt,
          temperature: 0.3,
          max_tokens: 4096,
          stream: true
        })
      });

      if (!response.ok) {
        let errText = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson.error?.message) {
            errText = errJson.error.message;
          } else if (errJson.error) {
            errText = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
          }
        } catch (e) {
          // fallback to status text
        }
        throw new Error(errText);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';
      let accumulatedTokens = 0;
      let stopReason = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              accumulatedText += parsed.delta.text;
            } else if (parsed.type === 'message_delta') {
              if (parsed.usage?.output_tokens) {
                accumulatedTokens = parsed.usage.output_tokens;
              }
              if (parsed.delta?.stop_reason) {
                stopReason = parsed.delta.stop_reason;
              }
            } else if (parsed.type === 'message_start' && parsed.message?.usage?.output_tokens) {
              accumulatedTokens = parsed.message.usage.output_tokens;
            }

            const now = Date.now();
            const durationMs = Math.max(1, now - startTime);
            const tokensPerSec = Number((accumulatedTokens / (durationMs / 1000)).toFixed(1));

            setResults(prev => ({
              ...prev,
              [modelId]: {
                ...prev[modelId],
                text: accumulatedText,
                tokens: accumulatedTokens,
                durationMs,
                tokensPerSec,
                stopReason: stopReason || prev[modelId]?.stopReason
              }
            }));
          } catch (e) {
            // ignore JSON parse errors in chunks
          }
        }
      }

      const finalDuration = Math.max(1, Date.now() - startTime);
      const finalTokPerSec = Number((accumulatedTokens / (finalDuration / 1000)).toFixed(1));

      setResults(prev => ({
        ...prev,
        [modelId]: {
          ...prev[modelId],
          status: 'success',
          text: accumulatedText,
          durationMs: finalDuration,
          tokens: accumulatedTokens,
          tokensPerSec: finalTokPerSec,
          stopReason
        }
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const finalDuration = Math.max(1, Date.now() - startTime);
        setResults(prev => {
          const existing = prev[modelId];
          return {
            ...prev,
            [modelId]: {
              ...existing,
              status: existing?.text ? 'success' : 'idle',
              durationMs: finalDuration
            }
          };
        });
      } else {
        const finalDuration = Math.max(1, Date.now() - startTime);
        setResults(prev => ({
          ...prev,
          [modelId]: {
            ...prev[modelId],
            status: 'error',
            error: err.message || 'Translation request failed',
            durationMs: finalDuration
          }
        }));
      }
    } finally {
      controllersRef.current.delete(modelId);
    }
  };

  // Main Translate Action
  const handleTranslate = () => {
    if (!sourceText.trim()) return;

    const targets = activeModelIds;
    if (targets.length === 0) return;

    const systemPrompt = buildTranslationSystemPrompt(sourceLang, targetLang, style);

    targets.forEach(modelId => {
      translateSingleModel(modelId, systemPrompt, sourceText);
    });
  };

  // Global keyboard shortcut: Cmd/Ctrl + Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isAnyStreaming) {
        handleStopAll();
      } else {
        handleTranslate();
      }
    }
  };

  // Copy Source text
  const handleCopySource = () => {
    if (!sourceText) return;
    navigator.clipboard.writeText(sourceText);
    setCopiedSource(true);
    setTimeout(() => setCopiedSource(false), 2000);
  };

  // Clear Source text and results
  const handleClear = () => {
    handleStopAll();
    setSourceText('');
    setResults({});
  };

  // Paste into source text
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setSourceText(text);
      }
    } catch (e) {
      // ignore clipboard permission error
    }
  };

  // Copy Target text for specific model
  const handleCopyTarget = (modelId: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTarget(prev => ({ ...prev, [modelId]: true }));
    setTimeout(() => {
      setCopiedTarget(prev => ({ ...prev, [modelId]: false }));
    }, 2000);
  };

  // Toggle Markdown vs Raw view for a card
  const toggleRenderMode = (modelId: string) => {
    setResults(prev => {
      const cur = prev[modelId];
      if (!cur) return prev;
      return {
        ...prev,
        [modelId]: {
          ...cur,
          renderMarkdown: !cur.renderMarkdown
        }
      };
    });
  };

  // Word & character counts
  const charCount = sourceText.length;
  const wordCount = useMemo(() => {
    if (!sourceText.trim()) return 0;
    return sourceText.trim().split(/\s+/).filter(Boolean).length;
  }, [sourceText]);

  const currentStyleObj = STYLE_PRESETS.find(s => s.id === style) || STYLE_PRESETS[0];

  const renderStyleIcon = (iconName: string) => {
    switch (iconName) {
      case 'Code': return <Code className="w-3.5 h-3.5" />;
      case 'BookOpen': return <BookOpen className="w-3.5 h-3.5" />;
      case 'Sparkles': return <Sparkles className="w-3.5 h-3.5" />;
      case 'Zap':
      default: return <Zap className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="w-full flex-1 space-y-4 flex flex-col font-sans h-full min-h-[600px] md:h-[calc(100dvh-6.5rem)] overflow-hidden">
      {/* Top Controls Header Workbench */}
      <div className="ui-card p-3.5 flex flex-wrap items-center justify-between gap-3 relative z-30 shrink-0">
        {/* Left Controls: Language Selectors & Swap */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source Language Select */}
          <div className="relative">
            <select
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
              className="appearance-none ui-input pr-8 py-2 cursor-pointer font-sans"
            >
              {SUPPORTED_LANGUAGES.map(langOpt => (
                <option key={langOpt.code} value={langOpt.code}>
                  {isZh ? langOpt.name : langOpt.enName}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwapLanguages}
            title={t('translate.swapLanguage')}
            className="p-2 ui-btn-secondary flex items-center justify-center"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
          </button>

          {/* Target Language Select */}
          <div className="relative">
            <select
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
              className="appearance-none ui-input pr-8 py-2 cursor-pointer font-sans"
            >
              {SUPPORTED_LANGUAGES.filter(l => l.code !== 'auto').map(langOpt => (
                <option key={langOpt.code} value={langOpt.code}>
                  {isZh ? langOpt.name : langOpt.enName}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="h-4 w-[1px] bg-white/10 mx-1 hidden sm:block" />

          {/* Style Preset Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStyleDropdown(!showStyleDropdown)}
              className="flex items-center gap-1.5 ui-btn-secondary px-3 py-2"
            >
              <span className="text-indigo-400">{renderStyleIcon(currentStyleObj.iconName)}</span>
              <span>{isZh ? currentStyleObj.name : currentStyleObj.enName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showStyleDropdown && (
              <div
                className="absolute left-0 mt-1.5 w-64 ui-card p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setShowStyleDropdown(false)}
              >
                {STYLE_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setStyle(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-start gap-2.5 transition ${
                      style === p.id
                        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-300 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className="mt-0.5 text-indigo-400">{renderStyleIcon(p.iconName)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{isZh ? p.name : p.enName}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                        {isZh ? p.desc : p.enDesc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Controls: Mode Toggle, Model Selector & Translate Action */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mode Switcher: Single vs Compare */}
          <div className="ui-tab-container text-xs">
            <button
              onClick={() => setCompareMode(false)}
              className={`ui-tab-pill ${
                !compareMode
                  ? 'ui-tab-pill-active font-semibold'
                  : ''
              }`}
            >
              {t('translate.singleModel')}
            </button>
            <button
              onClick={() => setCompareMode(true)}
              className={`ui-tab-pill flex items-center gap-1 ${
                compareMode
                  ? 'ui-tab-pill-active font-semibold'
                  : ''
              }`}
            >
              <Layers className="w-3 h-3" />
              {t('translate.compareModels')}
            </button>
          </div>

          {/* Model Selector based on mode */}
          {!compareMode ? (
            /* Single Model Dropdown */
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-1.5 ui-btn-secondary px-3 py-2 font-mono"
              >
                <span className="text-purple-400">⚡</span>
                <span>{selectedSingleModel}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showModelDropdown && (
                <div
                  className="absolute right-0 mt-1.5 w-56 ui-card p-1.5 z-50 max-h-60 overflow-y-auto"
                  onClick={() => setShowModelDropdown(false)}
                >
                  {availableModels.map(m => (
                    <button
                      key={m}
                      onClick={() => handleSelectSingleModel(m)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition flex items-center justify-between ${
                        selectedSingleModel === m
                          ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                          : 'text-slate-300 hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{m}</span>
                      {selectedSingleModel === m && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Multi Model Comparison Pills */
            <div className="flex items-center gap-1 ui-tab-container max-w-xs overflow-x-auto p-1">
              {availableModels.slice(0, 5).map(m => {
                const isSelected = selectedCompareModels.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => handleToggleCompareModel(m)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono transition whitespace-nowrap ${
                      isSelected
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {m.replace('gemini-', '')}
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Action Button: Translate vs Stop All */}
          {isAnyStreaming ? (
            <button
              onClick={handleStopAll}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-red-500/10 active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t('translate.stopAll')}</span>
            </button>
          ) : (
            <button
              onClick={handleTranslate}
              disabled={!sourceText.trim()}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl transition ${
                sourceText.trim()
                  ? 'ui-btn-primary cursor-pointer'
                  : 'bg-white/5 text-slate-500 border border-white/5 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{t('translate.translateBtn')}</span>
              <span className="text-[10px] opacity-70 bg-black/20 px-1 rounded ml-1 font-mono">⌘↵</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Left Panel: Source Text Area */}
        <div className="ui-card flex flex-col h-full overflow-hidden">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-xs font-medium text-slate-400 shrink-0">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4 text-indigo-400" />
              <span>{t('translate.sourceLanguage')}</span>
              {sourceLang === 'auto' && sourceText.trim() && (
                <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full text-[10px]">
                  {t('translate.detectedAs')}: {getLanguageName(detectedLang, isZh)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handlePaste}
                title={t('translate.paste')}
                className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-slate-200 rounded-lg transition"
              >
                <Clipboard className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCopySource}
                disabled={!sourceText}
                title={t('translate.copySource')}
                className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-slate-200 rounded-lg transition disabled:opacity-30"
              >
                {copiedSource ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleClear}
                disabled={!sourceText}
                title={t('translate.clear')}
                className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-rose-400 rounded-lg transition disabled:opacity-30"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Textarea */}
          <div className="flex-1 p-4 relative flex flex-col min-h-0">
            <textarea
              value={sourceText}
              onChange={e => setSourceText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('translate.sourcePlaceholder')}
              className="w-full flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-sm leading-relaxed resize-none focus:outline-none font-sans overflow-y-auto"
            />
          </div>

          {/* Footer Bar */}
          <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500 font-mono shrink-0">
            <div>
              {charCount} {t('translate.characters')} · {wordCount} {t('translate.words')}
            </div>
            <div className="text-slate-500">
              {sourceLang === 'auto' ? `Auto → ${getLanguageName(targetLang, isZh)}` : `${getLanguageName(sourceLang, isZh)} → ${getLanguageName(targetLang, isZh)}`}
            </div>
          </div>
        </div>

        {/* Right Panel: Target Results (Single or Compare Cards) */}
        <div className="flex flex-col h-full min-h-0 overflow-hidden">
          <div
            className={`grid gap-4 flex-1 min-h-0 overflow-y-auto ${
              compareMode && activeModelIds.length > 1
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            {activeModelIds.map(modelId => {
              const res: ModelTranslationResult = results[modelId] || {
                modelId,
                status: 'idle',
                text: '',
                durationMs: 0,
                tokens: 0,
                tokensPerSec: 0,
                renderMarkdown: true
              };

              return (
                <div
                  key={modelId}
                  className="flex flex-col h-full overflow-hidden ui-card min-h-[300px]"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-xs font-medium shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-indigo-300 font-semibold">{modelId}</span>

                      {/* Status indicator */}
                      {res.status === 'streaming' && (
                        <span className="flex items-center gap-1.5 text-indigo-400 text-[11px]">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                          </span>
                          {t('translate.translating')}
                        </span>
                      )}

                      {res.status === 'success' && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      )}

                      {res.status === 'error' && (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      )}
                    </div>

                    {/* Header Controls & Metrics */}
                    <div className="flex items-center gap-3">
                      {res.durationMs > 0 && (
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                          <span>{(res.durationMs / 1000).toFixed(1)}s</span>
                          {res.tokensPerSec > 0 && <span>· {res.tokensPerSec} tok/s</span>}
                        </div>
                      )}

                      {/* Toggle Markdown / Raw */}
                      <button
                        onClick={() => toggleRenderMode(modelId)}
                        title={res.renderMarkdown ? t('translate.renderRaw') : t('translate.renderMarkdown')}
                        className={`p-1 rounded-lg text-[11px] font-mono flex items-center gap-1 border transition ${
                          res.renderMarkdown
                            ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                            : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'
                        }`}
                      >
                        {res.renderMarkdown ? <Eye className="w-3 h-3" /> : <AlignLeft className="w-3 h-3" />}
                        <span className="hidden sm:inline">
                          {res.renderMarkdown ? 'MD' : 'RAW'}
                        </span>
                      </button>

                      {/* Individual stop button */}
                      {res.status === 'streaming' && (
                        <button
                          onClick={() => handleStopModel(modelId)}
                          title={t('translate.stop')}
                          className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="flex-1 min-h-0 p-4 overflow-y-auto">
                    {res.status === 'idle' && !res.text && (
                      <div className="h-full flex items-center justify-center text-slate-600 text-sm font-sans italic">
                        {t('translate.targetPlaceholder')}
                      </div>
                    )}

                    {res.status === 'error' && !res.text && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertCircle className="w-4 h-4 text-rose-400" />
                          <span>{t('translate.requestFailed')}</span>
                        </div>
                        <div className="font-mono text-[11px] opacity-90 break-words">{res.error}</div>
                        <button
                          onClick={() => {
                            const systemPrompt = buildTranslationSystemPrompt(sourceLang, targetLang, style);
                            translateSingleModel(modelId, systemPrompt, sourceText);
                          }}
                          className="mt-1 self-start flex items-center gap-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 px-3 py-1 rounded-lg text-xs transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{t('translate.retry')}</span>
                        </button>
                      </div>
                    )}

                    {res.text && (
                      <div className="text-slate-100 text-sm leading-relaxed font-sans">
                        {res.renderMarkdown ? (
                          <div className="prose dark:prose-invert max-w-none prose-p:my-2 prose-pre:bg-[var(--code-bg)] prose-pre:text-[var(--code-text)] prose-pre:border prose-pre:border-[var(--border-subtle)] prose-pre:p-3 prose-pre:rounded-lg text-[var(--text-primary)]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{res.text}</ReactMarkdown>
                          </div>
                        ) : (
                          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed break-words">
                            {res.text}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Truncated Warning Banner */}
                  {res.stopReason === 'max_tokens' && (
                    <div className="px-4 py-1.5 bg-amber-500/10 border-t border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{t('translate.truncatedWarning')}</span>
                    </div>
                  )}

                  {/* Card Footer */}
                  <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-500 font-mono shrink-0">
                    <div>
                      {res.tokens > 0 ? `${res.tokens} tokens` : ''}
                    </div>

                    <button
                      onClick={() => handleCopyTarget(modelId, res.text)}
                      disabled={!res.text}
                      className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition disabled:opacity-30"
                    >
                      {copiedTarget[modelId] ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">{t('translate.copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t('translate.copy')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
