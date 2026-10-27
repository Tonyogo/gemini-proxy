import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
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
  Github,
  ChevronDown,
  Search
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import type { EffortLevel, EffortModelMappings } from './EffortSelector';

export interface UpstreamServerConfig {
  url: string;
  weight: number;
  enabled: boolean;
  name?: string;
  allowedModels?: string[];
  type?: 'proxy' | 'direct';
  apiKeys?: string[];
  proxyUrl?: string;
  useProxy?: boolean;
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

const SPLIT_BORDER_COLORS = [
  'border-l-blue-500',
  'border-l-emerald-500',
  'border-l-purple-500',
  'border-l-amber-500',
  'border-l-cyan-500',
  'border-l-rose-500',
  'border-l-indigo-500',
  'border-l-teal-500'
];

const getCompactHost = (rawUrl?: string) => {
  const target = (rawUrl || '').trim();
  if (!target) return '';
  try {
    const withProto = /^https?:\/\//i.test(target) ? target : `https://${target}`;
    const u = new URL(withProto);
    return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
  } catch {
    return target.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
};

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
  initialTab?: TabType;
  onSaved?: () => void;
}

import {
  MappingEntry,
  parseMappingsObjectToEntries,
  serializeEntriesToMappingsObject
} from '../utils/mappingHelpers';

export type { MappingEntry };
export { parseMappingsObjectToEntries, serializeEntriesToMappingsObject };

interface ConfigSnapshot {
  stripSystemFingerprints: boolean;
  ignoredTools: string[];
  customSystemInstruction: string;
  proxyUrl: string;
  upstreamServers: UpstreamServerConfig[];
  serverKeyInputs: Record<number, string>;
  serverModelInputs: Record<number, string>;
  upstreamTimeoutMs: number;
  logLevel: string;
  logRetentionDays: number;
  countTokensModel: string;
  ephemeralUserMessagesText: string;
  ephemeralSystemMessagesText: string;
  effortLevel: EffortLevel;
  effortMappingsRaw: Record<EffortLevel, string>;
}

type TabType = 'general' | 'upstream' | 'instructions' | 'mappings' | 'security';

const VALID_CONFIG_TABS: TabType[] = ['general', 'upstream', 'instructions', 'mappings', 'security'];

export default function ConfigModal({ isOpen, onClose, adminKey, initialTab, onSaved }: ConfigModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (initialTab && VALID_CONFIG_TABS.includes(initialTab)) {
      return initialTab;
    }
    const saved = localStorage.getItem('admin_config_tab') as TabType;
    return VALID_CONFIG_TABS.includes(saved) ? saved : 'general';
  });

  useEffect(() => {
    if (isOpen && initialTab && VALID_CONFIG_TABS.includes(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    localStorage.setItem('admin_config_tab', tabId);
  };

  const initialConfigRef = useRef<ConfigSnapshot | null>(null);
  const [snapshotRevision, setSnapshotRevision] = useState<number>(0);
  const [expandedServers, setExpandedServers] = useState<Record<number, boolean>>({ 0: true });
  const [mappingSearchQuery, setMappingSearchQuery] = useState<string>('');

  const [stripSystemFingerprints, setStripSystemFingerprints] = useState<boolean>(true);
  const [ignoredTools, setIgnoredTools] = useState<string[]>(DEFAULT_IGNORED_TOOLS);
  const [toolInputText, setToolInputText] = useState<string>('');
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [upstreamServers, setUpstreamServers] = useState<UpstreamServerConfig[]>([]);
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');
  const [logRetentionDays, setLogRetentionDays] = useState<number>(3);
  const [countTokensModel, setCountTokensModel] = useState<string>('');
  const [proxyUrl, setProxyUrl] = useState<string>('');
  const [ephemeralUserMessagesText, setEphemeralUserMessagesText] = useState<string>('');
  const [ephemeralSystemMessagesText, setEphemeralSystemMessagesText] = useState<string>('');
  const [serverModelInputs, setServerModelInputs] = useState<Record<number, string>>({});
  const [serverKeyInputs, setServerKeyInputs] = useState<Record<number, string>>({});

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

  // KV Editor and Raw JSON Sync States (Per Effort Level)
  const [activeEffortLevel, setActiveEffortLevel] = useState<EffortLevel>('medium');
  const [editingEffortTab, setEditingEffortTab] = useState<EffortLevel>('medium');
  const [effortMappingEntries, setEffortMappingEntries] = useState<Record<EffortLevel, MappingEntry[]>>({
    low: [],
    medium: [],
    high: []
  });
  const [effortMappingsRaw, setEffortMappingsRaw] = useState<Record<EffortLevel, string>>({
    low: '{}',
    medium: '{}',
    high: '{}'
  });
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
          setStripSystemFingerprints(data.config.stripSystemFingerprints !== false);
          if (Array.isArray(data.config.ignoredTools)) {
            setIgnoredTools(data.config.ignoredTools);
          } else {
            setIgnoredTools(DEFAULT_IGNORED_TOOLS);
          }
          setCustomSystemInstruction(data.config.customSystemInstruction || '');
          let normalizedServers: UpstreamServerConfig[] = [];
          const keyInputs: Record<number, string> = {};
          const modelInputs: Record<number, string> = {};

          if (data.config.upstreamServers && Array.isArray(data.config.upstreamServers) && data.config.upstreamServers.length > 0) {
            const normalized = data.config.upstreamServers.map((srv: any) => ({
              ...srv,
              enabled: srv.enabled !== false
            }));
            normalizedServers = normalized;
            setUpstreamServers(normalized);
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
          } else {
            normalizedServers = [{ url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API', type: 'proxy' }];
            setUpstreamServers(normalizedServers);
          }
          setUpstreamTimeoutMs(data.config.upstreamTimeoutMs || 180000);
          setLogLevel(data.config.logLevel || 'info');
          setLogRetentionDays(data.config.logRetentionDays || 3);
          setCountTokensModel(data.config.countTokensModel || '');
          setProxyUrl(data.config.proxyUrl || '');
          const userMsgs = Array.isArray(data.config.ephemeralUserMessages)
            ? data.config.ephemeralUserMessages.join('\n')
            : '';
          const sysMsgs = Array.isArray(data.config.ephemeralSystemMessages)
            ? data.config.ephemeralSystemMessages.join('\n')
            : '';
          setEphemeralUserMessagesText(userMsgs);
          setEphemeralSystemMessagesText(sysMsgs);

          const lvl: EffortLevel = (data.config.effortLevel && ['low', 'medium', 'high'].includes(data.config.effortLevel))
            ? data.config.effortLevel
            : 'medium';
          setActiveEffortLevel(lvl);
          setEditingEffortTab(lvl);

          const rawEffortMappings: Record<string, any> = data.config.effortModelMappings || {};
          const fallbackMappings = data.config.modelMappings || {};

          const initialEntries: Record<EffortLevel, MappingEntry[]> = {
            low: [],
            medium: [],
            high: []
          };
          const initialRaw: Record<EffortLevel, string> = {
            low: '{}',
            medium: '{}',
            high: '{}'
          };

          for (const el of (['low', 'medium', 'high'] as EffortLevel[])) {
            const m = rawEffortMappings[el] !== undefined ? rawEffortMappings[el] : fallbackMappings;
            initialRaw[el] = JSON.stringify(m || {}, null, 2);
            initialEntries[el] = parseMappingsObjectToEntries(m || {});
          }

          setEffortMappingEntries(initialEntries);
          setEffortMappingsRaw(initialRaw);

          // Capture initial pristine snapshot for dirty checking
          initialConfigRef.current = {
            stripSystemFingerprints: data.config.stripSystemFingerprints !== false,
            ignoredTools: Array.isArray(data.config.ignoredTools) ? [...data.config.ignoredTools] : [...DEFAULT_IGNORED_TOOLS],
            customSystemInstruction: data.config.customSystemInstruction || '',
            proxyUrl: (data.config.proxyUrl || '').trim(),
            upstreamServers: JSON.parse(JSON.stringify(normalizedServers)),
            serverKeyInputs: { ...keyInputs },
            serverModelInputs: { ...modelInputs },
            upstreamTimeoutMs: data.config.upstreamTimeoutMs || 180000,
            logLevel: data.config.logLevel || 'info',
            logRetentionDays: data.config.logRetentionDays || 3,
            countTokensModel: data.config.countTokensModel || '',
            ephemeralUserMessagesText: userMsgs,
            ephemeralSystemMessagesText: sysMsgs,
            effortLevel: lvl,
            effortMappingsRaw: { ...initialRaw }
          };
          setSnapshotRevision(prev => prev + 1);
          setExpandedServers({ 0: true });
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
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentEntries = effortMappingEntries[editingEffortTab] || [];

  const updateCurrentEntriesAndRaw = (newEntries: MappingEntry[]) => {
    const rawObj = serializeEntriesToMappingsObject(newEntries);
    const rawStr = JSON.stringify(rawObj, null, 2);
    setEffortMappingEntries(prev => ({
      ...prev,
      [editingEffortTab]: newEntries
    }));
    setEffortMappingsRaw(prev => ({
      ...prev,
      [editingEffortTab]: rawStr
    }));
  };

  const handleAddMapping = () => {
    const newEntries: MappingEntry[] = [
      ...currentEntries,
      { id: Math.random().toString(36).substring(2, 9), source: '', target: '', strategy: '' }
    ];
    updateCurrentEntriesAndRaw(newEntries);
  };

  const handleRemoveMapping = (id: string) => {
    const newEntries = currentEntries.filter(e => e.id !== id);
    updateCurrentEntriesAndRaw(newEntries);
  };

  const handleEntryChange = (id: string, field: 'source' | 'target' | 'strategy', value: string) => {
    const newEntries = currentEntries.map(e => e.id === id ? { ...e, [field]: value } : e);
    updateCurrentEntriesAndRaw(newEntries);
  };

  const handleToggleHigh = (id: string, target: string) => {
    const trimmed = target.trim();
    const newTarget = trimmed.endsWith('-high') ? trimmed.slice(0, -5) : (trimmed ? `${trimmed}-high` : '');
    handleEntryChange(id, 'target', newTarget);
  };

  const handleRawJsonChange = (val: string) => {
    setEffortMappingsRaw(prev => ({
      ...prev,
      [editingEffortTab]: val
    }));
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) {
        const entries = parseMappingsObjectToEntries(parsed);
        setEffortMappingEntries(prev => ({
          ...prev,
          [editingEffortTab]: entries
        }));
      }
    } catch {
      // Ignore JSON parse error while user is typing
    }
  };

  const handleCopyFromEffort = (sourceLevel: EffortLevel) => {
    const srcRaw = effortMappingsRaw[sourceLevel] || '{}';
    try {
      const parsed = JSON.parse(srcRaw);
      const clonedEntries = parseMappingsObjectToEntries(parsed);
      const clonedRaw = JSON.stringify(parsed, null, 2);
      setEffortMappingEntries(prev => ({
        ...prev,
        [editingEffortTab]: clonedEntries
      }));
      setEffortMappingsRaw(prev => ({
        ...prev,
        [editingEffortTab]: clonedRaw
      }));
    } catch (err: any) {
      alert(`${t('effort.invalidJsonInLevel', { level: sourceLevel.toUpperCase() })}${err.message}`);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const parsedEffortMappings: Record<EffortLevel, any> = {
      low: {},
      medium: {},
      high: {}
    };

    for (const lvl of (['low', 'medium', 'high'] as EffortLevel[])) {
      try {
        parsedEffortMappings[lvl] = JSON.parse(effortMappingsRaw[lvl] || '{}');
      } catch (err: any) {
        alert(`${t('effort.invalidJsonInLevel', { level: lvl.toUpperCase() })}${err.message}`);
        setEditingEffortTab(lvl);
        return;
      }
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
          stripSystemFingerprints,
          ignoredTools,
          customSystemInstruction,
          proxyUrl: proxyUrl.trim(),
          upstreamServers: upstreamServers.map((s) => {
            return {
              url: s.url.trim().replace(/\/+$/, ''),
              weight: Math.max(1, Math.min(1000, Number(s.weight) || 1)),
              enabled: s.enabled !== false,
              type: s.type || 'proxy',
              useProxy: Boolean(s.useProxy),
              ...(s.name?.trim() ? { name: s.name.trim() } : {}),
              ...(Array.isArray(s.allowedModels) && s.allowedModels.length > 0 ? { allowedModels: s.allowedModels } : {}),
              ...(s.proxyUrl?.trim() ? { proxyUrl: s.proxyUrl.trim() } : {})
            };
          }),
          upstreamTimeoutMs,
          logLevel,
          logRetentionDays,
          countTokensModel,
          ephemeralUserMessages: ephemeralUserMessagesText.split('\n').map(s => s.trim()).filter(Boolean),
          ephemeralSystemMessages: ephemeralSystemMessagesText.split('\n').map(s => s.trim()).filter(Boolean),
          effortLevel: activeEffortLevel,
          effortModelMappings: parsedEffortMappings,
          modelMappings: parsedEffortMappings[activeEffortLevel]
        })
      });

      if (res.ok) {
        setToast(t('config.toastSaved'));
        initialConfigRef.current = {
          stripSystemFingerprints,
          ignoredTools: [...ignoredTools],
          customSystemInstruction,
          proxyUrl: proxyUrl.trim(),
          upstreamServers: JSON.parse(JSON.stringify(upstreamServers)),
          serverKeyInputs: { ...serverKeyInputs },
          serverModelInputs: { ...serverModelInputs },
          upstreamTimeoutMs,
          logLevel,
          logRetentionDays,
          countTokensModel,
          ephemeralUserMessagesText,
          ephemeralSystemMessagesText,
          effortLevel: activeEffortLevel,
          effortMappingsRaw: { ...effortMappingsRaw }
        };
        setSnapshotRevision(prev => prev + 1);
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

  const handleRevertChanges = () => {
    const snap = initialConfigRef.current;
    if (!snap) return;
    if (window.confirm(t('config.confirmRevert'))) {
      setStripSystemFingerprints(snap.stripSystemFingerprints);
      setIgnoredTools([...snap.ignoredTools]);
      setCustomSystemInstruction(snap.customSystemInstruction);
      setProxyUrl(snap.proxyUrl);
      setUpstreamServers(JSON.parse(JSON.stringify(snap.upstreamServers)));
      setServerKeyInputs({ ...snap.serverKeyInputs });
      setServerModelInputs({ ...snap.serverModelInputs });
      setUpstreamTimeoutMs(snap.upstreamTimeoutMs);
      setLogLevel(snap.logLevel);
      setLogRetentionDays(snap.logRetentionDays);
      setCountTokensModel(snap.countTokensModel);
      setEphemeralUserMessagesText(snap.ephemeralUserMessagesText);
      setEphemeralSystemMessagesText(snap.ephemeralSystemMessagesText);
      setActiveEffortLevel(snap.effortLevel);
      setEditingEffortTab(snap.effortLevel);
      setEffortMappingsRaw({ ...snap.effortMappingsRaw });
      const revertedEntries: Record<EffortLevel, MappingEntry[]> = {
        low: [],
        medium: [],
        high: []
      };
      for (const el of (['low', 'medium', 'high'] as EffortLevel[])) {
        try {
          const parsed = JSON.parse(snap.effortMappingsRaw[el]);
          revertedEntries[el] = parseMappingsObjectToEntries(parsed);
        } catch {
          revertedEntries[el] = [];
        }
      }
      setEffortMappingEntries(revertedEntries);
    }
  };

  const { isDirty, dirtyCount, tabDirtyMap } = useMemo(() => {
    const snap = initialConfigRef.current;
    if (!snap) {
      return {
        isDirty: false,
        dirtyCount: 0,
        tabDirtyMap: { general: false, upstream: false, instructions: false, mappings: false, security: false }
      };
    }

    let count = 0;
    const dirtyTabs = {
      general: false,
      upstream: false,
      instructions: false,
      mappings: false,
      security: false
    };

    let generalDirty = false;
    if (logLevel !== snap.logLevel) { count++; generalDirty = true; }
    if (logRetentionDays !== snap.logRetentionDays) { count++; generalDirty = true; }
    if (countTokensModel !== snap.countTokensModel) { count++; generalDirty = true; }
    if (proxyUrl.trim() !== snap.proxyUrl.trim()) { count++; generalDirty = true; }
    if (upstreamTimeoutMs !== snap.upstreamTimeoutMs) { count++; generalDirty = true; }
    dirtyTabs.general = generalDirty;

    let upstreamDirty = false;
    const serversChanged = JSON.stringify(upstreamServers) !== JSON.stringify(snap.upstreamServers) ||
      JSON.stringify(serverKeyInputs) !== JSON.stringify(snap.serverKeyInputs) ||
      JSON.stringify(serverModelInputs) !== JSON.stringify(snap.serverModelInputs);
    if (serversChanged) {
      count++;
      upstreamDirty = true;
    }
    dirtyTabs.upstream = upstreamDirty;

    let instructionsDirty = false;
    if (stripSystemFingerprints !== snap.stripSystemFingerprints) { count++; instructionsDirty = true; }
    if (JSON.stringify(ignoredTools) !== JSON.stringify(snap.ignoredTools)) { count++; instructionsDirty = true; }
    if (customSystemInstruction !== snap.customSystemInstruction) { count++; instructionsDirty = true; }
    if (ephemeralUserMessagesText !== snap.ephemeralUserMessagesText) { count++; instructionsDirty = true; }
    if (ephemeralSystemMessagesText !== snap.ephemeralSystemMessagesText) { count++; instructionsDirty = true; }
    dirtyTabs.instructions = instructionsDirty;

    let mappingsDirty = false;
    if (activeEffortLevel !== snap.effortLevel) {
      count++;
      mappingsDirty = true;
    }
    for (const lvl of (['low', 'medium', 'high'] as EffortLevel[])) {
      if ((effortMappingsRaw[lvl] || '').trim() !== (snap.effortMappingsRaw[lvl] || '').trim()) {
        count++;
        mappingsDirty = true;
      }
    }
    dirtyTabs.mappings = mappingsDirty;

    return {
      isDirty: count > 0,
      dirtyCount: count,
      tabDirtyMap: dirtyTabs
    };
  }, [
    logLevel,
    logRetentionDays,
    countTokensModel,
    proxyUrl,
    upstreamTimeoutMs,
    upstreamServers,
    serverKeyInputs,
    serverModelInputs,
    stripSystemFingerprints,
    ignoredTools,
    customSystemInstruction,
    ephemeralUserMessagesText,
    ephemeralSystemMessagesText,
    activeEffortLevel,
    effortMappingsRaw,
    snapshotRevision
  ]);

  const toggleServerExpand = (idx: number) => {
    setExpandedServers(prev => ({ [idx]: !prev[idx] }));
  };

  const handleExpandAllServers = () => {
    const all: Record<number, boolean> = {};
    upstreamServers.forEach((_, idx) => {
      all[idx] = true;
    });
    setExpandedServers(all);
  };

  const handleCollapseAllServers = () => {
    setExpandedServers({});
  };

  const filteredMappingEntries = useMemo(() => {
    const q = mappingSearchQuery.trim().toLowerCase();
    if (!q) return currentEntries;
    return currentEntries.filter(
      e => e.source.toLowerCase().includes(q) || e.target.toLowerCase().includes(q)
    );
  }, [currentEntries, mappingSearchQuery]);

  const handleCloseModal = useCallback(() => {
    if (isDirty) {
      if (!window.confirm(t('config.confirmRevert'))) {
        return;
      }
    }
    onClose();
  }, [isDirty, onClose, t]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        handleCloseModal();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleCloseModal, handleSave]);

  const TABS = [
    {
      id: 'general',
      label: t('config.tabGeneral'),
      shortLabel: t('config.tabGeneralShort', '通用'),
      desc: t('config.tabGeneralDesc', '日志级别与超时策略'),
      icon: Sliders
    },
    {
      id: 'upstream',
      label: t('config.tabUpstream'),
      shortLabel: t('config.tabUpstreamShort', '上游'),
      desc: t('config.tabUpstreamDesc', '网关调度与直连密钥池'),
      icon: Globe
    },
    {
      id: 'instructions',
      label: t('config.tabInstructions'),
      shortLabel: t('config.tabInstructionsShort', '指令'),
      desc: t('config.tabInstructionsDesc', '系统提示词与指纹清理'),
      icon: FileCode
    },
    {
      id: 'mappings',
      label: t('config.tabMappings'),
      shortLabel: t('config.tabMappingsShort', '映射'),
      desc: t('config.tabMappingsDesc', '模型路由与调度策略'),
      icon: ArrowRightLeft
    },
    {
      id: 'security',
      label: t('config.tabSecurity'),
      shortLabel: t('config.tabSecurityShort', '安全'),
      desc: t('config.tabSecurityDesc', '管理凭证与出厂重置'),
      icon: ShieldCheck
    }
  ];

  const currentTabObj = TABS.find(t => t.id === activeTab) || TABS[0];
  const CurrentTabIcon = currentTabObj.icon;

  return (
    <div className="backdrop-blur-xl bg-black/60 fixed inset-0 overflow-hidden overscroll-none flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="relative ui-card rounded-t-2xl sm:rounded-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[92dvh] sm:h-[86vh] sm:max-h-[880px]">
        {/* Mobile Drag Handle Pill */}
        <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full mx-auto my-1.5 block sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 sm:py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] shrink-0">
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
              onClick={handleCloseModal}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors shrink-0"
              title="ESC"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Linear Styled Tab Pills */}
        <div className="flex sm:hidden items-center space-x-1 px-2 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]/80 overflow-x-auto scrollbar-none shrink-0 w-full">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasTabDirty = tabDirtyMap[tab.id as TabType];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id as TabType)}
                className={`ui-tab-pill flex-1 justify-center px-1.5 py-1 flex items-center space-x-1 whitespace-nowrap text-center relative ${
                  isActive
                    ? 'ui-tab-pill-active font-semibold'
                    : ''
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="text-xs">{tab.shortLabel}</span>
                {hasTabDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body / Dual Column Workbench Layout */}
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-3 flex-1">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
            <span>{t('config.loading')}</span>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
            {/* Desktop Vertical Sidebar Navigation */}
            <aside className="hidden sm:flex flex-col w-60 border-r border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]/50 shrink-0 select-none p-3 justify-between">
              <div className="space-y-1">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const hasTabDirty = tabDirtyMap[tab.id as TabType];
                  const badgeText = tab.id === 'upstream'
                    ? t('config.nodesBadge', '{count} 节点').replace('{count}', String(upstreamServers.length))
                    : tab.id === 'mappings'
                    ? t('config.rulesBadge', '{count} 规则').replace('{count}', String(effortMappingEntries[activeEffortLevel]?.length || 0))
                    : null;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleTabChange(tab.id as TabType)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-start space-x-2.5 group relative ${
                        isActive
                          ? 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 dark:text-indigo-300 font-semibold shadow-xs'
                          : 'border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 transition-colors ${
                        isActive ? 'bg-indigo-600 text-white shadow-xs' : 'bg-[var(--bg-surface-sub)] text-slate-400 group-hover:text-[var(--text-primary)]'
                      }`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs truncate">{tab.label}</span>
                          <div className="flex items-center space-x-1 shrink-0">
                            {hasTabDirty && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" title="Unsaved changes" />
                            )}
                            {badgeText && (
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                                isActive
                                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                  : 'bg-[var(--bg-surface)] text-slate-400 border border-[var(--border-subtle)]'
                              }`}>
                                {badgeText}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] opacity-70 truncate mt-0.5">
                          {tab.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Sidebar Footer Info */}
              <div className="pt-3 border-t border-[var(--border-subtle)] px-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span className="font-mono text-[10px]">Gemini Proxy</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Runtime
                  </span>
                </div>
              </div>
            </aside>

            {/* Main Config Form Area */}
            <form onSubmit={handleSave} className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <div className="p-3.5 sm:p-6 overflow-y-auto overscroll-contain flex-1 space-y-4 sm:space-y-5">
                {toast && (
                  <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs text-center font-bold flex items-center justify-center space-x-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>{toast}</span>
                  </div>
                )}

                {/* Desktop Tab Header Banner */}
                <div className="hidden sm:flex items-center justify-between pb-3.5 mb-1 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                      <CurrentTabIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        {currentTabObj.label}
                      </h3>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {currentTabObj.desc}
                      </p>
                    </div>
                  </div>
                  {activeTab === 'upstream' && (
                    <span className="text-[11px] font-mono text-slate-400 bg-[var(--bg-surface-sub)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                      {t('config.nodesBadge', '{count} 节点').replace('{count}', String(upstreamServers.length))}
                    </span>
                  )}
                  {activeTab === 'mappings' && (
                    <span className="text-[11px] font-mono text-slate-400 bg-[var(--bg-surface-sub)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                      {t('config.rulesBadge', '{count} 规则').replace('{count}', String((effortMappingEntries[editingEffortTab] || []).length))}
                    </span>
                  )}
                </div>

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
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={handleExpandAllServers}
                              className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors flex items-center space-x-1"
                            >
                              <span>{t('config.expandAll', '全部展开')}</span>
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                              type="button"
                              onClick={handleCollapseAllServers}
                              className="text-[10px] font-mono text-slate-400 hover:text-slate-300 transition-colors flex items-center space-x-1"
                            >
                              <span>{t('config.collapseAll', '全部折叠')}</span>
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                              type="button"
                              onClick={handleOfficialDefault}
                              className="text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1 flex-shrink-0"
                            >
                              <Zap className="w-2.5 h-2.5" />
                              <span>{t('config.useOfficialDefault', '填入官方默认')}</span>
                            </button>
                          </div>
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
                            const borderColor = SPLIT_BORDER_COLORS[idx % SPLIT_BORDER_COLORS.length];
                            const isExpanded = expandedServers[idx] !== false;
                            const compactHost = getCompactHost(server.url);
                            const currentModelCount = (serverModelInputs[idx] !== undefined ? serverModelInputs[idx] : (server.allowedModels || []).join(', '))
                              .split(',')
                              .map(s => s.trim())
                              .filter(Boolean).length;

                            return (
                              <div
                                key={idx}
                                className={`relative p-3 rounded-lg border border-l-4 transition-all ${
                                  server.enabled
                                    ? `bg-slate-800/40 border-slate-700/70 hover:border-slate-600 ${borderColor}`
                                    : 'bg-slate-900/30 border-slate-800/60 opacity-60 border-l-slate-600'
                                }`}
                              >
                                <div
                                  onClick={() => toggleServerExpand(idx)}
                                  className={`cursor-pointer select-none ${isExpanded ? 'pb-2.5 mb-2.5 border-b border-slate-700/40' : ''}`}
                                >
                                  {/* First Row: Status, Node Name, Percentage, Controls */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/80 shrink-0">
                                        #{idx + 1}
                                      </span>
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
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        className="hidden sm:inline-flex rounded p-0.5 bg-slate-900 border border-slate-700/80 ml-1.5 shrink-0"
                                      >
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const updated = [...upstreamServers];
                                            let nextUrl = (updated[idx].url || '').trim();
                                            if (!nextUrl) {
                                              nextUrl = 'https://generativelanguage.googleapis.com';
                                            }
                                            updated[idx] = { ...updated[idx], type: 'direct', url: nextUrl };
                                            setUpstreamServers(updated);
                                          }}
                                          className={`px-2 py-0.5 text-[10px] rounded font-medium transition-all ${
                                            server.type === 'direct'
                                              ? 'bg-cyan-600 text-white shadow-xs'
                                              : 'text-slate-400 hover:text-slate-200'
                                          }`}
                                        >
                                          {t('config.serverTypeDirect', '直连模式 (Direct)')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const updated = [...upstreamServers];
                                            updated[idx] = { ...updated[idx], type: 'proxy' };
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
                                      </div>
                                    </div>

                                    {/* Right Controls: Enable Toggle & Delete Button & Chevron */}
                                    <div className="flex items-center space-x-2 sm:space-x-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        role="switch"
                                        aria-checked={server.enabled}
                                        aria-label={server.enabled ? t('config.nodeEnabled', '已启用') : t('config.nodeDisabled', '已禁用')}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = [...upstreamServers];
                                          const isEnabled = server.enabled !== false;
                                          updated[idx] = { ...updated[idx], enabled: !isEnabled };
                                          setUpstreamServers(updated);
                                        }}
                                        className="flex items-center space-x-1.5 cursor-pointer group focus:outline-none p-1 -m-1 sm:p-0 sm:m-0"
                                        title={server.enabled ? t('config.nodeEnabled', '已启用') : t('config.nodeDisabled', '已禁用')}
                                      >
                                        <div className={`w-7 h-4 rounded-full transition-colors relative ${server.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
                                          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${server.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                        </div>
                                        <span className="hidden sm:inline text-[11px] text-slate-400">
                                          {server.enabled ? t('config.nodeEnabled', '已启用') : t('config.nodeDisabled', '已禁用')}
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={upstreamServers.length <= 1}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (upstreamServers.length <= 1) return;
                                          const updated = upstreamServers.filter((_, i) => i !== idx);
                                          setUpstreamServers(updated);
                                        }}
                                        className={`p-1.5 sm:p-1 text-slate-400 hover:text-red-400 transition-colors ${
                                          upstreamServers.length <= 1 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                                        }`}
                                        title={upstreamServers.length <= 1 ? t('config.atLeastOneServer', '至少需要保留一个上游网关节点') : 'Delete'}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleServerExpand(idx);
                                        }}
                                        className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                                        title={isExpanded ? t('config.collapseAll', '折叠') : t('config.expandAll', '展开')}
                                      >
                                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Collapsed State Compact Summary Pills */}
                                  {!isExpanded && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        server.type === 'direct'
                                          ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                          : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                      }`}>
                                        {server.type === 'direct' ? t('config.modeDirectShort', '直连') : t('config.modeProxyShort', '代理')}
                                      </span>
                                      <span className="font-mono text-slate-300 truncate max-w-[280px]" title={server.url}>
                                        {compactHost || t('config.noEndpointSet', '未设置端点')}
                                      </span>
                                      <span className="text-slate-600">•</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                        server.useProxy
                                          ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                                      }`}>
                                        {server.useProxy ? t('config.egressProxyShort', '代理通道') : t('config.egressLocalShort', '本机直连')}
                                      </span>
                                      {currentModelCount > 0 && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                          模型 ×{currentModelCount}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {isExpanded && (
                                  <div className="grid grid-cols-12 gap-2 sm:gap-2.5 text-xs animate-in fade-in duration-150">
                                    {/* Mobile-only Full-Width Segmented Mode Switcher */}
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="col-span-12 grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg mt-2 sm:hidden gap-1"
                                    >
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = [...upstreamServers];
                                          let nextUrl = (updated[idx].url || '').trim();
                                          if (!nextUrl) {
                                            nextUrl = 'https://generativelanguage.googleapis.com';
                                          }
                                          updated[idx] = { ...updated[idx], type: 'direct', url: nextUrl };
                                          setUpstreamServers(updated);
                                        }}
                                        className={`py-1.5 px-2 text-xs rounded-md font-medium text-center transition-all ${
                                          server.type === 'direct'
                                            ? 'bg-cyan-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                      >
                                        {t('config.serverTypeDirect', '直连模式 (Direct)')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const updated = [...upstreamServers];
                                          updated[idx] = { ...updated[idx], type: 'proxy' };
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
                                    </div>
                                  <div className="col-span-12 grid grid-cols-12 gap-2 sm:gap-2.5">
                                    <div className="col-span-8 sm:col-span-3 space-y-1">
                                      <label className="text-[11px] text-slate-400 block">{t('config.nodeName', '节点备注名')}</label>
                                      <input
                                        type="text"
                                        value={server.name || ''}
                                        onChange={(e) => {
                                          const updated = [...upstreamServers];
                                          updated[idx] = { ...updated[idx], name: e.target.value };
                                          setUpstreamServers(updated);
                                        }}
                                        placeholder={server.type === 'direct' ? 'e.g. Gemini-Official' : 'e.g. HK-Gateway'}
                                        className="w-full ui-input py-1.5 px-2 text-xs"
                                      />
                                    </div>
                                    <div className="col-span-4 sm:col-span-2 space-y-1 sm:order-last">
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
                                        className="w-full ui-input py-1.5 px-2 text-xs font-mono"
                                      />
                                    </div>
                                    <div className="col-span-12 sm:col-span-7 space-y-1">
                                      <label className="text-[11px] text-slate-400 block">{t('config.nodeUrl', '网关 / 端点 URL')}</label>
                                      <input
                                        type="text"
                                        value={server.url}
                                        onChange={(e) => {
                                          const updated = [...upstreamServers];
                                          updated[idx] = { ...updated[idx], url: e.target.value };
                                          setUpstreamServers(updated);
                                        }}
                                        onBlur={() => {
                                          const updated = [...upstreamServers];
                                          let clean = (updated[idx].url || '').trim().replace(/\/+$/, '');
                                          if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
                                          updated[idx] = { ...updated[idx], url: clean };
                                          setUpstreamServers(updated);
                                        }}
                                        placeholder={server.type === 'direct' ? 'https://generativelanguage.googleapis.com' : 'https://api.example.com'}
                                        className="w-full ui-input py-1.5 px-2 text-xs font-mono"
                                      />
                                    </div>
                                  </div>

                                  {/* Row 2: Allowed Models + Unified Egress Channel */}
                                  <div className="col-span-12 grid grid-cols-12 gap-2 sm:gap-2.5 items-end">
                                    <div className="col-span-12 sm:col-span-7 space-y-1">
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
                                          placeholder={t('config.serverAllowedModelsPlaceholder', '全部模型 (逗号分隔过滤)')}
                                          className="w-full ui-input py-1.5 px-2 text-xs font-mono pr-8"
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

                                    <div className="col-span-12 sm:col-span-5 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-1.5">
                                          <ArrowRightLeft className={`w-3.5 h-3.5 shrink-0 ${server.type === 'direct' ? 'text-cyan-400' : 'text-indigo-400'}`} />
                                          <span className={`text-[11px] font-semibold ${server.type === 'direct' ? 'text-cyan-400' : 'text-slate-300'}`}>
                                            {t('config.egressChannelTitle', '出口通道')}
                                          </span>
                                        </div>
                                        {server.useProxy ? (
                                          proxyUrl.trim() ? (
                                            <span
                                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border truncate max-w-[160px] ${
                                                server.type === 'direct'
                                                  ? 'text-cyan-300 bg-slate-800/80 border-cyan-500/30'
                                                  : 'text-indigo-300 bg-slate-800/80 border-indigo-500/30'
                                              }`}
                                              title={proxyUrl.trim()}
                                            >
                                              {t('config.viaGlobalProxyBadge', '全局代理: {proxy}').replace('{proxy}', proxyUrl.trim())}
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-medium text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                                              {t('config.globalProxyNotConfigured', '需配置全局代理')}
                                            </span>
                                          )
                                        ) : null}
                                      </div>
                                      <div className="grid grid-cols-2 p-0.5 rounded-md bg-slate-950 border border-slate-700/80 h-[30px]">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...upstreamServers];
                                            updated[idx] = { ...updated[idx], useProxy: false };
                                            setUpstreamServers(updated);
                                          }}
                                          className={`h-full flex items-center justify-center text-[10px] rounded font-medium transition-all ${
                                            !server.useProxy
                                              ? (server.type === 'direct' ? 'bg-cyan-600 text-white shadow-xs font-semibold' : 'bg-indigo-600 text-white shadow-xs font-semibold')
                                              : 'text-slate-400 hover:text-slate-200'
                                          }`}
                                        >
                                          {t('config.egressLocalShort', '本机直连')}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...upstreamServers];
                                            updated[idx] = { ...updated[idx], useProxy: true };
                                            setUpstreamServers(updated);
                                          }}
                                          className={`h-full flex items-center justify-center text-[10px] rounded font-medium transition-all ${
                                            Boolean(server.useProxy)
                                              ? (server.type === 'direct' ? 'bg-cyan-600 text-white shadow-xs font-semibold' : 'bg-indigo-600 text-white shadow-xs font-semibold')
                                              : 'text-slate-400 hover:text-slate-200'
                                          }`}
                                        >
                                          {t('config.egressProxyShort', '代理通道')}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}

                          <button
                            type="button"
                            onClick={() => {
                              const newIndex = upstreamServers.length;
                              const updated: UpstreamServerConfig[] = [
                                ...upstreamServers,
                                {
                                  url: 'https://generativelanguage.googleapis.com',
                                  weight: 1,
                                  enabled: true,
                                  name: '',
                                  type: 'direct',
                                  apiKeys: []
                                }
                              ];
                              setUpstreamServers(updated);
                              setExpandedServers({ [newIndex]: true });
                            }}
                            className="w-full py-2.5 px-3 border border-dashed border-slate-700 hover:border-blue-500/50 rounded-lg text-xs font-medium text-slate-400 hover:text-blue-400 transition-colors flex items-center justify-center space-x-1.5 bg-slate-850 hover:bg-blue-500/5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t('config.addUpstreamServer', '添加上游节点')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Global Network & Timeout Parameters */}
                      <div className="pt-2 border-t border-slate-700/60 space-y-3">
                        <div className="flex items-center space-x-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          <Sliders className="w-3 h-3 text-slate-400" />
                          <span>{t('config.globalNetworkGroup', '全局网络与超时策略')}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-300 block">UPSTREAM_TIMEOUT_MS</label>
                            <div className="relative">
                              <input
                                type="number"
                                value={upstreamTimeoutMs}
                                onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10) || 0)}
                                className="w-full ui-input p-2 text-xs font-mono"
                              />
                              <span className="absolute right-2.5 top-2 text-[11px] text-slate-500 font-mono">ms</span>
                            </div>
                            <p className="hidden sm:block text-[10px] text-slate-400">{t('config.upstreamTimeoutDesc')}</p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-slate-300 block">COUNT_TOKENS_MODEL</label>
                            <input
                              type="text"
                              value={countTokensModel}
                              onChange={(e) => setCountTokensModel(e.target.value)}
                              placeholder="e.g. gemini-2.5-flash"
                              className="w-full ui-input p-2 text-xs font-mono"
                            />
                            <p className="hidden sm:block text-[10px] text-slate-400">{t('config.countTokensDesc')}</p>
                          </div>

                          <div className="col-span-1 sm:col-span-2 space-y-1">
                            <label className="text-[11px] font-semibold text-slate-300 block">{t('config.globalProxyTitle', '全局出站代理')}</label>
                            <input
                              type="text"
                              value={proxyUrl}
                              onChange={(e) => setProxyUrl(e.target.value)}
                              placeholder={t('config.globalProxyPlaceholder', 'http://127.0.0.1:7890 或 socks5://127.0.0.1:10808 (留空直连)')}
                              className="w-full ui-input p-2 text-xs font-mono"
                            />
                            <p className="hidden sm:block text-[10px] text-slate-400">{t('config.globalProxyDesc', '支持 HTTP / HTTPS / SOCKS5 代理。服务器无法直连 Google 时配置')}</p>
                          </div>
                        </div>
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
                        <span className="text-[11px] font-mono text-amber-400/80 lowercase">
                          ({(effortMappingEntries[editingEffortTab] || []).length})
                        </span>
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

                    {/* Effort Level Switcher Bar */}
                    <div className="p-2 sm:p-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.03] border border-[var(--border-subtle)] space-y-2.5">
                      <div className="flex items-center justify-between gap-1 sm:gap-2">
                        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 flex-1">
                          {(['low', 'medium', 'high'] as EffortLevel[]).map((lvl) => {
                            const isEditing = editingEffortTab === lvl;
                            const isActiveEffort = activeEffortLevel === lvl;
                            const ruleCount = (effortMappingEntries[lvl] || []).length;
                            const litCount = lvl === 'low' ? 1 : lvl === 'medium' ? 2 : 3;
                            const barColor =
                              lvl === 'low'
                                ? 'bg-emerald-500'
                                : lvl === 'medium'
                                ? 'bg-indigo-500'
                                : 'bg-amber-500';
                            const dimColor = 'bg-slate-300 dark:bg-slate-700/60';

                            return (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() => setEditingEffortTab(lvl)}
                                className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center justify-between gap-1 cursor-pointer ${
                                  isEditing
                                    ? 'bg-[var(--bg-surface)] border-indigo-500/50 shadow-sm text-[var(--text-primary)] font-semibold ring-1 ring-indigo-500/30'
                                    : 'border-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.05] text-[var(--text-secondary)]'
                                }`}
                                data-testid={`config-effort-tab-${lvl}`}
                              >
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <div className="flex items-end space-x-[2px] h-3 shrink-0" aria-hidden="true">
                                    <span className={`w-[2px] h-1.5 rounded-full ${litCount >= 1 ? barColor : dimColor}`} />
                                    <span className={`w-[2px] h-2.2 rounded-full ${litCount >= 2 ? barColor : dimColor}`} />
                                    <span className={`w-[2px] h-3 rounded-full ${litCount >= 3 ? barColor : dimColor}`} />
                                  </div>
                                  <span className="truncate">{t(`effort.${lvl}`)}</span>
                                  {lvl === 'high' && <Zap className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                                </div>
                                <div className="flex items-center space-x-1 shrink-0">
                                  <span className="text-[10px] font-mono text-[var(--text-secondary)] bg-black/5 dark:bg-white/10 px-1 py-0.2 rounded">
                                    {ruleCount}
                                  </span>
                                  {isActiveEffort && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                                      title={t('effort.activeBadge')}
                                    />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Editing Toolbar: Set Active & Copy From */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]/60 text-xs">
                        <div className="flex items-center space-x-2 min-w-0">
                          {activeEffortLevel === editingEffortTab ? (
                            <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>{t('effort.isCurrentlyActive')}</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActiveEffortLevel(editingEffortTab)}
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 transition-colors flex items-center space-x-1 cursor-pointer"
                              data-testid="set-active-effort-btn"
                            >
                              <span>{t('effort.setActive')}</span>
                            </button>
                          )}
                        </div>

                        {/* Quick Copy Buttons */}
                        <div className="flex items-center space-x-1 text-[11px] text-[var(--text-muted)]">
                          <span className="hidden sm:inline">{t('effort.copyFrom')}</span>
                          {(['low', 'medium', 'high'] as EffortLevel[])
                            .filter(lvl => lvl !== editingEffortTab)
                            .map(sourceLvl => (
                              <button
                                key={sourceLvl}
                                type="button"
                                onClick={() => handleCopyFromEffort(sourceLvl)}
                                className="px-2 py-0.5 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-transparent hover:border-[var(--border-subtle)] cursor-pointer"
                                title={t('effort.copyFromLevel', { level: t(`effort.${sourceLvl}`) })}
                              >
                                {t(`effort.${sourceLvl}Short`)}
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>

                    {!showAdvancedJson && (
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={mappingSearchQuery}
                          onChange={(e) => setMappingSearchQuery(e.target.value)}
                          placeholder={t('config.filterMappingsPlaceholder', '过滤模型规则...')}
                          className="w-full ui-input pl-8 pr-3 py-1.5 text-xs"
                        />
                      </div>
                    )}

                    {showAdvancedJson ? (
                      <div className="space-y-1.5">
                        <textarea
                          rows={6}
                          value={effortMappingsRaw[editingEffortTab] || '{}'}
                          onChange={(e) => handleRawJsonChange(e.target.value)}
                          placeholder={t('config.mappingsPlaceholder')}
                          className="w-full ui-input p-3 text-xs text-amber-300 leading-relaxed font-mono"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(effortMappingEntries[editingEffortTab] || []).length === 0 ? (
                          <div className="p-6 text-center border border-dashed border-white/[0.08] rounded-xl text-xs text-slate-500">
                            {t('config.emptyMappings')}
                          </div>
                        ) : filteredMappingEntries.length === 0 ? (
                          <div className="p-6 text-center border border-dashed border-white/[0.08] rounded-xl text-xs text-slate-500">
                            未找到匹配的模型映射规则
                          </div>
                        ) : (
                          <div className="space-y-2.5 sm:space-y-2">
                            {filteredMappingEntries.map((entry, index) => {
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
            <div className={`sticky bottom-0 bg-[var(--bg-surface-sub)]/95 backdrop-blur-xl border-t transition-colors p-3 sm:p-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shrink-0 ${
              isDirty ? 'border-amber-500/40 bg-amber-950/10' : 'border-[var(--border-subtle)]'
            }`}>
              {/* Left Status Area */}
              <div className="flex items-center space-x-2.5 min-w-0">
                {isDirty ? (
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                    <span className="text-amber-400 font-medium truncate">
                      {t('config.unsavedChanges').replace('{count}', String(dirtyCount))}
                    </span>
                    <button
                      type="button"
                      onClick={handleRevertChanges}
                      className="hidden sm:inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-1 border border-slate-700/60"
                      title={t('config.confirmRevert')}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t('config.revertChanges')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <span className="font-medium text-emerald-400/90">{t('config.configSynced')}</span>
                    <span className="hidden sm:inline text-[11px] text-slate-500 font-mono ml-2">
                      {t('config.shortcutSave')}
                    </span>
                  </div>
                )}
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center space-x-2.5 sm:space-x-3 shrink-0">
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleRevertChanges}
                    className="sm:hidden px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-slate-700/60 flex items-center space-x-1"
                    title={t('config.confirmRevert')}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="text-[11px]">{t('config.revertChanges')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3.5 sm:px-4 py-2 ui-btn-secondary text-center text-xs"
                >
                  {t('config.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`px-4 sm:px-5 py-2 ui-btn-primary flex items-center justify-center space-x-1.5 disabled:opacity-50 text-xs ${
                    isDirty ? 'ring-1 ring-indigo-400/50 shadow-md shadow-indigo-500/20 font-semibold' : ''
                  }`}
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
        </div>
      )}
    </div>
  </div>
);
}
