import React, { useMemo } from 'react';
import { Server, ShieldCheck, ShieldAlert, KeyRound, RefreshCw } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';
import { calculateUpstreamNodeSummary, UpstreamNodeSummaryItem } from '../../utils/upstreamNodeHelpers';

export interface UpstreamNodesOverviewProps {
  upstreamServers?: any[];
  timeSeries?: any[];
  range?: number | 'today';
  onEditNodes?: () => void;
  onRefresh?: () => void;
}

export const UpstreamNodesOverview: React.FC<UpstreamNodesOverviewProps> = ({
  upstreamServers,
  timeSeries,
  onEditNodes,
  onRefresh,
}) => {
  const { t } = useTranslation();

  const summary = useMemo(() => {
    return calculateUpstreamNodeSummary(upstreamServers, timeSeries);
  }, [upstreamServers, timeSeries]);

  if (!summary || summary.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Top Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Server className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
            {t('dashboard.upstreamNodesTitle', '上游集群节点列表')}
          </h3>
        </div>
        <div className="flex items-center space-x-3">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs font-semibold text-[var(--text-secondary)] hover:text-indigo-500 transition-colors cursor-pointer flex items-center space-x-1"
              title={t('dashboard.refreshHealth', '刷新节点健康状态')}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onEditNodes}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer"
          >
            {t('dashboard.editClusterNodes', '编辑集群节点')}
          </button>
        </div>
      </div>

      {/* 2-Column Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {summary.map((node: UpstreamNodeSummaryItem) => {
          const isDirect = node.type === 'direct';
          const isUnreachable = node.enabled && !node.isIsolated && (node.healthOk === false || node.healthStatus === 'unhealthy');

          return (
            <div
              key={node.serverIndex}
              className={`ui-card p-4 sm:p-5 rounded-2xl transition-all ${
                node.isIsolated || isUnreachable ? 'border-rose-500/30' : ''
              }`}
            >
              {/* Row 1: Node Title, Weight, DIRECT/PROXY Badge & Status Pill */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                    {node.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-[var(--text-secondary)] shrink-0">
                    {t('dashboard.nodeWeightLabel', '权重')}: {node.weight}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                    {isDirect ? 'DIRECT' : 'PROXY'}
                  </span>
                </div>

                {node.isIsolated ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{t('dashboard.nodesIsolated', '熔断隔离')}</span>
                  </span>
                ) : !node.enabled ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/30 shrink-0">
                    <span>{t('dashboard.nodeDisabled', '已禁用')}</span>
                  </span>
                ) : isUnreachable ? (
                  <span
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0"
                    title={node.healthError ? `${t('dashboard.nodeUnreachable', '无法连接')}: ${node.healthError}` : t('dashboard.nodeUnreachable', '无法连接')}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{t('dashboard.nodeUnreachable', '无法连接')}</span>
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0"
                    title={node.healthLatency !== undefined ? `${node.healthLatency}ms` : undefined}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{t('dashboard.nodeHealthyOnline', '健康在线')}</span>
                  </span>
                )}
              </div>

              {/* Row 2: Full URL */}
              <div
                className="mt-1.5 text-xs sm:text-sm font-mono text-[var(--text-secondary)] truncate"
                title={node.url || node.host}
              >
                {node.url || node.host}
              </div>

              {/* Divider + Bottom Row: Key Pool & Average Latency */}
              <div className="mt-3.5 pt-3 border-t border-[var(--border-subtle)] flex items-center space-x-5 text-xs text-[var(--text-secondary)]">
                <div className="flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>
                    {t('dashboard.nodeKeyPoolPolling', '密钥池: {count} 个轮询').replace(
                      '{count}',
                      String(node.keyCount ?? 1)
                    )}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5 font-mono tabular-nums">
                  <span>
                    {t('dashboard.nodeAvgLatencyItem', '平均延迟: {ms}ms').replace(
                      '{ms}',
                      String(node.avgLatency)
                    )}
                  </span>
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
