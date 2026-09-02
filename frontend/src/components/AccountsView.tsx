import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Upload,
  Layers,
  Download,
  Trash2,
  Power,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Zap,
  ZapOff,
  ChevronDown,
  Copy,
  Check,
  Radio,
  FileText,
  Key,
  ShieldCheck,
  AlertTriangle,
  ArrowRightLeft,
  X,
  ExternalLink,
  ArrowDownCircle
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export interface ModelUsageDetail {
  limit?: number;
  usage?: number;
  requests?: number;
}

export interface AccountUsage {
  total?: number;
  totalRequests?: number;
  byModel?: Record<string, ModelUsageDetail>;
  models?: Record<string, { requests?: number }>;
}

export interface AccountDetail {
  index: number;
  name: string | null;
  status: string;
  isDisabled: boolean;
  isInvalid: boolean;
  isDuplicate: boolean;
  isExpired: boolean;
  isRotation: boolean;
  hasContext: boolean;
  canonicalIndex: number | null;
  concurrentStatus?: 'INACTIVE' | 'ACTIVATING' | 'ACTIVATED' | 'RETIRED' | string;
  inFlight?: number;
  isSuspended?: boolean;
  usage?: AccountUsage;
}

export interface SystemStatusData {
  logCount?: number;
  logs?: string;
  status?: {
    currentAuthIndex?: number;
    currentAccountName?: string;
    isSystemBusy?: boolean;
    isConcurrentMode?: boolean;
    activeContextsCount?: number;
    maxContexts?: number;
    streamingMode?: string;
    usageCount?: number;
    failureCount?: number;
    accountDetails?: AccountDetail[];
  };
}

export default function AccountsView({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals & Popovers state
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number; email: string; isCurrent: boolean } | null>(null);
  const [closeContextConfirm, setCloseContextConfirm] = useState<{ index: number; email: string; isCurrent: boolean } | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<boolean>(false);
  const [dedupConfirm, setDedupConfirm] = useState<boolean>(false);
  const [popoverAnchor, setPopoverAnchor] = useState<{ index: number; rect: DOMRect } | null>(null);
  const [expandedMobileUsage, setExpandedMobileUsage] = useState<Record<number, boolean>>({});

  const popoverRef = useRef<HTMLDivElement>(null);

  const toggleMobileUsage = (index: number) => {
    setExpandedMobileUsage(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleTogglePopover = (e: React.MouseEvent<HTMLElement>, index: number) => {
    e.stopPropagation();
    if (popoverAnchor?.index === index) {
      setPopoverAnchor(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setPopoverAnchor({ index, rect });
    }
  };

  const handleMouseEnterPopover = (e: React.MouseEvent<HTMLElement>, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverAnchor({ index, rect });
  };

  // Clipboard feedback map for account keys/names
  const [copiedKeyIndex, setCopiedKeyIndex] = useState<number | null>(null);

  // Upstream Terminal Logs Collapse & State
  const [isLogsExpanded, setIsLogsExpanded] = useState<boolean>(false);
  const [enableLivePolling, setEnableLivePolling] = useState<boolean>(true);
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(false);
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const [refreshingLogs, setRefreshingLogs] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalLogsEndRef = useRef<HTMLDivElement>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const getHeaders = (extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { ...extra };
    if (adminKey) {
      headers['x-admin-key'] = adminKey;
    }
    return headers;
  };

  const fetchStatus = async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await fetch('/api/admin/accounts/status', {
        headers: getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else if (!silent) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (e: any) {
      if (!silent) {
        showToast(t('accounts.actionFailed', { error: e.message }), 'error');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [adminKey]);

  // Click outside / scroll / resize / keydown listener to dismiss open popovers
  useEffect(() => {
    if (!popoverAnchor) return;

    const handleDismiss = (e: Event) => {
      // If pointerdown happened inside popover bubble, don't dismiss
      if (e.type === 'pointerdown' && popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') {
        return;
      }
      setPopoverAnchor(null);
    };

    window.addEventListener('pointerdown', handleDismiss, true);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('keydown', handleDismiss);

    return () => {
      window.removeEventListener('pointerdown', handleDismiss, true);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('keydown', handleDismiss);
    };
  }, [popoverAnchor]);

  // Periodic 3s refresh when terminal logs are expanded and live polling is enabled
  useEffect(() => {
    if (!isLogsExpanded || !enableLivePolling) return;

    fetchStatus(true);
    const timer = setInterval(() => {
      fetchStatus(true);
    }, 3000);

    return () => clearInterval(timer);
  }, [isLogsExpanded, enableLivePolling, adminKey]);

  useEffect(() => {
    if (autoScrollLogs && isLogsExpanded && terminalLogsEndRef.current) {
      terminalLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.logs, autoScrollLogs, isLogsExpanded]);

  const accounts: AccountDetail[] = data?.status?.accountDetails || [];
  const currentAuthIndex = data?.status?.currentAuthIndex;
  const isSystemBusy = Boolean(data?.status?.isSystemBusy);

  const totalCount = accounts.length;

  const activatedCount = accounts.filter(a => {
    const isManuallyDisabled = Boolean(a.isDisabled || (a as any).disabled === true || a.status === 'disabled');
    if (isManuallyDisabled) return false;
    const cStatus = (a.concurrentStatus || '').toUpperCase().trim();
    return cStatus === 'ACTIVATED' || (!cStatus && a.status === 'active');
  }).length;

  const activatingCount = accounts.filter(a => {
    const isManuallyDisabled = Boolean(a.isDisabled || (a as any).disabled === true || a.status === 'disabled');
    if (isManuallyDisabled) return false;
    const cStatus = (a.concurrentStatus || '').toUpperCase().trim();
    return cStatus === 'ACTIVATING';
  }).length;

  const retiredCount = accounts.filter(a => {
    const isManuallyDisabled = Boolean(a.isDisabled || (a as any).disabled === true || a.status === 'disabled');
    if (isManuallyDisabled) return false;
    const cStatus = (a.concurrentStatus || '').toUpperCase().trim();
    return cStatus === 'RETIRED';
  }).length;

  const disabledCount = accounts.filter(a => {
    const isManuallyDisabled = Boolean(a.isDisabled || (a as any).disabled === true || a.status === 'disabled');
    const cStatus = (a.concurrentStatus || '').toUpperCase().trim();
    return isManuallyDisabled || cStatus === 'DISABLED';
  }).length;

  const inactiveCount = accounts.filter(a => {
    const isManuallyDisabled = Boolean(a.isDisabled || (a as any).disabled === true || a.status === 'disabled');
    if (isManuallyDisabled) return false;
    const cStatus = (a.concurrentStatus || '').toUpperCase().trim();
    return cStatus === 'INACTIVE' || (!cStatus && a.status !== 'active');
  }).length;

  const inFlightCount = accounts.reduce((acc, cur) => acc + (cur.inFlight || 0), 0);

  // Filtered accounts list based on searchQuery and statusFilter
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      // Search filter (by index or name/email)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesIndex = `#${acc.index}`.includes(query) || `${acc.index}` === query;
        const matchesName = (acc.name || '').toLowerCase().includes(query);
        if (!matchesIndex && !matchesName) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        const cStatus = (acc.concurrentStatus || '').toUpperCase().trim();
        const isManuallyDisabled = Boolean(acc.isDisabled || (acc as any).disabled === true || acc.status === 'disabled');

        if (statusFilter === 'ACTIVATED') {
          if (isManuallyDisabled) return false;
          if (cStatus !== 'ACTIVATED' && !(cStatus === '' && acc.status === 'active')) return false;
        } else if (statusFilter === 'ACTIVATING') {
          if (isManuallyDisabled || cStatus !== 'ACTIVATING') return false;
        } else if (statusFilter === 'RETIRED') {
          if (isManuallyDisabled || cStatus !== 'RETIRED') return false;
        } else if (statusFilter === 'DISABLED') {
          if (!isManuallyDisabled && cStatus !== 'DISABLED') return false;
        } else if (statusFilter === 'INACTIVE') {
          if (isManuallyDisabled) return false;
          if (cStatus !== 'INACTIVE' && !(cStatus === '' && acc.status !== 'active')) return false;
        } else if (statusFilter === 'ISSUES') {
          if (!acc.isInvalid && !acc.isDuplicate && !acc.isExpired && !acc.isSuspended) return false;
        }
      }

      return true;
    });
  }, [accounts, searchQuery, statusFilter]);

  const handleSelectAll = () => {
    if (selectedIndices.length === filteredAccounts.length && filteredAccounts.length > 0) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(filteredAccounts.map(a => a.index));
    }
  };

  const handleSelectOne = (index: number) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter(i => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleCloseContext = async (index: number) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts/${index}/close-context`, {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast(t('accounts.closeContextSuccess', { index: String(index) }));
        setCloseContextConfirm(null);
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleDisabled = async (index: number, currentDisabled: boolean) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/accounts/toggle-disabled', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ index, disabled: !currentDisabled })
      });
      if (res.ok) {
        showToast(t('accounts.actionSuccess'));
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchToggleDisabled = async (disabled: boolean) => {
    if (selectedIndices.length === 0) return;
    setActionLoading(true);
    try {
      await Promise.all(
        selectedIndices.map(index =>
          fetch('/api/admin/accounts/toggle-disabled', {
            method: 'POST',
            headers: getHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ index, disabled })
          })
        )
      );
      showToast(t('accounts.actionSuccess'));
      fetchStatus();
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetCurrent = async (targetIndex: number) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/accounts/current', {
        method: 'PUT',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ targetIndex })
      });
      if (res.ok) {
        showToast(t('accounts.actionSuccess'));
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadSingle = async (index: number) => {
    const filename = `auth-${index}.json`;
    window.open(`/api/admin/accounts/files/${filename}`, '_blank');
  };

  const handleDeleteSingle = async (index: number, force: boolean = false) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/accounts/${index}?force=${force}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast(t('accounts.actionSuccess'));
        setDeleteConfirm(null);
        setSelectedIndices(selectedIndices.filter(i => i !== index));
        fetchStatus();
      } else if (res.status === 409 && !force) {
        const acc = accounts.find(a => a.index === index);
        setDeleteConfirm({ index, email: acc?.name || '', isCurrent: true });
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIndices.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/accounts/batch-delete', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ indices: selectedIndices, force: true })
      });
      if (res.ok || res.status === 207) {
        showToast(t('accounts.actionSuccess'));
        setSelectedIndices([]);
        setBatchDeleteConfirm(false);
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeduplicate = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/accounts/deduplicate', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({})
      });
      if (res.ok) {
        const result = await res.json();
        const removed = result.removedIndices?.length || 0;
        showToast(t('accounts.dedupSuccess', { count: removed }));
        setDedupConfirm(false);
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({ error: 'Error' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchDownload = async () => {
    if (selectedIndices.length === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/accounts/batch-download', {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ indices: selectedIndices })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'accounts.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast(t('accounts.actionSuccess'));
      } else {
        const err = await res.json().catch(() => ({ error: 'Error downloading zip' }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setActionLoading(true);
    try {
      const parsedFiles: any[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const text = await file.text();
        try {
          const json = JSON.parse(text);
          parsedFiles.push(json);
        } catch {
          parsedFiles.push(text);
        }
      }

      let res;
      if (parsedFiles.length === 1) {
        res = await fetch('/api/admin/accounts/upload', {
          method: 'POST',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ content: parsedFiles[0] })
        });
      } else {
        res = await fetch('/api/admin/accounts/upload', {
          method: 'POST',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ files: parsedFiles })
        });
      }

      if (res.ok || res.status === 207) {
        showToast(t('accounts.uploadSuccess', { count: parsedFiles.length }));
        fetchStatus();
      } else {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        showToast(t('accounts.uploadFailed', { error: err.error || err.message }), 'error');
      }
    } catch (err: any) {
      showToast(t('accounts.uploadFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopyLogs = () => {
    if (!data?.logs) return;
    navigator.clipboard.writeText(data.logs);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleManualRefreshLogs = async () => {
    if (refreshingLogs) return;
    setRefreshingLogs(true);
    try {
      await fetchStatus(true);
    } finally {
      setTimeout(() => {
        setRefreshingLogs(false);
      }, 400);
    }
  };

  const handleCopyAccountName = (index: number, name: string | null) => {
    if (!name) return;
    navigator.clipboard.writeText(name);
    setCopiedKeyIndex(index);
    setTimeout(() => setCopiedKeyIndex(null), 1500);
  };

  const getTotalUsage = (usage?: AccountUsage): number => {
    if (!usage) return 0;
    if (typeof usage.total === 'number') return usage.total;
    if (typeof usage.totalRequests === 'number') return usage.totalRequests;
    if (usage.byModel) {
      return Object.values(usage.byModel).reduce((sum, item) => sum + (item.usage || item.requests || 0), 0);
    }
    return 0;
  };

  const getModelBreakdowns = (usage?: AccountUsage): Array<{ model: string; count: number; limit?: number }> => {
    if (!usage) return [];
    const list: Array<{ model: string; count: number; limit?: number }> = [];
    if (usage.byModel) {
      for (const [model, item] of Object.entries(usage.byModel)) {
        list.push({
          model,
          count: item.usage ?? item.requests ?? 0,
          limit: item.limit
        });
      }
    } else if (usage.models) {
      for (const [model, item] of Object.entries(usage.models)) {
        list.push({
          model,
          count: item.requests ?? 0
        });
      }
    }
    return list.sort((a, b) => b.count - a.count);
  };

  // State Machine Badges with modern Linear styles
  const renderStatusBadge = (acc: AccountDetail) => {
    const rawConcurrent = (acc.concurrentStatus || '').toUpperCase().trim();
    const isManuallyDisabled = Boolean(acc.isDisabled || (acc as any).disabled === true || acc.status === 'disabled');

    // 1. Explicitly Suspended / Rate Limited
    if (acc.isSuspended) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center space-x-1.5 shadow-[0_0_8px_rgba(244,63,94,0.1)]">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
          <span>{t('accounts.statusSuspended', '已暂停')}</span>
        </span>
      );
    }

    // 2. Explicitly Disabled / Inactive
    if (isManuallyDisabled || rawConcurrent === 'DISABLED') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/40 text-slate-400 border border-slate-700/50 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />
          <span>{t('accounts.statusDisabled')}</span>
        </span>
      );
    }

    // 3. ACTIVATED (已解卡且可用)
    if (rawConcurrent === 'ACTIVATED' || (!rawConcurrent && acc.status === 'active')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)] flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
          <span>{t('accounts.statusActivated', '已激活')}</span>
        </span>
      );
    }

    // 4. ACTIVATING (正在激活)
    if (rawConcurrent === 'ACTIVATING') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center space-x-1.5 shadow-[0_0_8px_rgba(99,102,241,0.15)]">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block animate-ping" />
          <span>{t('accounts.statusActivating', '激活中...')}</span>
        </span>
      );
    }

    // 5. RETIRED (下线退休，释放 Context)
    if (rawConcurrent === 'RETIRED') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
          <span>{t('accounts.statusRetired', '已下线')}</span>
        </span>
      );
    }

    // 6. INACTIVE (初始 / 未解卡)
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/40 text-slate-400 border border-slate-700/50 flex items-center space-x-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" />
        <span>{t('accounts.statusInactive', '未激活')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-6">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-16 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center space-x-2 border backdrop-blur-xl transition-all duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Modern Page Header & Stats Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>{t('accounts.title')}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t('accounts.sub', 'Manage multi-account credentials, automatic context rotation, and per-account usage quotas.')}
          </p>
        </div>

        {/* Stats Chips */}
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
          {/* Total Accounts */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-2 sm:px-3.5 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-slate-800/60 text-slate-300 border border-white/[0.04]">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">
                {t('accounts.totalAccounts')}
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-100 font-mono">{totalCount}</div>
            </div>
          </div>

          {/* Activated */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-2 sm:px-3.5 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-medium text-emerald-400 uppercase tracking-wider truncate">
                {t('accounts.activeAccounts')}
              </div>
              <div className="text-sm sm:text-base font-bold text-emerald-300 font-mono">{activatedCount}</div>
            </div>
          </div>

          {/* Activating */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-2 sm:px-3.5 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-medium text-indigo-400 uppercase tracking-wider truncate">
                {t('accounts.activatingAccounts')}
              </div>
              <div className="text-sm sm:text-base font-bold text-indigo-300 font-mono">{activatingCount}</div>
            </div>
          </div>

          {/* Retired */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-2 sm:px-3.5 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-medium text-amber-400 uppercase tracking-wider truncate">
                {t('accounts.retiredAccounts', '已下线')}
              </div>
              <div className="text-sm sm:text-base font-bold text-amber-300 font-mono">{retiredCount}</div>
            </div>
          </div>

          {/* Inactive */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-2 sm:px-3.5 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-slate-800/50 text-slate-400 border border-slate-700/40">
              <Power className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate">
                {t('accounts.inactiveAccounts', '未激活')}
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-300 font-mono">{inactiveCount}</div>
            </div>
          </div>

          {/* Disabled */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-2 sm:px-3.5 sm:py-2 flex flex-col sm:flex-row items-start sm:items-center space-y-1 sm:space-y-0 sm:space-x-3">
            <div className="p-1.5 sm:p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] font-medium text-rose-400 uppercase tracking-wider truncate">
                {t('accounts.disabledAccounts')}
              </div>
              <div className="text-sm sm:text-base font-bold text-rose-300 font-mono">{disabledCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
        {/* Left: Search & Filter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('accounts.searchPlaceholder', '按序号或邮箱/标识搜索...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#141620] border border-white/[0.08] text-slate-200 text-xs rounded-lg pl-8 pr-7 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="relative shrink-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto bg-[#141620] border border-white/[0.08] text-slate-300 text-xs rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-indigo-500/50 appearance-none cursor-pointer hover:border-white/[0.15] transition-all"
            >
              <option value="ALL">{t('accounts.filterAll', '全部状态')} ({totalCount})</option>
              <option value="ACTIVATED">{t('accounts.filterActivated', '已激活')} ({activatedCount})</option>
              <option value="ACTIVATING">{t('accounts.filterActivating', '激活中')} ({activatingCount})</option>
              <option value="RETIRED">{t('accounts.filterRetired', '已下线')} ({retiredCount})</option>
              <option value="INACTIVE">{t('accounts.filterInactive', '未激活')} ({inactiveCount})</option>
              <option value="DISABLED">{t('accounts.filterDisabled', '已禁用')} ({disabledCount})</option>
              <option value="ISSUES">{t('accounts.filterIssues', '凭据异常 / 已过期')}</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {/* File Upload Hidden Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept=".json"
            className="hidden"
          />

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={actionLoading}
            className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-[0_0_12px_rgba(99,102,241,0.15)] hover:shadow-[0_0_16px_rgba(99,102,241,0.25)] active:scale-95"
            title={t('accounts.importFiles')}
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t('accounts.importFiles')}</span>
          </button>

          {/* Deduplicate Button */}
          <button
            onClick={() => setDedupConfirm(true)}
            disabled={actionLoading || accounts.length === 0}
            className="flex-1 sm:flex-none justify-center px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-40 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all active:scale-95"
            title={t('accounts.deduplicate')}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('accounts.deduplicate')}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchStatus(false)}
            disabled={loading || actionLoading}
            className="p-1.5 bg-[#141620] hover:bg-white/[0.06] text-slate-300 border border-white/[0.08] hover:border-white/[0.15] rounded-lg text-xs font-semibold transition-all active:scale-95 shrink-0"
            title={t('accounts.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
          </button>
        </div>
      </div>

      {/* Modern Data Table */}
      <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl">
        {loading && accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 font-mono text-xs space-y-3">
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            <span>{t('accounts.loading')}</span>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/50 text-slate-500 mb-3 border border-white/[0.04]">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-slate-400 text-xs max-w-md mx-auto">
              {searchQuery || statusFilter !== 'ALL'
                ? t('accounts.noFilteredAccounts', '未找到符合当前搜索关键词或状态筛选的账号。')
                : t('accounts.noAccounts')}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#141620] text-[11px] font-medium tracking-wider text-slate-400 uppercase select-none">
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={filteredAccounts.length > 0 && selectedIndices.length === filteredAccounts.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded bg-[#0A0C10] border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 w-16">{t('accounts.tableIndex', '序号')}</th>
                    <th className="px-4 py-3 min-w-[200px]">{t('accounts.tableAccount', '账号 / 凭据标识')}</th>
                    <th className="px-4 py-3">{t('accounts.tableStatus', '状态')}</th>
                    <th className="px-4 py-3">{t('accounts.tableQuota', '配额与今日用量')}</th>
                    <th className="px-4 py-3 text-right">{t('accounts.tableActions', '操作')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {filteredAccounts.map((acc) => {
                    const isCurrent = acc.index === currentAuthIndex;
                    const isChecked = selectedIndices.includes(acc.index);
                    const isManuallyDisabled = Boolean(acc.isDisabled || (acc as any).disabled === true || acc.status === 'disabled');
                    const totalUsage = getTotalUsage(acc.usage);
                    const breakdowns = getModelBreakdowns(acc.usage);
                    const hasContext = Boolean(acc.hasContext);

                    return (
                      <tr
                        key={acc.index}
                        className={`hover:bg-[#151824]/80 transition-colors ${
                          isCurrent
                            ? 'bg-emerald-950/20'
                            : isChecked
                            ? 'bg-indigo-950/20'
                            : isManuallyDisabled
                            ? 'opacity-60 bg-black/20'
                            : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="w-10 px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleSelectOne(acc.index)}
                            className="w-4 h-4 rounded bg-[#0A0C10] border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>

                        {/* Index */}
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-400">
                          #{acc.index}
                        </td>

                        {/* Name & Identifiers */}
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`font-medium truncate max-w-xs md:max-w-sm ${
                                    isManuallyDisabled
                                      ? 'text-slate-400 line-through decoration-slate-600'
                                      : 'text-slate-100'
                                  }`}
                                >
                                  {acc.name || `Account #${acc.index}`}
                                </span>
                                {acc.name && (
                                  <button
                                    onClick={() => handleCopyAccountName(acc.index, acc.name)}
                                    className="text-slate-500 hover:text-slate-300 transition-colors"
                                    title={t('accounts.copyAccountName', '复制账号邮箱/名称')}
                                  >
                                    {copiedKeyIndex === acc.index ? (
                                      <Check className="w-3 h-3 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {acc.canonicalIndex !== null && acc.canonicalIndex !== undefined && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  canonical #{acc.canonicalIndex}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status Badges */}
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            {/* hasContext Indicator */}
                            <div
                              title={hasContext ? 'Context Ready (Browser session active)' : 'No Context'}
                              className={`px-1.5 py-0.5 rounded flex items-center justify-center cursor-help transition-all ${
                                hasContext
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20'
                                  : 'bg-slate-800/40 text-slate-600 border border-slate-800/60 opacity-60'
                              }`}
                            >
                              <Zap
                                className={`w-3.5 h-3.5 ${
                                  hasContext ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] fill-amber-400' : 'text-slate-600'
                                }`}
                              />
                            </div>

                            {/* Dynamic Status Badge */}
                            {renderStatusBadge(acc)}

                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                                {t('accounts.currentBadge')}
                              </span>
                            )}

                            {acc.isInvalid && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                {t('accounts.invalidBadge')}
                              </span>
                            )}

                            {acc.isDuplicate && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                {t('accounts.duplicateBadge')}
                              </span>
                            )}

                            {acc.isExpired && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                {t('accounts.expiredBadge')}
                              </span>
                            )}

                            {(acc.inFlight || 0) > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                {t('accounts.inFlight')}: {acc.inFlight}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Quota & Usage */}
                        <td className="px-4 py-3">
                          <div
                            className="relative inline-block"
                            onMouseEnter={(e) => handleMouseEnterPopover(e, acc.index)}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleTogglePopover(e, acc.index)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-[#141620] hover:bg-white/[0.06] text-slate-300 border border-white/[0.08] flex items-center space-x-1.5 cursor-pointer transition-all focus:outline-none"
                            >
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="text-slate-400">{t('accounts.todayUsage')}:</span>
                              <strong className="text-indigo-300 font-bold">{totalUsage}</strong>
                              <ChevronDown className="w-3 h-3 text-slate-500" />
                            </button>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Enable / Disable */}
                            <button
                              onClick={() => handleToggleDisabled(acc.index, isManuallyDisabled)}
                              disabled={actionLoading}
                              className={`p-1.5 rounded-lg border transition-all text-xs flex items-center justify-center ${
                                isManuallyDisabled
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-[#141620] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border-white/[0.08] hover:border-rose-500/30'
                              }`}
                              title={isManuallyDisabled ? t('accounts.toggleEnable') : t('accounts.toggleDisable')}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>

                            {/* Set as Current */}
                            <button
                              onClick={() => handleSetCurrent(acc.index)}
                              disabled={actionLoading || isCurrent || isManuallyDisabled}
                              className={`p-1.5 rounded-lg border transition-all text-xs ${
                                isCurrent
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 cursor-default'
                                  : 'bg-[#141620] hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 border-white/[0.08] hover:border-indigo-500/30 disabled:opacity-20'
                              }`}
                              title={isCurrent ? t('accounts.isCurrentAccount') : t('accounts.setAsCurrent')}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>

                            {/* Close Context */}
                            <button
                              onClick={() => setCloseContextConfirm({ index: acc.index, email: acc.name || '', isCurrent })}
                              disabled={actionLoading || !acc.hasContext}
                              className={`p-1.5 rounded-lg border text-xs transition-all flex items-center justify-center ${
                                acc.hasContext
                                  ? 'bg-[#141620] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border-white/[0.08] hover:border-amber-500/30'
                                  : 'bg-[#141620]/40 text-slate-600 border-white/[0.04] cursor-not-allowed opacity-40'
                              }`}
                              title={acc.hasContext ? t('accounts.closeContext') : t('accounts.contextAlreadyClosed')}
                            >
                              <ZapOff className="w-3.5 h-3.5" />
                            </button>

                            {/* Download JSON */}
                            <button
                              onClick={() => handleDownloadSingle(acc.index)}
                              disabled={actionLoading}
                              className="p-1.5 bg-[#141620] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 border border-white/[0.08] hover:border-white/[0.15] rounded-lg text-xs transition-all"
                              title={t('accounts.downloadCredential')}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (isCurrent) {
                                  setDeleteConfirm({ index: acc.index, email: acc.name || '', isCurrent: true });
                                } else {
                                  setDeleteConfirm({ index: acc.index, email: acc.name || '', isCurrent: false });
                                }
                              }}
                              disabled={actionLoading}
                              className="p-1.5 bg-[#141620] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/[0.08] hover:border-rose-500/30 rounded-lg text-xs transition-all"
                              title={t('accounts.deleteAccount')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Native Card List View */}
            <div className="block md:hidden divide-y divide-white/[0.06]">
              {filteredAccounts.map((acc) => {
                const isCurrent = acc.index === currentAuthIndex;
                const isChecked = selectedIndices.includes(acc.index);
                const isManuallyDisabled = Boolean(acc.isDisabled || (acc as any).disabled === true || acc.status === 'disabled');
                const totalUsage = getTotalUsage(acc.usage);
                const breakdowns = getModelBreakdowns(acc.usage);
                const hasContext = Boolean(acc.hasContext);
                const isUsageExpanded = Boolean(expandedMobileUsage[acc.index]);

                return (
                  <div
                    key={acc.index}
                    className={`p-3.5 transition-colors space-y-3 ${
                      isCurrent
                        ? 'bg-emerald-950/15'
                        : isChecked
                        ? 'bg-indigo-950/20'
                        : isManuallyDisabled
                        ? 'opacity-60 bg-black/20'
                        : 'bg-[#0F1118]/60'
                    }`}
                  >
                    {/* Card Header: Checkbox + Index + Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectOne(acc.index)}
                          className="w-4 h-4 rounded bg-[#0A0C10] border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                        />
                        <span className="font-mono text-xs font-bold text-slate-300">
                          #{acc.index}
                        </span>

                        {/* hasContext badge */}
                        <div
                          title={hasContext ? 'Context Ready' : 'No Context'}
                          className={`px-1.5 py-0.5 rounded flex items-center justify-center shrink-0 ${
                            hasContext
                              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20'
                              : 'bg-slate-800/40 text-slate-600 border border-slate-800/60 opacity-60'
                          }`}
                        >
                          <Zap
                            className={`w-3 h-3 ${
                              hasContext ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)] fill-amber-400' : 'text-slate-600'
                            }`}
                          />
                        </div>

                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                            {t('accounts.currentBadge')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {renderStatusBadge(acc)}
                      </div>
                    </div>

                    {/* Card Body: Account Identifier & Canonical */}
                    <div className="bg-[#141622] border border-white/[0.04] rounded-xl p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono font-medium truncate ${
                            isManuallyDisabled
                              ? 'text-slate-400 line-through decoration-slate-600'
                              : 'text-slate-100'
                          }`}
                        >
                          {acc.name || `Account #${acc.index}`}
                        </span>

                        {acc.name && (
                          <button
                            onClick={() => handleCopyAccountName(acc.index, acc.name)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white bg-white/[0.04] shrink-0 ml-2"
                            title={t('accounts.copyAccountName', '复制账号邮箱/名称')}
                          >
                            {copiedKeyIndex === acc.index ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {acc.canonicalIndex !== null && acc.canonicalIndex !== undefined && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          canonical #{acc.canonicalIndex}
                        </div>
                      )}
                    </div>

                    {/* Card Quota & In-Card Expandable Usage */}
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => toggleMobileUsage(acc.index)}
                        className="w-full px-3 py-2 rounded-xl text-xs font-mono bg-[#141622] hover:bg-[#1A1D2D] text-slate-300 border border-white/[0.06] flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-slate-400">{t('accounts.todayUsage')}:</span>
                          <strong className="text-indigo-300 font-bold">{totalUsage}</strong>
                        </div>
                        <div className="flex items-center space-x-1 text-slate-400 text-[11px]">
                          <span>{breakdowns.length > 0 ? `${breakdowns.length} models` : 'Details'}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isUsageExpanded ? 'rotate-180 text-indigo-400' : ''}`} />
                        </div>
                      </button>

                      {/* Expandable Model Usage Breakdown */}
                      {isUsageExpanded && (
                        <div className="p-3 bg-[#0C0E14] border border-white/[0.08] rounded-xl space-y-2.5 animate-in fade-in duration-150">
                          {breakdowns.length === 0 ? (
                            <div className="text-[11px] text-slate-500 italic text-center py-1">
                              {totalUsage === 0 ? 'No model requests today' : `Total requests: ${totalUsage}`}
                            </div>
                          ) : (
                            breakdowns.map((item, idx) => {
                              const ratio = item.limit ? Math.min(100, Math.round((item.count / item.limit) * 100)) : null;
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs font-mono">
                                    <span className="text-slate-300 truncate max-w-[180px]" title={item.model}>
                                      {item.model}
                                    </span>
                                    <span className="text-slate-400 font-semibold">
                                      <strong className="text-slate-200">{item.count}</strong>
                                      {item.limit !== undefined && <span className="text-slate-500 text-[10px]"> / {item.limit}</span>}
                                    </span>
                                  </div>
                                  {ratio !== null && (
                                    <div className="w-full bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          ratio >= 90 ? 'bg-rose-500' : ratio >= 70 ? 'bg-amber-500' : 'bg-indigo-500'
                                        }`}
                                        style={{ width: `${ratio}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Actions Footer: Big Touch Targets */}
                    <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                      {/* Set as Current */}
                      <button
                        onClick={() => handleSetCurrent(acc.index)}
                        disabled={actionLoading || isCurrent || isManuallyDisabled}
                        className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all active:scale-95 ${
                          isCurrent
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                            : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/40 disabled:opacity-30'
                        }`}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>{isCurrent ? t('accounts.isCurrentAccount', '当前账号') : t('accounts.setAsCurrent', '设为当前')}</span>
                      </button>

                      {/* Enable / Disable */}
                      <button
                        onClick={() => handleToggleDisabled(acc.index, isManuallyDisabled)}
                        disabled={actionLoading}
                        className={`py-1.5 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center space-x-1 transition-all active:scale-95 ${
                          isManuallyDisabled
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{isManuallyDisabled ? t('accounts.toggleEnable', '启用') : t('accounts.toggleDisable', '禁用')}</span>
                      </button>

                      {/* Close Context (Mobile) */}
                      <button
                        onClick={() => setCloseContextConfirm({ index: acc.index, email: acc.name || '', isCurrent })}
                        disabled={actionLoading || !acc.hasContext}
                        className={`p-1.5 rounded-lg border text-xs flex items-center justify-center transition-all ${
                          acc.hasContext
                            ? 'bg-[#141622] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border-white/[0.08] hover:border-amber-500/30'
                            : 'bg-[#141622]/40 text-slate-600 border-white/[0.04] cursor-not-allowed opacity-40'
                        }`}
                        title={acc.hasContext ? t('accounts.closeContext') : t('accounts.contextAlreadyClosed')}
                      >
                        <ZapOff className="w-3.5 h-3.5" />
                      </button>

                      {/* Download */}
                      <button
                        onClick={() => handleDownloadSingle(acc.index)}
                        disabled={actionLoading}
                        className="p-1.5 bg-[#141622] text-slate-400 border border-white/[0.08] rounded-lg text-xs hover:text-white"
                        title={t('accounts.downloadCredential')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => {
                          if (isCurrent) {
                            setDeleteConfirm({ index: acc.index, email: acc.name || '', isCurrent: true });
                          } else {
                            setDeleteConfirm({ index: acc.index, email: acc.name || '', isCurrent: false });
                          }
                        }}
                        disabled={actionLoading}
                        className="p-1.5 bg-[#141622] hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-white/[0.08] hover:border-rose-500/30 rounded-lg text-xs"
                        title={t('accounts.deleteAccount')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Floating Action Bar when rows are selected */}
      {selectedIndices.length > 0 && (
        <div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300 w-[92vw] sm:w-auto max-w-lg">
          <div className="backdrop-blur-xl bg-[#151824]/95 border border-white/[0.15] shadow-2xl rounded-2xl px-3 sm:px-5 py-2.5 sm:py-3 flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-2 sm:space-x-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-white pr-2 border-r border-white/[0.1] shrink-0">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span>{t('accounts.batchSelected', `${selectedIndices.length} accounts selected`).replace('{count}', String(selectedIndices.length))}</span>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap">
              {/* Batch Enable */}
              <button
                onClick={() => handleBatchToggleDisabled(false)}
                disabled={actionLoading}
                className="px-2.5 sm:px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all active:scale-95"
              >
                <Power className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('accounts.batchEnable', 'Enable')}</span>
              </button>

              {/* Batch Disable */}
              <button
                onClick={() => handleBatchToggleDisabled(true)}
                disabled={actionLoading}
                className="px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all active:scale-95"
              >
                <Power className="w-3.5 h-3.5 text-slate-400" />
                <span>{t('accounts.batchDisable', 'Disable')}</span>
              </button>

              {/* Batch Download */}
              <button
                onClick={handleBatchDownload}
                disabled={actionLoading}
                className="p-1.5 sm:px-3 sm:py-1.5 bg-[#1C1F2E] hover:bg-white/[0.1] text-slate-200 border border-white/[0.1] rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all active:scale-95"
                title={t('accounts.batchDownload')}
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">{t('accounts.batchDownload')}</span>
              </button>

              {/* Batch Delete */}
              <button
                onClick={() => setBatchDeleteConfirm(true)}
                disabled={actionLoading}
                className="p-1.5 sm:px-3 sm:py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all shadow-[0_0_12px_rgba(244,63,94,0.3)] active:scale-95"
                title={t('accounts.batchDelete')}
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">{t('accounts.batchDelete')}</span>
              </button>

              {/* Clear Selection */}
              <button
                onClick={() => setSelectedIndices([])}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                title={t('accounts.clearSelection', 'Clear selection')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upstream Terminal Logs Section */}
      <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-2xl overflow-hidden shadow-lg">
        {/* Terminal Header */}
        <div
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-[#141620] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs font-bold text-slate-200 truncate">{t('accounts.upstreamLogsTitle')}</span>
            {data?.logCount !== undefined && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700/60 shrink-0">
                {data.logCount}
              </span>
            )}
            {isLogsExpanded && (
              enableLivePolling ? (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)] shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span className="hidden xs:inline">{t('accounts.livePolling')}</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400/90 border border-amber-500/20 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 inline-block" />
                  <span className="hidden xs:inline">{t('accounts.pollingPaused')}</span>
                </span>
              )
            )}
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs shrink-0" onClick={(e) => e.stopPropagation()}>
            {isLogsExpanded && (
              <>
                {/* Live Polling Toggle Button */}
                <button
                  type="button"
                  onClick={() => setEnableLivePolling(!enableLivePolling)}
                  className={`p-1.5 sm:px-2 sm:py-1 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-all ${
                    enableLivePolling
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-sm'
                      : 'bg-[#1A1C28] text-slate-400 border-white/[0.08] hover:text-slate-200'
                  }`}
                  title={t('accounts.livePollingToggle')}
                >
                  <Radio className={`w-3.5 h-3.5 ${enableLivePolling ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                  <span className="hidden sm:inline text-[11px]">{t('accounts.livePollingToggle')}</span>
                </button>

                {/* Manual Refresh if polling paused */}
                {!enableLivePolling && (
                  <button
                    onClick={handleManualRefreshLogs}
                    disabled={refreshingLogs}
                    className="p-1.5 sm:px-2 sm:py-1 bg-[#1A1C28] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[11px] text-slate-300 hover:text-white transition-all flex items-center space-x-1 disabled:opacity-50"
                    title={t('accounts.refreshLogs')}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${refreshingLogs ? 'animate-spin text-indigo-400' : ''}`} />
                    <span className="hidden md:inline">{t('accounts.refreshLogs')}</span>
                  </button>
                )}

                {/* Auto Scroll Toggle Button */}
                <button
                  type="button"
                  onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                  className={`p-1.5 sm:px-2 sm:py-1 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-all ${
                    autoScrollLogs
                      ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                      : 'bg-[#1A1C28] text-slate-400 border-white/[0.08] hover:text-slate-200'
                  }`}
                  title={t('accounts.autoScroll')}
                >
                  <ArrowDownCircle className={`w-3.5 h-3.5 ${autoScrollLogs ? 'text-indigo-400 animate-bounce' : 'text-slate-500'}`} />
                  <span className="hidden sm:inline text-[11px]">{t('accounts.autoScroll')}</span>
                </button>

                {/* Copy Logs Button */}
                {data?.logs && (
                  <button
                    onClick={handleCopyLogs}
                    className="p-1.5 sm:px-2.5 sm:py-1 bg-[#1A1C28] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-[11px] text-slate-300 hover:text-white transition-all flex items-center space-x-1"
                    title={t('accounts.copyLogs')}
                  >
                    {copiedLogs ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="hidden sm:inline">{t('accounts.copiedLogs')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span className="hidden sm:inline">{t('accounts.copyLogs')}</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setIsLogsExpanded(!isLogsExpanded)}
              className="p-1 bg-[#1A1C28] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-slate-400 hover:text-white transition-all"
              title={isLogsExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isLogsExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Terminal Log Viewport */}
        {isLogsExpanded && (
          <div className="p-4 bg-[#07090E] text-slate-300 font-mono text-[11px] leading-relaxed max-h-80 overflow-y-auto select-text whitespace-pre-wrap">
            {data?.logs ? (
              <div className="space-y-0.5">
                {data.logs.split('\n').map((line, idx) => {
                  if (!line.trim()) return null;
                  const isError = /error|fail|exception|\[ERROR\]/i.test(line);
                  const isWarn = /warn|warning|\[WARN\]/i.test(line);
                  const isSuccess = /success|ready|connected|active/i.test(line);

                  return (
                    <div
                      key={idx}
                      className={`${
                        isError
                          ? 'text-rose-400 font-medium'
                          : isWarn
                          ? 'text-amber-400'
                          : isSuccess
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })}
                <div ref={terminalLogsEndRef} />
              </div>
            ) : (
              <div className="text-slate-500 italic py-2 text-center">
                {t('accounts.noUpstreamLogs')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close Context Confirm Dialog */}
      {closeContextConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12141F] border border-white/[0.1] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-amber-400">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <ZapOff className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">
                {t('accounts.confirmCloseContextTitle')}
              </h3>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-slate-300">
              <p>
                {t('accounts.confirmCloseContextMessage', {
                  index: String(closeContextConfirm.index),
                  email: closeContextConfirm.email || 'No email'
                })}
              </p>
              <p className="text-slate-400">
                {t('accounts.confirmCloseContextDesc')}
              </p>
              {closeContextConfirm.isCurrent && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('accounts.confirmDeleteCurrentWarning')}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCloseContextConfirm(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] rounded-xl text-xs font-semibold transition-all"
              >
                {t('accounts.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleCloseContext(closeContextConfirm.index)}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('accounts.closeContext')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F1118] border border-white/[0.12] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{t('accounts.confirmDeleteTitle')}</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('accounts.confirmDeleteMessage', {
                index: deleteConfirm.index,
                email: deleteConfirm.email
              })}
            </p>

            {deleteConfirm.isCurrent && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
                {t('accounts.confirmDeleteCurrentWarning')}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                {t('accounts.cancel')}
              </button>
              <button
                onClick={() => handleDeleteSingle(deleteConfirm.index, deleteConfirm.isCurrent)}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-[0_0_12px_rgba(244,63,94,0.3)]"
              >
                {t('accounts.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Modal */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F1118] border border-white/[0.12] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>{t('accounts.batchDelete')}</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('accounts.confirmBatchDeleteMessage', { count: selectedIndices.length })}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setBatchDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                {t('accounts.cancel')}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-[0_0_12px_rgba(244,63,94,0.3)]"
              >
                {t('accounts.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduplicate Confirmation Modal */}
      {dedupConfirm && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F1118] border border-white/[0.12] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>{t('accounts.confirmDeduplicateTitle')}</span>
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              {t('accounts.confirmDeduplicateMessage')}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDedupConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all"
              >
                {t('accounts.cancel')}
              </button>
              <button
                onClick={handleDeduplicate}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold transition-all shadow-[0_0_12px_rgba(245,158,11,0.3)]"
              >
                {t('accounts.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Usage Details Popover */}
      {popoverAnchor && (() => {
        const acc = accounts.find(a => a.index === popoverAnchor.index);
        if (!acc) return null;

        const totalUsage = getTotalUsage(acc.usage);
        const breakdowns = getModelBreakdowns(acc.usage);
        const { rect } = popoverAnchor;
        const spaceBelow = window.innerHeight - rect.bottom;

        // Determine top/bottom placement
        const isTop = spaceBelow < 280 && rect.top > 280;
        const leftPos = Math.max(12, Math.min(rect.left, window.innerWidth - 280));
        const popoverStyle: React.CSSProperties = {
          position: 'fixed',
          zIndex: 100,
          width: '16rem', // w-64 = 256px
          maxWidth: '85vw',
          left: `${leftPos}px`,
          ...(isTop
            ? { bottom: `${window.innerHeight - rect.top + 8}px` }
            : { top: `${rect.bottom + 8}px` })
        };

        const arrowStyle: React.CSSProperties = {
          left: `${Math.max(12, Math.min(rect.left + rect.width / 2 - leftPos - 5, 236))}px`
        };

        return createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="p-3 bg-[#0F1118] border border-white/[0.12] rounded-xl shadow-2xl backdrop-blur-xl pointer-events-auto animate-in fade-in duration-150"
            onMouseLeave={() => setPopoverAnchor(null)}
          >
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08]">
              <span className="text-[11px] font-bold text-slate-200 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('accounts.todayUsage')}</span>
              </span>
              <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                {totalUsage}
              </span>
            </div>

            {breakdowns.length === 0 ? (
              <div className="text-[10px] text-slate-400 italic py-1">
                {totalUsage === 0 ? 'No model request breakdown' : `Total: ${totalUsage}`}
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {breakdowns.map((item, idx) => {
                  const ratio = item.limit ? Math.min(100, Math.round((item.count / item.limit) * 100)) : null;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300 font-mono truncate max-w-[130px]" title={item.model}>
                          {item.model}
                        </span>
                        <span className="text-slate-400 font-mono font-semibold">
                          <strong className="text-slate-200">{item.count}</strong>
                          {item.limit !== undefined && <span className="text-slate-500 text-[10px]"> / {item.limit}</span>}
                        </span>
                      </div>
                      {ratio !== null && (
                        <div className="w-full bg-[#0A0C10] rounded-full h-1.5 overflow-hidden border border-white/[0.06]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ratio >= 90 ? 'bg-rose-500' : ratio >= 70 ? 'bg-amber-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Pointer Arrow */}
            <div
              style={arrowStyle}
              className={`absolute ${
                isTop
                  ? 'top-full -mt-px border-r border-b'
                  : 'bottom-full -mb-px border-l border-t'
              } w-2.5 h-2.5 bg-[#0F1118] border-white/[0.12] transform rotate-45`}
            />
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
