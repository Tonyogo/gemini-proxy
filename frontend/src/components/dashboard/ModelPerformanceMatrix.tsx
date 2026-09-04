import React from 'react';
import { Layers } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface ModelStatItem {
  model: string;
  requests: number;
  percentage: number;
  avgLatency: number;
}

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
    <div className="ui-card p-5 flex flex-col w-full overflow-hidden">
      {/* Header */}
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

      {/* Content: Full-width Table */}
      {!modelStats?.list || count === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[140px] text-slate-500 text-xs font-mono">
          {t('dashboard.noData')}
        </div>
      ) : (
        <div className="overflow-x-auto w-full no-scrollbar">
          <table className="w-full text-left text-xs font-mono border-collapse min-w-[650px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] uppercase tracking-wider">
                <th className="py-2.5 px-3 font-medium">{t('dashboard.modelName', '模型名称')}</th>
                <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.totalTransactions', '请求总量')}</th>
                <th className="py-2.5 px-4 font-medium min-w-[200px]">{t('dashboard.trafficShare', '流量占比')}</th>
                <th className="py-2.5 px-3 font-medium text-center">{t('dashboard.averageLatency', '平均延迟')}</th>
                <th className="py-2.5 px-3 font-medium text-right">{t('dashboard.throughputRate', 'Throughput / 平均吞吐')}</th>
                <th className="py-2.5 px-3 font-medium text-center">{t('dashboard.modelHealth', '健康状态')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]/50">
              {modelStats.list.map((item, index) => {
                const color = getModelColor(item.model, index);
                const latencyColor = item.avgLatency < 1000
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : item.avgLatency < 3000
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

                return (
                  <tr key={item.model} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                    {/* 1. Model Name */}
                    <td className="py-3 px-3 font-medium text-[var(--text-primary)]">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
                        <span className="truncate max-w-[220px]" title={item.model}>
                          {item.model}
                        </span>
                      </div>
                    </td>

                    {/* 2. Total Requests */}
                    <td className="py-3 px-3 text-right font-bold text-indigo-400">
                      {item.requests.toLocaleString()}
                    </td>

                    {/* 3. Traffic Share & Wide Progress Bar */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-[var(--text-primary)] font-semibold w-12 text-right shrink-0">
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

                    {/* 4. Avg Latency Badge */}
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-medium inline-block ${latencyColor}`}>
                        ~{item.avgLatency}ms
                      </span>
                    </td>

                    {/* 5. Throughput Rate */}
                    <td className="py-3 px-3 text-right text-[var(--text-secondary)]">
                      {getThroughput(item.requests)}
                    </td>

                    {/* 6. Health Indicator */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold inline-flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>ACTIVE</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ModelPerformanceMatrix;
