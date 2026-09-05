import React, { useEffect, useState, useMemo } from 'react';
import {
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Server,
  Activity,
  BarChart3
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import ModelPerformanceMatrix from './dashboard/ModelPerformanceMatrix';
import {
  formatUptime,
  formatThroughput,
  getBezierSplinePath,
  getBezierAreaPath,
  getStackedBarSegments
} from '../utils/chartHelpers';
import { aggregateModelStats, normalizeModelName } from '../utils/modelHelpers';

interface TimeSeriesPoint {
  time: string;
  total: number;
  success: number;
  error: number;
  avgDurationMs: number;
  models?: Record<string, number>;
  modelDurations?: Record<string, number>;
}

export default function DashboardView({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<number | 'today'>('today');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [chartViewTab, setChartViewTab] = useState<'volume' | 'latency'>('volume');
  const [focusedModel, setFocusedModel] = useState<string | null>(null);

  const loadData = (currentRange = range) => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    Promise.all([
      fetch('/api/admin/status', { headers }).then(r => r.json()).catch(() => null),
      fetch(`/api/admin/stats?range=${currentRange}`, { headers }).then(r => r.json()).catch(() => null),
    ]).then(([statusData, statsData]) => {
      setStatus(statusData);
      setStats(statsData);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData(range);
  }, [adminKey, range]);

  const cfg = status?.config || {};
  const timeSeries: TimeSeriesPoint[] = stats?.timeSeries || [];
  const N = timeSeries.length;

  // Cumulative model metrics summary with model normalization
  const modelStatsSummary = useMemo(() => {
    return aggregateModelStats(timeSeries);
  }, [timeSeries]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-72 text-slate-400 space-y-3">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        <span className="text-xs font-mono tracking-wide text-slate-400">{t('dashboard.loading')}</span>
      </div>
    );
  }

  // SVG dimensions & margins
  const svgWidth = 1000;
  const svgHeight = 170;
  const paddingLeft = 50;
  const paddingRight = 30;
  const paddingTop = 35;
  const paddingBottom = 30;
  const plottingWidth = svgWidth - paddingLeft - paddingRight;
  const plottingHeight = svgHeight - paddingTop - paddingBottom;
  const yMin = paddingTop;
  const yMax = svgHeight - paddingBottom;

  // Helper: Get X coordinate for a timeSeries index
  const getX = (index: number) => {
    if (N <= 1) return paddingLeft + plottingWidth / 2;
    return paddingLeft + (index / (N - 1)) * plottingWidth;
  };

  // Synchronized hover calculations for Mouse & Touch
  const updateHoveredIndex = (clientX: number, target: SVGSVGElement) => {
    if (N === 0) return;
    const rect = target.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const svgX = (mouseX / rect.width) * svgWidth;
    const relativeX = svgX - paddingLeft;

    if (relativeX < 0) {
      setHoveredIndex(0);
    } else if (relativeX > plottingWidth) {
      setHoveredIndex(N - 1);
    } else {
      const idx = Math.round((relativeX / plottingWidth) * (N - 1));
      setHoveredIndex(Math.max(0, Math.min(N - 1, idx)));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    updateHoveredIndex(e.clientX, e.currentTarget);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      updateHoveredIndex(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  // Determine which X-axis labels to display
  const getXLabelIndices = () => {
    if (N <= 6) return Array.from({ length: N }, (_, i) => i);
    const step = Math.max(1, Math.floor(N / 4));
    const indices: number[] = [];
    for (let i = 0; i < N; i += step) {
      indices.push(i);
    }
    if (indices[indices.length - 1] !== N - 1) {
      indices.push(N - 1);
    }
    return Array.from(new Set(indices)).sort((a, b) => a - b);
  };

  const labelIndices = getXLabelIndices();

  // Volume Chart calculations
  const maxVolume = Math.max(...timeSeries.map(p => p.total), 0);
  const volumeLimit = maxVolume === 0 ? 10 : Math.ceil(maxVolume * 1.15);
  const getYVolume = (v: number) => yMax - (v / volumeLimit) * plottingHeight;

  // Latency Chart calculations
  let maxLatency = 0;
  timeSeries.forEach(p => {
    if (p.modelDurations) {
      Object.values(p.modelDurations).forEach(dur => {
        if (dur > maxLatency) maxLatency = dur;
      });
    }
    if (p.avgDurationMs > maxLatency) maxLatency = p.avgDurationMs;
  });
  const latencyLimit = maxLatency === 0 ? 100 : Math.ceil(maxLatency * 1.15);
  const getYLatency = (v: number) => yMax - (v / latencyLimit) * plottingHeight;

  // Model Distribution Chart calculations (normalized base models)
  const allModels = Array.from(new Set(timeSeries.flatMap(p => {
    return Object.keys(p.models || {}).map(m => normalizeModelName(m).baseModel);
  })));
  const modelColors = ['#6366F1', '#38BDF8', '#10B981', '#F59E0B', '#EC4899', '#A855F7', '#14B8A6'];
  const getModelColor = (modelName: string, index: number) => {
    return modelColors[index % modelColors.length];
  };

  const getModelHourlyCount = (p: TimeSeriesPoint, baseModel: string): number => {
    if (!p.models) return 0;
    let count = 0;
    for (const [rawModel, num] of Object.entries(p.models)) {
      if (normalizeModelName(rawModel).baseModel === baseModel) {
        count += Number(num) || 0;
      }
    }
    return count;
  };

  const getModelHourlyLatency = (p: TimeSeriesPoint, baseModel: string): number => {
    if (!p.modelDurations) return 0;
    let totalDur = 0;
    let count = 0;
    for (const [rawModel, dur] of Object.entries(p.modelDurations)) {
      if (normalizeModelName(rawModel).baseModel === baseModel) {
        totalDur += Number(dur) || 0;
        count += 1;
      }
    }
    return count > 0 ? Math.round(totalDur / count) : 0;
  };

  const getModelPath = (modelName: string) => {
    if (N === 0) return '';
    const points = timeSeries.map((p, i) => ({
      x: getX(i),
      y: getYVolume(getModelHourlyCount(p, modelName))
    }));
    return getBezierSplinePath(points);
  };

  // Stacked/Bar top-rounded path generator
  const getRoundedTopBarPath = (x: number, y: number, w: number, h: number, r: number) => {
    if (h <= 0) return '';
    const radius = Math.min(r, h, w / 2);
    if (radius <= 0) {
      return `M ${x} ${y + h} L ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} Z`;
    }
    return `
      M ${x} ${y + h}
      L ${x} ${y + radius}
      A ${radius} ${radius} 0 0 1 ${x + radius} ${y}
      L ${x + w - radius} ${y}
      A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius}
      L ${x + w} ${y + h}
      Z
    `.replace(/\s+/g, ' ').trim();
  };

  // Subtle dashed horizontal grid lines
  const renderGridLines = (limit: number, formatVal?: (v: number) => string) => {
    const ticks = [0, limit / 3, (limit * 2) / 3, limit];
    return ticks.map((tick, i) => {
      const y = yMax - (tick / limit) * plottingHeight;
      const formatted = formatVal ? formatVal(Math.round(tick)) : Math.round(tick);
      return (
        <g key={i} className="opacity-70">
          <line
            x1={paddingLeft}
            y1={y}
            x2={svgWidth - paddingRight}
            y2={y}
            stroke="currentColor"
            className="text-black/[0.06] dark:text-white/[0.06]"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
          <text
            x={paddingLeft - 8}
            y={y + 3}
            textAnchor="end"
            className="text-[10px] fill-slate-500 font-mono select-none"
          >
            {formatted}
          </text>
        </g>
      );
    });
  };

  const getModelLatencyPath = (modelName: string) => {
    if (N === 0) return '';
    const points = timeSeries.map((p, i) => ({
      x: getX(i),
      y: getYLatency(getModelHourlyLatency(p, modelName))
    }));
    return getBezierSplinePath(points);
  };

  // Calculations for APM KPI Cards
  const totalLogsCount = stats?.totalLogs || 0;
  const totalSuccessCount = stats?.successCount || 0;
  const totalErrorCount = stats?.errorCount || 0;
  const availabilityRate = totalLogsCount > 0 ? ((totalSuccessCount / totalLogsCount) * 100).toFixed(2) : '100.00';
  const avgLatency = stats ? stats.avgDurationMs : 0;
  const latencyQuality = avgLatency < 1000 ? 'EXCELLENT' : avgLatency < 3000 ? 'GOOD' : 'SLOW';
  const latencyQualityColor = avgLatency < 1000
    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : avgLatency < 3000
    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-8">
      {/* Tier 1: Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight flex items-center space-x-2">
            <span>{t('dashboard.title')}</span>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              v1.0.0
            </span>
          </h2>
        </div>

        {/* Time Range Selector */}
        <div className="ui-tab-container">
          <span className="text-[10px] text-slate-500 uppercase font-semibold px-2 tracking-wider select-none">
            {t('dashboard.timeRange')}
          </span>
          {(['today', 6, 12, 24, 48] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`ui-tab-pill font-mono ${
                range === r ? 'ui-tab-pill-active' : ''
              }`}
            >
              {r === 'today' ? t('dashboard.rangeToday') : t(`dashboard.range${r}h`)}
            </button>
          ))}
        </div>
      </div>

      {/* Tier 2: 4 APM KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Server Status & Uptime */}
        <div className="ui-card p-5 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
              {t('dashboard.statusCard')}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2.5">
            <span className="relative flex h-2.5 w-2.5 self-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-2xl font-mono font-bold tracking-tight text-[var(--text-primary)]">
              {t('dashboard.online')}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              {t('dashboard.healthy', 'HEALTHY')}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-3 flex items-center space-x-1.5">
            <span>{t('dashboard.uptime')}:</span>
            <span className="text-[var(--text-primary)] font-semibold">{status ? formatUptime(status.uptime) : 'N/A'}</span>
          </div>
        </div>

        {/* Card 2: Total Requests & Throughput */}
        <div className="ui-card p-5 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
              {t('dashboard.totalTransactions')}
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-mono font-bold tracking-tight text-[var(--text-primary)]">
              {totalLogsCount.toLocaleString()}
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
              {range === 'today' ? 'TODAY TOTAL' : `${range}H TOTAL`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-3 flex items-center space-x-1.5">
            <span>{t('dashboard.avgThroughput')}:</span>
            <span className="text-indigo-400 font-semibold">{formatThroughput(totalLogsCount, range)}</span>
          </div>
        </div>

        {/* Card 3: Average Latency */}
        <div className="ui-card p-5 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
              {t('dashboard.averageLatency')}
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline space-x-1.5">
              <div className="text-2xl font-mono font-bold tracking-tight text-[var(--text-primary)]">
                {avgLatency}
              </div>
              <span className="text-xs font-mono text-purple-400 font-medium">ms</span>
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium border ${latencyQualityColor}`}>
              {latencyQuality}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 truncate font-mono">
            {t('dashboard.upstreamTimeoutLimit').replace('{limit}', String(cfg.upstreamTimeoutMs || 180000))}
          </div>
        </div>

        {/* Card 4: Service Availability */}
        <div className="ui-card p-5 hover:border-indigo-500/30 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
              {t('dashboard.serviceAvailability')}
            </span>
            <div className={`w-8 h-8 rounded-lg ${totalErrorCount > 0 ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'} flex items-center justify-center group-hover:scale-105 transition-transform`}>
              {totalErrorCount > 0 ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-2xl font-mono font-bold tracking-tight text-[var(--text-primary)]">
              {availabilityRate}%
            </div>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${totalErrorCount > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
              {totalSuccessCount}/{totalLogsCount}
            </span>
          </div>
          <div className="w-full bg-rose-500/20 h-1.5 rounded-full overflow-hidden flex mt-2.5">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${availabilityRate}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-1.5">
            <span>{t('dashboard.successCountLabel')}: {totalSuccessCount}</span>
            <span className={totalErrorCount > 0 ? 'text-rose-400' : ''}>{t('dashboard.errorCountLabel')}: {totalErrorCount}</span>
          </div>
        </div>
      </div>

      {/* Tier 2: Top Priority: Full-width Model Performance DataTable & Matrix */}
      <ModelPerformanceMatrix
        modelStats={modelStatsSummary}
        getModelColor={getModelColor}
        range={range}
      />

      {/* Tier 3: Unified Full-Width Interactive APM Chart */}
      <div className="ui-card p-5 sm:p-6 relative flex flex-col h-[380px] transition-colors group">
        {/* Unified APM Toolbar Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-3">
          {/* Left: View Switcher Tabs & Active Metric Preview */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="ui-tab-container p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setChartViewTab('volume'); setFocusedModel(null); }}
                className={`px-3 py-1 rounded-md flex items-center space-x-1.5 transition-all ${
                  chartViewTab === 'volume'
                    ? 'ui-tab-pill-active font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-[var(--text-primary)]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{t('dashboard.chartVolumeTab', '请求量')}</span>
              </button>
              <button
                type="button"
                onClick={() => setChartViewTab('latency')}
                className={`px-3 py-1 rounded-md flex items-center space-x-1.5 transition-all ${
                  chartViewTab === 'latency'
                    ? 'ui-tab-pill-active font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-[var(--text-primary)]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{t('dashboard.chartLatencyTab', '响应延迟')}</span>
              </button>
            </div>

            {/* Subtitle / Metric Preview (Static Anti-Shift) */}
            <div className="text-xs font-mono text-[var(--text-secondary)] pl-2 border-l border-[var(--border-subtle)] flex items-center space-x-2">
              {chartViewTab === 'volume' ? (
                <>
                  <span className="text-slate-500">{t('dashboard.totalReqsLabel', '区间总请求')}:</span>
                  <span className="font-bold text-indigo-400">{totalLogsCount.toLocaleString()}</span>
                </>
              ) : (
                <>
                  <span className="text-slate-500">{t('dashboard.averageLatency', '总体平均延迟')}:</span>
                  <span className="font-bold text-purple-400">{avgLatency} ms</span>
                </>
              )}
            </div>
          </div>

          {/* Right: Sub-controls & Model Legends */}
          <div className="flex flex-wrap items-center gap-2.5">
            {chartViewTab === 'latency' && focusedModel && (
              <button
                type="button"
                onClick={() => setFocusedModel(null)}
                className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition-all"
              >
                重置高亮
              </button>
            )}

            {/* Model Legend Pills with Interactive Focus */}
            {allModels.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pl-2 border-l border-[var(--border-subtle)]">
                {allModels.map((model, idx) => {
                  const mColor = getModelColor(model, idx);
                  const isFocused = focusedModel === model;
                  const isDimmed = focusedModel !== null && !isFocused;
                  return (
                    <button
                      key={model}
                      type="button"
                      onMouseEnter={() => setFocusedModel(model)}
                      onMouseLeave={() => setFocusedModel(null)}
                      onClick={() => setFocusedModel(focusedModel === model ? null : model)}
                      className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono transition-all duration-150 border ${
                        isFocused
                          ? 'bg-purple-500/20 border-purple-500/40 text-[var(--text-primary)] ring-1 ring-purple-500/50 shadow-sm'
                          : isDimmed
                          ? 'opacity-40 border-transparent text-[var(--text-secondary)] hover:opacity-75'
                          : 'bg-[var(--bg-surface-sub)]/60 border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-purple-500/30'
                      }`}
                      title={chartViewTab === 'latency' ? `${model} (点击或悬停高亮)` : model}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 transition-transform"
                        style={{
                          backgroundColor: mColor,
                          transform: isFocused ? 'scale(1.25)' : 'none'
                        }}
                      />
                      <span className="truncate max-w-[110px] sm:max-w-[150px]">{model}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Chart Visualization Area */}
        {N === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-[var(--bg-surface-sub)] rounded-lg border border-[var(--border-subtle)]">
            {t('dashboard.noData')}
          </div>
        ) : (
          <div className="relative flex-1 w-full min-w-0">
            <div className="w-full h-full relative">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible touch-none"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onTouchStart={handleTouchMove}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseLeave}
              >
                <defs>
                  <linearGradient id="volumeBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.70" />
                  </linearGradient>
                  <linearGradient id="volumeBarHoverGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818CF8" stopOpacity="1" />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity="0.85" />
                  </linearGradient>
                  <linearGradient id="volumeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.40" />
                    <stop offset="80%" stopColor="#6366F1" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="latencyAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
                    <stop offset="80%" stopColor="#a855f7" stopOpacity="0.04" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                {chartViewTab === 'volume'
                  ? renderGridLines(volumeLimit)
                  : renderGridLines(latencyLimit, v => `${v}ms`)}

                {/* X-axis baseline */}
                <line
                  x1={paddingLeft}
                  y1={yMax}
                  x2={svgWidth - paddingRight}
                  y2={yMax}
                  stroke="currentColor"
                  className="text-black/[0.08] dark:text-white/[0.08]"
                  strokeWidth="1"
                />

                {/* VIEW 1: Volume Mode - Multi-Model Stacked Bars */}
                {chartViewTab === 'volume' && (
                  timeSeries.map((p, i) => {
                    const barWidth = Math.min(22, Math.max(6, (plottingWidth / N) * 0.55));
                    const x = getX(i) - barWidth / 2;
                    const isHovered = hoveredIndex === i;
                    const segments = getStackedBarSegments(
                      p,
                      allModels,
                      getModelHourlyCount,
                      volumeLimit,
                      volumeLimit,
                      plottingHeight
                    );

                    return (
                      <g key={i}>
                        {/* Column Hover Background Guide */}
                        {isHovered && (
                          <rect
                            x={getX(i) - barWidth * 1.1}
                            y={yMin}
                            width={barWidth * 2.2}
                            height={plottingHeight}
                            fill="rgba(99, 102, 241, 0.06)"
                            rx="4"
                            className="pointer-events-none"
                          />
                        )}

                        {/* Stacked multi-model segments */}
                        {segments.length > 0 ? (
                          segments.map((seg, sIdx) => {
                            const mIdx = allModels.indexOf(seg.model);
                            const color = getModelColor(seg.model, mIdx >= 0 ? mIdx : 0);
                            const isTop = sIdx === segments.length - 1;
                            return isTop ? (
                              <path
                                key={`seg-${seg.model}-${i}`}
                                d={getRoundedTopBarPath(x, seg.y, barWidth, seg.height, 3)}
                                fill={color}
                                className="transition-all duration-150"
                                style={{ opacity: isHovered ? 1 : 0.9 }}
                              />
                            ) : (
                              <rect
                                key={`seg-${seg.model}-${i}`}
                                x={x}
                                y={seg.y}
                                width={barWidth}
                                height={seg.height}
                                fill={color}
                                className="transition-all duration-150"
                                style={{ opacity: isHovered ? 1 : 0.9 }}
                              />
                            );
                          })
                        ) : p.total > 0 ? (
                          (() => {
                            const h = (p.total / volumeLimit) * plottingHeight;
                            const y = yMax - h;
                            return (
                              <path
                                d={getRoundedTopBarPath(x, y, barWidth, h, 3)}
                                fill={isHovered ? 'url(#volumeBarHoverGrad)' : 'url(#volumeBarGrad)'}
                                className="transition-all duration-150"
                              />
                            );
                          })()
                        ) : null}
                      </g>
                    );
                  })
                )}

                {/* VIEW 2: Latency Mode */}
                {chartViewTab === 'latency' && (
                  <>
                    {/* Overall Average Latency Smooth Area & Baseline Spline */}
                    {(() => {
                      const overallLatencyPoints = timeSeries.map((p, i) => ({
                        x: getX(i),
                        y: getYLatency(p.avgDurationMs)
                      }));
                      return (
                        <g className="transition-opacity duration-200" style={{ opacity: focusedModel !== null ? 0.35 : 0.85 }}>
                          <path
                            d={getBezierAreaPath(overallLatencyPoints, yMax)}
                            fill="url(#latencyAreaGrad)"
                          />
                          <path
                            d={getBezierSplinePath(overallLatencyPoints)}
                            fill="none"
                            stroke="#a855f7"
                            strokeWidth={focusedModel === null ? 2 : 1.5}
                            strokeDasharray="4 4"
                            strokeOpacity="0.7"
                          />
                        </g>
                      );
                    })()}

                    {/* Polylines for each active model with interactive focus */}
                    {allModels.length > 0 ? (
                      allModels.map((model, idx) => {
                        const mPath = getModelLatencyPath(model);
                        if (!mPath) return null;
                        const mColor = getModelColor(model, idx);
                        const isFocused = focusedModel === model;
                        const isDimmed = focusedModel !== null && !isFocused;

                        return (
                          <g key={`latency-line-${model}`}>
                            <path
                              d={mPath}
                              fill="none"
                              stroke={mColor}
                              strokeWidth={focusedModel === model ? 3 : 1.75}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-all duration-200"
                              style={{
                                opacity: focusedModel === null ? 0.85 : isFocused ? 1 : 0.2,
                                filter: isFocused ? 'drop-shadow(0 0 6px rgba(168, 85, 247, 0.4))' : 'none'
                              }}
                            />
                            {timeSeries.map((p, i) => {
                              const dur = getModelHourlyLatency(p, model);
                              return (
                                <circle
                                  key={`dot-${model}-${i}`}
                                  cx={getX(i)}
                                  cy={getYLatency(dur)}
                                  r={isFocused ? 3.5 : 2}
                                  fill={mColor}
                                  stroke="var(--bg-surface)"
                                  strokeWidth="1"
                                  className="transition-all duration-200"
                                  style={{
                                    opacity: focusedModel === null ? 0.85 : isFocused ? 1 : 0.2
                                  }}
                                />
                              );
                            })}
                          </g>
                        );
                      })
                    ) : (
                      <path
                        d={getBezierSplinePath(timeSeries.map((p, i) => ({ x: getX(i), y: getYLatency(p.avgDurationMs) })))}
                        fill="none"
                        stroke="#a855f7"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </>
                )}

                {/* Common X-axis labels */}
                {labelIndices.map(idx => {
                  const rawTime = timeSeries[idx].time;
                  const displayLabel = rawTime.includes(' ') ? rawTime.split(' ')[1] : rawTime;
                  return (
                    <text
                      key={idx}
                      x={getX(idx)}
                      y={yMax + 16}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-500 font-mono select-none"
                    >
                      {displayLabel}
                    </text>
                  );
                })}

                {/* Common Active Hover Crosshair Line */}
                {hoveredIndex !== null && (
                  <line
                    x1={getX(hoveredIndex)}
                    y1={yMin}
                    x2={getX(hoveredIndex)}
                    y2={yMax}
                    stroke={chartViewTab === 'volume' ? 'rgba(99, 102, 241, 0.6)' : 'rgba(168, 85, 247, 0.6)'}
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Highlighted active node dots on hover */}
                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                  chartViewTab === 'volume' ? (
                    allModels.map((model, mIdx) => {
                      const count = getModelHourlyCount(timeSeries[hoveredIndex], model);
                      const mColor = getModelColor(model, mIdx);
                      return (
                        <circle
                          key={`hover-vol-${model}`}
                          cx={getX(hoveredIndex)}
                          cy={getYVolume(count)}
                          r="5"
                          fill={mColor}
                          stroke="var(--bg-surface)"
                          strokeWidth="2"
                          className="animate-pulse"
                        />
                      );
                    })
                  ) : (
                    allModels.length > 0 ? (
                      allModels.map((model, mIdx) => {
                        const dur = getModelHourlyLatency(timeSeries[hoveredIndex], model);
                        const mColor = getModelColor(model, mIdx);
                        const isFocused = focusedModel === model;
                        return (
                          <circle
                            key={`hover-lat-${model}`}
                            cx={getX(hoveredIndex)}
                            cy={getYLatency(dur)}
                            r={isFocused ? 6 : 4.5}
                            fill={mColor}
                            stroke="var(--bg-surface)"
                            strokeWidth="2"
                            className="animate-pulse"
                            style={{
                              opacity: focusedModel === null || isFocused ? 1 : 0.25
                            }}
                          />
                        );
                      })
                    ) : (
                      <circle
                        cx={getX(hoveredIndex)}
                        cy={getYLatency(timeSeries[hoveredIndex].avgDurationMs)}
                        r="5"
                        fill="#a855f7"
                        stroke="var(--bg-surface)"
                        strokeWidth="2"
                        className="animate-pulse"
                      />
                    )
                  )
                )}
              </svg>

              {/* Glassmorphic Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (() => {
                const ratio = N > 1 ? hoveredIndex / (N - 1) : 0.5;
                const isRightHalf = ratio > 0.5;
                const percentX = Math.round(((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 100);

                return (
                  <div
                    className={`absolute z-30 backdrop-blur-xl bg-[var(--bg-surface)]/95 border border-[var(--border-subtle)] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 w-[calc(100%-2rem)] max-w-[280px] sm:max-w-[300px] transition-all duration-75 ${
                      isRightHalf
                        ? 'right-2 sm:right-auto'
                        : 'left-2 sm:left-auto'
                    }`}
                    style={{
                      top: '6%',
                      ...(typeof window !== 'undefined' && window.innerWidth >= 640 ? {
                        left: `${percentX}%`,
                        right: 'auto',
                        transform: isRightHalf ? 'translateX(-105%)' : 'translateX(5%)'
                      } : {})
                    }}
                  >
                    <div className="font-semibold text-[var(--text-primary)] font-mono border-b border-[var(--border-subtle)] pb-1.5 mb-1 flex items-center justify-between">
                      <span>{timeSeries[hoveredIndex].time}</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        {chartViewTab === 'volume'
                          ? `${timeSeries[hoveredIndex].total} reqs`
                          : `${timeSeries[hoveredIndex].avgDurationMs} ms avg`}
                      </span>
                    </div>

                    {timeSeries[hoveredIndex].total === 0 ? (
                      <div className="text-center text-slate-500 italic py-1">
                        {chartViewTab === 'volume' ? t('dashboard.noRequestsInPeriod') : t('dashboard.noSampling')}
                      </div>
                    ) : chartViewTab === 'volume' ? (
                      <div className="space-y-1.5 font-mono">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-[var(--text-secondary)]">Total:</span>
                          <span className="font-bold text-indigo-400">{timeSeries[hoveredIndex].total}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-[var(--text-secondary)]">Success / Err:</span>
                          <span>
                            <span className="font-bold text-emerald-400">{timeSeries[hoveredIndex].success}</span>
                            <span className="text-slate-500 mx-1">/</span>
                            <span className={`font-bold ${timeSeries[hoveredIndex].error > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                              {timeSeries[hoveredIndex].error}
                            </span>
                          </span>
                        </div>

                        {/* Model Breakdown in Volume Mode */}
                        {allModels.length > 0 && (
                          <div className="pt-1.5 border-t border-[var(--border-subtle)] space-y-1 max-h-36 overflow-y-auto no-scrollbar">
                            {allModels.map((model, mIdx) => {
                              const count = getModelHourlyCount(timeSeries[hoveredIndex], model);
                              const mColor = getModelColor(model, mIdx);
                              const percent = timeSeries[hoveredIndex].total > 0
                                ? ((count / timeSeries[hoveredIndex].total) * 100).toFixed(0)
                                : '0';
                              return (
                                <div key={model} className="flex items-center justify-between gap-3 text-[11px]" title={model}>
                                  <div className="flex items-center space-x-1.5 min-w-0 text-[var(--text-secondary)]">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mColor }} />
                                    <span className="truncate max-w-[130px]">{model}:</span>
                                  </div>
                                  <div className="flex items-center space-x-1.5 shrink-0">
                                    <span className="font-bold" style={{ color: mColor }}>{count}</span>
                                    <span className="text-[10px] text-slate-400">({percent}%)</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Model Breakdown in Latency Mode */
                      <div className="space-y-1.5 font-mono">
                        <div className="flex justify-between items-center text-[11px] border-b border-[var(--border-subtle)] pb-1">
                          <span className="text-[var(--text-secondary)] font-medium">Overall Avg:</span>
                          <span className="font-bold text-purple-400">
                            {timeSeries[hoveredIndex].avgDurationMs} ms
                          </span>
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto no-scrollbar">
                          {allModels.map((model, mIdx) => {
                            const mDur = getModelHourlyLatency(timeSeries[hoveredIndex], model);
                            const mColor = getModelColor(model, mIdx);
                            const isFocused = focusedModel === model;
                            return (
                              <div
                                key={model}
                                className={`flex items-center justify-between gap-3 text-[11px] transition-colors ${
                                  isFocused ? 'bg-purple-500/10 px-1 py-0.5 rounded font-semibold' : ''
                                }`}
                                title={model}
                              >
                                <span className="flex items-center space-x-1.5 min-w-0 text-[var(--text-secondary)]" style={{ color: mColor }}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mColor }} />
                                  <span className="truncate max-w-[130px]">{model}:</span>
                                </span>
                                <span className="font-bold shrink-0" style={{ color: mColor }}>
                                  {mDur} ms
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
