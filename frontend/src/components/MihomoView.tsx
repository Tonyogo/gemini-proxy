import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Radio,
  Activity,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Search,
  Check,
  Globe,
  Wifi,
  WifiOff,
  AlertCircle,
  Trash2,
  Cpu,
  Layers,
  Zap,
  SlidersHorizontal,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export interface MihomoViewProps {
  adminKey: string;
}

export interface ProxyItem {
  name: string;
  type: string;
  now?: string;
  all?: string[];
  history?: Array<{ time: string; delay: number }>;
  udp?: boolean;
}

export interface MihomoConfigs {
  port?: number;
  'socks-port'?: number;
  'redir-port'?: number;
  'tproxy-port'?: number;
  'mixed-port'?: number;
  mode?: 'rule' | 'global' | 'direct' | string;
  'log-level'?: string;
}

export interface TrafficStats {
  up: number;
  down: number;
}

export interface ConnectionsStats {
  downloadTotal: number;
  uploadTotal: number;
  connectionsCount: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024));
  return `${(bytesPerSec / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const MihomoView: React.FC<MihomoViewProps> = ({ adminKey }) => {
  const { t } = useTranslation();

  // Connection & core status
  const [coreStatus, setCoreStatus] = useState<'checking' | 'online' | 'offline' | 'unauthorized'>('checking');
  const [coreVersion, setCoreVersion] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Traffic & metrics
  const [traffic, setTraffic] = useState<TrafficStats>({ up: 0, down: 0 });
  const [connStats, setConnStats] = useState<ConnectionsStats>({ downloadTotal: 0, uploadTotal: 0, connectionsCount: 0 });

  // Configs
  const [configs, setConfigs] = useState<MihomoConfigs>({});
  const [isUpdatingMode, setIsUpdatingMode] = useState<boolean>(false);

  // Proxies & Groups
  const [proxiesMap, setProxiesMap] = useState<Record<string, ProxyItem>>({});
  const [selectedGroup, setSelectedGroup] = useState<string>('GLOBAL');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [nodeDelays, setNodeDelays] = useState<Record<string, number | 'timeout' | 'testing'>>({});
  const [isBatchTesting, setIsBatchTesting] = useState<boolean>(false);
  const [isSwitchingNode, setIsSwitchingNode] = useState<string | null>(null);

  // General state
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  }, []);

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (adminKey) {
      headers['x-admin-key'] = adminKey;
    }
    return headers;
  }, [adminKey]);

  // 1. Fetch Core Status
  const fetchStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/mihomo/status', { headers: getHeaders() });
      if (res.status === 401) {
        setCoreStatus('unauthorized');
        setStatusMessage(t('mihomo.unauthorized'));
        return false;
      }
      const data = await res.json();
      if (data.ok) {
        setCoreStatus('online');
        setCoreVersion(data.version || 'Mihomo Meta');
        setStatusMessage('');
        return true;
      } else {
        setCoreStatus('offline');
        setStatusMessage(data.message || t('mihomo.offlineDesc'));
        return false;
      }
    } catch (err: any) {
      setCoreStatus('offline');
      setStatusMessage(err.message || t('mihomo.offlineDesc'));
      return false;
    }
  }, [getHeaders, t]);

  // 2. Fetch Configs
  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mihomo/configs', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data);
      }
    } catch {
      // ignore
    }
  }, [getHeaders]);

  // 3. Fetch Proxies Map
  const fetchProxies = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mihomo/proxies', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const map = data.proxies || data || {};
        setProxiesMap(map);

        // Pre-populate delays from history
        const initialDelays: Record<string, number> = {};
        Object.keys(map).forEach((key) => {
          const item = map[key];
          if (item.history && item.history.length > 0) {
            const last = item.history[item.history.length - 1];
            if (last && typeof last.delay === 'number') {
              initialDelays[key] = last.delay;
            }
          }
        });
        setNodeDelays((prev) => ({ ...initialDelays, ...prev }));
      }
    } catch {
      // ignore
    }
  }, [getHeaders]);

  // 4. Fetch Traffic & Connections
  const fetchTrafficAndConnections = useCallback(async () => {
    try {
      const [trafRes, connRes] = await Promise.allSettled([
        fetch('/api/admin/mihomo/traffic', { headers: getHeaders() }),
        fetch('/api/admin/mihomo/connections', { headers: getHeaders() })
      ]);

      if (trafRes.status === 'fulfilled' && trafRes.value.ok) {
        const tData = await trafRes.value.json();
        setTraffic({ up: tData.up || 0, down: tData.down || 0 });
      }

      if (connRes.status === 'fulfilled' && connRes.value.ok) {
        const cData = await connRes.value.json();
        setConnStats({
          downloadTotal: cData.downloadTotal || 0,
          uploadTotal: cData.uploadTotal || 0,
          connectionsCount: Array.isArray(cData.connections) ? cData.connections.length : 0
        });
      }
    } catch {
      // ignore
    }
  }, [getHeaders]);

  // Initial Load and Polling
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    const isOnline = await fetchStatus();
    if (isOnline) {
      await Promise.allSettled([fetchConfigs(), fetchProxies(), fetchTrafficAndConnections()]);
    }
    setIsRefreshing(false);
  }, [fetchStatus, fetchConfigs, fetchProxies, fetchTrafficAndConnections]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Polling traffic & connection rates every 2s
  useEffect(() => {
    if (coreStatus !== 'online') return;
    const interval = setInterval(() => {
      fetchTrafficAndConnections();
    }, 2000);
    return () => clearInterval(interval);
  }, [coreStatus, fetchTrafficAndConnections]);

  // Extract policy groups
  const proxyGroups = useMemo(() => {
    const list: string[] = [];
    Object.keys(proxiesMap).forEach((name) => {
      const p = proxiesMap[name];
      if (
        p.all &&
        Array.isArray(p.all) &&
        ['Selector', 'URLTest', 'Fallback', 'LoadBalance'].includes(p.type)
      ) {
        list.push(name);
      }
    });
    // Ensure GLOBAL is prioritized if present
    if (proxiesMap['GLOBAL'] && !list.includes('GLOBAL')) {
      list.unshift('GLOBAL');
    }
    return list;
  }, [proxiesMap]);

  // Keep selected group valid
  useEffect(() => {
    if (proxyGroups.length > 0 && !proxyGroups.includes(selectedGroup)) {
      setSelectedGroup(proxyGroups.includes('GLOBAL') ? 'GLOBAL' : proxyGroups[0]);
    }
  }, [proxyGroups, selectedGroup]);

  // Current active group details
  const activeGroup = proxiesMap[selectedGroup];

  // Group nodes list
  const groupNodes = useMemo(() => {
    if (!activeGroup || !activeGroup.all) return [];
    return activeGroup.all
      .map((name) => proxiesMap[name] || { name, type: 'Unknown' })
      .filter((node) => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        return node.name.toLowerCase().includes(q) || (node.type && node.type.toLowerCase().includes(q));
      });
  }, [activeGroup, proxiesMap, searchFilter]);

  // Handler: Mode Switch
  const handleSwitchMode = async (newMode: 'rule' | 'global' | 'direct') => {
    if (configs.mode?.toLowerCase() === newMode || isUpdatingMode) return;
    setIsUpdatingMode(true);
    try {
      const res = await fetch('/api/admin/mihomo/configs', {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ mode: newMode })
      });
      if (res.ok) {
        setConfigs((prev) => ({ ...prev, mode: newMode }));
        showToast(t('mihomo.mode') + ': ' + newMode.toUpperCase());
      }
    } catch (err: any) {
      showToast('Mode update failed: ' + err.message);
    } finally {
      setIsUpdatingMode(false);
    }
  };

  // Handler: Select Node
  const handleSelectNode = async (groupName: string, nodeName: string) => {
    if (!groupName || !nodeName || activeGroup?.now === nodeName || isSwitchingNode) return;
    setIsSwitchingNode(nodeName);
    try {
      const res = await fetch(`/api/admin/mihomo/proxies/${encodeURIComponent(groupName)}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ name: nodeName })
      });
      if (res.status === 204 || res.ok) {
        setProxiesMap((prev) => {
          if (!prev[groupName]) return prev;
          return {
            ...prev,
            [groupName]: {
              ...prev[groupName],
              now: nodeName
            }
          };
        });
        showToast(t('mihomo.switchSuccess', { name: nodeName }));
      }
    } catch (err: any) {
      showToast('Failed to switch proxy: ' + err.message);
    } finally {
      setIsSwitchingNode(null);
    }
  };

  // Handler: Test Single Node Delay
  const handleTestDelay = async (nodeName: string): Promise<number | 'timeout'> => {
    setNodeDelays((prev) => ({ ...prev, [nodeName]: 'testing' }));
    try {
      const res = await fetch(
        `/api/admin/mihomo/proxies/${encodeURIComponent(nodeName)}/delay?timeout=3000`,
        { headers: getHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        const delay = typeof data.delay === 'number' ? data.delay : 'timeout';
        setNodeDelays((prev) => ({ ...prev, [nodeName]: delay }));
        return delay;
      } else {
        setNodeDelays((prev) => ({ ...prev, [nodeName]: 'timeout' }));
        return 'timeout';
      }
    } catch {
      setNodeDelays((prev) => ({ ...prev, [nodeName]: 'timeout' }));
      return 'timeout';
    }
  };

  // Handler: Batch Test Group Delay
  const testGroupDelay = async () => {
    if (!activeGroup?.all || isBatchTesting) return;
    setIsBatchTesting(true);
    const nodes = activeGroup.all;

    // Run tests in batches of 5
    const batchSize = 5;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((n) => handleTestDelay(n)));
    }
    setIsBatchTesting(false);
  };

  // Handler: Close All Connections
  const handleCloseConnections = async () => {
    try {
      const res = await fetch('/api/admin/mihomo/connections', {
        method: 'DELETE',
        headers: getHeaders()
      });
      if (res.status === 204 || res.ok) {
        setConnStats((prev) => ({ ...prev, connectionsCount: 0 }));
        showToast(t('mihomo.closeConnSuccess'));
      }
    } catch (err: any) {
      showToast('Failed to close connections: ' + err.message);
    }
  };

  // Delay pill color helper
  const getDelayPill = (delayVal: number | 'timeout' | 'testing' | undefined) => {
    if (delayVal === 'testing') {
      return (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center space-x-1 animate-pulse">
          <span>...</span>
        </span>
      );
    }
    if (delayVal === 'timeout' || delayVal === 0) {
      return (
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-medium">
          Timeout
        </span>
      );
    }
    if (typeof delayVal === 'number') {
      let color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      if (delayVal > 300) {
        color = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      } else if (delayVal > 150) {
        color = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      }
      return (
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-medium ${color}`}>
          {delayVal} ms
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400">
        --
      </span>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 animate-fadeIn pb-14 text-[var(--text-primary)]">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-20 right-6 z-50 bg-slate-900/90 text-white text-xs px-3.5 py-2 rounded-xl shadow-xl backdrop-blur-md border border-white/10 animate-fadeIn flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Top Header & Running Mode Banner */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-purple-500/20">
              <Radio className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold truncate">
                  {t('mihomo.title')}
                </h1>
                {coreStatus === 'online' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                    {coreVersion || 'Online'}
                  </span>
                )}
                {coreStatus === 'checking' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 animate-pulse">
                    {t('mihomo.connecting')}
                  </span>
                )}
                {coreStatus === 'offline' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    {t('mihomo.offline')}
                  </span>
                )}
                {coreStatus === 'unauthorized' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    {t('mihomo.unauthorized')}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                {t('mihomo.subtitle')}
              </p>
            </div>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="flex items-center space-x-1.5 self-start sm:self-auto bg-black/[0.03] dark:bg-white/[0.04] p-1 rounded-xl border border-[var(--border-subtle)]">
            {(['rule', 'global', 'direct'] as const).map((m) => {
              const active = configs.mode?.toLowerCase() === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSwitchMode(m)}
                  disabled={isUpdatingMode}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30 font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
                  }`}
                >
                  {m === 'rule' && t('mihomo.modeRule')}
                  {m === 'global' && t('mihomo.modeGlobal')}
                  {m === 'direct' && t('mihomo.modeDirect')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Real-time Metric Cards Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-[var(--border-subtle)]">
          {/* Metric 1: Real-time Up */}
          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--border-subtle)]">
            <div className="flex items-center space-x-1.5 text-xs text-[var(--text-muted)] mb-1">
              <ArrowUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t('mihomo.upRate')}</span>
            </div>
            <div className="text-sm sm:text-base font-mono font-semibold text-emerald-500 dark:text-emerald-400 truncate">
              {formatSpeed(traffic.up)}
            </div>
          </div>

          {/* Metric 2: Real-time Down */}
          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--border-subtle)]">
            <div className="flex items-center space-x-1.5 text-xs text-[var(--text-muted)] mb-1">
              <ArrowDown className="w-3.5 h-3.5 text-blue-500" />
              <span>{t('mihomo.downRate')}</span>
            </div>
            <div className="text-sm sm:text-base font-mono font-semibold text-blue-500 dark:text-blue-400 truncate">
              {formatSpeed(traffic.down)}
            </div>
          </div>

          {/* Metric 3: Active Connections */}
          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--border-subtle)]">
            <div className="flex items-center space-x-1.5 text-xs text-[var(--text-muted)] mb-1">
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('mihomo.activeConnections')}</span>
            </div>
            <div className="text-sm sm:text-base font-mono font-semibold text-[var(--text-primary)] truncate">
              {connStats.connectionsCount}
            </div>
          </div>

          {/* Metric 4: Total Downloaded */}
          <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[var(--border-subtle)]">
            <div className="flex items-center space-x-1.5 text-xs text-[var(--text-muted)] mb-1">
              <Globe className="w-3.5 h-3.5 text-purple-500" />
              <span>{t('mihomo.totalDownload')}</span>
            </div>
            <div className="text-sm sm:text-base font-mono font-semibold text-[var(--text-primary)] truncate">
              {formatBytes(connStats.downloadTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Offline / Unauthorized Diagnostic Empty State */}
      {coreStatus === 'offline' || coreStatus === 'unauthorized' ? (
        <div className="ui-card p-8 text-center space-y-4 max-w-xl mx-auto my-8 border border-rose-500/20">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto">
            <WifiOff className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              {coreStatus === 'unauthorized' ? t('mihomo.unauthorized') : t('mihomo.offlineTitle')}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
              {statusMessage || t('mihomo.offlineDesc')}
            </p>
            <div className="mt-4 p-3 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl border border-[var(--border-subtle)] text-[11px] text-left font-mono space-y-1 text-[var(--text-muted)]">
              <div>* {t('mihomo.checkEnvTip')}</div>
              <div>* MIHOMO_API_URL: default http://127.0.0.1:9090</div>
              <div>* MIHOMO_SECRET: external-controller secret</div>
            </div>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition-all active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('mihomo.retry')}</span>
          </button>
        </div>
      ) : (
        /* Main Dashboard: Policy Groups & Nodes Grid */
        <div className="space-y-4">
          {/* Controls Bar: Group Selector Tabs, Search, Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 rounded-2xl shadow-sm">
            {/* Group Tabs (Scrollable on mobile) */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              {proxyGroups.map((group) => {
                const isActive = selectedGroup === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setSelectedGroup(group)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-purple-600 text-white font-semibold shadow-sm shadow-purple-600/20'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    {group}
                  </button>
                );
              })}
            </div>

            {/* Right Tools: Search + Batch Test + Clear Connections + Refresh */}
            <div className="flex items-center space-x-2 shrink-0">
              {/* Search Filter */}
              <div className="relative flex-1 sm:w-44">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={t('mihomo.searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-1.5 bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Speedtest All Button */}
              <button
                type="button"
                onClick={testGroupDelay}
                disabled={isBatchTesting}
                title={t('mihomo.speedtestAll')}
                className="px-2.5 py-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] hover:bg-purple-500/10 border border-[var(--border-subtle)] hover:border-purple-500/30 text-xs font-medium text-[var(--text-secondary)] hover:text-purple-400 transition-all flex items-center space-x-1.5 shrink-0"
              >
                <Zap className={`w-3.5 h-3.5 text-purple-400 ${isBatchTesting ? 'animate-bounce' : ''}`} />
                <span className="hidden sm:inline">
                  {isBatchTesting ? t('mihomo.speedtesting') : t('mihomo.speedtestAll')}
                </span>
              </button>

              {/* Close Connections Button */}
              <button
                type="button"
                onClick={handleCloseConnections}
                title={t('mihomo.closeConnections')}
                className="p-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] hover:bg-rose-500/10 border border-[var(--border-subtle)] hover:border-rose-500/30 text-xs text-[var(--text-secondary)] hover:text-rose-400 transition-all shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={refreshAll}
                disabled={isRefreshing}
                title={t('mihomo.refresh')}
                className="p-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Group Info Header */}
          <div className="flex items-center justify-between px-1 text-xs text-[var(--text-muted)]">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-[var(--text-secondary)]">{selectedGroup}</span>
              <span>•</span>
              <span>{groupNodes.length} nodes</span>
              {activeGroup?.type && (
                <span className="px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.05] text-[10px] font-mono">
                  {activeGroup.type}
                </span>
              )}
            </div>
            {activeGroup?.now && (
              <div className="flex items-center space-x-1.5 text-purple-400 font-mono text-[11px]">
                <Check className="w-3.5 h-3.5" />
                <span>{activeGroup.now}</span>
              </div>
            )}
          </div>

          {/* Node Cards Grid */}
          {groupNodes.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl">
              {t('mihomo.noNodes')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {groupNodes.map((node) => {
                const isSelected = activeGroup?.now === node.name;
                const isSwitching = isSwitchingNode === node.name;
                const delay = nodeDelays[node.name];

                return (
                  <div
                    key={node.name}
                    onClick={() => handleSelectNode(selectedGroup, node.name)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? 'bg-purple-500/[0.08] border-purple-500 shadow-sm shadow-purple-500/10'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-purple-500/40 hover:bg-purple-500/[0.02]'
                    }`}
                  >
                    {/* Top Row: Node Name & Active Badge */}
                    <div className="flex items-start justify-between space-x-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5">
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shrink-0" />
                          )}
                          <h4
                            className={`text-xs font-semibold truncate ${
                              isSelected
                                ? 'text-purple-400'
                                : 'text-[var(--text-primary)] group-hover:text-purple-300'
                            }`}
                            title={node.name}
                          >
                            {node.name}
                          </h4>
                        </div>
                        <div className="flex items-center space-x-1.5 mt-1 text-[10px] text-[var(--text-muted)] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.02] dark:border-white/[0.03]">
                            {node.type || 'Proxy'}
                          </span>
                          {node.udp && <span className="text-emerald-500 font-semibold">UDP</span>}
                        </div>
                      </div>

                      {/* Active Indicator or Switch Spinner */}
                      {isSwitching ? (
                        <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin shrink-0" />
                      ) : isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </div>
                      ) : null}
                    </div>

                    {/* Bottom Row: Delay Badge (Click to re-test single node) */}
                    <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {t('mihomo.latency')}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTestDelay(node.name);
                        }}
                        title="Click to test delay"
                        className="hover:scale-105 active:scale-95 transition-transform"
                      >
                        {getDelayPill(delay)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MihomoView;
