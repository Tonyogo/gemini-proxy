import React, { useEffect, useState, useMemo } from 'react';
import {
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Layers,
  Cpu,
  TrendingUp,
  Server,
  ArrowUpRight,
  ShieldCheck
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

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

  // Synchronized hover calculations
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (N === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
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

  // Success vs Error Chart calculations
  const maxStacked = Math.max(...timeSeries.map(p => p.total), 0);
  const stackedLimit = maxStacked === 0 ? 10 : Math.ceil(maxStacked * 1.15);
  const getYStacked = (v: number) => yMax - (v / stackedLimit) * plottingHeight;

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
    const points = timeSeries.map((p, i) => {
      const count = p.models?.[modelName] || 0;
      return `${getX(i)},${getYModel(count)}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Stacked column top-rounded path generator
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
            stroke="rgba(255, 255, 255, 0.04)"
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

  // Build Area and Line paths for Volume
  let volumeAreaPath = '';
  let volumeLinePath = '';
  if (N > 0) {
    const points = timeSeries.map((p, i) => `${getX(i)},${getYVolume(p.total)}`);
    volumeLinePath = `M ${points.join(' L ')}`;
    volumeAreaPath = `M ${getX(0)},${yMax} L ${points.join(' L ')} L ${getX(N - 1)},${yMax} Z`;
  }

  const getModelLatencyPath = (modelName: string) => {
    if (N === 0) return '';
    const points = timeSeries.map((p, i) => {
      const dur = p.modelDurations?.[modelName] || 0;
      return `${getX(i)},${getYLatency(dur)}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Calculations for KPI Cards
  const totalLogsCount = stats?.totalLogs || 0;
  const totalSuccessCount = stats?.successCount || 0;
  const totalErrorCount = stats?.errorCount || 0;
  const errorRatePercent = totalLogsCount > 0 ? ((totalErrorCount / totalLogsCount) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans pb-8">
      {/* Top Banner: Status & Metrics */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight flex items-center space-x-2">
              <span>{t('dashboard.title')}</span>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v1.0.0
              </span>
            </h2>
          </div>

          {/* Modern Time Range Selector */}
          <div className="flex items-center space-x-1.5 bg-[#0F1118]/90 border border-white/[0.08] p-1 rounded-xl shadow-inner">
            <span className="text-[10px] text-slate-500 uppercase font-semibold px-2 tracking-wider select-none">
              {t('dashboard.timeRange')}
            </span>
            {(['today', 6, 12, 24, 48] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                  range === r
                    ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                {r === 'today' ? t('dashboard.rangeToday') : t(`dashboard.range${r}h`)}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Modern Linear/SaaS KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Server Status */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 hover:border-indigo-500/30 transition-all group shadow-lg relative overflow-hidden">
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
              <span className="text-2xl font-mono font-bold tracking-tight text-slate-100">
                {t('dashboard.online')}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                HEALTHY
              </span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-3 flex items-center space-x-1.5">
              <span>{t('dashboard.uptime')}:</span>
              <span className="text-slate-300 font-semibold">{status ? `${Math.floor(status.uptime)}s` : 'N/A'}</span>
            </div>
          </div>

          {/* Card 2: Total Requests */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 hover:border-indigo-500/30 transition-all group shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                {t('dashboard.totalTransactions')}
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Zap className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-mono font-bold tracking-tight text-slate-100">
                {totalLogsCount.toLocaleString()}
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                {range === 'today' ? 'TODAY TOTAL' : `${range}H TOTAL`}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-3 truncate">
              {t('dashboard.sampledRequests')}
            </div>
          </div>

          {/* Card 3: Average Latency */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 hover:border-indigo-500/30 transition-all group shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                {t('dashboard.averageLatency')}
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <div className="text-2xl font-mono font-bold tracking-tight text-slate-100">
                {stats ? stats.avgDurationMs : 0}
              </div>
              <span className="text-xs font-mono text-purple-400 font-medium">ms</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-3 truncate font-mono">
              {t('dashboard.upstreamTimeoutLimit').replace('{limit}', String(cfg.upstreamTimeoutMs || 180000))}
            </div>
          </div>

          {/* Card 4: Success vs Errors */}
          <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 hover:border-indigo-500/30 transition-all group shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                {t('dashboard.successVsErrors')}
              </span>
              <div className={`w-8 h-8 rounded-lg ${totalErrorCount > 0 ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                {totalErrorCount > 0 ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-baseline space-x-2 font-mono">
                <span className="text-xl font-bold text-emerald-400">{totalSuccessCount}</span>
                <span className="text-slate-600 font-bold">/</span>
                <span className="text-xl font-bold text-rose-400">{totalErrorCount}</span>
              </div>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${totalErrorCount > 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                {errorRatePercent}% ERR
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-3 truncate">
              {t('dashboard.recentRatio')}
            </div>
          </div>
        </div>
      </div>

      {/* SVG Trend Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart 1: Volume Trend */}
        <div className="bg-[#0F1118]/90 border border-white/[0.08] hover:border-white/[0.12] rounded-xl p-5 shadow-lg relative flex flex-col h-[320px] transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span>{t('dashboard.volumeChartTitle')}</span>
            </h3>
            {hoveredIndex !== null && timeSeries[hoveredIndex] && (
              <span className="text-indigo-400 font-mono text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                {timeSeries[hoveredIndex].total} reqs
              </span>
            )}
          </div>

          {N === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-black/20 rounded-lg border border-white/[0.04]">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
              <div className="min-w-[480px] sm:min-w-full h-full relative">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-full overflow-visible"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                <defs>
                  <linearGradient id="volumeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#6366F1" stopOpacity="0.00" />
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
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="1"
                />

                {/* Area under curve */}
                {volumeAreaPath && (
                  <path d={volumeAreaPath} fill="url(#volumeAreaGrad)" />
                )}

                {/* Polyline */}
                {volumeLinePath && (
                  <path
                    d={volumeLinePath}
                    fill="none"
                    stroke="#6366F1"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
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

                {/* Active Hover Dot */}
                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                  <circle
                    cx={getX(hoveredIndex)}
                    cy={getYVolume(timeSeries[hoveredIndex].total)}
                    r="5"
                    fill="#6366F1"
                    stroke="#0F1118"
                    strokeWidth="2.5"
                    className="animate-pulse"
                  />
                )}
              </svg>

              {/* Glassmorphic Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-20 backdrop-blur-xl bg-[#151824]/95 border border-white/[0.12] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 min-w-[190px]"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '10%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-semibold text-slate-200 font-mono border-b border-white/[0.08] pb-1.5 mb-1 flex items-center justify-between">
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

        {/* Chart 2: Average Latency Trend */}
        <div className="bg-[#0F1118]/90 border border-white/[0.08] hover:border-white/[0.12] rounded-xl p-5 shadow-lg relative flex flex-col h-[320px] transition-colors group">
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <span>{t('dashboard.latencyChartTitle')}</span>
              </h3>
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <span className="text-purple-400 font-mono text-xs px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                  {timeSeries[hoveredIndex].total > 0 ? `${timeSeries[hoveredIndex].avgDurationMs} ms` : t('dashboard.noSampling')}
                </span>
              )}
            </div>

            {/* Model Legend for Latency */}
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
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-black/20 rounded-lg border border-white/[0.04]">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
              <div className="min-w-[480px] sm:min-w-full h-full relative">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-full overflow-visible"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                {/* Gridlines */}
                {renderGridLines(latencyLimit, v => `${v}ms`)}

                {/* X-axis baseline */}
                <line
                  x1={paddingLeft}
                  y1={yMax}
                  x2={svgWidth - paddingRight}
                  y2={yMax}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="1"
                />

                {/* Polylines for each active model */}
                {allModels.length > 0 ? (
                  allModels.map((model, idx) => {
                    const mPath = getModelLatencyPath(model);
                    if (!mPath) return null;
                    return (
                      <path
                        key={model}
                        d={mPath}
                        fill="none"
                        stroke={getModelColor(model, idx)}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    );
                  })
                ) : (
                  <path
                    d={`M ${timeSeries.map((p, i) => `${getX(i)},${getYLatency(p.avgDurationMs)}`).join(' L ')}`}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Node points for each active model across all time points */}
                {allModels.length > 0 ? (
                  allModels.map((model, mIdx) => {
                    const mColor = getModelColor(model, mIdx);
                    return timeSeries.map((p, i) => {
                      const dur = p.modelDurations?.[model] || 0;
                      return (
                        <circle
                          key={`latency-${model}-${i}`}
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
                    stroke="rgba(168, 85, 247, 0.6)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}
              </svg>

              {/* Glassmorphic Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-20 backdrop-blur-xl bg-[#151824]/95 border border-white/[0.12] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 min-w-[200px] max-w-[290px]"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '10%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-semibold text-slate-200 font-mono border-b border-white/[0.08] pb-1.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  {timeSeries[hoveredIndex].total === 0 ? (
                    <div className="text-center text-slate-500 italic py-1">
                      {t('dashboard.noSampling')}
                    </div>
                  ) : (
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
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chart 3: Success vs Error Distribution */}
        <div className="bg-[#0F1118]/90 border border-white/[0.08] hover:border-white/[0.12] rounded-xl p-5 shadow-lg relative flex flex-col h-[320px] transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>{t('dashboard.successErrorChartTitle')}</span>
            </h3>
            {hoveredIndex !== null && timeSeries[hoveredIndex] && (
              <span className="text-emerald-400 font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                {timeSeries[hoveredIndex].success}✓ / {timeSeries[hoveredIndex].error}✗
              </span>
            )}
          </div>

          {N === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-black/20 rounded-lg border border-white/[0.04]">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
              <div className="min-w-[480px] sm:min-w-full h-full relative">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-full overflow-visible"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                {/* Gridlines */}
                {renderGridLines(stackedLimit)}

                {/* X-axis baseline */}
                <line
                  x1={paddingLeft}
                  y1={yMax}
                  x2={svgWidth - paddingRight}
                  y2={yMax}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="1"
                />

                {/* Stacked Columns with rounded data-ends and gap separators */}
                {timeSeries.map((p, i) => {
                  const barWidth = Math.min(20, Math.max(8, (plottingWidth / N) * 0.5));
                  const x = getX(i) - barWidth / 2;

                  // Success segment (bottom)
                  const hSuccess = (p.success / stackedLimit) * plottingHeight;
                  const ySuccess = yMax - hSuccess;

                  // Error segment (top)
                  const gap = (p.success > 0 && p.error > 0) ? 2 : 0;
                  const hError = Math.max(0, (p.error / stackedLimit) * plottingHeight - gap);
                  const yError = ySuccess - gap - hError;

                  const isHovered = hoveredIndex === i;

                  return (
                    <g key={i}>
                      {/* Interactive Column Hover Guide Background */}
                      {isHovered && (
                        <rect
                          x={getX(i) - barWidth}
                          y={yMin}
                          width={barWidth * 2}
                          height={plottingHeight}
                          fill="rgba(255, 255, 255, 0.04)"
                          rx="4"
                          className="pointer-events-none"
                        />
                      )}

                      {/* Success Bar */}
                      {hSuccess > 0 && (
                        <path
                          d={p.error === 0
                            ? getRoundedTopBarPath(x, ySuccess, barWidth, hSuccess, 3)
                            : `M ${x} ${yMax} L ${x} ${ySuccess} L ${x + barWidth} ${ySuccess} L ${x + barWidth} ${yMax} Z`
                          }
                          fill="#10B981"
                          className="transition-colors duration-200"
                        />
                      )}

                      {/* Error Bar */}
                      {hError > 0 && (
                        <path
                          d={getRoundedTopBarPath(x, yError, barWidth, hError, 3)}
                          fill="#F43F5E"
                          className="transition-colors duration-200"
                        />
                      )}
                    </g>
                  );
                })}

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
              </svg>

              {/* Glassmorphic Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-20 backdrop-blur-xl bg-[#151824]/95 border border-white/[0.12] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 min-w-[190px]"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '10%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-semibold text-slate-200 font-mono border-b border-white/[0.08] pb-1.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  {timeSeries[hoveredIndex].total === 0 ? (
                    <div className="text-center text-slate-500 italic py-1">
                      {t('dashboard.noRequestsInPeriod')}
                    </div>
                  ) : (
                    <div className="space-y-1.5 font-mono">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">Success Ratio:</span>
                        <span className="font-bold text-emerald-400">
                          {((timeSeries[hoveredIndex].success / (timeSeries[hoveredIndex].total || 1)) * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">Success (✓):</span>
                        <span className="font-bold text-emerald-400">{timeSeries[hoveredIndex].success}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">Errors (✗):</span>
                        <span className="font-bold text-rose-400">{timeSeries[hoveredIndex].error}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chart 4: Model Distribution Trend */}
        <div className="bg-[#0F1118]/90 border border-white/[0.08] hover:border-white/[0.12] rounded-xl p-5 shadow-lg relative flex flex-col h-[320px] transition-colors group">
          <div className="mb-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                <span>{t('dashboard.modelChartTitle')}</span>
              </h3>
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <span className="text-cyan-400 font-mono text-xs px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  {allModels.length} models
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
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-black/20 rounded-lg border border-white/[0.04]">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1 overflow-x-auto overflow-y-hidden">
              <div className="min-w-[480px] sm:min-w-full h-full relative">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-full overflow-visible"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                {/* Gridlines */}
                {renderGridLines(modelLimit)}

                {/* X-axis baseline */}
                <line
                  x1={paddingLeft}
                  y1={yMax}
                  x2={svgWidth - paddingRight}
                  y2={yMax}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth="1"
                />

                {/* Polylines for each active model */}
                {allModels.map((model, idx) => {
                  const mPath = getModelPath(model);
                  if (!mPath) return null;
                  return (
                    <path
                      key={model}
                      d={mPath}
                      fill="none"
                      stroke={getModelColor(model, idx)}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}

                {/* Small node points for each active model */}
                {allModels.map((model, mIdx) => {
                  const mColor = getModelColor(model, mIdx);
                  return timeSeries.map((p, i) => {
                    const count = p.models?.[model] || 0;
                    return (
                      <circle
                        key={`${model}-${i}`}
                        cx={getX(i)}
                        cy={getYModel(count)}
                        r="2.5"
                        fill={mColor}
                        stroke="#0F1118"
                        strokeWidth="1"
                      />
                    );
                  });
                })}

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
                    stroke="rgba(6, 182, 212, 0.6)"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Highlighted active node dots on hover */}
                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
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
                  className="absolute z-20 backdrop-blur-xl bg-[#151824]/95 border border-white/[0.12] shadow-2xl rounded-xl p-3.5 text-xs pointer-events-none space-y-2 min-w-[200px] max-w-[290px]"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '10%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-semibold text-slate-200 font-mono border-b border-white/[0.08] pb-1.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  {allModels.length === 0 ? (
                    <div className="text-slate-500 italic text-center p-1">No active models</div>
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

    {/* Model Performance & System Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matrix 1: Model Distribution & Performance Breakdown */}
        <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>{t('dashboard.modelPerformanceTitle', '模型性能与分布矩阵')}</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
              {modelStatsSummary.list.length} {t('dashboard.modelsTracked', '个已追踪模型')}
            </span>
          </div>

          {modelStatsSummary.list.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic py-8">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="space-y-3.5 flex-1">
              {modelStatsSummary.list.map((item, idx) => {
                const color = getModelColor(item.model, idx);
                return (
                  <div key={item.model} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-slate-200 font-medium truncate max-w-[200px]" title={item.model}>
                          {item.model}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-slate-400 shrink-0">
                        <span className="text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 text-[10px]">
                          ~{item.avgLatency}ms
                        </span>
                        <span className="text-slate-200 font-semibold">{item.requests} reqs</span>
                        <span className="text-[10px] text-slate-500 w-10 text-right font-medium">
                          {item.percentage.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {/* Slim Progress Bar */}
                    <div className="w-full bg-white/[0.04] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(item.percentage, 2)}%`,
                          backgroundColor: color
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Matrix 2: System Configuration & Runtime Matrix */}
        <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-white/[0.06] pb-3">
            <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>{t('dashboard.systemRuntimeMatrix', '系统运行时参数矩阵')}</span>
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 font-mono text-xs">
            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.04] flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">LOG_LEVEL</span>
              <span className="text-slate-200 font-bold mt-1 uppercase text-indigo-400">{cfg.logLevel || 'info'}</span>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.04] flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">UPSTREAM_TIMEOUT</span>
              <span className="text-slate-200 font-bold mt-1 text-purple-400">{cfg.upstreamTimeoutMs || 180000}ms</span>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.04] flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">SYSTEM_ROLE_TO_INSTRUCTION</span>
              <span className={`text-[11px] font-bold mt-1 ${cfg.systemRoleToInstruction ? 'text-emerald-400' : 'text-slate-400'}`}>
                {cfg.systemRoleToInstruction ? 'TRUE (INJECT)' : 'FALSE (INLINE)'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.04] flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">LOG_RETENTION_DAYS</span>
              <span className="text-slate-200 font-bold mt-1 text-sky-400">{cfg.logRetentionDays ?? 3} Days</span>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.04] flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">TIME_ZONE</span>
              <span className="text-slate-200 font-bold mt-1 text-slate-300 truncate">{cfg.timeZone || 'Asia/Shanghai'}</span>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/[0.04] flex flex-col justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">COUNT_TOKENS_MODEL</span>
              <span className="text-slate-200 font-bold mt-1 text-amber-400 truncate">{cfg.countTokensModel || 'Default Model'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

