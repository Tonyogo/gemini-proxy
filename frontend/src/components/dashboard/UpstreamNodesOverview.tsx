import React, { useMemo } from 'react';
import { Server } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { calculateUpstreamNodeSummary, UpstreamNodeSummaryItem } from '../../utils/upstreamNodeHelpers';

export interface UpstreamNodesOverviewProps {
  upstreamServers?: any[];
  timeSeries?: any[];
  range?: number | 'today';
}

export const UpstreamNodesOverview: React.FC<UpstreamNodesOverviewProps> = ({
  upstreamServers,
  timeSeries,
}) => {
  const { t } = useTranslation();

  const summary = useMemo(() => {
    return calculateUpstreamNodeSummary(upstreamServers, timeSeries);
  }, [upstreamServers, timeSeries]);

  if (!summary || summary.length === 0) {
    return null;
  }

  const totalNodes = summary.length;
  const healthyNodes = summary.filter((n) => n.enabled && !n.isIsolated).length;
  const isolatedNodes = summary.filter((n) => n.isIsolated).length;

  const getLatencyColor = (latency: number) => {
    if (latency === 0) return 'text-[var(--text-muted)]';
    if (latency < 1000) return 'text-emerald-500 dark:text-emerald-400';
    if (latency < 3000) return 'text-amber-500 dark:text-amber-400';
    return 'text-rose-500 dark:text-rose-400';
  };

  return (
    <div className="ui-card p-3 sm:p-5 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <h3 className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] tracking-tight">
              {t('dashboard.upstreamNodesTitle', '上游节点概览')}
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
              {totalNodes} {t('dashboard.nodesConfigured', '个节点已配置')}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-[10px] sm:text-[11px] font-mono">
          <span className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>
              {healthyNodes} {t('dashboard.nodesHealthy', '健康')}
            </span>
          </span>
          {isolatedNodes > 0 && (
            <span className="flex items-center space-x-1.5 text-rose-500">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>
                {isolatedNodes} {t('dashboard.nodesIsolated', '熔断隔离')}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Node Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {summary.map((node: UpstreamNodeSummaryItem) => {
          const isDirect = node.type === 'direct';

          return (
            <div
              key={node.serverIndex}
              className={`p-3 rounded-xl border bg-[var(--bg-surface-sub)] transition-all space-y-2.5 ${
                node.isIsolated
                  ? 'border-rose-500/30 bg-rose-500/[0.03]'
                  : 'border-[var(--border-subtle)] hover:border-indigo-500/25'
              }`}
            >
              {/* Node Card Header */}
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center space-x-2 min-w-0">
                  {node.isIsolated ? (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                    </span>
                  ) : !node.enabled ? (
                    <span className="inline-flex rounded-full h-2 w-2 bg-slate-400 shrink-0" />
                  ) : (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                  )}

                  <div className="min-w-0">
                    <div
                      className="text-xs font-semibold text-[var(--text-primary)] truncate"
                      title={node.name}
                    >
                      {node.name}
                    </div>
                    <div
                      className="text-[10px] text-[var(--text-muted)] font-mono truncate"
                      title={node.url || node.host}
                    >
                      {node.host || node.url}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 shrink-0">
                  {isDirect ? (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                      直连
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                      代理
                    </span>
                  )}

                  {node.isIsolated && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/25 animate-pulse">
                      {t('dashboard.nodesIsolated', '熔断隔离')}
                    </span>
                  )}
                </div>
              </div>

              {/* Node Card Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
                {/* Traffic Weight & Share */}
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {t('dashboard.nodeWeightShare', '流量权重')}
                  </div>
                  <div className="font-mono font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">
                    W{node.weight} · {node.effectivePercent.toFixed(1)}%
                  </div>
                </div>

                {/* Requests & Success Rate */}
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {t('dashboard.nodeReqsAndRate', '请求 / 成功率')}
                  </div>
                  <div className="font-mono font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">
                    {node.requests.toLocaleString()}{' '}
                    <span
                      className={
                        node.successRate >= 98
                          ? 'text-emerald-500 dark:text-emerald-400'
                          : 'text-amber-500 dark:text-amber-400'
                      }
                    >
                      ({node.successRate.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Avg Latency */}
                <div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {t('dashboard.nodeLatency', '平均延迟')}
                  </div>
                  <div
                    className={`font-mono font-semibold tabular-nums mt-0.5 ${getLatencyColor(
                      node.avgLatency
                    )}`}
                  >
                    {node.avgLatency > 0 ? `${node.avgLatency} ms` : '0 ms'}
                  </div>
                </div>

                {/* Key Pool (Direct) or Success/Error (Proxy) */}
                <div>
                  {isDirect ? (
                    <>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {t('dashboard.nodeDirectKeys', 'API Key 池')}
                      </div>
                      <div className="font-mono font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums mt-0.5">
                        {node.keyCount ?? 0} Keys
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {t('dashboard.successVsErrors', '成功 / 异常')}
                      </div>
                      <div className="font-mono text-[var(--text-secondary)] tabular-nums mt-0.5">
                        {node.success.toLocaleString()} /{' '}
                        <span className={node.error > 0 ? 'text-rose-500 font-semibold' : ''}>
                          {node.error.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UpstreamNodesOverview;
