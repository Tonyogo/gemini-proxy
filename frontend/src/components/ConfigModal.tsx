import React, { useEffect, useState } from 'react';
import {
  Settings,
  Sliders,
  Globe,
  FileCode,
  ArrowRightLeft,
  ShieldCheck,
  Zap,
  Trash2,
  Plus,
  RefreshCw,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  Code,
  List,
  Sparkles,
  Info
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminKey: string;
  onSaved?: () => void;
}

interface MappingEntry {
  id: string;
  source: string;
  target: string;
  strategy?: string;
}

type TabType = 'general' | 'upstream' | 'instructions' | 'mappings' | 'security';

const VALID_CONFIG_TABS: TabType[] = ['general', 'upstream', 'instructions', 'mappings', 'security'];

export default function ConfigModal({ isOpen, onClose, adminKey, onSaved }: ConfigModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem('admin_config_tab') as TabType;
    return VALID_CONFIG_TABS.includes(saved) ? saved : 'general';
  });

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    localStorage.setItem('admin_config_tab', tabId);
  };

  const [systemRoleToInstruction, setSystemRoleToInstruction] = useState<boolean>(false);
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');
  const [logRetentionDays, setLogRetentionDays] = useState<number>(3);
  const [countTokensModel, setCountTokensModel] = useState<string>('');
  const [ephemeralUserMessagesText, setEphemeralUserMessagesText] = useState<string>('');
  const [ephemeralSystemMessagesText, setEphemeralSystemMessagesText] = useState<string>('');

  // KV Editor and Raw JSON Sync States
  const [mappingEntries, setMappingEntries] = useState<MappingEntry[]>([]);
  const [modelMappingsRaw, setModelMappingsRaw] = useState<string>('{}');
  const [showAdvancedJson, setShowAdvancedJson] = useState<boolean>(false);
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const fetchConfig = () => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/status', { headers })
      .then(r => r.json())
      .then(data => {
        if (data?.config) {
          setSystemRoleToInstruction(Boolean(data.config.systemRoleToInstruction));
          setCustomSystemInstruction(data.config.customSystemInstruction || '');
          setUpstreamTimeoutMs(data.config.upstreamTimeoutMs || 180000);
          setLogLevel(data.config.logLevel || 'info');
          setLogRetentionDays(data.config.logRetentionDays || 3);
          setCountTokensModel(data.config.countTokensModel || '');
          const userMsgs = Array.isArray(data.config.ephemeralUserMessages)
            ? data.config.ephemeralUserMessages.join('\n')
            : '';
          const sysMsgs = Array.isArray(data.config.ephemeralSystemMessages)
            ? data.config.ephemeralSystemMessages.join('\n')
            : '';
          setEphemeralUserMessagesText(userMsgs);
          setEphemeralSystemMessagesText(sysMsgs);

          const mappings = data.config.modelMappings || {};
          setModelMappingsRaw(JSON.stringify(mappings, null, 2));
          const entries: MappingEntry[] = Object.entries(mappings).map(([source, val]) => {
            if (Array.isArray(val)) {
              return {
                id: Math.random().toString(36).substring(2, 9),
                source,
                target: val.join(', '),
                strategy: ''
              };
            }
            if (val && typeof val === 'object') {
              if ('targets' in val && Array.isArray((val as any).targets)) {
                const targetObj = val as { targets: string[]; strategy?: string };
                return {
                  id: Math.random().toString(36).substring(2, 9),
                  source,
                  target: targetObj.targets.join(', '),
                  strategy: targetObj.strategy || ''
                };
              }
              if ('target' in val) {
                const targetObj = val as { target: string; strategy?: string };
                return {
                  id: Math.random().toString(36).substring(2, 9),
                  source,
                  target: String(targetObj.target || ''),
                  strategy: targetObj.strategy || ''
                };
              }
            }
            return {
              id: Math.random().toString(36).substring(2, 9),
              source,
              target: String(val || ''),
              strategy: ''
            };
          });
          setMappingEntries(entries);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchConfig();
  }, [isOpen, adminKey]);

  if (!isOpen) return null;

  const updateRawFromEntries = (entries: MappingEntry[]) => {
    const obj: Record<string, any> = {};
    for (const e of entries) {
      if (e.source.trim()) {
        const targetTrimmed = e.target.trim();
        const strategyTrimmed = e.strategy?.trim();

        if (targetTrimmed.includes(',')) {
          const parts = targetTrimmed.split(',').map(s => s.trim()).filter(Boolean);
          if (parts.length > 1) {
            if (strategyTrimmed) {
              obj[e.source.trim()] = {
                targets: parts,
                strategy: strategyTrimmed
              };
            } else {
              obj[e.source.trim()] = parts;
            }
          } else if (parts.length === 1) {
            if (strategyTrimmed) {
              obj[e.source.trim()] = {
                target: parts[0],
                strategy: strategyTrimmed
              };
            } else {
              obj[e.source.trim()] = parts[0];
            }
          }
        } else {
          if (strategyTrimmed) {
            obj[e.source.trim()] = {
              target: targetTrimmed,
              strategy: strategyTrimmed
            };
          } else {
            obj[e.source.trim()] = targetTrimmed;
          }
        }
      }
    }
    setModelMappingsRaw(JSON.stringify(obj, null, 2));
  };

  const handleAddMapping = () => {
    const newEntries: MappingEntry[] = [
      ...mappingEntries,
      { id: Math.random().toString(36).substring(2, 9), source: '', target: '', strategy: '' }
    ];
    setMappingEntries(newEntries);
    updateRawFromEntries(newEntries);
  };

  const handleRemoveMapping = (id: string) => {
    const newEntries = mappingEntries.filter(e => e.id !== id);
    setMappingEntries(newEntries);
    updateRawFromEntries(newEntries);
  };

  const handleEntryChange = (id: string, field: 'source' | 'target' | 'strategy', value: string) => {
    const newEntries = mappingEntries.map(e => e.id === id ? { ...e, [field]: value } : e);
    setMappingEntries(newEntries);
    updateRawFromEntries(newEntries);
  };

  const handleToggleHigh = (id: string, target: string) => {
    const trimmed = target.trim();
    const newTarget = trimmed.endsWith('-high') ? trimmed.slice(0, -5) : (trimmed ? `${trimmed}-high` : '');
    handleEntryChange(id, 'target', newTarget);
  };

  const handleRawJsonChange = (val: string) => {
    setModelMappingsRaw(val);
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) {
        const entries: MappingEntry[] = Object.entries(parsed).map(([source, mappingVal]) => {
          if (Array.isArray(mappingVal)) {
            return {
              id: Math.random().toString(36).substring(2, 9),
              source,
              target: mappingVal.join(', '),
              strategy: ''
            };
          }
          if (mappingVal && typeof mappingVal === 'object') {
            if ('targets' in mappingVal && Array.isArray((mappingVal as any).targets)) {
              const targetObj = mappingVal as { targets: string[]; strategy?: string };
              return {
                id: Math.random().toString(36).substring(2, 9),
                source,
                target: targetObj.targets.join(', '),
                strategy: targetObj.strategy || ''
              };
            }
            if ('target' in mappingVal) {
              const targetObj = mappingVal as { target: string; strategy?: string };
              return {
                id: Math.random().toString(36).substring(2, 9),
                source,
                target: String(targetObj.target || ''),
                strategy: targetObj.strategy || ''
              };
            }
          }
          return {
            id: Math.random().toString(36).substring(2, 9),
            source,
            target: String(mappingVal || ''),
            strategy: ''
          };
        });
        setMappingEntries(entries);
      }
    } catch {
      // Ignore JSON parse error while user is typing
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    let parsedMappings = {};
    try {
      parsedMappings = JSON.parse(modelMappingsRaw);
    } catch (err: any) {
      alert(`${t('config.alertInvalidJson')}${err.message}`);
      return;
    }

    setSaving(true);
    setToast('');

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {})
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemRoleToInstruction,
          customSystemInstruction,
          upstreamTimeoutMs,
          logLevel,
          logRetentionDays,
          countTokensModel,
          ephemeralUserMessages: ephemeralUserMessagesText.split('\n').map(s => s.trim()).filter(Boolean),
          ephemeralSystemMessages: ephemeralSystemMessagesText.split('\n').map(s => s.trim()).filter(Boolean),
          modelMappings: parsedMappings
        })
      });

      if (res.ok) {
        setToast(t('config.toastSaved'));
        if (onSaved) onSaved();
        setTimeout(() => {
          setToast('');
        }, 2000);
      } else {
        alert(t('config.alertSaveFail'));
      }
    } catch (err: any) {
      alert(`${t('config.alertSaveError')}${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToEnv = async () => {
    if (window.confirm(t('config.confirmReset'))) {
      setSaving(true);
      setToast('');
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        ...(adminKey ? { 'x-admin-key': adminKey } : {})
      };
      try {
        const res = await fetch('/api/admin/config', {
          method: 'POST',
          headers,
          body: JSON.stringify({ resetToEnv: true })
        });
        if (res.ok) {
          setToast(t('config.toastReset'));
          if (onSaved) onSaved();
          fetchConfig();
          setTimeout(() => {
            setToast('');
          }, 2000);
        } else {
          alert(t('config.alertResetFail'));
        }
      } catch (err: any) {
        alert(`${t('config.alertResetError')}${err.message}`);
      } finally {
        setSaving(false);
      }
    }
  };

  const TABS = [
    { id: 'general', label: t('config.tabGeneral'), icon: Sliders },
    { id: 'upstream', label: t('config.tabUpstream'), icon: Globe },
    { id: 'instructions', label: t('config.tabInstructions'), icon: FileCode },
    { id: 'mappings', label: t('config.tabMappings'), icon: ArrowRightLeft },
    { id: 'security', label: t('config.tabSecurity'), icon: ShieldCheck }
  ];

  return (
    <div className="backdrop-blur-xl bg-black/60 fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-[#0F1118] border border-white/[0.1] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[92vh] sm:h-auto sm:max-h-[90vh]">
        {/* Mobile Drag Handle Pill */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto my-1.5 block sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-white/[0.08] bg-[#121520] shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-inner shrink-0">
              <Settings className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2 truncate">
                <span>{t('config.modalTitle')}</span>
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">{t('config.modalSub')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-white/[0.05] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Linear Styled Tab Pills */}
        <div className="flex items-center space-x-1.5 px-3 sm:px-6 py-2 sm:py-2.5 border-b border-white/[0.06] bg-[#0A0C12] overflow-x-auto scrollbar-none shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id as TabType)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 sm:space-x-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body Form */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-3 flex-1">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span>{t('config.loading')}</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-4 sm:space-y-5">
              {toast && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs text-center font-bold flex items-center justify-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{toast}</span>
                </div>
              )}

              {/* TAB 1: General & Logs */}
              {activeTab === 'general' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t('config.generalGroup')}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">LOG_LEVEL</label>
                        <select
                          value={logLevel}
                          onChange={(e) => setLogLevel(e.target.value)}
                          className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        >
                          <option value="error">{t('config.logLevelError')}</option>
                          <option value="warn">{t('config.logLevelWarn')}</option>
                          <option value="info">{t('config.logLevelInfo')}</option>
                          <option value="debug">{t('config.logLevelDebug')}</option>
                        </select>
                        <p className="text-[10px] text-slate-400">{t('config.logLevelDesc')}</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">LOG_RETENTION_DAYS</label>
                        <input
                          type="number"
                          value={logRetentionDays}
                          onChange={(e) => setLogRetentionDays(parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        />
                        <p className="text-[10px] text-slate-400">{t('config.logRetentionDesc')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Proxy & Upstream */}
              {activeTab === 'upstream' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                      <Globe className="w-3.5 h-3.5 text-blue-400" />
                      <span>{t('config.upstreamGroup')}</span>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">UPSTREAM_TIMEOUT_MS</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={upstreamTimeoutMs}
                            onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10) || 0)}
                            className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">ms</span>
                        </div>
                        <p className="text-[10px] text-slate-400">{t('config.upstreamTimeoutDesc')}</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">COUNT_TOKENS_MODEL</label>
                        <input
                          type="text"
                          value={countTokensModel}
                          onChange={(e) => setCountTokensModel(e.target.value)}
                          placeholder="e.g. gemini-2.5-flash (Leave blank to use request model)"
                          className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                        />
                        <p className="text-[10px] text-slate-400">{t('config.countTokensDesc')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: System Instruction & Ephemeral Rules */}
              {activeTab === 'instructions' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('config.translationGroup')}</span>
                    </div>

                    {/* Refined Toggle Switch */}
                    <div className="bg-[#151824] p-3.5 sm:p-4 rounded-xl border border-white/[0.06] flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">SYSTEM_ROLE_TO_INSTRUCTION</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{t('config.systemRoleDesc')}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSystemRoleToInstruction(!systemRoleToInstruction)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          systemRoleToInstruction ? 'bg-emerald-500' : 'bg-slate-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            systemRoleToInstruction ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-200 block">CUSTOM_SYSTEM_INSTRUCTION</label>
                      <textarea
                        rows={2}
                        value={customSystemInstruction}
                        onChange={(e) => setCustomSystemInstruction(e.target.value)}
                        placeholder={t('config.customInstructionPlaceholder')}
                        className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-200 block">EPHEMERAL_USER_MESSAGES</label>
                      <textarea
                        rows={2}
                        value={ephemeralUserMessagesText}
                        onChange={(e) => setEphemeralUserMessagesText(e.target.value)}
                        placeholder={t('config.ephemeralUserMessagesPlaceholder')}
                        className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
                      />
                      <p className="text-[10px] text-slate-400">{t('config.ephemeralUserMessagesDesc')}</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-200 block">EPHEMERAL_SYSTEM_MESSAGES</label>
                      <textarea
                        rows={2}
                        value={ephemeralSystemMessagesText}
                        onChange={(e) => setEphemeralSystemMessagesText(e.target.value)}
                        placeholder={t('config.ephemeralSystemMessagesPlaceholder')}
                        className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed"
                      />
                      <p className="text-[10px] text-slate-400">{t('config.ephemeralSystemMessagesDesc')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Model Mapping */}
              {activeTab === 'mappings' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                        <span>{t('config.modelMappingsGroup')}</span>
                        <span className="text-[11px] font-mono text-amber-400/80 lowercase">({mappingEntries.length})</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAdvancedJson(!showAdvancedJson)}
                        className="px-2.5 py-1 bg-[#151824] hover:bg-[#1C2030] border border-white/[0.08] rounded-lg text-[11px] font-semibold text-slate-300 hover:text-amber-300 transition-colors flex items-center space-x-1.5"
                      >
                        {showAdvancedJson ? (
                          <>
                            <List className="w-3 h-3 text-amber-400" />
                            <span>{t('config.toggleKv')}</span>
                          </>
                        ) : (
                          <>
                            <Code className="w-3 h-3 text-amber-400" />
                            <span>{t('config.toggleJson')}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      💡 支持多目标映射：在目标模型输入框中用英文逗号 (,) 分隔多个模型（如 gemini-2.5-pro, gemini-3.6-pro）。
                    </p>

                    {showAdvancedJson ? (
                      <div className="space-y-1.5">
                        <textarea
                          rows={6}
                          value={modelMappingsRaw}
                          onChange={(e) => handleRawJsonChange(e.target.value)}
                          placeholder={t('config.mappingsPlaceholder')}
                          className="w-full bg-[#151824] border border-white/[0.08] rounded-xl p-3 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500 leading-relaxed"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {mappingEntries.length === 0 ? (
                          <div className="p-6 text-center border border-dashed border-white/[0.08] rounded-xl text-xs text-slate-500">
                            {t('config.emptyMappings')}
                          </div>
                        ) : (
                          <div className="space-y-2.5 sm:space-y-2">
                            {mappingEntries.map((entry, index) => {
                              const targets = entry.target.split(',').map(s => s.trim()).filter(Boolean);
                              const isMultiTarget = targets.length > 1;

                              return (
                                <div
                                  key={entry.id}
                                  className={`p-2 rounded-xl transition-all ${
                                    isMultiTarget
                                      ? 'border border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-500/[0.04] shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                                      : 'bg-[#151824]/60 sm:bg-white/[0.02] border border-white/[0.06] sm:border-white/[0.04]'
                                  }`}
                                >
                                  <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-1.5">
                                    {/* Index */}
                                    <div className="flex items-center space-x-1 shrink-0 self-start sm:self-center">
                                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                        #{index + 1}
                                      </span>
                                    </div>

                                    {/* Source -> Target Input Fields */}
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 flex-1 min-w-0">
                                      <div className="flex-[2] min-w-0">
                                        <label className="text-[10px] text-slate-400 block sm:hidden mb-0.5 font-semibold">{t('config.sourceModel')}</label>
                                        <input
                                          type="text"
                                          value={entry.source}
                                          onChange={(e) => handleEntryChange(entry.id, 'source', e.target.value)}
                                          placeholder={t('config.sourceModel')}
                                          className="w-full bg-[#121520] sm:bg-[#151824] border border-white/[0.08] rounded-lg p-1.5 sm:p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                                        />
                                      </div>
                                      <span className="hidden sm:inline text-slate-500 font-bold text-xs shrink-0">→</span>
                                      <div className="flex-[3] min-w-0">
                                        <label className="text-[10px] text-slate-400 block sm:hidden mb-0.5 font-semibold">{t('config.targetModel')}</label>
                                        <div className="relative flex items-center">
                                          <input
                                            type="text"
                                            value={entry.target}
                                            onChange={(e) => handleEntryChange(entry.id, 'target', e.target.value)}
                                            onFocus={() => setFocusedTargetId(entry.id)}
                                            onBlur={() => setFocusedTargetId(null)}
                                            placeholder={t('config.targetModel')}
                                            className={`w-full bg-[#121520] sm:bg-[#151824] border border-white/[0.08] rounded-lg p-1.5 sm:p-2 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500 ${
                                              isMultiTarget && focusedTargetId !== entry.id ? 'pr-6' : ''
                                            }`}
                                          />
                                          {isMultiTarget && focusedTargetId !== entry.id && (
                                            <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center">
                                              <span
                                                className="text-[9px] font-mono font-bold text-amber-300 bg-[#121520] sm:bg-[#151824] border border-amber-500/60 shadow-sm px-1 py-0.5 rounded leading-none flex items-center select-none"
                                                title={`${targets.length} targets configured`}
                                              >
                                                ×{targets.length}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Compact Action Buttons */}
                                    <div className="flex items-center justify-between sm:justify-end gap-1 pt-1.5 sm:pt-0 border-t border-white/[0.04] sm:border-0 shrink-0">
                                      <select
                                        value={entry.strategy || ''}
                                        onChange={(e) => handleEntryChange(entry.id, 'strategy', e.target.value)}
                                        className="w-24 sm:w-[94px] bg-[#121520] sm:bg-[#151824] border border-white/[0.08] rounded-lg p-1.5 sm:p-2 text-[10px] sm:text-[11px] text-slate-300 font-mono focus:outline-none focus:border-amber-500 shrink-0"
                                        title={t('config.strategy')}
                                      >
                                        <option value="">{t('config.strategyDefault')}</option>
                                        <option value="least-used">{t('config.strategyLeastUsed')}</option>
                                        <option value="round-robin">{t('config.strategyRoundRobin')}</option>
                                        <option value="weighted">{t('config.strategyWeighted')}</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleHigh(entry.id, entry.target)}
                                        className={`px-1.5 py-1 sm:py-1.5 text-[9px] sm:text-[10px] font-bold rounded-lg transition-all border shrink-0 flex items-center space-x-0.5 ${
                                          entry.target.trim().endsWith('-high')
                                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                                            : 'bg-[#121520] sm:bg-[#151824] border-white/[0.08] text-slate-400 hover:text-slate-300 hover:border-white/[0.15]'
                                        }`}
                                        title={t('config.highToggleTooltip')}
                                      >
                                        <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        <span>HIGH</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMapping(entry.id)}
                                        className="p-1 sm:p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-xs shrink-0"
                                        title="Remove mapping"
                                      >
                                        <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleAddMapping}
                          className="w-full py-2 bg-[#151824] hover:bg-[#1C2030] border border-white/[0.08] hover:border-white/[0.15] text-amber-400/90 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('config.addMapping')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: Security & Reset */}
              {activeTab === 'security' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4">
                    <div className="flex items-center space-x-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                      <span>{t('config.securityGroup')}</span>
                    </div>

                    <div className="bg-[#151824] p-3.5 sm:p-4 rounded-xl border border-white/[0.06] space-y-2">
                      <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
                        <Info className="w-4 h-4 text-indigo-400" />
                        <span>{t('config.adminSecretTitle')}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {t('config.adminSecretDesc')}
                      </p>
                    </div>

                    <div className="bg-rose-950/20 border border-rose-800/30 p-3.5 sm:p-4 rounded-xl space-y-3">
                      <div className="flex items-center space-x-2 text-xs font-bold text-rose-300">
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        <span>{t('config.factoryResetTitle')}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {t('config.factoryResetDesc')}
                      </p>
                      <button
                        type="button"
                        onClick={handleResetToEnv}
                        disabled={saving}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl font-semibold text-xs transition-colors flex items-center space-x-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t('config.resetDefault')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Sticky Footer */}
            <div className="sticky bottom-0 bg-[#121520]/95 backdrop-blur-xl border-t border-white/[0.08] p-3.5 sm:p-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0">
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono text-center sm:text-left">
                {t('config.footerNote')}
              </span>

              <div className="flex items-center space-x-2.5 sm:space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-[#151824] hover:bg-[#1C2030] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-300 transition-colors text-center"
                >
                  {t('config.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 sm:flex-none px-5 py-2.5 sm:py-2 bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-500 hover:from-indigo-600 hover:via-purple-700 hover:to-pink-600 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-[0_0_20px_rgba(129,140,248,0.35)] transition-all flex items-center justify-center space-x-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('config.applying')}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('config.save')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
