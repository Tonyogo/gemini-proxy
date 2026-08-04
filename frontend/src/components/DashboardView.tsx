import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

interface TimeSeriesPoint {
  time: string;
  total: number;
  success: number;
  error: number;
  avgDurationMs: number;
  models?: Record<string, number>;
}

export default function DashboardView({ adminKey }: { adminKey: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const loadData = () => {
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    Promise.all([
      fetch('/api/admin/status', { headers }).then(r => r.json()).catch(() => null),
      fetch('/api/admin/stats', { headers }).then(r => r.json()).catch(() => null),
    ]).then(([statusData, statsData]) => {
      setStatus(statusData);
      setStats(statsData);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, [adminKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
        {t('dashboard.loading')}
      </div>
    );
  }

  const cfg = status?.config || {};
  const timeSeries: TimeSeriesPoint[] = stats?.timeSeries || [];
  const N = timeSeries.length;

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
    // Select 4-6 evenly spaced indices including 0 and N-1
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
  const maxLatency = Math.max(...timeSeries.map(p => p.avgDurationMs), 0);
  const latencyLimit = maxLatency === 0 ? 100 : Math.ceil(maxLatency * 1.15);
  const getYLatency = (v: number) => yMax - (v / latencyLimit) * plottingHeight;

  // Success vs Error Chart calculations
  const maxStacked = Math.max(...timeSeries.map(p => p.total), 0);
  const stackedLimit = maxStacked === 0 ? 10 : Math.ceil(maxStacked * 1.15);
  const getYStacked = (v: number) => yMax - (v / stackedLimit) * plottingHeight;

  // Model Distribution Chart calculations
  const allModels = Array.from(new Set(timeSeries.flatMap(p => Object.keys(p.models || {}))));
  const modelColors = ['#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6'];
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

  // Helper for rendering horizontal grid lines
  const renderGridLines = (limit: number, formatVal?: (v: number) => string) => {
    const ticks = [0, limit / 2, limit];
    return ticks.map((tick, i) => {
      const y = yMax - (tick / limit) * plottingHeight;
      const formatted = formatVal ? formatVal(Math.round(tick)) : Math.round(tick);
      return (
        <g key={i} className="opacity-40">
          <line
            x1={paddingLeft}
            y1={y}
            x2={svgWidth - paddingRight}
            y2={y}
            stroke="#1e293b"
            strokeWidth="1"
          />
          <text
            x={paddingLeft - 8}
            y={y + 3}
            textAnchor="end"
            className="text-[10px] fill-slate-400 font-mono select-none"
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

  // Build Line path for Latency
  let latencyLinePath = '';
  if (N > 0) {
    const points = timeSeries.map((p, i) => `${getX(i)},${getYLatency(p.avgDurationMs)}`);
    latencyLinePath = `M ${points.join(' L ')}`;
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans">
      {/* Top Banner: Status & Metrics */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 mb-4 tracking-tight">{t('dashboard.title')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Status Card */}
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('dashboard.statusCard')}</div>
            <div className="flex items-center space-x-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xl font-bold text-emerald-400">{t('dashboard.online')}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">{t('dashboard.uptime')}: {status ? `${Math.floor(status.uptime)}s` : 'N/A'}</div>
          </div>

          {/* Total Transactions */}
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('dashboard.totalTransactions')}</div>
            <div className="text-2xl font-extrabold text-blue-400">{stats ? stats.totalLogs : 0}</div>
            <div className="text-xs text-slate-500 mt-2">{t('dashboard.sampledRequests')}</div>
          </div>

          {/* Average Latency */}
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('dashboard.averageLatency')}</div>
            <div className="text-2xl font-extrabold text-purple-400">{stats ? `${stats.avgDurationMs}` : 0} <span className="text-sm font-normal text-slate-400">ms</span></div>
            <div className="text-xs text-slate-500 mt-2">{t('dashboard.upstreamTimeoutLimit').replace('{limit}', String(cfg.upstreamTimeoutMs || 180000))}</div>
          </div>

          {/* Success vs Errors */}
          <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 p-5 rounded-xl shadow-lg">
            <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{t('dashboard.successVsErrors')}</div>
            <div className="flex items-center space-x-3 mt-1">
              <span className="text-lg font-bold text-emerald-400">✓ {stats?.successCount || 0}</span>
              <span className="text-slate-600">/</span>
              <span className="text-lg font-bold text-rose-400">✗ {stats?.errorCount || 0}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">{t('dashboard.recentRatio')}</div>
          </div>
        </div>
      </div>

      {/* SVG Trend Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart 1: Volume Trend */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg relative flex flex-col h-[320px]">
          <h3 className="text-sm font-bold text-slate-200 mb-4 tracking-wide uppercase text-xs flex items-center justify-between">
            <span>{t('dashboard.volumeChartTitle')}</span>
            {hoveredIndex !== null && timeSeries[hoveredIndex] && (
              <span className="text-cyan-400 font-mono text-xs lowercase">
                {timeSeries[hoveredIndex].total} reqs
              </span>
            )}
          </h3>

          {N === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-slate-900/40 rounded-lg border border-slate-800/60">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  <linearGradient id="volumeAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.00" />
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
                  stroke="#334155"
                  strokeWidth="1.5"
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
                    stroke="#06b6d4"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* X-axis labels */}
                {labelIndices.map(idx => {
                  const rawTime = timeSeries[idx].time;
                  // If formatted as "YYYY-MM-DD HH:00", split and only show "HH:00" to keep labels clean
                  const displayLabel = rawTime.includes(' ') ? rawTime.split(' ')[1] : rawTime;
                  return (
                    <text
                      key={idx}
                      x={getX(idx)}
                      y={yMax + 16}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400 font-mono select-none"
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
                    stroke="#06b6d4"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    className="opacity-80"
                  />
                )}

                {/* Active Hover Dot */}
                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                  <circle
                    cx={getX(hoveredIndex)}
                    cy={getYVolume(timeSeries[hoveredIndex].total)}
                    r="5"
                    fill="#06b6d4"
                    stroke="#1e293b"
                    strokeWidth="2"
                    className="animate-pulse"
                  />
                )}
              </svg>

              {/* Synchronized Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-10 bg-slate-900/95 border border-slate-700/80 text-[11px] p-2 rounded-lg shadow-xl pointer-events-none space-y-1 backdrop-blur-sm"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '15%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-bold text-slate-300 font-mono border-b border-slate-800 pb-0.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Total:</span>
                    <span className="font-bold text-cyan-400 font-mono">{timeSeries[hoveredIndex].total}</span>
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Success:</span>
                    <span className="font-bold text-emerald-400 font-mono">{timeSeries[hoveredIndex].success}</span>
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Error:</span>
                    <span className="font-bold text-rose-400 font-mono">{timeSeries[hoveredIndex].error}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chart 2: Average Latency Trend */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg relative flex flex-col h-[320px]">
          <h3 className="text-sm font-bold text-slate-200 mb-4 tracking-wide uppercase text-xs flex items-center justify-between">
            <span>{t('dashboard.latencyChartTitle')}</span>
            {hoveredIndex !== null && timeSeries[hoveredIndex] && (
              <span className="text-purple-400 font-mono text-xs lowercase">
                {timeSeries[hoveredIndex].avgDurationMs} ms
              </span>
            )}
          </h3>

          {N === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-slate-900/40 rounded-lg border border-slate-800/60">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-full overflow-visible"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  <linearGradient id="latencyLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>

                {/* Gridlines */}
                {renderGridLines(latencyLimit, v => `${v}ms`)}

                {/* X-axis baseline */}
                <line
                  x1={paddingLeft}
                  y1={yMax}
                  x2={svgWidth - paddingRight}
                  y2={yMax}
                  stroke="#334155"
                  strokeWidth="1.5"
                />

                {/* Polyline */}
                {latencyLinePath && (
                  <path
                    d={latencyLinePath}
                    fill="none"
                    stroke="url(#latencyLineGrad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* All Node points (amber color with gap ring) */}
                {timeSeries.map((p, i) => (
                  <circle
                    key={i}
                    cx={getX(i)}
                    cy={getYLatency(p.avgDurationMs)}
                    r="3.5"
                    fill="#f59e0b"
                    stroke="#1e293b"
                    strokeWidth="1.5"
                  />
                ))}

                {/* X-axis labels */}
                {labelIndices.map(idx => {
                  const rawTime = timeSeries[idx].time;
                  // If formatted as "YYYY-MM-DD HH:00", split and only show "HH:00" to keep labels clean
                  const displayLabel = rawTime.includes(' ') ? rawTime.split(' ')[1] : rawTime;
                  return (
                    <text
                      key={idx}
                      x={getX(idx)}
                      y={yMax + 16}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400 font-mono select-none"
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
                    stroke="#a855f7"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    className="opacity-80"
                  />
                )}

                {/* Highlighted active node dot */}
                {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                  <circle
                    cx={getX(hoveredIndex)}
                    cy={getYLatency(timeSeries[hoveredIndex].avgDurationMs)}
                    r="5.5"
                    fill="#f59e0b"
                    stroke="#1e293b"
                    strokeWidth="2"
                    className="animate-pulse"
                  />
                )}
              </svg>

              {/* Synchronized Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-10 bg-slate-900/95 border border-slate-700/80 text-[11px] p-2 rounded-lg shadow-xl pointer-events-none space-y-1 backdrop-blur-sm"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '15%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-bold text-slate-300 font-mono border-b border-slate-800 pb-0.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Avg Latency:</span>
                    <span className="font-bold text-amber-400 font-mono">{timeSeries[hoveredIndex].avgDurationMs} ms</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chart 3: Success vs Error Distribution */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg relative flex flex-col h-[320px]">
          <h3 className="text-sm font-bold text-slate-200 mb-4 tracking-wide uppercase text-xs flex items-center justify-between">
            <span>{t('dashboard.successErrorChartTitle')}</span>
            {hoveredIndex !== null && timeSeries[hoveredIndex] && (
              <span className="text-emerald-400 font-mono text-xs">
                {timeSeries[hoveredIndex].success}✓ / {timeSeries[hoveredIndex].error}✗
              </span>
            )}
          </h3>

          {N === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-slate-900/40 rounded-lg border border-slate-800/60">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1">
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
                  stroke="#334155"
                  strokeWidth="1.5"
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
                            ? getRoundedTopBarPath(x, ySuccess, barWidth, hSuccess, 4)
                            : `M ${x} ${yMax} L ${x} ${ySuccess} L ${x + barWidth} ${ySuccess} L ${x + barWidth} ${yMax} Z`
                          }
                          fill="#10b981"
                          className="transition-colors duration-200"
                        />
                      )}

                      {/* Error Bar */}
                      {hError > 0 && (
                        <path
                          d={getRoundedTopBarPath(x, yError, barWidth, hError, 4)}
                          fill="#f43f5e"
                          className="transition-colors duration-200"
                        />
                      )}
                    </g>
                  );
                })}

                {/* X-axis labels */}
                {labelIndices.map(idx => {
                  const rawTime = timeSeries[idx].time;
                  // If formatted as "YYYY-MM-DD HH:00", split and only show "HH:00" to keep labels clean
                  const displayLabel = rawTime.includes(' ') ? rawTime.split(' ')[1] : rawTime;
                  return (
                    <text
                      key={idx}
                      x={getX(idx)}
                      y={yMax + 16}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-400 font-mono select-none"
                    >
                      {displayLabel}
                    </text>
                  );
                })}
              </svg>

              {/* Synchronized Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-10 bg-slate-900/95 border border-slate-700/80 text-[11px] p-2 rounded-lg shadow-xl pointer-events-none space-y-1 backdrop-blur-sm"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '15%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-bold text-slate-300 font-mono border-b border-slate-800 pb-0.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Success Ratio:</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      {((timeSeries[hoveredIndex].success / (timeSeries[hoveredIndex].total || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Success (✓):</span>
                    <span className="font-bold text-emerald-400 font-mono">{timeSeries[hoveredIndex].success}</span>
                  </div>
                  <div className="flex justify-between space-x-4">
                    <span className="text-slate-400">Errors (✗):</span>
                    <span className="font-bold text-rose-400 font-mono">{timeSeries[hoveredIndex].error}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chart 4: Model Distribution Trend */}
        <div className="bg-slate-800/80 backdrop-blur border border-slate-700/60 rounded-xl p-5 shadow-lg relative flex flex-col h-[320px]">
          <div className="mb-2">
            <h3 className="text-sm font-bold text-slate-200 mb-2 tracking-wide uppercase text-[10px] flex items-center justify-between">
              <span>{t('dashboard.modelChartTitle')}</span>
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <span className="text-cyan-400 font-mono text-xs">
                  {allModels.length} models
                </span>
              )}
            </h3>

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
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic bg-slate-900/40 rounded-lg border border-slate-800/60">
              {t('dashboard.noData')}
            </div>
          ) : (
            <div className="relative flex-1">
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
                  stroke="#334155"
                  strokeWidth="1.5"
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
                        stroke="#1e293b"
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
                      className="text-[10px] fill-slate-400 font-mono select-none"
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
                    stroke="#06b6d4"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    className="opacity-80"
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
                        stroke="#1e293b"
                        strokeWidth="2"
                        className="animate-pulse"
                      />
                    );
                  })
                )}
              </svg>

              {/* Synchronized Hover Tooltip Overlay */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <div
                  className="absolute z-10 bg-slate-900/95 border border-slate-700/80 text-[11px] p-2 rounded-lg shadow-xl pointer-events-none space-y-1 backdrop-blur-sm min-w-[140px]"
                  style={{
                    left: `${((getX(hoveredIndex) - paddingLeft) / plottingWidth) * 85 + 8}%`,
                    top: '15%',
                    transform: hoveredIndex > N / 2 ? 'translateX(-105%)' : 'translateX(5%)',
                  }}
                >
                  <div className="font-bold text-slate-300 font-mono border-b border-slate-800 pb-0.5 mb-1 text-center">
                    {timeSeries[hoveredIndex].time}
                  </div>
                  {allModels.length === 0 ? (
                    <div className="text-slate-500 italic text-center p-1">No active models</div>
                  ) : (
                    allModels.map((model, mIdx) => {
                      const count = timeSeries[hoveredIndex].models?.[model] || 0;
                      const mColor = getModelColor(model, mIdx);
                      return (
                        <div key={model} className="flex items-center justify-between space-x-4">
                          <div className="flex items-center space-x-1.5 text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: mColor }}></span>
                            <span className="font-mono truncate max-w-[100px]">{model}:</span>
                          </div>
                          <span className="font-bold font-mono" style={{ color: mColor }}>{count}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
