import React, { useMemo, useState, useEffect } from 'react';
import { Layers, TrendingUp, Clock, Activity, Search, ArrowUpDown, ArrowUp, ArrowDown, Copy, Check, Server } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { ModelStatItem, ModelNodeStatItem, detectModelFamily } from '../../utils/modelHelpers';

export type { ModelStatItem, ModelNodeStatItem };

export interface ModelPerformanceMatrixProps {
  modelStats: {
    totalRequests: number;
    list: ModelStatItem[];
  };
  getModelColor: (modelName: string, index: number) => string;
  range?: number | 'today';
}

interface UpstreamNodeCapsuleProps {
  node: ModelNodeStatItem;
  onHover: (node: ModelNodeStatItem, el: HTMLElement) => void;
  onLeave: () => void;
  onClick: (node: ModelNodeStatItem, el: HTMLElement, e: React.MouseEvent) => void;
}

const UpstreamNodeCapsule: React.FC<UpstreamNodeCapsuleProps> = ({
  node,
  onHover,
  onLeave,
  onClick,
}) => {
  const styleClass = node.isIsolated
    ? 'bg-rose-500/10 text-rose-400 border-rose-500/25 hover:border-rose-500/50 hover:bg-rose-500/15'
    : node.isLegacy
    ? 'bg-slate-500/10 text-slate-400 border-slate-500/25 hover:border-slate-500/50 hover:bg-slate-500/15'
    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:border-emerald-500/50 hover:bg-emerald-500/15';

  const dotClass = node.isIsolated
    ? 'bg-rose-400 shadow-[0_0_5px_rgba(244,63,94,0.6)] animate-pulse'
    : node.isLegacy
    ? 'bg-slate-400'
    : 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.5)]';

  return (
    <button
      type="button"
      className={`px-2 py-0.5 rounded-md border text-[10px] font-mono font-medium flex items-center space-x-1.5 cursor-pointer transition-all shrink-0 ${styleClass}`}
      onMouseEnter={(e) => onHover(node, e.currentTarget)}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(node, e.currentTarget, e)}
      title={`${node.nodeName}: ${node.requests.toLocaleString()} reqs (${node.percentage.toFixed(1)}%)`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      <span className="truncate max-w-[90px] font-semibold text-[var(--text-primary)]">{node.nodeName}</span>
      <span className="tabular-nums opacity-85 font-mono">{node.requests.toLocaleString()}</span>
    </button>
  );
};

type SortField = 'model' | 'requests' | 'percentage' | 'avgLatency' | 'throughput';
type SortDirection = 'asc' | 'desc';

export const ModelPerformanceMatrix: React.FC<ModelPerformanceMatrixProps> = ({
  modelStats,
  getModelColor,
  range = 24,
}) => {
  const { t } = useTranslation();
  const count = modelStats?.list?.length || 0;

  const [sortField, setSortField] = useState<SortField>('requests');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedModel, setCopiedModel] = useState<string | null>(null);

  const [activeTooltip, setActiveTooltip] = useState<{
    node: ModelNodeStatItem;
    rect: DOMRect;
  } | null>(null);

  useEffect(() => {
    if (!activeTooltip) return;
    const close = () => setActiveTooltip(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('click', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('click', close);
    };
  }, [activeTooltip]);

  const handleNodeHover = (node: ModelNodeStatItem, el: HTMLElement) => {
    setActiveTooltip({ node, rect: el.getBoundingClientRect() });
  };

  const handleNodeLeave = () => {
    setActiveTooltip(null);
  };

  const handleNodeClick = (node: ModelNodeStatItem, el: HTMLElement, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTooltip?.node.nodeKey === node.nodeKey) {
      setActiveTooltip(null);
    } else {
      setActiveTooltip({ node, rect: el.getBoundingClientRect() });
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'avgLatency' ? 'asc' : 'desc');
    }
  };

  const handleCopy = (modelName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(modelName).then(() => {
        setCopiedModel(modelName);
        setTimeout(() => {
          setCopiedModel(prev => (prev === modelName ? null : prev));
        }, 2000);
      }).catch(() => {});
    }
  };

  const getThroughput = (requests: number) => {
    if (!requests || requests <= 0) return '0.00 req/s';
    let hours = typeof range === 'number' ? range : 24;
    if (range === 'today') {
      const now = new Date();
      hours = Math.max(1, now.getHours() + now.getMinutes() / 60);
    }
    const qps = requests / (hours * 3600);
    return `${qps.toFixed(2)} req/s`;
  };

  // Safe latency benchmark computations
  const validLatencies = useMemo(() => {
    return (modelStats?.list || []).filter(
      item => (item.requests || 0) > 0 && typeof item.avgLatency === 'number' && item.avgLatency > 0
    );
  }, [modelStats?.list]);

  const maxLatency = useMemo(() => {
    if (!validLatencies.length) return 1000;
    const max = Math.max(...validLatencies.map(item => item.avgLatency));
    return max > 0 ? max : 1000;
  }, [validLatencies]);

  // Insights footer calculations (unfiltered true global metrics)
  const topModel = useMemo(() => {
    if (!modelStats?.list?.length) return null;
    return [...modelStats.list].sort((a, b) => (b.requests || 0) - (a.requests || 0))[0];
  }, [modelStats?.list]);

  const fastestModel = useMemo(() => {
    if (!validLatencies.length) return null;
    return [...validLatencies].sort((a, b) => a.avgLatency - b.avgLatency)[0];
  }, [validLatencies]);

  const totalThroughput = useMemo(() => {
    const total = modelStats?.totalRequests || 0;
    return getThroughput(total);
  }, [modelStats?.totalRequests, range]);

  // Sorted and filtered list
  const displayList = useMemo(() => {
    let list = modelStats?.list || [];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(item => item.model.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'model':
          return factor * a.model.localeCompare(b.model);
        case 'requests':
        case 'throughput':
        case 'percentage':
          return factor * ((a.requests || 0) - (b.requests || 0));
        case 'avgLatency': {
          const aVal = (a.requests || 0) > 0 && a.avgLatency > 0 ? a.avgLatency : 999999;
          const bVal = (b.requests || 0) > 0 && b.avgLatency > 0 ? b.avgLatency : 999999;
          return factor * (aVal - bVal);
        }
        default:
          return 0;
      }
    });
  }, [modelStats?.list, searchQuery, sortField, sortDirection]);

  const getRankBadgeClass = (index: number) => {
    if (index === 0) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    if (index === 1) return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    if (index === 2) return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    return 'bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] border-[var(--border-subtle)]';
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-75 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-400 animate-in fade-in" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-400 animate-in fade-in" />
    );
  };

  return (
    <div className="ui-card p-2.5 sm:p-5 flex flex-col w-full overflow-hidden">
      {/* Card Header & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2.5 sm:mb-4 gap-2.5">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-semibold text-[var(--text-primary)] tracking-wider uppercase">
              {t('dashboard.modelPerformanceTitle')}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium">
              {count} {t('dashboard.modelsTracked')}
            </span>
          </div>
        </div>

        {/* Search filter if models >= 3 or actively filtering */}
        {(count >= 3 || searchQuery) && (
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('dashboard.filterModelsPlaceholder', '搜索模型...')}
              className="w-full bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] focus:border-indigo-500/50 rounded-lg pl-8 pr-6 py-1 text-[11px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-mono leading-none"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {!modelStats?.list || count === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[140px] text-[var(--text-secondary)] text-xs font-mono">
          {t('dashboard.noData')}
        </div>
      ) : displayList.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[140px] text-[var(--text-secondary)] text-xs font-mono space-y-1.5 py-6">
          <span>{t('logs.noLogsFound', '未找到匹配的模型。')}</span>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-[11px] text-indigo-400 hover:underline"
          >
            {t('common.clearFilter', '清除过滤条件')}
          </button>
        </div>
      ) : (
        <>
          {/* 1. Desktop Multi-column DataTable (Hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto w-full no-scrollbar rounded-xl">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]/80 text-[var(--text-secondary)] text-[11px] uppercase tracking-wider backdrop-blur-sm">
                  {/* Model Name */}
                  <th
                    className="py-2.5 px-3 font-semibold cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => handleSort('model')}
                    title={t('dashboard.sortBy', '点击排序')}
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>{t('dashboard.modelName', '模型名称')}</span>
                      {renderSortIcon('model')}
                    </div>
                  </th>

                  {/* Upstream Nodes Comparison */}
                  <th className="py-2.5 px-3 font-semibold min-w-[200px] select-none text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-1.5">
                      <span>{t('dashboard.upstreamNodes', '上游节点对比')}</span>
                    </div>
                  </th>

                  {/* Total Requests */}
                  <th
                    className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => handleSort('requests')}
                    title={t('dashboard.sortBy', '点击排序')}
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>{t('dashboard.totalTransactions', '总请求量')}</span>
                      {renderSortIcon('requests')}
                    </div>
                  </th>

                  {/* Traffic Share */}
                  <th
                    className="py-2.5 px-4 font-semibold min-w-[170px] cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => handleSort('percentage')}
                    title={t('dashboard.sortBy', '点击排序')}
                  >
                    <div className="flex items-center space-x-1.5">
                      <span>{t('dashboard.trafficShare', '流量占比')}</span>
                      {renderSortIcon('percentage')}
                    </div>
                  </th>

                  {/* Average Latency */}
                  <th
                    className="py-2.5 px-3 font-semibold text-center min-w-[130px] cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => handleSort('avgLatency')}
                    title={t('dashboard.sortBy', '点击排序')}
                  >
                    <div className="flex items-center justify-center space-x-1.5">
                      <span>{t('dashboard.averageLatency', '平均延迟')}</span>
                      {renderSortIcon('avgLatency')}
                    </div>
                  </th>

                  {/* Throughput */}
                  <th
                    className="py-2.5 px-3 font-semibold text-right cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => handleSort('throughput')}
                    title={t('dashboard.sortBy', '点击排序')}
                  >
                    <div className="flex items-center justify-end space-x-1.5">
                      <span>{t('dashboard.throughputRate', 'Throughput / 平均吞吐')}</span>
                      {renderSortIcon('throughput')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((item, index) => {
                  const color = getModelColor(item.model, index);
                  const family = detectModelFamily(item.model);

                  const latencyTier = item.avgLatency < 1000
                    ? {
                        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        barColor: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]',
                        label: t('dashboard.latencyScaleFast', '极速')
                      }
                    : item.avgLatency < 3000
                    ? {
                        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                        barColor: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]',
                        label: t('dashboard.latencyScaleModerate', '正常')
                      }
                    : {
                        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
                        barColor: 'bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.4)]',
                        label: t('dashboard.latencyScaleSlow', '较慢')
                      };

                  const latencyRatio = maxLatency > 0 && item.avgLatency > 0 ? (item.avgLatency / maxLatency) * 100 : 0;
                  const latencyWidth = isFinite(latencyRatio) ? Math.min(100, Math.max(item.avgLatency > 0 ? 8 : 0, latencyRatio)) : 0;

                  return (
                    <tr
                      key={item.model}
                      className="group/row border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-surface-hover)] transition-colors"
                    >
                      {/* Model Name & Rank Badge */}
                      <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono font-bold border shrink-0 ${getRankBadgeClass(
                              index
                            )}`}
                          >
                            #{index + 1}
                          </span>
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm transition-transform group-hover/row:scale-110"
                            style={{
                              backgroundColor: color,
                              boxShadow: `0 0 8px ${color}50`
                            }}
                          />
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase tracking-wider border shrink-0 ${family.badgeClass}`}
                          >
                            {family.label}
                          </span>
                          <span className="truncate max-w-[180px] font-semibold text-xs text-[var(--text-primary)]" title={item.model}>
                            {item.model}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopy(item.model, e)}
                            className="opacity-0 group-hover/row:opacity-100 p-1 hover:bg-[var(--bg-surface-sub)] rounded text-[var(--text-secondary)] hover:text-indigo-400 transition-all shrink-0"
                            title={copiedModel === item.model ? t('dashboard.modelCopied', '已复制') : t('dashboard.copyModelName', '复制模型名称')}
                          >
                            {copiedModel === item.model ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Upstream Nodes Comparison */}
                      <td className="py-3 px-3">
                        {item.nodes && item.nodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 items-center max-w-[340px]">
                            {item.nodes.map(node => (
                              <UpstreamNodeCapsule
                                key={node.nodeKey}
                                node={node}
                                onHover={handleNodeHover}
                                onLeave={handleNodeLeave}
                                onClick={handleNodeClick}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)] font-mono">-</span>
                        )}
                      </td>

                      {/* Total Requests */}
                      <td className="py-3 px-3 text-right font-bold tabular-nums text-indigo-400">
                        {item.requests.toLocaleString()}
                      </td>

                      {/* Traffic Share & Progress Capsule */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <span className="text-[var(--text-primary)] font-semibold tabular-nums w-12 text-right shrink-0">
                            {item.percentage.toFixed(1)}%
                          </span>
                          <div className="flex-1 bg-black/5 dark:bg-white/5 h-2 rounded-full overflow-hidden p-0.5 border border-black/5 dark:border-white/5">
                            <div
                              className="h-full transition-all duration-500 rounded-full"
                              style={{
                                width: `${Math.max(item.percentage, 2)}%`,
                                backgroundColor: color,
                                boxShadow: `0 0 6px ${color}35`
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Avg Latency & Relative Benchmark Bar */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-block tabular-nums ${latencyTier.color}`}>
                              ~{item.avgLatency}ms
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)]">
                              {latencyTier.label}
                            </span>
                          </div>
                          <div className="w-full max-w-[90px] bg-black/5 dark:bg-white/5 h-1 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${latencyTier.barColor}`}
                              style={{ width: `${latencyWidth}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Throughput */}
                      <td className="py-3 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                        {getThroughput(item.requests)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 2. Mobile Redesigned Micro Dashboard Cards (Hidden on desktop) */}
          <div className="md:hidden space-y-2">
            {displayList.map((item, index) => {
              const color = getModelColor(item.model, index);
              const family = detectModelFamily(item.model);

              const latencyTier = item.avgLatency < 1000
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : item.avgLatency < 3000
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

              return (
                <div
                  key={item.model}
                  className="p-3 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] space-y-2.5 transition-all hover:border-[var(--border-hover)]"
                >
                  {/* Header: Rank + Model Name + Latency Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono font-bold border shrink-0 ${getRankBadgeClass(
                          index
                        )}`}
                      >
                        #{index + 1}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                        style={{
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}50`
                        }}
                      />
                      <span
                        className={`text-[9px] px-1 py-0.5 rounded font-mono font-semibold uppercase tracking-wider border shrink-0 ${family.badgeClass}`}
                      >
                        {family.label}
                      </span>
                      <span className="font-mono font-semibold text-[var(--text-primary)] truncate text-xs" title={item.model}>
                        {item.model}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopy(item.model, e)}
                        className="p-1 text-[var(--text-secondary)] hover:text-indigo-400 transition-colors shrink-0"
                        title={copiedModel === item.model ? t('dashboard.modelCopied', '已复制') : t('dashboard.copyModelName', '复制模型名称')}
                      >
                        {copiedModel === item.model ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-medium shrink-0 tabular-nums ${latencyTier}`}>
                      ~{item.avgLatency}ms
                    </span>
                  </div>

                  {/* Requests Summary */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                    <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                      {t('dashboard.totalTransactions', '总请求量')}
                    </span>
                    <span className="text-[var(--text-primary)] font-bold text-[11px] tabular-nums text-indigo-400">
                      {item.requests.toLocaleString()} reqs ({item.percentage.toFixed(0)}%)
                    </span>
                  </div>

                  {/* Upstream Nodes Comparison */}
                  {item.nodes && item.nodes.length > 0 && (
                    <div className="space-y-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)]">
                        <span className="uppercase tracking-wider font-medium">
                          {t('dashboard.upstreamNodes', '上游节点对比')}
                        </span>
                        <span className="opacity-75">{item.nodes.length} 个节点</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.nodes.map(node => (
                          <UpstreamNodeCapsule
                            key={node.nodeKey}
                            node={node}
                            onHover={handleNodeHover}
                            onLeave={handleNodeLeave}
                            onClick={handleNodeClick}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Traffic Share & Throughput */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-2 flex-1 mr-3">
                      <span className="shrink-0">{t('dashboard.trafficShare', '流量占比')}</span>
                      <div className="flex-1 bg-black/5 dark:bg-white/5 h-1.5 rounded-full overflow-hidden p-0.5 border border-black/5 dark:border-white/5">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(item.percentage, 2)}%`,
                            backgroundColor: color,
                            boxShadow: `0 0 6px ${color}35`
                          }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 font-medium text-[var(--text-primary)] tabular-nums">
                      {getThroughput(item.requests)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3. Footer Insights Summary Strip */}
          <div className="mt-3 sm:mt-4 pt-3 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-xs">
            {/* Top Model */}
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] hover:border-amber-500/30 transition-colors">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                  {t('dashboard.insightsPrimaryModel', '主力模型')}
                </div>
                <div className="font-mono font-semibold text-[var(--text-primary)] truncate text-xs" title={topModel?.model}>
                  {topModel ? topModel.model : '-'}
                </div>
              </div>
              {topModel && (
                <span className="text-[11px] font-mono font-bold text-amber-400 shrink-0 tabular-nums">
                  {topModel.percentage.toFixed(1)}%
                </span>
              )}
            </div>

            {/* Fastest Model */}
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] hover:border-emerald-500/30 transition-colors">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                  {t('dashboard.insightsFastest', '最快响应')}
                </div>
                <div className="font-mono font-semibold text-[var(--text-primary)] truncate text-xs" title={fastestModel?.model}>
                  {fastestModel ? fastestModel.model : '-'}
                </div>
              </div>
              {fastestModel && (
                <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0 tabular-nums">
                  ~{fastestModel.avgLatency}ms
                </span>
              )}
            </div>

            {/* Total Combined Throughput */}
            <div className="flex items-center space-x-2.5 p-2.5 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] hover:border-indigo-500/30 transition-colors">
              <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                  {t('dashboard.insightsTotalThroughput', '全站总吞吐')}
                </div>
                <div className="font-mono font-semibold text-[var(--text-primary)] truncate text-xs tabular-nums">
                  {totalThroughput}
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-indigo-400 shrink-0 tabular-nums">
                {(modelStats?.totalRequests || 0).toLocaleString()} reqs
              </span>
            </div>
          </div>
        </>
      )}

      {/* Floating Glassmorphic Tooltip Card */}
      {activeTooltip && (
        <div
          className="fixed z-[9999] pointer-events-none p-3 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md border border-slate-700/60 shadow-2xl text-[11px] font-mono text-[var(--text-primary)] transition-all duration-150 w-[270px] space-y-2 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.max(12, Math.min(window.innerWidth - 282, activeTooltip.rect.left + activeTooltip.rect.width / 2 - 135)),
            ...(activeTooltip.rect.top > 230
              ? { bottom: window.innerHeight - activeTooltip.rect.top + 8 }
              : { top: activeTooltip.rect.bottom + 8 }),
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 min-w-0">
              <Server className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-bold text-white truncate max-w-[150px]" title={activeTooltip.node.nodeName}>
                {activeTooltip.node.nodeName}
              </span>
            </div>
            <div className="flex items-center space-x-1 shrink-0">
              {activeTooltip.node.type && (
                <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeTooltip.node.type}
                </span>
              )}
              {activeTooltip.node.isIsolated ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {t('dashboard.upstreamNodeIsolated', '已熔断')}
                </span>
              ) : activeTooltip.node.isLegacy ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-700 text-slate-300">
                  Legacy
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  正常
                </span>
              )}
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/40">
              <div className="text-slate-400 text-[9px] uppercase">{t('dashboard.upstreamNodeShare', '流量占比')}</div>
              <div className="text-white font-bold text-[11px] mt-0.5">{activeTooltip.node.percentage.toFixed(1)}%</div>
            </div>
            <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/40">
              <div className="text-slate-400 text-[9px] uppercase">{t('dashboard.upstreamNodeLatency', '平均延迟')}</div>
              <div className="text-white font-bold text-[11px] mt-0.5">~{activeTooltip.node.avgLatency}ms</div>
            </div>
            <div className="bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/40 col-span-2">
              <div className="flex justify-between items-center text-slate-400 text-[9px] uppercase">
                <span>{t('dashboard.upstreamNodeSuccessRate', '成功率')}</span>
                <span className="text-slate-400">{activeTooltip.node.requests.toLocaleString()} 总请求</span>
              </div>
              <div className="flex justify-between items-center mt-0.5">
                <span className={`font-bold text-[11px] ${activeTooltip.node.successRate >= 98 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {activeTooltip.node.successRate.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400">
                  ({activeTooltip.node.success.toLocaleString()} 成功 / {activeTooltip.node.error.toLocaleString()} 失败)
                </span>
              </div>
            </div>
          </div>

          {/* Weight & URL */}
          {activeTooltip.node.weight !== undefined && (
            <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
              <span>{t('dashboard.upstreamNodeWeight', '调度权重')}:</span>
              <span className="text-[var(--text-primary)] font-semibold">{activeTooltip.node.weight}</span>
            </div>
          )}

          {activeTooltip.node.url && (
            <div className="text-[9px] text-slate-400 break-all bg-slate-950/60 p-1.5 rounded border border-slate-800/80">
              <span className="text-slate-500 mr-1">URL:</span>
              <span className="text-slate-300 select-all">{activeTooltip.node.url}</span>
            </div>
          )}

          {activeTooltip.node.isLegacy && (
            <div className="text-[9px] text-slate-400 bg-slate-800/40 p-1.5 rounded border border-slate-700/30">
              升级前或未绑定上游节点索引的历史请求
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ModelPerformanceMatrix;
