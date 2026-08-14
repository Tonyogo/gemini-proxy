import React, { useState, useEffect, useRef } from 'react';
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
  concurrentStatus?: string;
  inFlight?: number;
  isSuspended?: boolean;
  usage?: AccountUsage;
}

export interface SystemStatusData {
  logCount?: number;
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

  // Modals state
  const [deleteConfirm, setDeleteConfirm] = useState<{ index: number; email: string; isCurrent: boolean } | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<boolean>(false);
  const [dedupConfirm, setDedupConfirm] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/accounts/status', {
        headers: getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
      }
    } catch (e: any) {
      showToast(t('accounts.actionFailed', { error: e.message }), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [adminKey]);

  const accounts: AccountDetail[] = data?.status?.accountDetails || [];
  const currentAuthIndex = data?.status?.currentAuthIndex;
  const isSystemBusy = Boolean(data?.status?.isSystemBusy);

  const totalCount = accounts.length;
  const activeCount = accounts.filter(a => !a.isDisabled && a.status === 'active').length;
  const disabledCount = accounts.filter(a => a.isDisabled || a.status === 'disabled').length;
  const inFlightCount = accounts.reduce((acc, cur) => acc + (cur.inFlight || 0), 0);

  const handleSelectAll = () => {
    if (selectedIndices.length === accounts.length && accounts.length > 0) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(accounts.map(a => a.index));
    }
  };

  const handleSelectOne = (index: number) => {
    if (selectedIndices.includes(index)) {
      setSelectedIndices(selectedIndices.filter(i => i !== index));
    } else {
      setSelectedIndices([...selectedIndices, index]);
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

  // Helper to extract total usage number
  const getTotalUsage = (usage?: AccountUsage): number => {
    if (!usage) return 0;
    if (typeof usage.total === 'number') return usage.total;
    if (typeof usage.totalRequests === 'number') return usage.totalRequests;
    if (usage.byModel) {
      return Object.values(usage.byModel).reduce((sum, item) => sum + (item.usage || item.requests || 0), 0);
    }
    return 0;
  };

  // Helper to extract models breakdown list
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
    return list;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-16 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center space-x-2 border transition-all duration-300 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-300'
          }`}
        >
          <span>{toastMessage.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header & Stats Banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400">{t('accounts.totalAccounts')}</span>
          <span className="text-xl font-bold text-slate-100 mt-1">{totalCount}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-emerald-400">{t('accounts.activeAccounts')}</span>
          <span className="text-xl font-bold text-emerald-300 mt-1">{activeCount}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-slate-400">{t('accounts.disabledAccounts')}</span>
          <span className="text-xl font-bold text-rose-400 mt-1">{disabledCount}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-blue-400">{t('accounts.inFlightRequests')}</span>
          <span className="text-xl font-bold text-blue-300 mt-1">{inFlightCount}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between col-span-2 md:col-span-1">
          <span className="text-[11px] font-medium text-amber-400">{t('accounts.systemBusy')}</span>
          <span className="text-sm font-semibold mt-1">
            {isSystemBusy ? (
              <span className="text-rose-400 font-bold">BUSY</span>
            ) : (
              <span className="text-emerald-400 font-medium">IDLE</span>
            )}
          </span>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={accounts.length > 0 && selectedIndices.length === accounts.length}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>{t('accounts.selectAll')}</span>
            {selectedIndices.length > 0 && (
              <span className="text-blue-400 font-mono text-[11px]">({selectedIndices.length})</span>
            )}
          </label>
        </div>

        <div className="flex items-center flex-wrap gap-2">
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
            className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
            title={t('accounts.importFiles')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>{t('accounts.importFiles')}</span>
          </button>

          {/* Deduplicate Button */}
          <button
            onClick={() => setDedupConfirm(true)}
            disabled={actionLoading || accounts.length === 0}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
            title={t('accounts.deduplicate')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>{t('accounts.deduplicate')}</span>
          </button>

          {/* Batch Download ZIP */}
          <button
            onClick={handleBatchDownload}
            disabled={actionLoading || selectedIndices.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-700/80 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
            title={t('accounts.batchDownload')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{t('accounts.batchDownload')}</span>
          </button>

          {/* Batch Delete */}
          <button
            onClick={() => setBatchDeleteConfirm(true)}
            disabled={actionLoading || selectedIndices.length === 0}
            className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
            title={t('accounts.batchDelete')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>{t('accounts.batchDelete')}</span>
          </button>

          {/* Refresh */}
          <button
            onClick={fetchStatus}
            disabled={loading || actionLoading}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 rounded-lg text-xs font-semibold transition-all"
            title={t('accounts.refresh')}
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Account List */}
      {loading && accounts.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-slate-400 font-mono text-xs">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
          {t('accounts.loading')}
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800/80 text-slate-400 mb-3">
            📁
          </div>
          <p className="text-slate-400 text-xs max-w-md mx-auto">{t('accounts.noAccounts')}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {accounts.map(acc => {
            const isCurrent = acc.index === currentAuthIndex;
            const isChecked = selectedIndices.includes(acc.index);
            const isDisabled = acc.isDisabled || acc.status === 'disabled';
            const totalUsage = getTotalUsage(acc.usage);
            const breakdowns = getModelBreakdowns(acc.usage);

            return (
              <div
                key={acc.index}
                className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/40'
                    : isDisabled
                    ? 'bg-slate-950/60 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
                    : 'bg-slate-900/70 hover:bg-slate-900/90 border-slate-800/80'
                }`}
              >
                {/* Left: Checkbox + Index + Email + Badges */}
                <div className="flex items-center space-x-3.5 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleSelectOne(acc.index)}
                    className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />

                  <span className={`font-mono text-xs font-bold whitespace-nowrap ${isDisabled ? 'text-slate-500' : 'text-slate-400'}`}>
                    #{acc.index}
                  </span>

                  <span className={`font-medium text-xs truncate max-w-xs md:max-w-md ${isDisabled ? 'text-slate-400 line-through decoration-slate-600' : 'text-slate-100'}`}>
                    {acc.name || `Account #${acc.index}`}
                  </span>

                  {/* Status Badges */}
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    {isDisabled ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block"></span>
                        <span>{t('accounts.statusDisabled')}</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                        <span>{t('accounts.statusActive')}</span>
                      </span>
                    )}

                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-500/60 shadow-sm">
                        {t('accounts.currentBadge')}
                      </span>
                    )}

                    {acc.isInvalid && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        {t('accounts.invalidBadge')}
                      </span>
                    )}

                    {acc.isDuplicate && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {t('accounts.duplicateBadge')}
                      </span>
                    )}

                    {acc.isExpired && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        {t('accounts.expiredBadge')}
                      </span>
                    )}

                    {/* Interactive Today Usage Badge with Custom Instant Popover Tooltip */}
                    <div className="relative inline-block group">
                      <div className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30 flex items-center space-x-1 cursor-pointer transition-all hover:bg-blue-500/20 shadow-sm">
                        <span>📊</span>
                        <span>{t('accounts.todayUsage')}</span>
                        <strong className="text-blue-200">{totalUsage}</strong>
                        <span className="text-[8px] text-blue-400 ml-0.5">▾</span>
                      </div>

                      {/* Popover Bubble */}
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-50 w-64 p-3 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-lg pointer-events-auto">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                          <span className="text-[11px] font-bold text-slate-200 flex items-center space-x-1">
                            <span>📊</span>
                            <span>{t('accounts.todayUsage')}</span>
                          </span>
                          <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                            {totalUsage}
                          </span>
                        </div>

                        {breakdowns.length === 0 ? (
                          <div className="text-[10px] text-slate-400 italic py-1">
                            {totalUsage === 0 ? '暂无各模型请求消耗数据' : `总请求次数: ${totalUsage}`}
                          </div>
                        ) : (
                          <div className="space-y-2">
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
                                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                                      <div
                                        className={`h-full rounded-full transition-all ${
                                          ratio >= 90 ? 'bg-rose-500' : ratio >= 70 ? 'bg-amber-500' : 'bg-blue-500'
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
                        {/* Triangle arrow pointer */}
                        <div className="absolute left-6 top-full -mt-px w-2.5 h-2.5 bg-slate-900 border-r border-b border-slate-700/80 transform rotate-45"></div>
                      </div>
                    </div>

                    {/* In flight count if > 0 */}
                    {(acc.inFlight || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        {t('accounts.inFlight')}: {acc.inFlight}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Action Buttons Group */}
                <div className="flex items-center space-x-1.5 ml-4">
                  {/* Enable / Disable Button */}
                  <button
                    onClick={() => handleToggleDisabled(acc.index, isDisabled)}
                    disabled={actionLoading}
                    className={`p-1.5 rounded-lg border transition-all text-xs flex items-center justify-center ${
                      isDisabled
                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-950'
                        : 'bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border-slate-700 hover:border-rose-500/40'
                    }`}
                    title={isDisabled ? t('accounts.toggleEnable') : t('accounts.toggleDisable')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                    </svg>
                  </button>

                  {/* Set as Current Button */}
                  <button
                    onClick={() => handleSetCurrent(acc.index)}
                    disabled={actionLoading || isCurrent || isDisabled}
                    className={`p-1.5 rounded-lg border transition-all text-xs ${
                      isCurrent
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 cursor-default'
                        : 'bg-slate-800/80 hover:bg-blue-500/20 text-slate-400 hover:text-blue-300 border-slate-700 hover:border-blue-500/40 disabled:opacity-30 disabled:hover:bg-slate-800/80 disabled:hover:border-slate-700'
                    }`}
                    title={isCurrent ? t('accounts.isCurrentAccount') : t('accounts.setAsCurrent')}
                  >
                    {isCurrent ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    )}
                  </button>

                  {/* Single Download Credential JSON */}
                  <button
                    onClick={() => handleDownloadSingle(acc.index)}
                    disabled={actionLoading}
                    className="p-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg text-xs transition-all"
                    title={t('accounts.downloadCredential')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
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
                    className="p-1.5 bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 rounded-lg text-xs transition-all"
                    title={t('accounts.deleteAccount')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span className="text-rose-400">⚠️</span>
              <span>{t('accounts.confirmDeleteTitle')}</span>
            </h3>

            <p className="text-xs text-slate-300">
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg"
              >
                {t('accounts.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Modal */}
      {batchDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span className="text-rose-400">⚠️</span>
              <span>{t('accounts.batchDelete')}</span>
            </h3>

            <p className="text-xs text-slate-300">
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg"
              >
                {t('accounts.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deduplicate Confirmation Modal */}
      {dedupConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span className="text-amber-400">🧹</span>
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
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg"
              >
                {t('accounts.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
