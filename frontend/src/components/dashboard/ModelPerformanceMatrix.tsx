import React, { useMemo, useState } from 'react';
import { Layers, Zap, TrendingUp, Clock, Activity, Search, ArrowUpDown, ArrowUp, ArrowDown, Copy, Check } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { ModelStatItem } from '../../utils/modelHelpers';

export type { ModelStatItem };

export interface ModelPerformanceMatrixProps {
  modelStats: {
    totalRequests: number;
    list: ModelStatItem[];
  };
  getModelColor: (modelName: string, index: number) => string;
  range?: number | 'today';
}

type SortField = 'model' | 'spec' | 'requests' | 'percentage' | 'avgLatency' | 'throughput';
type SortDirection = 'asc' | 'desc';

interface ModelFamilyConfig {
  label: string;
  badgeClass: string;
}

const detectModelFamily = (modelName: string): ModelFamilyConfig => {
  const lower = (modelName || '').toLowerCase();
  if (lower.includes('gemini')) {
    return {
      label: 'Gemini',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/25'
    };
  }
  if (lower.includes('claude')) {
    return {
      label: 'Claude',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/25'
    };
  }
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) {
    return {
      label: 'OpenAI',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
    };
  }
  if (lower.includes('deepseek')) {
    return {
      label: 'DeepSeek',
      badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25'
    };
  }
  if (lower.includes('qwen')) {
    return {
      label: 'Qwen',
      badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/25'
    };
  }
  if (lower.includes('llama')) {
    return {
      label: 'Llama',
      badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25'
    };
  }
  return {
    label: 'LLM',
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/25'
  };
};

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
        case 'spec': {
          const aTotal = (a.standardRequests || 0) + (a.highRequests || 0);
          const bTotal = (b.standardRequests || 0) + (b.highRequests || 0);
          const aRatio = aTotal > 0 ? (a.highRequests || 0) / aTotal : 0;
          const bRatio = bTotal > 0 ? (b.highRequests || 0) / bTotal : 0;
          return factor * (aRatio - bRatio || (a.highRequests || 0) - (b.highRequests || 0));
        }
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

                  {/* Spec Distribution */}
                  <th
                    className="py-2.5 px-3 font-semibold text-center min-w-[210px] cursor-pointer select-none group hover:text-[var(--text-primary)] transition-colors"
                    onClick={() => handleSort('spec')}
                    title={t('dashboard.sortBy', '点击排序')}
                  >
                    <div className="flex items-center justify-center space-x-1.5">
                      <span>{t('dashboard.specDistribution', '规格分布 (标 / 高)')}</span>
                      {renderSortIcon('spec')}
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
                  const stdCount = item.standardRequests || 0;
                  const highCount = item.highRequests || 0;
                  const totalSpec = stdCount + highCount;
                  const stdPercent = totalSpec > 0 ? (stdCount / totalSpec) * 100 : 0;
                  const highPercent = totalSpec > 0 ? (highCount / totalSpec) * 100 : 0;
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

                      {/* Spec Distribution: Dual-spec capsules */}
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Standard Capsule */}
                          <span
                            className="bg-sky-500/10 text-sky-400 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 font-medium whitespace-nowrap"
                            title={`${t('dashboard.standardReqs', '标准请求')}: ${stdCount.toLocaleString()} (${Math.round(stdPercent)}%)`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0 shadow-[0_0_4px_rgba(56,189,248,0.6)]" />
                            <span className="tabular-nums">Std {stdCount.toLocaleString()} · {Math.round(stdPercent)}%</span>
                          </span>

                          {/* High Capsule */}
                          {highCount > 0 ? (
                            <span
                              className="bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 font-medium whitespace-nowrap"
                              title={`${t('dashboard.highReqs', 'High 规格')}: ${highCount.toLocaleString()} (${Math.round(highPercent)}%)`}
                            >
                              <Zap className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                              <span className="tabular-nums">High {highCount.toLocaleString()} · {Math.round(highPercent)}%</span>
                            </span>
                          ) : (
                            <span
                              className="bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-40 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 whitespace-nowrap"
                              title={`${t('dashboard.highReqs', 'High 规格')}: 0 (0%)`}
                            >
                              <Zap className="w-2.5 h-2.5 shrink-0 opacity-60" />
                              <span>High 0 · 0%</span>
                            </span>
                          )}
                        </div>
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
              const stdCount = item.standardRequests || 0;
              const highCount = item.highRequests || 0;
              const totalSpec = stdCount + highCount;
              const stdPct = totalSpec > 0 ? (stdCount / totalSpec) * 100 : 0;
              const highPct = totalSpec > 0 ? (highCount / totalSpec) * 100 : 0;
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
                        className={`text-[9px] px-1 py-0.2 rounded font-mono font-semibold uppercase tracking-wider border shrink-0 ${family.badgeClass}`}
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

                  {/* Spec Distribution & Requests */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                      <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                        {t('dashboard.specDistribution', '规格分布')}
                      </span>
                      <span className="text-[var(--text-primary)] font-bold text-[10px] tabular-nums">
                        {item.requests.toLocaleString()} reqs ({item.percentage.toFixed(0)}%)
                      </span>
                    </div>

                    {/* Dual Capsules */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Standard Capsule */}
                      <span
                        className="bg-sky-500/10 text-sky-400 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 font-medium whitespace-nowrap"
                        title={`${t('dashboard.standardReqs', '标准请求')}: ${stdCount.toLocaleString()} (${Math.round(stdPct)}%)`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                        <span className="tabular-nums">Std {stdCount.toLocaleString()} · {Math.round(stdPct)}%</span>
                      </span>

                      {/* High Capsule */}
                      {highCount > 0 ? (
                        <span
                          className="bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 font-medium whitespace-nowrap"
                          title={`${t('dashboard.highReqs', 'High 规格')}: ${highCount.toLocaleString()} (${Math.round(highPct)}%)`}
                        >
                          <Zap className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                          <span className="tabular-nums">High {highCount.toLocaleString()} · {Math.round(highPct)}%</span>
                        </span>
                      ) : (
                        <span
                          className="bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-40 font-mono text-[10px] px-2 py-0.5 rounded-full flex items-center space-x-1 whitespace-nowrap"
                          title={`${t('dashboard.highReqs', 'High 规格')}: 0 (0%)`}
                        >
                          <Zap className="w-2.5 h-2.5 shrink-0 opacity-60" />
                          <span>High 0 · 0%</span>
                        </span>
                      )}
                    </div>
                  </div>

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
    </div>
  );
};

export default ModelPerformanceMatrix;
