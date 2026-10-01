import React, { useEffect, useState, useMemo } from 'react';
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
  Info,
  Github
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: 'proxy' | 'direct';
  apiKeys?: string[];
  agentId?: string;
}

export interface TerminalHostOption {
  id: string;
  name: string;
  ip: string;
  platform: string;
  status: 'online' | 'offline';
}

const SPLIT_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500'
];

const DEFAULT_IGNORED_TOOLS = [
  'Artifact',
  'ArtifactCheck',
  'ArtifactData',
  'ArtifactComments'
];

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
  const [stripSystemFingerprints, setStripSystemFingerprints] = useState<boolean>(true);
  const [ignoredTools, setIgnoredTools] = useState<string[]>(DEFAULT_IGNORED_TOOLS);
  const [toolInputText, setToolInputText] = useState<string>('');
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [geminiBaseUrl, setGeminiBaseUrl] = useState<string>('https://generativelanguage.googleapis.com');
  const [upstreamServers, setUpstreamServers] = useState<UpstreamServerConfig[]>([]);
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');
  const [logRetentionDays, setLogRetentionDays] = useState<number>(3);
  const [countTokensModel, setCountTokensModel] = useState<string>('');
  const [ephemeralUserMessagesText, setEphemeralUserMessagesText] = useState<string>('');
  const [ephemeralSystemMessagesText, setEphemeralSystemMessagesText] = useState<string>('');
  const [serverModelInputs, setServerModelInputs] = useState<Record<number, string>>({});
  const [serverKeyInputs, setServerKeyInputs] = useState<Record<number, string>>({});
  const [availableHosts, setAvailableHosts] = useState<TerminalHostOption[]>([]);
  const [loadingHosts, setLoadingHosts] = useState<boolean>(false);

  const fetchAvailableHosts = async () => {
    setLoadingHosts(true);
    try {
      const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
      const res = await fetch('/api/terminal/hosts', { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.hosts)) {
          setAvailableHosts(data.hosts);
        }
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoadingHosts(false);
    }
  };

  const activeTotalWeight = useMemo(() => {
    return upstreamServers
      .filter(s => s.enabled)
      .reduce((sum, s) => sum + (Number(s.weight) || 1), 0);
  }, [upstreamServers]);

  const getEffectivePercent = (server: UpstreamServerConfig) => {
    if (!server.enabled || activeTotalWeight === 0) return 0;
    const w = Number(server.weight) || 1;
    return parseFloat(((w / activeTotalWeight) * 100).toFixed(1));
  };

  const handleOfficialDefault = () => {
    const official: UpstreamServerConfig[] = [
      { url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API' }
    ];
    setUpstreamServers(official);
    setGeminiBaseUrl('https://generativelanguage.googleapis.com');
  };

  const handleAddTool = () => {
    const trimmed = toolInputText.trim();
    if (!trimmed) return;
    const parts = trimmed.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const next = Array.from(new Set([...ignoredTools, ...parts]));
    setIgnoredTools(next);
    setToolInputText('');
  };

  const handleRemoveTool = (toolToRemove: string) => {
    setIgnoredTools(ignoredTools.filter(t => t.toLowerCase() !== toolToRemove.toLowerCase()));
  };

  const handleResetDefaultTools = () => {
    setIgnoredTools([...DEFAULT_IGNORED_TOOLS]);
  };

  const handleClearTools = () => {
    setIgnoredTools([]);
  };

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
          setStripSystemFingerprints(data.config.stripSystemFingerprints !== false);
          if (Array.isArray(data.config.ignoredTools)) {
            setIgnoredTools(data.config.ignoredTools);
          } else {
            setIgnoredTools(DEFAULT_IGNORED_TOOLS);
          }
          setCustomSystemInstruction(data.config.customSystemInstruction || '');
          setGeminiBaseUrl(data.config.geminiBaseUrl || 'https://generativelanguage.googleapis.com');
          if (data.config.upstreamServers && Array.isArray(data.config.upstreamServers) && data.config.upstreamServers.length > 0) {
            setUpstreamServers(data.config.upstreamServers);
            const keyInputs: Record<number, string> = {};
            const modelInputs: Record<number, string> = {};
            data.config.upstreamServers.forEach((srv: any, idx: number) => {
              if (Array.isArray(srv.apiKeys)) {
                keyInputs[idx] = srv.apiKeys.join('\n');
              }
              if (Array.isArray(srv.allowedModels)) {
                modelInputs[idx] = srv.allowedModels.join(', ');
              }
            });
            setServerKeyInputs(keyInputs);
            setServerModelInputs(modelInputs);
          } else if (data.config.geminiBaseUrl) {
            const parts = String(data.config.geminiBaseUrl).split(',').map((s: string) => s.trim()).filter(Boolean);
            setUpstreamServers(parts.map((url: string) => ({ url, weight: 1, enabled: true, type: 'proxy' })));
          } else {
            setUpstreamServers([{ url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API', type: 'proxy' }]);
          }
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

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'upstream') {
      fetchAvailableHosts();
    }
  }, [isOpen, activeTab, adminKey]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

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

  const handleServerAllowedModelsChange = (serverIndex: number, rawVal: string) => {
    const parts = rawVal.split(',').map(s => s.trim()).filter(Boolean);
    const updated = [...upstreamServers];
    updated[serverIndex] = {
      ...updated[serverIndex],
      allowedModels: parts.length > 0 ? Array.from(new Set(parts)) : undefined
    };
    setUpstreamServers(updated);
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
          stripSystemFingerprints,
          ignoredTools,
          customSystemInstruction,
          geminiBaseUrl: geminiBaseUrl.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean).join(','),
          upstreamServers: upstreamServers.map((s, idx) => {
            const rawKeys = serverKeyInputs[idx] !== undefined ? serverKeyInputs[idx] : (s.apiKeys || []).join('\n');
            const cleanKeys = Array.from(new Set(rawKeys.split('\n').map(k => k.trim()).filter(Boolean)));
            return {
              url: (s.type === 'direct' && !s.url.trim()) ? 'https://generativelanguage.googleapis.com' : s.url.trim().replace(/\/+$/, ''),
              weight: Math.max(1, Math.min(1000, Number(s.weight) || 1)),
              enabled: s.enabled !== false,
              type: s.type || 'proxy',
              ...(s.name?.trim() ? { name: s.name.trim() } : {}),
              ...(Array.isArray(s.allowedModels) && s.allowedModels.length > 0 ? { allowedModels: s.allowedModels } : {}),
              ...(s.type === 'direct' && cleanKeys.length > 0 ? { apiKeys: cleanKeys } : {}),
              ...(s.type === 'direct' && s.agentId?.trim() ? { agentId: s.agentId.trim() } : {})
            };
          }),
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
    { id: 'general', label: t('config.tabGeneral'), shortLabel: t('config.tabGeneralShort', '通用'), icon: Sliders },
    { id: 'upstream', label: t('config.tabUpstream'), shortLabel: t('config.tabUpstreamShort', '上游'), icon: Globe },
    { id: 'instructions', label: t('config.tabInstructions'), shortLabel: t('config.tabInstructionsShort', '指令'), icon: FileCode },
    { id: 'mappings', label: t('config.tabMappings'), shortLabel: t('config.tabMappingsShort', '映射'), icon: ArrowRightLeft },
    { id: 'security', label: t('config.tabSecurity'), shortLabel: t('config.tabSecurityShort', '安全'), icon: ShieldCheck }
  ];

  return (
    <div className="backdrop-blur-xl bg-black/60 fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="ui-card rounded-t-2xl sm:rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[92dvh] sm:h-auto sm:max-h-[90vh]">
        {/* Mobile Drag Handle Pill */}
        <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full mx-auto my-1.5 block sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-inner shrink-0">
              <Settings className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2 truncate">
                <span>{t('config.modalTitle')}</span>
              </h2>
              <p className="hidden sm:block text-[11px] text-[var(--text-secondary)] truncate">{t('config.modalSub')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 sm:space-x-1 shrink-0">
            {/* Mobile-only Quick Save Button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 sm:hidden shadow-sm active:scale-95 disabled:opacity-50 transition-all"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>{saving ? t('config.applying') : t('config.save')}</span>
            </button>

            <a
              href="https://github.com/Tonyogo/gemini-proxy"
              target="_blank"
              rel="noopener noreferrer"
              title={t('nav.github', 'GitHub Repository')}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0 flex items-center"
            >
              <Github className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Linear Styled Tab Pills */}
        <div className="flex items-center space-x-1 px-2 sm:px-6 py-1.5 sm:py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]/80 overflow-x-auto scrollbar-none shrink-0 w-full">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id as TabType)}
                className={`ui-tab-pill flex-1 sm:flex-none justify-center px-1.5 sm:px-3 py-1 sm:py-1.5 flex items-center space-x-1 sm:space-x-2 whitespace-nowrap text-center ${
                  isActive
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="sm:hidden text-xs">{tab.shortLabel}</span>
                <span className="hidden sm:inline text-xs">{tab.label}</span>
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
                <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
                  <div className="ui-card-sub p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                      <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t('config.generalGroup')}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">LOG_LEVEL</label>
                        <select
                          value={logLevel}
                          onChange={(e) => setLogLevel(e.target.value)}
                          className="w-full ui-input p-2.5 text-xs appearance-none cursor-pointer"
                        >
                          <option value="error">{t('config.logLevelError')}</option>
                          <option value="warn">{t('config.logLevelWarn')}</option>
                          <option value="info">{t('config.logLevelInfo')}</option>
                          <option value="debug">{t('config.logLevelDebug')}</option>
                        </select>
                        <p className="hidden sm:block text-[10px] text-slate-400">{t('config.logLevelDesc')}</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">LOG_RETENTION_DAYS</label>
                        <input
                          type="number"
                          value={logRetentionDays}
                          onChange={(e) => setLogRetentionDays(parseInt(e.target.value, 10) || 0)}
                          className="w-full ui-input p-2.5 text-xs"
                        />
                        <p className="hidden sm:block text-[10px] text-slate-400">{t('config.logRetentionDesc')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Proxy & Upstream */}
              {activeTab === 'upstream' && (
                <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
                  <div className="ui-card-sub p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                      <Globe className="w-3.5 h-3.5 text-blue-400" />
                      <span>{t('config.upstreamGroup')}</span>
                    </div>

                    <div className="space-y-3.5 sm:space-y-4">
                      {/* UPSTREAM SERVERS & TRAFFIC ALLOCATION */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-xs font-semibold text-slate-200 block">
                              {t('config.upstreamServersTitle', '上游代理服务器与流量分配')}
                            </label>
                            <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">
                              {t('config.upstreamServersDesc', '配置多个上游 Gemini 网关并设置流量百分比权重及启停状态。系统将自动按平滑加权算法进行精确调度。')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleOfficialDefault}
                            className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 flex-shrink-0"
                          >
                            <Zap className="w-2.5 h-2.5" />
                            <span>{t('config.useOfficialDefault', '填入官方默认')}</span>
                          </button>
                        </div>

                        {/* Traffic Split Preview Bar */}
                        <div className="space-y-2 p-3 rounded-lg bg-slate-900/40 border border-slate-700/60">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                              <span>{t('config.trafficSplitPreview', '实时流量分配预览')}</span>
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {activeTotalWeight > 0 ? `Total Weight: ${activeTotalWeight}` : t('config.nodeDisabled', '已禁用')}
                            </span>
                          </div>

                          <div className="h-3 w-full bg-slate-850 rounded-full overflow-hidden flex border border-slate-700/60 shadow-inner">
                            {upstreamServers.map((server, idx) => {
                              const pct = getEffectivePercent(server);
                              if (!server.enabled || pct <= 0) return null;
                              const color = SPLIT_COLORS[idx % SPLIT_COLORS.length];
                              return (
                                <div
                                  key={idx}
                                  style={{ width: `${pct}%` }}
                                  className={`${color} h-full transition-all duration-300 relative group`}
                                  title={`${server.name || server.url || `Node ${idx + 1}`}: ${pct}%`}
                                />
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            {upstreamServers.map((server, idx) => {
                              const pct = getEffectivePercent(server);
                              const color = SPLIT_COLORS[idx % SPLIT_COLORS.length];
                              return (
                                <div key={idx} className="flex items-center space-x-1.5 text-[11px] text-slate-300">
                                  <span className={`w-2 h-2 rounded-full ${server.enabled ? color : 'bg-slate-600'}`} />
                                  <span className="font-medium truncate max-w-[120px]">{server.name || `Node ${idx + 1}`}</span>
                                  <span className={`font-mono ${server.enabled ? 'text-blue-400' : 'text-slate-500'}`}>{pct}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Gateway Nodes List */}
                        <div className="space-y-2.5">
                          {upstreamServers.map((server, idx) => {
                            const pct = getEffectivePercent(server);
                            const color = SPLIT_COLORS[idx % SPLIT_COLORS.length];
                            return (
                              <div
                                key={idx}
                                className={`p-3 rounded-lg border transition-all ${
                                  server.enabled
                                    ? 'bg-slate-800/40 border-slate-700/70 hover:border-slate-600'
                                    : 'bg-slate-900/30 border-slate-800/60 opacity-60'
                                }`}
                              >
                                <div className="pb-2.5 mb-2.5 border-b border-slate-700/40">
                                  {/* First Row: Status, Node Name, Percentage, Controls */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${server.enabled ? color : 'bg-slate-600'}`} />
                                      <span className="text-xs font-semibold text-slate-200 truncate">
                                        {server.name || `Node ${idx + 1}`}
                                      </span>
                                      <span
                                        className={`px-1.5 py-0.5 text-[10px] rounded font-mono font-medium shrink-0 ${
                                          server.enabled
                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                                        }`}
                                      >
                                        {server.enabled ? `${pct}%` : t('config.nodeDisabled', '已禁用')}
                                      </span>

                                      {/* Desktop-only Server Type Switcher */}
                                      <div className="hidden sm:inline-flex rounded p-0.5 bg-slate-900 border border-slate-700/80 ml-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...upstreamServers];
                                            updated[idx] = { ...updated[idx], type: 'proxy', agentId: undefined };
                                            setUpstreamServers(updated);
                                          }}
                                          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                                            (server.type || 'proxy') === 'proxy'
                                              ? 'bg-purple-600 text-white shadow-xs'
                                              : 'text-slate-400 hover:text-slate-200'
                                          }`}
                                        >
                                          {t('config.serverTypeProxy', '代理模式 (Proxy)')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...upstreamServers];
                                            let nextUrl = updated[idx].url;
                                            if (!nextUrl || nextUrl.includes('proxy') || nextUrl === '') {
                                              nextUrl = 'https://generativelanguage.googleapis.com';
                                            }
                                            updated[idx] = { ...updated[idx], type: 'direct', url: nextUrl };
                                            setUpstreamServers(updated);
                                            setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
                                          }}
                                          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                                            server.type === 'direct'
                                              ? 'bg-cyan-600 text-white shadow-xs'
                                              : 'text-slate-400 hover:text-slate-200'
                                          }`}
                                        >
                                          {t('config.serverTypeDirect', '直连模式 (Direct)')}
                                        </button>
                                      </div>
                                    </div>

                                    {/* Right Controls: Enable Toggle & Delete Button */}
                                    <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
                                      <label className="flex items-center cursor-pointer space-x-1.5">
                                        <input
                                          type="checkbox"
                                          checked={server.enabled}
                                          onChange={(e) => {
                                            const updated = [...upstreamServers];
                                            updated[idx] = { ...updated[idx], enabled: e.target.checked };
                                            setUpstreamServers(updated);
                                            setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
                                          }}
                                          className="sr-only"
                                        />
                                        <div className={`w-7 h-4 rounded-full transition-colors relative ${server.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${server.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                        </div>
                                        <span className="hidden sm:inline text-[11px] text-slate-400">
                                          {server.enabled ? t('config.nodeEnabled', '已启用') : t('config.nodeDisabled', '已禁用')}
                                        </span>
                                      </label>

                                      <button
                                        type="button"
                                        disabled={upstreamServers.length <= 1}
                                        onClick={() => {
                                          if (upstreamServers.length <= 1) return;
                                          const updated = upstreamServers.filter((_, i) => i !== idx);
                                          setUpstreamServers(updated);
                                          setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
                                        }}
                                        className={`p-1.5 sm:p-1 text-slate-400 hover:text-red-400 transition-colors ${
                                          upstreamServers.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                                        }`}
                                        title={upstreamServers.length <= 1 ? t('config.atLeastOneServer', '至少需要保留一个上游网关节点') : 'Delete'}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Mobile-only Full-Width Segmented Mode Switcher */}
                                  <div className="grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg mt-2 sm:hidden gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...upstreamServers];
                                        updated[idx] = { ...updated[idx], type: 'proxy', agentId: undefined };
                                        setUpstreamServers(updated);
                                      }}
                                      className={`py-1.5 px-2 text-xs rounded-md font-medium text-center transition-all ${
                                        (server.type || 'proxy') === 'proxy'
                                          ? 'bg-purple-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      {t('config.serverTypeProxy', '代理模式 (Proxy)')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...upstreamServers];
                                        let nextUrl = updated[idx].url;
                                        if (!nextUrl || nextUrl.includes('proxy') || nextUrl === '') {
                                          nextUrl = 'https://generativelanguage.googleapis.com';
                                        }
                                        updated[idx] = { ...updated[idx], type: 'direct', url: nextUrl };
                                        setUpstreamServers(updated);
                                        setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
                                      }}
                                      className={`py-1.5 px-2 text-xs rounded-md font-medium text-center transition-all ${
                                        server.type === 'direct'
                                          ? 'bg-cyan-600 text-white shadow-sm'
                                          : 'text-slate-400 hover:text-slate-200'
                                      }`}
                                    >
                                      {t('config.serverTypeDirect', '直连模式 (Direct)')}
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-12 gap-2 sm:gap-2.5 text-xs">
                                  <div className="col-span-12 grid grid-cols-12 gap-2 sm:gap-2.5">
                                    <div className="col-span-8 sm:col-span-4 space-y-1">
                                      <label className="text-[11px] text-slate-400 block">{t('config.nodeName', '节点备注名')}</label>
                                      <input
                                        type="text"
                                        value={server.name || ''}
                                        onChange={(e) => {
                                          const updated = [...upstreamServers];
                                          updated[idx] = { ...updated[idx], name: e.target.value };
                                          setUpstreamServers(updated);
                                        }}
                                        placeholder="e.g. HK-Gateway"
                                        className="w-full ui-input p-2 text-xs"
                                      />
                                    </div>

                                    <div className="col-span-4 sm:col-span-3 space-y-1 sm:order-last">
                                      <label className="text-[11px] text-slate-400 block">{t('config.nodeWeight', '权重')}</label>
                                      <input
                                        type="number"
                                        min="1"
                                        max="1000"
                                        value={server.weight}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value, 10);
                                          const updated = [...upstreamServers];
                                          updated[idx] = { ...updated[idx], weight: isNaN(val) ? 1 : Math.max(1, Math.min(1000, val)) };
                                          setUpstreamServers(updated);
                                        }}
                                        className="w-full ui-input p-2 text-xs font-mono"
                                      />
                                    </div>

                                    <div className="col-span-12 sm:col-span-5 space-y-1">
                                      <label className="text-[11px] text-slate-400 block">{t('config.nodeUrl', '网关 URL')}</label>
                                      <input
                                        type="text"
                                        value={server.url}
                                        onChange={(e) => {
                                          const updated = [...upstreamServers];
                                          updated[idx] = { ...updated[idx], url: e.target.value };
                                          setUpstreamServers(updated);
                                          setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
                                        }}
                                        onBlur={() => {
                                          const updated = [...upstreamServers];
                                          let clean = (updated[idx].url || '').trim().replace(/\/+$/, '');
                                          if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
                                          updated[idx] = { ...updated[idx], url: clean };
                                          setUpstreamServers(updated);
                                          setGeminiBaseUrl(updated.map(s => s.url).filter(Boolean).join(','));
                                        }}
                                        placeholder="https://api.example.com"
                                        className="w-full ui-input p-2 text-xs font-mono"
                                      />
                                    </div>
                                  </div>

                                  {/* Allowed Models (Single line) */}
                                  <div className="col-span-12 space-y-1">
                                    <label className="text-[11px] text-slate-400 block">{t('config.serverAllowedModelsTitle', '允许模型')}</label>
                                    <div className="relative flex items-center">
                                      <input
                                        type="text"
                                        value={serverModelInputs[idx] !== undefined ? serverModelInputs[idx] : (server.allowedModels || []).join(', ')}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setServerModelInputs(prev => ({ ...prev, [idx]: val }));
                                        }}
                                        onBlur={() => {
                                          const raw = serverModelInputs[idx] !== undefined ? serverModelInputs[idx] : (server.allowedModels || []).join(', ');
                                          const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
                                          const updated = [...upstreamServers];
                                          updated[idx] = {
                                            ...updated[idx],
                                            allowedModels: parts.length > 0 ? Array.from(new Set(parts)) : undefined
                                          };
                                          setUpstreamServers(updated);
                                          setServerModelInputs(prev => ({ ...prev, [idx]: parts.join(', ') }));
                                        }}
                                        placeholder={t('config.serverAllowedModelsPlaceholder', '留空允许全部，多个以英文逗号分隔，如 gemini-2.5-flash, gemini-2.5-pro')}
                                        className="w-full ui-input p-2 text-xs font-mono pr-8"
                                      />
                                      {(() => {
                                        const currentVal = serverModelInputs[idx] !== undefined ? serverModelInputs[idx] : (server.allowedModels || []).join(', ');
                                        const count = currentVal.split(',').map(s => s.trim()).filter(Boolean).length;
                                        if (count <= 1) return null;
                                        return (
                                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center">
                                            <span
                                              className="text-[9px] font-mono font-bold text-blue-400 bg-[var(--bg-surface-sub)] border border-blue-500/40 shadow-sm px-1 py-0.5 rounded leading-none select-none"
                                              title={`${count} models configured`}
                                            >
                                              ×{count}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  {/* Direct Mode Egress Channel Selector */}
                                  {server.type === 'direct' && (
                                    <div className="col-span-12 space-y-2 mt-1 p-3 rounded-lg bg-slate-900/60 border border-cyan-500/20">
                                      <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-semibold text-cyan-400 flex items-center space-x-1.5">
                                          <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                                          <span>{t('config.egressChannelTitle', '网络出口通道')}</span>
                                        </label>
                                        {server.agentId && (
                                          <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                            Agent: {server.agentId}
                                          </span>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                        {/* Option 1: Local Direct */}
                                        <label
                                          onClick={() => {
                                            const updated = [...upstreamServers];
                                            updated[idx] = { ...updated[idx], agentId: undefined };
                                            setUpstreamServers(updated);
                                          }}
                                          className={`p-2.5 rounded border cursor-pointer transition-all flex flex-col justify-between ${
                                            !server.agentId
                                              ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-100 shadow-sm'
                                              : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
                                          }`}
                                        >
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              name={`egress_channel_${idx}`}
                                              checked={!server.agentId}
                                              onChange={() => {}}
                                              className="text-cyan-600 focus:ring-0 cursor-pointer"
                                            />
                                            <span className="font-semibold text-slate-200">{t('config.egressLocal', '本机直接出站 (Local Direct)')}</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-1 pl-5">
                                            {t('config.egressLocalDesc', '由服务器本机直接请求 Google 官方 API 接口')}
                                          </p>
                                        </label>

                                        {/* Option 2: Remote Agent */}
                                        <label
                                          onClick={() => {
                                            if (!server.agentId) {
                                              const firstOnline = availableHosts.find(h => h.status === 'online');
                                              const target = firstOnline ? firstOnline.name || firstOnline.id : (availableHosts[0]?.name || availableHosts[0]?.id || 'agent');
                                              const updated = [...upstreamServers];
                                              updated[idx] = { ...updated[idx], agentId: target };
                                              setUpstreamServers(updated);
                                            }
                                          }}
                                          className={`p-2.5 rounded border cursor-pointer transition-all flex flex-col justify-between ${
                                            server.agentId
                                              ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-100 shadow-sm'
                                              : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
                                          }`}
                                        >
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="radio"
                                              name={`egress_channel_${idx}`}
                                              checked={Boolean(server.agentId)}
                                              onChange={() => {}}
                                              className="text-cyan-600 focus:ring-0 cursor-pointer"
                                            />
                                            <span className="font-semibold text-slate-200">{t('config.egressAgent', '借道 Agent 节点出口 (Remote Agent Egress)')}</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-1 pl-5">
                                            {t('config.egressAgentDesc', '通过已连接的反向 WebSocket 隧道将请求借道远端节点发出')}
                                          </p>
                                        </label>
                                      </div>

                                      {/* Agent Host Dropdown when Remote Agent is selected */}
                                      {server.agentId && (
                                        <div className="pt-2 border-t border-cyan-500/10 flex items-center space-x-2">
                                          <div className="flex-1 relative">
                                            <select
                                              value={server.agentId}
                                              onChange={(e) => {
                                                const updated = [...upstreamServers];
                                                updated[idx] = { ...updated[idx], agentId: e.target.value };
                                                setUpstreamServers(updated);
                                              }}
                                              className="w-full ui-input p-2 text-xs font-mono bg-slate-950/80 border-cyan-500/30 text-cyan-200 cursor-pointer"
                                            >
                                              {availableHosts.length === 0 ? (
                                                <option value={server.agentId}>
                                                  {server.agentId} ({t('config.noAgentsAvailable', '暂无在线 Agent')})
                                                </option>
                                              ) : (
                                                availableHosts.map((h) => {
                                                  const identifier = h.name || h.id;
                                                  const statusDot = h.status === 'online' ? '● 在线' : '○ 离线';
                                                  return (
                                                    <option key={h.id} value={identifier}>
                                                      {statusDot} | {identifier} ({h.ip || 'no-ip'})
                                                    </option>
                                                  );
                                                })
                                              )}
                                            </select>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={fetchAvailableHosts}
                                            disabled={loadingHosts}
                                            title="刷新在线 Agent 列表"
                                            className="p-2 text-cyan-400 hover:text-cyan-200 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 rounded cursor-pointer transition-colors"
                                          >
                                            <RefreshCw className={`w-3.5 h-3.5 ${loadingHosts ? 'animate-spin' : ''}`} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Direct Mode API Keys (Multi-line) */}
                                  {server.type === 'direct' && (
                                    <div className="col-span-12 space-y-1 mt-1 p-2.5 rounded bg-slate-900/60 border border-cyan-500/20">
                                      <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-semibold text-cyan-400 flex items-center space-x-1">
                                          <span>{t('config.serverApiKeys', 'Gemini API Keys (直连密钥池)')}</span>
                                        </label>
                                        {(() => {
                                          const rawKeys = serverKeyInputs[idx] !== undefined ? serverKeyInputs[idx] : (server.apiKeys || []).join('\n');
                                          const count = rawKeys.split('\n').map(k => k.trim()).filter(Boolean).length;
                                          return (
                                            <span className="text-[10px] text-cyan-300/80 font-mono bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                              {t('config.serverApiKeysHelp', '已配置 {count} 个密钥').replace('{count}', String(count))}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                      <textarea
                                        rows={3}
                                        value={serverKeyInputs[idx] !== undefined ? serverKeyInputs[idx] : (server.apiKeys || []).join('\n')}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setServerKeyInputs(prev => ({ ...prev, [idx]: val }));
                                        }}
                                        onBlur={() => {
                                          const raw = serverKeyInputs[idx] !== undefined ? serverKeyInputs[idx] : (server.apiKeys || []).join('\n');
                                          const cleanKeys = Array.from(new Set(raw.split('\n').map(k => k.trim()).filter(Boolean)));
                                          const updated = [...upstreamServers];
                                          updated[idx] = {
                                            ...updated[idx],
                                            apiKeys: cleanKeys.length > 0 ? cleanKeys : undefined
                                          };
                                          setUpstreamServers(updated);
                                          setServerKeyInputs(prev => ({ ...prev, [idx]: cleanKeys.join('\n') }));
                                        }}
                                        placeholder={t('config.serverApiKeysPlaceholder', '每行一个 API Key，请求将在配置的 Key 之间均衡轮询负载')}
                                        className="w-full ui-input p-2 text-xs font-mono resize-y leading-relaxed text-slate-200"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => {
                              const updated: UpstreamServerConfig[] = [
                                ...upstreamServers,
                                { url: '', weight: 1, enabled: true, name: '', type: 'proxy' }
                              ];
                              setUpstreamServers(updated);
                            }}
                            className="w-full py-2.5 px-3 border border-dashed border-slate-700 hover:border-blue-500/50 rounded-lg text-xs font-medium text-slate-400 hover:text-blue-400 transition-colors flex items-center justify-center space-x-1.5 bg-slate-850 hover:bg-blue-500/5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t('config.addUpstreamServer', '添加代理节点')}</span>
                          </button>
                        </div>

                        {/* Hidden compatibility input */}
                        <div className="hidden">
                          <input
                            type="text"
                            value={geminiBaseUrl}
                            onChange={(e) => setGeminiBaseUrl(e.target.value)}
                            onBlur={() => setGeminiBaseUrl(prev => prev.split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean).join(','))}
                            placeholder="https://generativelanguage.googleapis.com,https://s2.example.com"
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">UPSTREAM_TIMEOUT_MS</label>
                        <div className="relative">
                          <input
                            type="number"
                            value={upstreamTimeoutMs}
                            onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10) || 0)}
                            className="w-full ui-input p-2.5 text-xs"
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">ms</span>
                        </div>
                        <p className="hidden sm:block text-[10px] text-slate-400">{t('config.upstreamTimeoutDesc')}</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200 block">COUNT_TOKENS_MODEL</label>
                        <input
                          type="text"
                          value={countTokensModel}
                          onChange={(e) => setCountTokensModel(e.target.value)}
                          placeholder="e.g. gemini-2.5-flash (Leave blank to use request model)"
                          className="w-full ui-input p-2.5 text-xs"
                        />
                        <p className="hidden sm:block text-[10px] text-slate-400">{t('config.countTokensDesc')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: System Instruction & Ephemeral Rules */}
              {activeTab === 'instructions' && (
                <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
                  <div className="ui-card-sub p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('config.translationGroup')}</span>
                    </div>

                    {/* Refined Toggle Switch */}
                    <div className="ui-card-sub p-3 sm:p-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">SYSTEM_ROLE_TO_INSTRUCTION</span>
                        <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">{t('config.systemRoleDesc')}</p>
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

                    {/* STRIP_SYSTEM_FINGERPRINTS Toggle Switch */}
                    <div className="ui-card-sub p-3 sm:p-4 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-slate-200 block">{t('config.stripFingerprintsTitle')}</span>
                        <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">{t('config.stripFingerprintsDesc')}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setStripSystemFingerprints(!stripSystemFingerprints)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          stripSystemFingerprints ? 'bg-emerald-500' : 'bg-slate-800'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            stripSystemFingerprints ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* IGNORED_TOOLS Tag Badge Editor */}
                    <div className="ui-card-sub p-3 sm:p-4 space-y-3">
                      <div className="flex items-start sm:items-center justify-between gap-2 flex-col sm:flex-row">
                        <div>
                          <span className="text-xs font-semibold text-slate-200 block">{t('config.ignoredToolsTitle')}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{t('config.ignoredToolsDesc')}</p>
                        </div>
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleResetDefaultTools}
                            className="px-2.5 py-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition-colors flex items-center space-x-1"
                            title={t('config.ignoredToolsResetDefault')}
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{t('config.ignoredToolsResetDefault')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearTools}
                            className="px-2.5 py-1 text-[11px] font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-colors flex items-center space-x-1"
                            title={t('config.ignoredToolsClear')}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t('config.ignoredToolsClear')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Tag list */}
                      <div className="min-h-[38px] p-2 bg-slate-900/40 border border-slate-700/40 rounded-xl flex flex-wrap items-center gap-1.5">
                        {ignoredTools.length > 0 ? (
                          ignoredTools.map((tool) => (
                            <span
                              key={tool}
                              className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-indigo-500/15 border border-indigo-500/30 text-indigo-300"
                            >
                              <span>{tool}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTool(tool)}
                                className="hover:text-rose-400 p-0.5 rounded-full transition-colors ml-0.5"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-500 italic px-1">
                            {t('config.ignoredToolsEmpty')}
                          </span>
                        )}
                      </div>

                      {/* Input bar */}
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={toolInputText}
                          onChange={(e) => setToolInputText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTool();
                            }
                          }}
                          placeholder={t('config.ignoredToolsPlaceholder')}
                          className="flex-1 ui-input p-2 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleAddTool}
                          className="px-3.5 py-2 ui-btn-primary text-xs flex items-center space-x-1 shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('config.ignoredToolsAdd')}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-200 block">CUSTOM_SYSTEM_INSTRUCTION</label>
                      <textarea
                        rows={2}
                        value={customSystemInstruction}
                        onChange={(e) => setCustomSystemInstruction(e.target.value)}
                        placeholder={t('config.customInstructionPlaceholder')}
                        className="w-full ui-input p-2.5 text-xs leading-relaxed"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-200 block">EPHEMERAL_USER_MESSAGES</label>
                      <textarea
                        rows={2}
                        value={ephemeralUserMessagesText}
                        onChange={(e) => setEphemeralUserMessagesText(e.target.value)}
                        placeholder={t('config.ephemeralUserMessagesPlaceholder')}
                        className="w-full ui-input p-2.5 text-xs leading-relaxed"
                      />
                      <p className="hidden sm:block text-[10px] text-slate-400">{t('config.ephemeralUserMessagesDesc')}</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-200 block">EPHEMERAL_SYSTEM_MESSAGES</label>
                      <textarea
                        rows={2}
                        value={ephemeralSystemMessagesText}
                        onChange={(e) => setEphemeralSystemMessagesText(e.target.value)}
                        placeholder={t('config.ephemeralSystemMessagesPlaceholder')}
                        className="w-full ui-input p-2.5 text-xs leading-relaxed"
                      />
                      <p className="hidden sm:block text-[10px] text-slate-400">{t('config.ephemeralSystemMessagesDesc')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Model Mapping */}
              {activeTab === 'mappings' && (
                <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
                  <div className="ui-card-sub p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                        <span className="hidden sm:inline">{t('config.modelMappingsGroup')}</span>
                        <span className="sm:hidden text-xs">模型映射规则</span>
                        <span className="text-[11px] font-mono text-amber-400/80 lowercase">({mappingEntries.length})</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowAdvancedJson(!showAdvancedJson)}
                        className="px-2.5 py-1 ui-btn-secondary text-[11px] font-semibold text-slate-300 hover:text-amber-300 flex items-center space-x-1.5"
                      >
                        {showAdvancedJson ? (
                          <>
                            <List className="w-3 h-3 text-amber-400" />
                            <span className="hidden sm:inline">{t('config.toggleKv')}</span>
                            <span className="sm:hidden">可视化</span>
                          </>
                        ) : (
                          <>
                            <Code className="w-3 h-3 text-amber-400" />
                            <span className="hidden sm:inline">{t('config.toggleJson')}</span>
                            <span className="sm:hidden">JSON</span>
                          </>
                        )}
                      </button>
                    </div>

                    {showAdvancedJson ? (
                      <div className="space-y-1.5">
                        <textarea
                          rows={6}
                          value={modelMappingsRaw}
                          onChange={(e) => handleRawJsonChange(e.target.value)}
                          placeholder={t('config.mappingsPlaceholder')}
                          className="w-full ui-input p-3 text-xs text-amber-300 leading-relaxed"
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
                                      : 'ui-card-sub'
                                  }`}
                                >
                                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-y-2 sm:gap-y-0 sm:gap-x-1.5">
                                    {/* Index Badge: Order 1 on mobile and desktop */}
                                    <div className="order-1 flex items-center space-x-1 shrink-0">
                                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                        #{index + 1}
                                      </span>
                                    </div>

                                    {/* Compact Action Buttons: Order 2 on mobile (aligned right in header), Order 3 on desktop */}
                                    <div className="order-2 sm:order-3 flex items-center gap-1.5 sm:gap-1 shrink-0 ml-auto sm:ml-0">
                                      <select
                                        value={entry.strategy || ''}
                                        onChange={(e) => handleEntryChange(entry.id, 'strategy', e.target.value)}
                                        className="w-[88px] sm:w-[94px] h-7 sm:h-8 ui-input p-1 sm:p-2 text-[10px] sm:text-[11px] shrink-0 appearance-none cursor-pointer"
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
                                        className={`h-7 sm:h-8 px-2 sm:px-1.5 py-0.5 sm:py-1.5 text-[9px] sm:text-[10px] font-bold rounded-lg transition-all border shrink-0 flex items-center space-x-0.5 active:scale-95 ${
                                          entry.target.trim().endsWith('-high')
                                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]'
                                            : 'ui-btn-secondary'
                                        }`}
                                        title={t('config.highToggleTooltip')}
                                      >
                                        <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                        <span>HIGH</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMapping(entry.id)}
                                        className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-xs shrink-0 active:scale-95"
                                        title="Remove mapping"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {/* Source -> Target Input Fields: Order 3 on mobile (full width row 2 & 3), Order 2 on desktop (middle) */}
                                    <div className="order-3 sm:order-2 w-full basis-full sm:basis-auto sm:w-auto sm:flex-1 min-w-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5">
                                      <div className="flex-[2] min-w-0">
                                        <label className="text-[10px] text-slate-400 block sm:hidden mb-0.5 font-semibold">
                                          {t('config.sourceModelShort', '源模型')}
                                        </label>
                                        <input
                                          type="text"
                                          value={entry.source}
                                          onChange={(e) => handleEntryChange(entry.id, 'source', e.target.value)}
                                          placeholder={t('config.sourceModelPlaceholder', '如 claude-3-5-sonnet')}
                                          className="w-full ui-input p-1.5 sm:p-2 text-xs"
                                        />
                                      </div>
                                      <span className="hidden sm:inline text-slate-500 font-bold text-xs shrink-0">→</span>
                                      <div className="flex-[3] min-w-0">
                                        <label className="text-[10px] text-slate-400 block sm:hidden mb-0.5 font-semibold">
                                          {t('config.targetModelShort', '重定向至')}
                                        </label>
                                        <div className="relative flex items-center">
                                          <input
                                            type="text"
                                            value={entry.target}
                                            onChange={(e) => handleEntryChange(entry.id, 'target', e.target.value)}
                                            onFocus={() => setFocusedTargetId(entry.id)}
                                            onBlur={() => setFocusedTargetId(null)}
                                            placeholder={t('config.targetModelPlaceholder', '如 gemini-2.5-pro')}
                                            className={`w-full ui-input p-1.5 sm:p-2 text-xs text-amber-500 dark:text-amber-300 ${
                                              isMultiTarget && focusedTargetId !== entry.id ? 'pr-6' : ''
                                            }`}
                                          />
                                          {isMultiTarget && focusedTargetId !== entry.id && (
                                            <div className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none z-10 flex items-center">
                                              <span
                                                className="text-[9px] font-mono font-bold text-amber-500 dark:text-amber-300 bg-[var(--bg-surface-sub)] border border-amber-500/60 shadow-sm px-1 py-0.5 rounded leading-none flex items-center select-none"
                                                title={`${targets.length} targets configured`}
                                              >
                                                ×{targets.length}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
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
                          className="w-full py-2 ui-btn-secondary text-amber-400/90 flex items-center justify-center space-x-1.5"
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
                <div className="space-y-3.5 sm:space-y-4 animate-in fade-in duration-150">
                  <div className="ui-card-sub p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    <div className="hidden sm:flex items-center space-x-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                      <span>{t('config.securityGroup')}</span>
                    </div>

                    <div className="ui-card-sub p-3 sm:p-4 space-y-1 sm:space-y-2">
                      <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
                        <Info className="w-4 h-4 text-indigo-400" />
                        <span>{t('config.adminSecretTitle')}</span>
                      </div>
                      <p className="hidden sm:block text-[11px] text-slate-400 leading-relaxed">
                        {t('config.adminSecretDesc')}
                      </p>
                    </div>

                    <div className="bg-rose-950/20 border border-rose-800/30 p-3 sm:p-4 rounded-xl space-y-2 sm:space-y-3">
                      <div className="flex items-center space-x-2 text-xs font-bold text-rose-300">
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        <span>{t('config.factoryResetTitle')}</span>
                      </div>
                      <p className="hidden sm:block text-[11px] text-slate-400">
                        {t('config.factoryResetDesc')}
                      </p>
                      <button
                        type="button"
                        onClick={handleResetToEnv}
                        disabled={saving}
                        className="px-3.5 sm:px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl font-semibold text-xs transition-colors flex items-center space-x-1.5 active:scale-95"
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
            <div className="sticky bottom-0 bg-[var(--bg-surface-sub)]/95 backdrop-blur-xl border-t border-[var(--border-subtle)] p-3 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shrink-0">
              <span className="hidden sm:inline text-[11px] text-slate-500 font-mono text-left">
                {t('config.footerNote')}
              </span>

              <div className="flex items-center space-x-2.5 sm:space-x-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2 ui-btn-secondary text-center"
                >
                  {t('config.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 sm:flex-none px-5 py-2 ui-btn-primary flex items-center justify-center space-x-1.5 disabled:opacity-50"
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
