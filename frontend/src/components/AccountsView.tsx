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
  ArrowDownCircle,
  Info,
  CopyCheck,
  Server,
  Globe
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

  // Multi-server state
  const [servers, setServers] = useState<string[]>([]);
  const [activeServerIndex, setActiveServerIndex] = useState<number>(0);

  const [serverDataMap, setServerDataMap] = useState<Record<number, any>>({});
  const [serverLoadingMap, setServerLoadingMap] = useState<Record<number, boolean>>({});
  const [serverErrorMap, setServerErrorMap] = useState<Record<number, string | null>>({});
  const [serverHealthMap, setServerHealthMap] = useState<Record<number, boolean>>({});
  const [globalLoading, setGlobalLoading] = useState<boolean>(false);

  const latestRequestIdRef = useRef<number>(0);

  const currentData = serverDataMap[activeServerIndex] || null;
  const isCurrentLoading = Boolean(serverLoadingMap[activeServerIndex]);
  const currentError = serverErrorMap[activeServerIndex] || null;
  const isCurrentOffline = serverHealthMap[activeServerIndex] === false || Boolean(serverErrorMap[activeServerIndex]);

  const accounts: AccountDetail[] = currentData?.status?.accountDetails || [];
  const currentAuthIndex = currentData?.status?.currentAuthIndex;
  const isSystemBusy = Boolean(currentData?.status?.isSystemBusy);

  const data = currentData;
  const loading = isCurrentLoading;

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);

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

  const getServerHost = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.host;
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }
  };

  const getApiUrl = (endpoint: string, serverIdx: number = activeServerIndex): string => {
    const sep = endpoint.includes('?') ? '&' : '?';
    return `${endpoint}${sep}serverId=${serverIdx}`;
  };

  const fetchServers = async () => {
    try {
      const res = await fetch('/api/admin/accounts/servers', {
        headers: getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        const serverList = Array.isArray(json.servers) ? json.servers : [];
        if (serverList.length > 0) {
          setServers(serverList);
        }
        fetchAllServers(false, serverList);
      } else {
        fetchAllServers(false);
      }
    } catch {
      fetchAllServers(false);
    }
  };

  const fetchAllServers = async (silent = false, serverList?: string[]) => {
    const list = (serverList && serverList.length > 0) ? serverList : servers;
    if (list.length === 0) {
      fetchSingleServer(silent, 0);
      return;
    }
    if (!silent) setGlobalLoading(true);
    try {
      await Promise.allSettled(
        list.map(async (_, idx) => {
          setServerLoadingMap(prev => ({ ...prev, [idx]: true }));
          try {
            const res = await fetch(getApiUrl('/api/admin/accounts/status', idx), {
              headers: getHeaders()
            });
            if (res.ok) {
              const json = await res.json();
              setServerDataMap(prev => ({ ...prev, [idx]: json }));
              setServerErrorMap(prev => ({ ...prev, [idx]: null }));
              setServerHealthMap(prev => ({ ...prev, [idx]: true }));
            } else {
              const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
              setServerErrorMap(prev => ({ ...prev, [idx]: err.error || `HTTP ${res.status}` }));
              setServerHealthMap(prev => ({ ...prev, [idx]: false }));
            }
          } catch (e: any) {
            setServerErrorMap(prev => ({ ...prev, [idx]: e.message }));
            setServerHealthMap(prev => ({ ...prev, [idx]: false }));
          } finally {
            setServerLoadingMap(prev => ({ ...prev, [idx]: false }));
          }
        })
      );
    } finally {
      if (!silent) setGlobalLoading(false);
    }
  };

  const fetchSingleServer = async (silent: boolean = false, targetServerIdx: number = activeServerIndex) => {
    const reqId = ++latestRequestIdRef.current;

    if (!silent) {
      setServerLoadingMap(prev => ({ ...prev, [targetServerIdx]: true }));
    }

    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/status', targetServerIdx), {
        headers: getHeaders()
      });

      // Drop stale response if another request has been started for another tab
      if (reqId !== latestRequestIdRef.current && targetServerIdx !== activeServerIndex) {
        return;
      }

      if (res.ok) {
        const json = await res.json();
        setServerDataMap(prev => ({ ...prev, [targetServerIdx]: json }));
        setServerErrorMap(prev => ({ ...prev, [targetServerIdx]: null }));
        setServerHealthMap(prev => ({ ...prev, [targetServerIdx]: true }));
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setServerErrorMap(prev => ({ ...prev, [targetServerIdx]: err.error || err.message }));
        setServerHealthMap(prev => ({ ...prev, [targetServerIdx]: false }));
        if (!silent) {
          showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
        }
      }
    } catch (e: any) {
      if (reqId === latestRequestIdRef.current) {
        setServerErrorMap(prev => ({ ...prev, [targetServerIdx]: e.message }));
        setServerHealthMap(prev => ({ ...prev, [targetServerIdx]: false }));
        if (!silent) {
          showToast(t('accounts.actionFailed', { error: e.message }), 'error');
        }
      }
    } finally {
      if (!silent) {
        setServerLoadingMap(prev => ({ ...prev, [targetServerIdx]: false }));
      }
    }
  };

  const fetchStatus = fetchSingleServer;

  const handleSwitchServer = (idx: number) => {
    if (idx === activeServerIndex) return;
    setActiveServerIndex(idx);
    setSelectedIndices([]);
    setPopoverAnchor(null);

    if (!serverDataMap[idx] && !serverLoadingMap[idx]) {
      fetchSingleServer(false, idx);
    }
  };

  useEffect(() => {
    fetchServers();
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

    fetchStatus(true, activeServerIndex);
    const timer = setInterval(() => {
      fetchStatus(true, activeServerIndex);
    }, 3000);

    return () => clearInterval(timer);
  }, [isLogsExpanded, enableLivePolling, adminKey, activeServerIndex]);

  useEffect(() => {
    if (autoScrollLogs && isLogsExpanded && terminalLogsEndRef.current) {
      terminalLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.logs, autoScrollLogs, isLogsExpanded]);

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
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/accounts/${index}/close-context`, targetServerIdx), {
        method: 'POST',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast(t('accounts.closeContextSuccess', { index: String(index) }));
        setCloseContextConfirm(null);
        fetchStatus(false, targetServerIdx);
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
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/toggle-disabled', targetServerIdx), {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ index, disabled: !currentDisabled })
      });
      if (res.ok) {
        showToast(t('accounts.actionSuccess'));
        fetchStatus(false, targetServerIdx);
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
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      await Promise.all(
        selectedIndices.map(index =>
          fetch(getApiUrl('/api/admin/accounts/toggle-disabled', targetServerIdx), {
            method: 'POST',
            headers: getHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ index, disabled })
          })
        )
      );
      showToast(t('accounts.actionSuccess'));
      fetchStatus(false, targetServerIdx);
    } catch (err: any) {
      showToast(t('accounts.actionFailed', { error: err.message }), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetCurrent = async (targetIndex: number) => {
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/current', targetServerIdx), {
        method: 'PUT',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ targetIndex })
      });
      if (res.ok) {
        showToast(t('accounts.actionSuccess'));
        fetchStatus(false, targetServerIdx);
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
    const targetServerIdx = activeServerIndex;
    const filename = `auth-${index}.json`;
    window.open(getApiUrl(`/api/admin/accounts/files/${filename}`, targetServerIdx), '_blank');
  };

  const handleDeleteSingle = async (index: number, force: boolean = false) => {
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/admin/accounts/${index}?force=${force}`, targetServerIdx), {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.ok) {
        showToast(t('accounts.actionSuccess'));
        setDeleteConfirm(null);
        setSelectedIndices(selectedIndices.filter(i => i !== index));
        fetchStatus(false, targetServerIdx);
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
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/batch-delete', targetServerIdx), {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ indices: selectedIndices, force: true })
      });
      if (res.ok || res.status === 207) {
        showToast(t('accounts.actionSuccess'));
        setSelectedIndices([]);
        setBatchDeleteConfirm(false);
        fetchStatus(false, targetServerIdx);
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
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/deduplicate', targetServerIdx), {
        method: 'POST',
        headers: getHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({})
      });
      if (res.ok) {
        const result = await res.json();
        const removed = result.removedIndices?.length || 0;
        showToast(t('accounts.dedupSuccess', { count: removed }));
        setDedupConfirm(false);
        fetchStatus(false, targetServerIdx);
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
    const targetServerIdx = activeServerIndex;
    setActionLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/admin/accounts/batch-download', targetServerIdx), {
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

    const targetServerIdx = activeServerIndex;
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
        res = await fetch(getApiUrl('/api/admin/accounts/upload', targetServerIdx), {
          method: 'POST',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ content: parsedFiles[0] })
        });
      } else {
        res = await fetch(getApiUrl('/api/admin/accounts/upload', targetServerIdx), {
          method: 'POST',
          headers: getHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ files: parsedFiles })
        });
      }

      if (res.ok || res.status === 207) {
        showToast(t('accounts.uploadSuccess', { count: parsedFiles.length }));
        fetchStatus(false, targetServerIdx);
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
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 dark:bg-rose-400 inline-block" />
          <span>{t('accounts.statusSuspended', '已暂停')}</span>
        </span>
      );
    }

    // 2. Explicitly Disabled / Inactive
    if (isManuallyDisabled || rawConcurrent === 'DISABLED') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 border border-black/5 dark:border-white/10 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
          <span>{t('accounts.statusDisabled')}</span>
        </span>
      );
    }

    // 3. ACTIVATED (已解卡且可用)
    if (rawConcurrent === 'ACTIVATED' || (!rawConcurrent && acc.status === 'active')) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 inline-block animate-pulse" />
          <span>{t('accounts.statusActivated', '已激活')}</span>
        </span>
      );
    }

    // 4. ACTIVATING (正在激活)
    if (rawConcurrent === 'ACTIVATING') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/25 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400 inline-block animate-ping" />
          <span>{t('accounts.statusActivating', '激活中...')}</span>
        </span>
      );
    }

    // 5. RETIRED (下线退休，释放 Context)
    if (rawConcurrent === 'RETIRED') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 inline-block" />
          <span>{t('accounts.statusRetired', '已下线')}</span>
        </span>
      );
    }

    // 6. INACTIVE (初始 / 未解卡)
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 border border-black/5 dark:border-white/10 flex items-center space-x-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
        <span>{t('accounts.statusInactive', '未激活')}</span>
      </span>
    );
  };

  return (
    <div className="space-y-2.5 sm:space-y-6 max-w-7xl mx-auto font-sans pb-12">
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

      {/* Multi-Server Selection Tabs */}
      {servers.length > 1 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
          <div className="flex items-center bg-black/[0.03] dark:bg-white/[0.04] p-1 rounded-xl border border-black/5 dark:border-white/10 gap-1.5 min-w-max">
            {servers.map((serverUrl, idx) => {
              const host = getServerHost(serverUrl);
              const isActive = activeServerIndex === idx;
              const serverData = serverDataMap[idx];
              const isLoading = Boolean(serverLoadingMap[idx]);
              const isOffline = serverHealthMap[idx] === false || Boolean(serverErrorMap[idx]);
              const count = serverData?.status?.accountDetails?.length;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSwitchServer(idx)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 sm:space-x-2 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                  title={serverUrl}
                >
                  <span className="flex items-center space-x-1.5">
                    {isLoading ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-indigo-300 shrink-0" />
                    ) : isOffline ? (
                      <span className="w-2 h-2 rounded-full bg-rose-500 ring-2 ring-rose-500/20 shrink-0" />
                    ) : (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-300 ring-2 ring-emerald-300/30' : 'bg-emerald-500'}`} />
                    )}
                    <span className="hidden sm:inline">Server {idx + 1} ({host})</span>
                    <span className="inline sm:hidden font-mono font-bold">{t('accounts.mobileTabShort', { index: idx + 1 })}</span>
                  </span>

                  {isOffline ? (
                    <span className="px-1 sm:px-1.5 py-0.2 rounded text-[9px] sm:text-[10px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                      {t('accounts.nodeOffline')}
                    </span>
                  ) : count !== undefined ? (
                    <span className={`text-[9px] sm:text-[10px] font-mono px-1 sm:px-1.5 py-0.2 rounded-full shrink-0 ${
                      isActive ? 'bg-white/20 text-white font-semibold' : 'bg-black/5 dark:bg-white/10 text-slate-500 dark:text-slate-300'
                    }`}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile-only Active Node Status Bar */}
      {servers.length > 1 && (
        <div className="block sm:hidden px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--border-subtle)] text-[11px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCurrentOffline ? 'bg-rose-500 ring-2 ring-rose-500/20' : 'bg-emerald-500 ring-2 ring-emerald-500/20'}`} />
              <span className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">
                Server {activeServerIndex + 1}
              </span>
              <span className="font-mono text-slate-400 dark:text-slate-500 truncate max-w-[130px]">
                ({getServerHost(servers[activeServerIndex])})
              </span>
            </div>
            <div className="flex items-center space-x-1.5 shrink-0 text-[10px]">
              <span className={isCurrentOffline ? 'text-rose-500 font-medium' : 'text-emerald-500 font-medium'}>
                {isCurrentOffline ? t('accounts.nodeOffline') : t('accounts.nodeOnline')}
              </span>
              <span className="text-slate-400 font-mono">· {accounts.length} {t('accounts.accountUnit')}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modern Page Header (Desktop/Tablet only, hidden on mobile to avoid duplicate header with App bar) */}
      <div className="hidden sm:flex items-center justify-between pb-1">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/10 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {t('accounts.title')}
              </h1>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                {servers.length > 1 ? t('accounts.multiNodes', { count: servers.length }) : t('accounts.singleNode')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('accounts.modernSub')}
            </p>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="ui-card p-2 sm:p-3.5 shrink-0">
        {/* File Upload Hidden Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          multiple
          accept=".json"
          className="hidden"
        />

        {/* Mobile View: Collapsible Search & Single-Row Compact Bar */}
        <div className="flex sm:hidden items-center justify-between gap-1.5 min-w-0">
          {isMobileSearchOpen ? (
            <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-150">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  placeholder={t('accounts.searchPlaceholder', '按序号或邮箱/标识搜索...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ui-input pl-7 pr-7 py-1 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsMobileSearchOpen(false);
                }}
                className="px-2 py-1 text-xs text-slate-400 hover:text-white shrink-0"
              >
                {t('common.cancel', '取消')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5 w-full">
              {/* Left: Search Trigger & Compact Status Dropdown */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsMobileSearchOpen(true)}
                  className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                    searchQuery
                      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                      : 'bg-black/[0.04] dark:bg-white/[0.05] text-slate-400 hover:text-slate-200 border-[var(--border-subtle)]'
                  }`}
                  title={t('accounts.searchPlaceholder')}
                >
                  <Search className="w-3.5 h-3.5" />
                </button>

                <div className="relative flex-1 min-w-0 max-w-[170px]">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full ui-input pl-2 pr-6 py-1 text-xs appearance-none cursor-pointer truncate"
                  >
                    <option value="ALL">{t('accounts.filterAll', '全部')} ({totalCount})</option>
                    <option value="ACTIVATED">{t('accounts.filterActivated', '已激活')} ({activatedCount})</option>
                    <option value="ACTIVATING">{t('accounts.filterActivating', '激活中')} ({activatingCount})</option>
                    <option value="RETIRED">{t('accounts.filterRetired', '已下线')} ({retiredCount})</option>
                    <option value="INACTIVE">{t('accounts.filterInactive', '未激活')} ({inactiveCount})</option>
                    <option value="DISABLED">{t('accounts.filterDisabled', '已禁用')} ({disabledCount})</option>
                    <option value="ISSUES">{t('accounts.filterIssues', '异常')}</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Right: Compact Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDedupConfirm(true)}
                  disabled={actionLoading || accounts.length === 0}
                  className="p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-[var(--border-subtle)] text-amber-400 hover:bg-black/[0.08] active:scale-95 disabled:opacity-40"
                  title={t('accounts.dedup', '去重')}
                >
                  <CopyCheck className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={actionLoading}
                  className="px-2.5 py-1 ui-btn-primary flex items-center space-x-1 text-xs active:scale-95"
                  title={t('accounts.importFiles')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{t('accounts.importFiles', '导入')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop View: Standard Multi-Column Bar */}
        <div className="hidden sm:flex items-center justify-between gap-3">
          {/* Left: Search & Filter */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('accounts.searchPlaceholder', '按序号或邮箱/标识搜索...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ui-input pl-8 pr-7 py-1.5"
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

            <div className="relative shrink-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-auto ui-input pl-3 pr-8 py-1.5 appearance-none cursor-pointer"
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
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={actionLoading}
              className="px-3 py-1.5 ui-btn-primary flex items-center space-x-1.5"
              title={t('accounts.importFiles')}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t('accounts.importFiles')}</span>
            </button>

            <button
              onClick={() => setDedupConfirm(true)}
              disabled={actionLoading || accounts.length === 0}
              className="px-3 py-1.5 ui-btn-secondary disabled:opacity-40 flex items-center space-x-1.5 text-amber-300"
              title={t('accounts.dedupTooltip', '扫描并清理重复的 refresh_token / 凭据')}
            >
              <CopyCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('accounts.dedup', '去重')}</span>
            </button>

            <button
              onClick={() => fetchAllServers(false)}
              disabled={loading || actionLoading || globalLoading}
              className="p-1.5 ui-btn-secondary shrink-0 cursor-pointer"
              title={t('accounts.refreshAll', '刷新全部节点')}
            >
              <RefreshCw className={`w-4 h-4 ${(loading || globalLoading) ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            </button>
          </div>
        </div>
      </div>

      {isCurrentLoading && !currentData && (
        <div className="ui-card p-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <span className="text-xs font-mono">{t('accounts.loading')}</span>
        </div>
      )}

      {/* Node Offline Fallback State */}
      {!isCurrentLoading && isCurrentOffline && accounts.length === 0 ? (
        <div className="ui-card p-12 text-center flex flex-col items-center justify-center space-y-4 rounded-xl border border-rose-500/20 bg-rose-500/5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('accounts.nodeConnectionFailed')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
              {currentError || t('accounts.offlineTip')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchSingleServer(false, activeServerIndex)}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shadow-sm shadow-indigo-500/20"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('accounts.retryNode')}</span>
          </button>
        </div>
      ) : (!isCurrentLoading || currentData) && (
      <div className="ui-card overflow-hidden">
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
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)] text-[11px] font-medium tracking-wider text-[var(--text-secondary)] uppercase select-none">
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={filteredAccounts.length > 0 && selectedIndices.length === filteredAccounts.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4 rounded bg-[var(--bg-surface)] border-[var(--border-subtle)] text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3 w-16 text-left">{t('accounts.tableIndex', '序号')}</th>
                    <th className="px-4 py-3 min-w-[220px] text-left">{t('accounts.tableAccount', '账号 / 凭据标识')}</th>
                    <th className="px-4 py-3 min-w-[190px] text-left">{t('accounts.tableStatus', '状态')}</th>
                    <th className="px-4 py-3 min-w-[150px] text-left">{t('accounts.tableQuota', '配额与今日用量')}</th>
                    <th className="px-4 py-3 text-right whitespace-nowrap">{t('accounts.tableActions', '操作')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
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
                        className={`hover:bg-[var(--bg-surface-hover)] transition-colors ${
                          isCurrent
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-l-2 border-emerald-500'
                            : isChecked
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/25'
                            : isManuallyDisabled
                            ? 'opacity-60'
                            : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="w-10 px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleSelectOne(acc.index)}
                            className="w-4 h-4 rounded bg-[var(--bg-surface)] border-[var(--border-subtle)] text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
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
                                      : 'text-slate-800 dark:text-slate-100'
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
                          <div className="flex flex-wrap items-center gap-1.5">
                            {renderStatusBadge(acc)}
                            {hasContext && (
                              <span
                                title={t('accounts.contextReadyTooltip', '浏览器上下文已连接就绪 (约占用 500~700MB 内存)')}
                                className="inline-flex items-center justify-center p-1 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/25 shadow-xs cursor-help select-none hover:bg-amber-500/20 transition-colors"
                              >
                                <Zap className="w-3 h-3 fill-amber-500 dark:fill-amber-400" />
                              </span>
                            )}
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                {t('accounts.currentBadge')}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Today Usage (Requests Count) */}
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                              {totalUsage.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">reqs</span>

                            {/* Breakdown Popover Trigger (Portal-based Top Layer) */}
                            {breakdowns.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => handleTogglePopover(e, acc.index)}
                                onMouseEnter={(e) => handleMouseEnterPopover(e, acc.index)}
                                className={`p-1 rounded-md transition-colors ${
                                  popoverAnchor?.index === acc.index
                                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/15'
                                    : 'text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                                title={t('accounts.todayUsage', '查看用量明细')}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            )}
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
                                  ? 'ui-btn-secondary text-slate-500 hover:text-emerald-600 hover:border-emerald-500/30 dark:text-slate-400 dark:hover:text-emerald-400'
                                  : 'ui-btn-secondary text-slate-500 hover:text-rose-600 hover:border-rose-500/30 dark:text-slate-400 dark:hover:text-rose-400'
                              }`}
                              title={isManuallyDisabled ? t('accounts.toggleEnable') : t('accounts.toggleDisable')}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>

                            {/* Set as Current */}
                            <button
                              onClick={() => handleSetCurrent(acc.index)}
                              disabled={actionLoading || isCurrent || isManuallyDisabled}
                              className={`p-1.5 rounded-lg border transition-all text-xs flex items-center justify-center ${
                                isCurrent
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 cursor-default'
                                  : 'ui-btn-secondary text-slate-500 hover:text-indigo-600 hover:border-indigo-500/30 dark:text-slate-400 dark:hover:text-indigo-400 disabled:opacity-20'
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
                                  ? 'ui-btn-secondary text-slate-500 hover:text-amber-600 hover:border-amber-500/30 dark:text-slate-400 dark:hover:text-amber-400'
                                  : 'ui-btn-secondary cursor-not-allowed opacity-30 text-slate-400'
                              }`}
                              title={acc.hasContext ? t('accounts.closeContext') : t('accounts.contextAlreadyClosed')}
                            >
                              <ZapOff className="w-3.5 h-3.5" />
                            </button>

                            {/* Download JSON */}
                            <button
                              onClick={() => handleDownloadSingle(acc.index)}
                              disabled={actionLoading}
                              className="p-1.5 ui-btn-secondary rounded-lg text-xs transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
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
                              className="p-1.5 ui-btn-secondary text-slate-500 hover:text-rose-600 hover:border-rose-500/30 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg text-xs transition-all"
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

            {/* Mobile Native Card List View (Clean 2-Row Layout) */}
            <div className="block md:hidden divide-y divide-[var(--border-subtle)]">
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
                    className={`p-2.5 transition-colors space-y-1.5 ${
                      isCurrent
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-l-2 border-emerald-500'
                        : isChecked
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/25'
                        : isManuallyDisabled
                        ? 'opacity-60'
                        : ''
                    }`}
                  >
                    {/* Row 1: Checkbox + Index + Badges + Adaptive Account Name + Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5 min-w-0 flex-1 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleSelectOne(acc.index)}
                          className="w-4 h-4 rounded bg-[var(--bg-surface)] border-[var(--border-subtle)] text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                        />
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0">
                          #{acc.index}
                        </span>

                        {isCurrent && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 shrink-0">
                            {t('accounts.currentBadge')}
                          </span>
                        )}

                        {/* Adaptive Auto-Truncated Account Name / Identifier */}
                        {acc.name && (
                          <div className="flex items-center space-x-1 min-w-0 flex-1 overflow-hidden ml-0.5">
                            <span
                              title={acc.name}
                              className={`text-[11px] font-mono truncate min-w-0 flex-1 ${
                                isManuallyDisabled
                                  ? 'text-slate-400 line-through decoration-slate-500'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {acc.name}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyAccountName(acc.index, acc.name);
                              }}
                              className="text-slate-400 hover:text-slate-200 p-0.5 shrink-0 transition-colors"
                              title={t('accounts.copyAccountName', '复制账号名称/邮箱')}
                            >
                              {copiedKeyIndex === acc.index ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0 ml-1">
                        {renderStatusBadge(acc)}
                        {hasContext && (
                          <span
                            title={t('accounts.contextReadyTooltip', '浏览器上下文已连接就绪 (约占用 500~700MB 内存)')}
                            className="inline-flex items-center justify-center p-1 rounded-full bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/25 shrink-0"
                          >
                            <Zap className="w-3 h-3 fill-amber-500 dark:fill-amber-400" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Today Usage (Left) + Quick Actions Group (Right) */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      {/* Usage Button */}
                      <button
                        type="button"
                        onClick={() => toggleMobileUsage(acc.index)}
                        className="px-2 py-0.5 rounded-lg text-xs font-mono ui-card-sub hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] flex items-center space-x-1.5 transition-colors"
                      >
                        <Clock className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                        <span className="font-bold text-slate-800 dark:text-slate-200">{totalUsage}</span>
                        <span className="text-[10px] text-slate-500 font-mono">reqs</span>
                        {breakdowns.length > 0 && (
                          <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isUsageExpanded ? 'rotate-180 text-indigo-400' : ''}`} />
                        )}
                      </button>

                      {/* Action Buttons Group */}
                      <div className="flex items-center space-x-1 shrink-0">
                        {/* Set as Current */}
                        <button
                          onClick={() => handleSetCurrent(acc.index)}
                          disabled={actionLoading || isCurrent || isManuallyDisabled}
                          className={`p-1 sm:p-1.5 rounded-lg border text-xs flex items-center justify-center transition-all ${
                            isCurrent
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 cursor-default'
                              : 'ui-btn-secondary text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 disabled:opacity-20'
                          }`}
                          title={isCurrent ? t('accounts.isCurrentAccount') : t('accounts.setAsCurrent')}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>

                        {/* Enable / Disable */}
                        <button
                          onClick={() => handleToggleDisabled(acc.index, isManuallyDisabled)}
                          disabled={actionLoading}
                          className={`p-1 sm:p-1.5 rounded-lg border text-xs flex items-center justify-center transition-all ${
                            isManuallyDisabled
                              ? 'ui-btn-secondary text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 hover:border-emerald-500/30'
                              : 'ui-btn-secondary text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 hover:border-rose-500/30'
                          }`}
                          title={isManuallyDisabled ? t('accounts.toggleEnable') : t('accounts.toggleDisable')}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        {/* Close Context */}
                        <button
                          onClick={() => setCloseContextConfirm({ index: acc.index, email: acc.name || '', isCurrent })}
                          disabled={actionLoading || !acc.hasContext}
                          className={`p-1 sm:p-1.5 rounded-lg border text-xs flex items-center justify-center transition-all ${
                            acc.hasContext
                              ? 'ui-btn-secondary text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 hover:border-amber-500/30'
                              : 'ui-btn-secondary cursor-not-allowed opacity-30 text-slate-400'
                          }`}
                          title={acc.hasContext ? t('accounts.closeContext') : t('accounts.contextAlreadyClosed')}
                        >
                          <ZapOff className="w-3.5 h-3.5" />
                        </button>

                        {/* Download JSON */}
                        <button
                          onClick={() => handleDownloadSingle(acc.index)}
                          disabled={actionLoading}
                          className="p-1 sm:p-1.5 ui-btn-secondary text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg text-xs"
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
                          className="p-1 sm:p-1.5 ui-btn-secondary text-slate-500 hover:text-rose-600 hover:border-rose-500/30 dark:text-slate-400 dark:hover:text-rose-400 rounded-lg text-xs transition-all"
                          title={t('accounts.deleteAccount')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expandable Model Usage Breakdown when clicked */}
                    {isUsageExpanded && (
                      <div className="p-2.5 ui-card-sub rounded-xl space-y-2 animate-in fade-in duration-150 text-xs">
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
                                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px]" title={item.model}>
                                    {item.model}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400 font-semibold">
                                    <strong className="text-slate-800 dark:text-slate-200">{item.count}</strong>
                                    {item.limit !== undefined && <span className="text-slate-500 text-[10px]"> / {item.limit}</span>}
                                  </span>
                                </div>
                                {ratio !== null && (
                                  <div className="w-full bg-black/[0.04] dark:bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
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
                );
              })}
            </div>
          </>
        )}
      </div>
      )}

      {/* Floating Action Bar when rows are selected */}
      {selectedIndices.length > 0 && (
        <div className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300 w-[92vw] sm:w-auto max-w-lg">
          <div className="backdrop-blur-xl bg-[var(--bg-surface)]/95 border border-[var(--border-subtle)] shadow-2xl rounded-2xl px-3 sm:px-5 py-2.5 sm:py-3 flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-start gap-2 sm:space-x-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-[var(--text-primary)] pr-2 border-r border-[var(--border-subtle)] shrink-0">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span>{t('accounts.batchSelected', `${selectedIndices.length} accounts selected`).replace('{count}', String(selectedIndices.length))}</span>
            </div>

            <div className="flex items-center space-x-1.5 sm:space-x-2 flex-wrap">
              {/* Batch Enable */}
              <button
                onClick={() => handleBatchToggleDisabled(false)}
                disabled={actionLoading}
                className="px-2.5 sm:px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 dark:text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all active:scale-95"
              >
                <Power className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('accounts.batchEnable', 'Enable')}</span>
              </button>

              {/* Batch Disable */}
              <button
                onClick={() => handleBatchToggleDisabled(true)}
                disabled={actionLoading}
                className="px-2.5 sm:px-3 py-1.5 ui-btn-secondary rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all active:scale-95"
              >
                <Power className="w-3.5 h-3.5 text-slate-400" />
                <span>{t('accounts.batchDisable', 'Disable')}</span>
              </button>

              {/* Batch Download */}
              <button
                onClick={handleBatchDownload}
                disabled={actionLoading}
                className="p-1.5 sm:px-3 sm:py-1.5 ui-btn-secondary rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all active:scale-95"
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
      <div className="ui-card overflow-hidden shadow-lg">
        {/* Terminal Header */}
        <div
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none hover:bg-[var(--bg-surface-hover)] transition-colors"
        >
          <div className="flex items-center space-x-2 sm:space-x-2.5 min-w-0">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-xs font-bold text-[var(--text-primary)] truncate">{t('accounts.upstreamLogsTitle')}</span>
            {data?.logCount !== undefined && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-black/[0.05] dark:bg-white/[0.05] text-[var(--text-secondary)] border border-[var(--border-subtle)] shrink-0">
                {data.logCount}
              </span>
            )}
            {isLogsExpanded && (
              enableLivePolling ? (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)] shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span className="hidden xs:inline">{t('accounts.livePolling')}</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 shrink-0">
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
                      ? 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-300 border-emerald-500/30 shadow-sm'
                      : 'ui-btn-secondary'
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
                    className="p-1.5 sm:px-2 sm:py-1 ui-btn-secondary rounded-lg text-[11px] transition-all flex items-center space-x-1 disabled:opacity-50"
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
                      ? 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 border-indigo-500/30'
                      : 'ui-btn-secondary'
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
                    className="p-1.5 sm:px-2.5 sm:py-1 ui-btn-secondary rounded-lg text-[11px] transition-all flex items-center space-x-1"
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
              className="p-1 ui-btn-secondary rounded-lg transition-all"
              title={isLogsExpanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={`w-3.5 h-3.5 transform transition-transform ${isLogsExpanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Terminal Log Viewport */}
        {isLogsExpanded && (
          <div className="p-4 bg-[var(--code-bg)] text-[var(--code-text)] border-t border-[var(--border-subtle)] font-mono text-[11px] leading-relaxed max-h-80 overflow-y-auto select-text whitespace-pre-wrap">
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
          <div className="ui-card max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 text-amber-500 dark:text-amber-400">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <ZapOff className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {t('accounts.confirmCloseContextTitle')}
              </h3>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              <p>
                {t('accounts.confirmCloseContextMessage', {
                  index: String(closeContextConfirm.index),
                  email: closeContextConfirm.email || 'No email'
                })}
              </p>
              <p className="text-[var(--text-muted)]">
                {t('accounts.confirmCloseContextDesc')}
              </p>
              {closeContextConfirm.isCurrent && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-600 dark:text-amber-300 flex items-start space-x-2">
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
                className="px-4 py-2 ui-btn-secondary text-xs font-semibold transition-all"
              >
                {t('accounts.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleCloseContext(closeContextConfirm.index)}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
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
          <div className="ui-card max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <span>{t('accounts.confirmDeleteTitle')}</span>
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t('accounts.confirmDeleteMessage', {
                index: deleteConfirm.index,
                email: deleteConfirm.email
              })}
            </p>

            {deleteConfirm.isCurrent && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-600 dark:text-amber-300 text-xs">
                {t('accounts.confirmDeleteCurrentWarning')}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 ui-btn-secondary text-xs font-semibold transition-all"
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
          <div className="ui-card max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
              <span>{t('accounts.batchDelete')}</span>
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t('accounts.confirmBatchDeleteMessage', { count: selectedIndices.length })}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setBatchDeleteConfirm(false)}
                className="px-4 py-2 ui-btn-secondary text-xs font-semibold transition-all"
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
          <div className="ui-card max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
              <Layers className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>{t('accounts.confirmDeduplicateTitle')}</span>
            </h3>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {t('accounts.confirmDeduplicateMessage')}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDedupConfirm(false)}
                className="px-4 py-2 ui-btn-secondary text-xs font-semibold transition-all"
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

      {/* Portal Usage Details Popover (Top Layer via Body Portal) */}
      {popoverAnchor && (() => {
        const acc = accounts.find(a => a.index === popoverAnchor.index);
        if (!acc) return null;

        const totalUsage = getTotalUsage(acc.usage);
        const breakdowns = getModelBreakdowns(acc.usage);
        const { rect } = popoverAnchor;
        const spaceBelow = window.innerHeight - rect.bottom;

        // Determine top/bottom placement (default to top if not enough space below)
        const isTop = spaceBelow < 280 && rect.top > 280;
        const popoverWidth = 270; // 270px for pleasant proportions
        const idealLeft = rect.left + rect.width / 2 - popoverWidth / 2;
        const leftPos = Math.max(16, Math.min(idealLeft, window.innerWidth - popoverWidth - 16));

        const popoverStyle: React.CSSProperties = {
          position: 'fixed',
          zIndex: 9999,
          width: `${popoverWidth}px`,
          maxWidth: '90vw',
          left: `${leftPos}px`,
          ...(isTop
            ? { bottom: `${window.innerHeight - rect.top + 8}px` }
            : { top: `${rect.bottom + 8}px` })
        };

        const arrowLeft = Math.max(14, Math.min(rect.left + rect.width / 2 - leftPos - 5, popoverWidth - 24));
        const arrowStyle: React.CSSProperties = {
          left: `${arrowLeft}px`
        };

        return createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="p-3.5 ui-card rounded-2xl shadow-2xl backdrop-blur-2xl border border-[var(--border-subtle)] pointer-events-auto animate-in fade-in zoom-in-95 duration-150"
            onMouseLeave={() => setPopoverAnchor(null)}
          >
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border-subtle)]">
              <span className="text-xs font-bold text-[var(--text-primary)] flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>{t('accounts.todayUsage')}</span>
              </span>
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg">
                {totalUsage.toLocaleString()} <span className="text-[10px] font-normal text-[var(--text-muted)]">reqs</span>
              </span>
            </div>

            {breakdowns.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] italic py-2 text-center">
                {totalUsage === 0 ? 'No model requests today' : `Total requests: ${totalUsage}`}
              </div>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {breakdowns.map((item, idx) => {
                  const ratio = item.limit ? Math.min(100, Math.round((item.count / item.limit) * 100)) : null;
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-secondary)] font-mono text-[11px] truncate max-w-[140px]" title={item.model}>
                          {item.model}
                        </span>
                        <span className="text-[var(--text-secondary)] font-mono text-xs font-semibold shrink-0 ml-2">
                          <strong className="text-[var(--text-primary)]">{item.count.toLocaleString()}</strong>
                          {item.limit !== undefined && <span className="text-[var(--text-muted)] text-[10px]"> / {item.limit}</span>}
                        </span>
                      </div>
                      {ratio !== null && (
                        <div className="w-full bg-black/5 dark:bg-white/10 rounded-full h-1.5 overflow-hidden border border-[var(--border-subtle)]">
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
                  ? 'top-full -mt-1 border-r border-b'
                  : 'bottom-full -mb-1 border-l border-t'
              } w-2.5 h-2.5 bg-[var(--bg-surface)] border-[var(--border-subtle)] transform rotate-45`}
            />
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
