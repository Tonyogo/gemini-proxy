import React from 'react';
import { Layers, Zap } from 'lucide-react';
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

  return (
    <div className="ui-card p-4 sm:p-5 flex flex-col w-full overflow-hidden">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-4">
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
        <div className="flex-1 flex items-center justify-center min-h-[140px] text-slate-500 text-xs font-mono">
          {t('dashboard.noData')}
        </div>
      ) : (
        <>
          {/* 1. Desktop Multi-column DataTable (Hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto w-full no-scrollbar rounded-xl">
            <table className="w-full text-left text-xs font-mono border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-black/[0.06] dark:border-white/[0.06] text-[var(--text-secondary)] text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-medium">{t('dashboard.modelName', '模型名称')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.standardReqs', '标准请求')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.highReqs', 'High 规格')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.totalTransactions', '总请求量')}</th>
                  <th className="py-2.5 px-4 font-medium min-w-[180px]">{t('dashboard.trafficShare', '流量占比')}</th>
                  <th className="py-2.5 px-3 font-medium text-center">{t('dashboard.averageLatency', '平均延迟')}</th>
                  <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.throughputRate', 'Throughput / 平均吞吐')}</th>
                </tr>
              </thead>
              <tbody>
                {modelStats.list.map((item, index) => {
                  const color = getModelColor(item.model, index);
                  const latencyColor = item.avgLatency < 1000
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : item.avgLatency < 3000
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

                  return (
                    <tr key={item.model} className="border-b border-black/[0.04] dark:border-white/[0.04] last:border-b-0 hover:bg-[var(--bg-surface-hover)] transition-colors">
                      {/* Model Name */}
                      <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                          <span className="truncate max-w-[220px]" title={item.model}>
                            {item.model}
                          </span>
                        </div>
                      </td>

                      {/* Standard Requests */}
                      <td className="py-3 px-3 text-right text-[var(--text-primary)] font-medium">
                        {item.standardRequests ? item.standardRequests.toLocaleString() : '-'}
                      </td>

                      {/* High Spec Requests */}
                      <td className="py-3 px-3 text-right font-medium">
                        {item.highRequests > 0 ? (
                          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-semibold">
                            <Zap className="w-2.5 h-2.5" />
                            <span>{item.highRequests.toLocaleString()}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* Total Requests */}
                      <td className="py-3 px-3 text-right font-bold text-indigo-400">
                        {item.requests.toLocaleString()}
                      </td>

                      {/* Traffic Share & Progress Bar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-[var(--text-primary)] font-semibold w-11 text-right shrink-0">
                            {item.percentage.toFixed(1)}%
                          </span>
                          <div className="flex-1 bg-[var(--border-subtle)]/40 h-2 rounded-full overflow-hidden">
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

                      {/* Avg Latency */}
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-block ${latencyColor}`}>
                          ~{item.avgLatency}ms
                        </span>
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

          {/* 2. Mobile Classic Compact Card List (Hidden on desktop) */}
          <div className="md:hidden space-y-3">
            {modelStats.list.map((item, index) => {
              const color = getModelColor(item.model, index);
              return (
                <div key={item.model} className="space-y-1.5 p-2.5 rounded-lg bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]/60">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-mono font-semibold text-[var(--text-primary)] truncate max-w-[130px]" title={item.model}>
                        {item.model}
                      </span>
                      <span className="text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0">
                        ~{item.avgLatency}ms
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0 font-mono text-[11px] text-[var(--text-secondary)]">
                      <span>
                        {item.standardRequests}
                        {item.highRequests > 0 && (
                          <span className="text-purple-400 font-semibold ml-1">+{item.highRequests}H</span>
                        )}
                      </span>
                      <span className="text-[var(--text-primary)] font-bold w-10 text-right">
                        {item.percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-[var(--border-subtle)]/40 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 rounded-full"
                      style={{
                        width: `${Math.max(item.percentage, 2)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ModelPerformanceMatrix;
