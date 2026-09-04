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
import SystemRuntimeMatrix from './dashboard/SystemRuntimeMatrix';
import {
  formatUptime,
  formatThroughput,
  getBezierSplinePath,
  getBezierAreaPath
} from '../utils/chartHelpers';

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
  const [analyticsTab, setAnalyticsTab] = useState<'latency' | 'distribution'>('latency');
  const [volumeChartType, setVolumeChartType] = useState<'bar' | 'area'>('area');

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

  // Cumulative model metrics summary
  const modelStatsSummary = useMemo(() => {
    const summary: Record<string, { requests: number; totalDuration: number; durationCount: number }> = {};
    let totalReqs = 0;

    timeSeries.forEach(p => {
      if (p.models) {
        Object.entries(p.models).forEach(([model, count]) => {
          if (!summary[model]) {
            summary[model] = { requests: 0, totalDuration: 0, durationCount: 0 };
          }
          summary[model].requests += count;
          totalReqs += count;
        });
      }
      if (p.modelDurations) {
        Object.entries(p.modelDurations).forEach(([model, dur]) => {
          if (!summary[model]) {
            summary[model] = { requests: 0, totalDuration: 0, durationCount: 0 };
          }
          summary[model].totalDuration += dur;
          summary[model].durationCount += 1;
        });
      }
    });

    return {
      totalRequests: totalReqs,
      list: Object.entries(summary)
        .map(([model, data]) => ({
          model,
          requests: data.requests,
          percentage: totalReqs > 0 ? (data.requests / totalReqs) * 100 : 0,
          avgLatency: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount) : 0,
        }))
        .sort((a, b) => b.requests - a.requests)
    };
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
  const svgWidth = 600;
  const svgHeight = 220;
  const paddingLeft = 50;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 35;
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

  // Model Distribution Chart calculations
  const allModels = Array.from(new Set(timeSeries.flatMap(p => Object.keys(p.models || {}))));
  const modelColors = ['#6366F1', '#38BDF8', '#10B981', '#F59E0B', '#EC4899', '#A855F7', '#14B8A6'];
  const getModelColor = (modelName: string, index: number) => {
    return modelColors[index % modelColors.length];
  };

  let maxModelCount = 0;
  timeSeries.forEach(p => {
    if (p.models) {
      Object.values(p.models).forEach(count => {
        if (count > maxModelCount) {
          maxModelCount = count;
        }
      });
    }
  });
  const modelLimit = maxModelCount === 0 ? 10 : Math.ceil(maxModelCount * 1.15);
  const getYModel = (v: number) => yMax - (v / modelLimit) * plottingHeight;

  const getModelPath = (modelName: string) => {
    if (N === 0) return '';
    const points = timeSeries.map((p, i) => ({
      x: getX(i),
      y: getYModel(p.models?.[modelName] || 0)
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
    const ticks = [0, limit / 2, limit];
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
      y: getYLatency(p.modelDurations?.[modelName] || 0)
    }));
    return getBezierSplinePath(points);
  };

  const getOverallLatencyPath = () => {
    if (N === 0) return '';
    const points = timeSeries.map((p, i) => ({
      x: getX(i),
      y: getYLatency(p.avgDurationMs)
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

      {/* Tier 3: Golden First-Screen Section (6:4 Split Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Core Charts View (60% split) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {/* Chart 1: Request Volume Trend */}
          <div className="ui-card p-5 relative flex flex-col h-[320px] transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-[var(--text-primary)] tracking-wider uppercase flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span>{t('dashboard.volumeChartTitle')}</span>
              </h3>
              <div className="flex items-center space-x-2">
                {/* Chart Type Switcher: Area vs Bar */}
                <div className="ui-tab-container p-0.5 text-[10px] font-medium">
                  <button
                    type="button"
                    onClick={() => setVolumeChartType('area')}
                    className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
                      volumeChartType === 'area' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    <span>{t('dashboard.areaChart', '面积图')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVolumeChartType('bar')}
                    className={`px-2 py-0.5 rounded flex items-center space-x-1 ${
                      volumeChartType === 'bar' ? 'ui-tab-pill-active font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                    <span>{t('dashboard.barChart', '柱状图')}</span>
                  </button>
                </div>

                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                  <span className="text-indigo-400 font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    {timeSeries[hoveredIndex].total} reqs
                  </span>
                )}
              </div>
            </div>

            {N === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-[var(--bg-surface-sub)] rounded-lg border border-[var(--border-subtle)]">
                {t('dashboard.noData')}
              </div>
            ) : (
              <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
                <div className="min-w-[480px] sm:min-w-full h-full relative">
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
                        <stop offset="0%" stopColor="#6366F1" stopOpacity="0.45" />
                        <stop offset="80%" stopColor="#6366F1" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Gridlines */}
                    {renderGridLines(volumeLimit)}

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

                    {/* Chart Visualization: Wave Area or Bar */}
                    {volumeChartType === 'area' ? (
                      (() => {
                        const volumePoints = timeSeries.map((p, i) => ({
                          x: getX(i),
                          y: getYVolume(p.total)
                        }));
                        return (
                          <g>
                            {/* Smooth Bezier Area */}
                            <path
                              d={getBezierAreaPath(volumePoints, yMax)}
                              fill="url(#volumeAreaGrad)"
                              className="transition-all duration-300"
                            />
                            {/* Smooth Bezier Stroke Line */}
                            <path
                              d={getBezierSplinePath(volumePoints)}
                              fill="none"
                              stroke="#6366F1"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-all duration-300"
                            />
                            {/* Data Points */}
                            {volumePoints.map((pt, i) => (
                              <circle
                                key={i}
                                cx={pt.x}
                                cy={pt.y}
                                r={hoveredIndex === i ? 4.5 : 2.5}
                                fill={hoveredIndex === i ? "#818CF8" : "#6366F1"}
                                stroke="var(--bg-surface)"
                                strokeWidth="1.5"
                                className="transition-all duration-150"
                              />
                            ))}
                          </g>
                        );
                      })()
                    ) : (
                      /* Bar columns */
                      timeSeries.map((p, i) => {
                        const barWidth = Math.min(18, Math.max(6, (plottingWidth / N) * 0.45));
                        const x = getX(i) - barWidth / 2;
                        const h = (p.total / volumeLimit) * plottingHeight;
                        const y = yMax - h;
                        const isHovered = hoveredIndex === i;

                        return (
                          <g key={i}>
                            {/* Column Hover Background Guide */}
                            {isHovered && (
                              <rect
                                x={getX(i) - barWidth * 1.2}
                                y={yMin}
                                width={barWidth * 2.4}
                                height={plottingHeight}
                                fill="rgba(255, 255, 255, 0.04)"
                                rx="4"
                                className="pointer-events-none"
                              />
                            )}

                            {/* Top-rounded Bar */}
                            {h > 0 && (
                              <path
                                d={getRoundedTopBarPath(x, y, barWidth, h, 3)}
                                fill={isHovered ? "url(#volumeBarHoverGrad)" : "url(#volumeBarGrad)"}
                                className="transition-all duration-150"
                              />
                            )}
                          </g>
                        );
                      })
                    )}

                    {/* X-axis labels */}
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

                    {/* Active Hover Crosshair Line */}
                    {hoveredIndex !== null && (
                      <line
                        x1={getX(hoveredIndex)}
                        y1={yMin}
                        x2={getX(hoveredIndex)}
                        y2={yMax}
                        stroke="rgba(99, 102, 241, 0.6)"
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    )}
                  </svg>

                  {/* Glassmorphic Hover Tooltip Overlay */}
                  {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                    <div
                      className="absolute z-20 backdrop-blur-xl bg-[var(--bg-surface)]/95 border border-[var(--border-subtle)] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 min-w-[190px]"
                      style={{
                        left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                        top: '10%',
                        transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                      }}
                    >
                      <div className="font-semibold text-[var(--text-primary)] font-mono border-b border-[var(--border-subtle)] pb-1.5 mb-1 flex items-center justify-between">
                        <span>{timeSeries[hoveredIndex].time}</span>
                        <span className="text-[10px] text-slate-400">{timeSeries[hoveredIndex].total} reqs</span>
                      </div>
                      {timeSeries[hoveredIndex].total === 0 ? (
                        <div className="text-center text-slate-500 italic py-1">
                          {t('dashboard.noRequestsInPeriod')}
                        </div>
                      ) : (
                        <div className="space-y-1.5 font-mono">
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-400">Total:</span>
                            <span className="font-bold text-indigo-400">{timeSeries[hoveredIndex].total}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-400">Success:</span>
                            <span className="font-bold text-emerald-400">{timeSeries[hoveredIndex].success}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-slate-400">Error:</span>
                            <span className="font-bold text-rose-400">{timeSeries[hoveredIndex].error}</span>
                          </div>
                          {/* Mini Ratio Bar */}
                          <div className="w-full bg-rose-500/20 h-1.5 rounded-full overflow-hidden flex mt-2">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{
                                width: `${(timeSeries[hoveredIndex].success / (timeSeries[hoveredIndex].total || 1)) * 100}%`
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Chart 2: Tab-Switchable Model Analytics (Latency vs Distribution) */}
          <div className="ui-card p-5 relative flex flex-col h-[320px] transition-colors group">
            <div className="mb-2">
              <div className="flex items-center justify-between mb-2">
                {/* Tab Switcher Buttons */}
                <div className="ui-tab-container p-0.5">
                  <button
                    type="button"
                    onClick={() => setAnalyticsTab('latency')}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      analyticsTab === 'latency'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    <span>{t('dashboard.latencyTab', '响应延迟 (ms)')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalyticsTab('distribution')}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      analyticsTab === 'distribution'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                    <span>{t('dashboard.distributionTab', '请求分布')}</span>
                  </button>
                </div>

                {/* Active Hover Metric Badge */}
                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                  <span className={`font-mono text-xs px-2 py-0.5 rounded border ${
                    analyticsTab === 'latency'
                      ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                      : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                  }`}>
                    {analyticsTab === 'latency'
                      ? (timeSeries[hoveredIndex].total > 0 ? `${timeSeries[hoveredIndex].avgDurationMs} ms` : t('dashboard.noSampling'))
                      : `${allModels.length} models`
                    }
                  </span>
                )}
              </div>

              {/* Model Legend */}
              {allModels.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  {allModels.map((model, idx) => (
                    <div key={model} className="flex items-center space-x-1 font-mono">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getModelColor(model, idx) }}></span>
                      <span className="truncate max-w-[120px]" title={model}>{model}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {N === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-[var(--bg-surface-sub)] rounded-lg border border-[var(--border-subtle)]">
                {t('dashboard.noData')}
              </div>
            ) : (
              <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
                <div className="min-w-[480px] sm:min-w-full h-full relative">
                    <svg
                      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                      className="w-full h-full overflow-visible touch-none"
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={handleTouchMove}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleMouseLeave}
                    >
                    {/* Gridlines */}
                    {analyticsTab === 'latency'
                      ? renderGridLines(latencyLimit, v => `${v}ms`)
                      : renderGridLines(modelLimit)
                    }

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

                    {/* Polylines for each active model */}
                    {analyticsTab === 'latency' ? (
                      allModels.length > 0 ? (
                        allModels.map((model, idx) => {
                          const mPath = getModelLatencyPath(model);
                          if (!mPath) return null;
                          const mColor = getModelColor(model, idx);
                          return (
                            <path
                              key={`line-${model}`}
                              d={mPath}
                              fill="none"
                              stroke={mColor}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="transition-all duration-300"
                            />
                          );
                        })
                      ) : (
                        <path
                          d={getOverallLatencyPath()}
                          fill="none"
                          stroke="#a855f7"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )
                    ) : (
                      allModels.map((model, idx) => {
                        const mPath = getModelPath(model);
                        if (!mPath) return null;
                        const mColor = getModelColor(model, idx);
                        return (
                          <path
                            key={`area-${model}`}
                            d={mPath}
                            fill="none"
                            stroke={mColor}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-all duration-300"
                          />
                        );
                      })
                    )}

                    {/* Data Node Dots */}
                    {analyticsTab === 'latency' ? (
                       allModels.length > 0 ? (
                        allModels.map((model, mIdx) => {
                          const mColor = getModelColor(model, mIdx);
                          return timeSeries.map((p, i) => {
                            const dur = p.modelDurations?.[model] || 0;
                            return (
                              <circle
                                key={`dot-${model}-${i}`}
                                cx={getX(i)}
                                cy={getYLatency(dur)}
                                r="2.5"
                                fill={mColor}
                                stroke="#0F1118"
                                strokeWidth="1"
                              />
                            );
                          });
                        })
                      ) : (
                        timeSeries.map((p, i) => (
                          <circle
                            key={`latency-overall-${i}`}
                            cx={getX(i)}
                            cy={getYLatency(p.avgDurationMs)}
                            r="2.5"
                            fill="#a855f7"
                            stroke="#0F1118"
                            strokeWidth="1"
                          />
                        ))
                      )
                    ) : (
                      allModels.map((model, mIdx) => {
                        const mColor = getModelColor(model, mIdx);
                        return timeSeries.map((p, i) => {
                          const count = p.models?.[model] || 0;
                          return (
                            <circle
                              key={`dist-${model}-${i}`}
                              cx={getX(i)}
                              cy={getYModel(count)}
                              r="2.5"
                              fill={mColor}
                              stroke="#0F1118"
                              strokeWidth="1"
                            />
                          );
                        });
                      })
                    )}

                    {/* X-axis labels */}
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

                    {/* Active Hover Crosshair Line */}
                    {hoveredIndex !== null && (
                      <line
                        x1={getX(hoveredIndex)}
                        y1={yMin}
                        x2={getX(hoveredIndex)}
                        y2={yMax}
                        stroke={analyticsTab === 'latency' ? 'rgba(168, 85, 247, 0.6)' : 'rgba(6, 182, 212, 0.6)'}
                        strokeWidth="1"
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Highlighted active node dots on hover for Distribution Tab */}
                    {analyticsTab === 'distribution' && hoveredIndex !== null && timeSeries[hoveredIndex] && (
                      allModels.map((model, mIdx) => {
                        const count = timeSeries[hoveredIndex].models?.[model] || 0;
                        const mColor = getModelColor(model, mIdx);
                        return (
                          <circle
                            key={`hover-${model}`}
                            cx={getX(hoveredIndex)}
                            cy={getYModel(count)}
                            r="5.5"
                            fill={mColor}
                            stroke="#0F1118"
                            strokeWidth="2"
                            className="animate-pulse"
                          />
                        );
                      })
                    )}
                  </svg>

                  {/* Glassmorphic Hover Tooltip Overlay */}
                  {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                    <div
                      className="absolute z-20 backdrop-blur-xl bg-[var(--bg-surface)]/95 border border-[var(--border-subtle)] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 min-w-[200px] max-w-[290px]"
                      style={{
                        left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                        top: '10%',
                        transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                      }}
                    >
                      <div className="font-semibold text-[var(--text-primary)] font-mono border-b border-[var(--border-subtle)] pb-1.5 mb-1 text-center">
                        {timeSeries[hoveredIndex].time}
                      </div>
                      {timeSeries[hoveredIndex].total === 0 ? (
                        <div className="text-center text-slate-500 italic py-1">
                          {analyticsTab === 'latency' ? t('dashboard.noSampling') : t('dashboard.noRequestsInPeriod')}
                        </div>
                      ) : analyticsTab === 'latency' ? (
                        <div className="space-y-1.5 font-mono">
                          <div className="flex justify-between items-center text-[11px] border-b border-white/[0.06] pb-1">
                            <span className="text-slate-400 font-medium">Overall Avg:</span>
                            <span className="font-bold text-purple-400">
                              {timeSeries[hoveredIndex].avgDurationMs} ms
                            </span>
                          </div>
                          {allModels.map((model, mIdx) => {
                            const mDur = timeSeries[hoveredIndex].modelDurations?.[model] || 0;
                            const mColor = getModelColor(model, mIdx);
                            return (
                              <div key={model} className="flex items-center justify-between gap-3 text-[11px]" title={model}>
                                <span className="flex items-center space-x-1.5 min-w-0 text-slate-300" style={{ color: mColor }}>
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mColor }}></span>
                                  <span className="truncate max-w-[130px]">{model}:</span>
                                </span>
                                <span className="font-bold shrink-0" style={{ color: mColor }}>
                                  {mDur} ms
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-1.5 font-mono">
                          {allModels.map((model, mIdx) => {
                            const count = timeSeries[hoveredIndex].models?.[model] || 0;
                            const mColor = getModelColor(model, mIdx);
                            return (
                              <div key={model} className="flex items-center justify-between gap-3 text-[11px]" title={model}>
                                <div className="flex items-center space-x-1.5 min-w-0 text-slate-300">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mColor }}></span>
                                  <span className="truncate max-w-[130px]">{model}:</span>
                                </div>
                                <span className="font-bold shrink-0" style={{ color: mColor }}>{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Golden Matrix View (40% split) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          {/* Elevated Top Right: Model Performance Matrix */}
          <ModelPerformanceMatrix
            modelStats={modelStatsSummary}
            getModelColor={getModelColor}
          />

          {/* System Runtime Configuration Matrix */}
          <SystemRuntimeMatrix config={cfg} />
        </div>
      </div>
    </div>
  );
}
