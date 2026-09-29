import React, { useMemo } from 'react';
import { Layers, Zap, TrendingUp, Clock, Activity } from 'lucide-react';
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

export const ModelPerformanceMatrix: React.FC<ModelPerformanceMatrixProps> = ({
  modelStats,
  getModelColor,
  range = 24,
}) => {
  const { t } = useTranslation();
  const count = modelStats?.list?.length || 0;

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

  // Insights footer calculations
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

  const getRankBadgeClass = (index: number) => {
    if (index === 0) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    if (index === 1) return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
    if (index === 2) return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
    return 'bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] border-[var(--border-subtle)]';
  };

  return (
    <div className="ui-card p-2.5 sm:p-5 flex flex-col w-full overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold text-[var(--text-primary)] tracking-wider uppercase">
            {t('dashboard.modelPerformanceTitle')}
          </h3>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full font-mono border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium">
          {count} {t('dashboard.modelsTracked')}
        </span>
      </div>

      {!modelStats?.list || count === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[140px] text-[var(--text-secondary)] text-xs font-mono">
          {t('dashboard.noData')}
        </div>
      ) : (
        <>
          {/* 1. Desktop Multi-column DataTable (Hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto w-full no-scrollbar rounded-xl">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-medium">{t('dashboard.modelName', '模型名称')}</th>
                  <th className="py-2.5 px-3 font-medium text-center min-w-[210px]">
                    {t('dashboard.specDistribution', '规格分布 (标 / 高)')}
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.totalTransactions', '总请求量')}</th>
                  <th className="py-2.5 px-4 font-medium min-w-[170px]">{t('dashboard.trafficShare', '流量占比')}</th>
                  <th className="py-2.5 px-3 font-medium text-center min-w-[130px]">{t('dashboard.averageLatency', '平均延迟')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.throughputRate', 'Throughput / 平均吞吐')}</th>
                </tr>
              </thead>
              <tbody>
                {modelStats.list.map((item, index) => {
                  const color = getModelColor(item.model, index);
                  const stdCount = item.standardRequests || 0;
                  const highCount = item.highRequests || 0;
                  const totalSpec = stdCount + highCount;
                  const stdPercent = totalSpec > 0 ? (stdCount / totalSpec) * 100 : 0;
                  const highPercent = totalSpec > 0 ? (highCount / totalSpec) * 100 : 0;

                  const latencyTier = item.avgLatency < 1000
                    ? {
                        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        barColor: 'bg-emerald-400',
                        label: t('dashboard.latencyScaleFast', '极速')
                      }
                    : item.avgLatency < 3000
                    ? {
                        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                        barColor: 'bg-amber-400',
                        label: t('dashboard.latencyScaleModerate', '正常')
                      }
                    : {
                        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
                        barColor: 'bg-rose-400',
                        label: t('dashboard.latencyScaleSlow', '较慢')
                      };

                  const latencyRatio = maxLatency > 0 && item.avgLatency > 0 ? (item.avgLatency / maxLatency) * 100 : 0;
                  const latencyWidth = isFinite(latencyRatio) ? Math.min(100, Math.max(item.avgLatency > 0 ? 8 : 0, latencyRatio)) : 0;

                  return (
                    <tr
                      key={item.model}
                      className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-surface-hover)] transition-colors"
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
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                          <span className="truncate max-w-[200px]" title={item.model}>
                            {item.model}
                          </span>
                        </div>
                      </td>

                      {/* Spec Distribution: Dual-spec stacked bar + badges */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col space-y-1.5">
                          <div className="flex items-center justify-between gap-1.5">
                            {/* Standard Pill */}
                            <span
                              className="border border-sky-500/30 bg-sky-500/10 text-sky-400 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-medium whitespace-nowrap"
                              title={`${t('dashboard.standardReqs', '标准请求')}: ${stdCount.toLocaleString()} (${Math.round(stdPercent)}%)`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                              <span>Std {stdCount.toLocaleString()} · {Math.round(stdPercent)}%</span>
                            </span>

                            {/* High Pill */}
                            {highCount > 0 ? (
                              <span
                                className="border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-medium whitespace-nowrap"
                                title={`${t('dashboard.highReqs', 'High 规格')}: ${highCount.toLocaleString()} (${Math.round(highPercent)}%)`}
                              >
                                <Zap className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                                <span>High {highCount.toLocaleString()} · {Math.round(highPercent)}%</span>
                              </span>
                            ) : (
                              <span
                                className="border border-[var(--border-subtle)] bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-40 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 whitespace-nowrap"
                                title={`${t('dashboard.highReqs', 'High 规格')}: 0 (0%)`}
                              >
                                <Zap className="w-2.5 h-2.5 shrink-0 opacity-60" />
                                <span>High 0 · 0%</span>
                              </span>
                            )}
                          </div>

                          {/* Amplified Gradient Ratio Bar */}
                          <div className="w-full bg-black/5 dark:bg-white/5 h-2.5 rounded-full overflow-hidden p-0.5 flex border border-black/5 dark:border-white/5">
                            {totalSpec > 0 ? (
                              <>
                                {stdPercent > 0 && (
                                  <div
                                    className={`bg-gradient-to-r from-sky-500 to-blue-500 h-full transition-all duration-300 ${
                                      highPercent > 0 ? 'rounded-l-full' : 'rounded-full'
                                    }`}
                                    style={{ width: `${stdPercent}%` }}
                                  />
                                )}
                                {highPercent > 0 && (
                                  <div
                                    className={`bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full transition-all duration-300 ${
                                      stdPercent > 0 ? 'rounded-r-full border-l border-white/20 dark:border-black/20' : 'rounded-full'
                                    }`}
                                    style={{ width: `${highPercent}%` }}
                                  />
                                )}
                              </>
                            ) : (
                              <div className="w-full h-full bg-black/5 dark:bg-white/5 rounded-full" />
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Total Requests */}
                      <td className="py-3 px-3 text-right font-bold text-indigo-400">
                        {item.requests.toLocaleString()}
                      </td>

                      {/* Traffic Share & Progress Capsule */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <span className="text-[var(--text-primary)] font-semibold w-12 text-right shrink-0">
                            {item.percentage.toFixed(1)}%
                          </span>
                          <div className="flex-1 bg-black/5 dark:bg-white/5 h-2 rounded-full overflow-hidden p-0.5">
                            <div
                              className="h-full transition-all duration-500 rounded-full"
                              style={{
                                width: `${Math.max(item.percentage, 2)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Avg Latency & Relative Benchmark Bar */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center space-y-1">
                          <div className="flex items-center space-x-1.5">
                            <span className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-block ${latencyTier.color}`}>
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
                      <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
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
            {modelStats.list.map((item, index) => {
              const color = getModelColor(item.model, index);
              const stdCount = item.standardRequests || 0;
              const highCount = item.highRequests || 0;
              const totalSpec = stdCount + highCount;
              const stdPct = totalSpec > 0 ? (stdCount / totalSpec) * 100 : 0;
              const highPct = totalSpec > 0 ? (highCount / totalSpec) * 100 : 0;

              const latencyTier = item.avgLatency < 1000
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : item.avgLatency < 3000
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

              return (
                <div
                  key={item.model}
                  className="p-2.5 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)] space-y-2"
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
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                      <span className="font-mono font-semibold text-[var(--text-primary)] truncate text-xs" title={item.model}>
                        {item.model}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-mono font-medium shrink-0 ${latencyTier}`}>
                      ~{item.avgLatency}ms
                    </span>
                  </div>

                  {/* Spec Distribution & Requests */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                      <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                        {t('dashboard.specDistribution', '规格分布')}
                      </span>
                      <span className="text-[var(--text-primary)] font-bold text-[10px]">
                        {item.requests.toLocaleString()} reqs ({item.percentage.toFixed(0)}%)
                      </span>
                    </div>

                    {/* Dual Badges */}
                    <div className="flex items-center justify-between gap-1.5">
                      {/* Standard Pill */}
                      <span
                        className="border border-sky-500/30 bg-sky-500/10 text-sky-400 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-medium whitespace-nowrap"
                        title={`${t('dashboard.standardReqs', '标准请求')}: ${stdCount.toLocaleString()} (${Math.round(stdPct)}%)`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                        <span>Std {stdCount.toLocaleString()} · {Math.round(stdPct)}%</span>
                      </span>

                      {/* High Pill */}
                      {highCount > 0 ? (
                        <span
                          className="border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-medium whitespace-nowrap"
                          title={`${t('dashboard.highReqs', 'High 规格')}: ${highCount.toLocaleString()} (${Math.round(highPct)}%)`}
                        >
                          <Zap className="w-2.5 h-2.5 text-fuchsia-400 shrink-0" />
                          <span>High {highCount.toLocaleString()} · {Math.round(highPct)}%</span>
                        </span>
                      ) : (
                        <span
                          className="border border-[var(--border-subtle)] bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-40 font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center space-x-1 whitespace-nowrap"
                          title={`${t('dashboard.highReqs', 'High 规格')}: 0 (0%)`}
                        >
                          <Zap className="w-2.5 h-2.5 shrink-0 opacity-60" />
                          <span>High 0 · 0%</span>
                        </span>
                      )}
                    </div>

                    {/* Dual Spec Gradient Ratio Bar */}
                    <div className="w-full bg-black/5 dark:bg-white/5 h-2.5 rounded-full overflow-hidden p-0.5 flex border border-black/5 dark:border-white/5">
                      {totalSpec > 0 ? (
                        <>
                          {stdPct > 0 && (
                            <div
                              className={`bg-gradient-to-r from-sky-500 to-blue-500 h-full transition-all duration-300 ${
                                highPct > 0 ? 'rounded-l-full' : 'rounded-full'
                              }`}
                              style={{ width: `${stdPct}%` }}
                            />
                          )}
                          {highPct > 0 && (
                            <div
                              className={`bg-gradient-to-r from-fuchsia-500 to-purple-600 h-full transition-all duration-300 ${
                                stdPct > 0 ? 'rounded-r-full border-l border-white/20 dark:border-black/20' : 'rounded-full'
                              }`}
                              style={{ width: `${highPct}%` }}
                            />
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full bg-black/5 dark:bg-white/5 rounded-full" />
                      )}
                    </div>
                  </div>

                  {/* Traffic Share & Throughput */}
                  <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)]">
                    <div className="flex items-center space-x-2 flex-1 mr-3">
                      <span className="shrink-0">{t('dashboard.trafficShare', '流量占比')}</span>
                      <div className="flex-1 bg-black/5 dark:bg-white/5 h-1 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(item.percentage, 2)}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 font-medium text-[var(--text-primary)]">
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
            <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
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
                <span className="text-[11px] font-mono font-bold text-amber-400 shrink-0">
                  {topModel.percentage.toFixed(1)}%
                </span>
              )}
            </div>

            {/* Fastest Model */}
            <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
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
                <span className="text-[11px] font-mono font-bold text-emerald-400 shrink-0">
                  ~{fastestModel.avgLatency}ms
                </span>
              )}
            </div>

            {/* Total Combined Throughput */}
            <div className="flex items-center space-x-2.5 p-2 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]">
              <div className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">
                  {t('dashboard.insightsTotalThroughput', '全站总吞吐')}
                </div>
                <div className="font-mono font-semibold text-[var(--text-primary)] truncate text-xs">
                  {totalThroughput}
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-indigo-400 shrink-0">
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
