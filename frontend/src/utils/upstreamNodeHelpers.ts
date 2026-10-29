export interface UpstreamNodeSummaryItem {
  serverIndex: number;
  name: string;
  host: string;
  url: string;
  type: 'proxy' | 'direct';
  weight: number;
  effectivePercent: number;
  enabled: boolean;
  isIsolated: boolean;
  keyCount?: number;
  requests: number;
  success: number;
  error: number;
  successRate: number;
  avgLatency: number;
}

export function extractHost(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    return new URL(urlStr).hostname;
  } catch {
    return urlStr.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

export function calculateUpstreamNodeSummary(
  upstreamServers?: any[],
  timeSeries?: any[]
): UpstreamNodeSummaryItem[] {
  if (!Array.isArray(upstreamServers) || upstreamServers.length === 0) {
    return [];
  }

  const series = Array.isArray(timeSeries) ? timeSeries : [];

  return upstreamServers.map((server, idx) => {
    const serverIndex = typeof server.serverIndex === 'number' ? server.serverIndex : idx;
    const url = server.url || '';
    const host = extractHost(url);
    const fallbackName = host ? `Node ${serverIndex + 1} (${host})` : `Node ${serverIndex + 1}`;
    const name = server.name?.trim() ? server.name.trim() : fallbackName;
    const type = server.type === 'direct' ? 'direct' : 'proxy';
    const weight = typeof server.weight === 'number' ? server.weight : 1;
    const effectivePercent = typeof server.effectivePercent === 'number' ? server.effectivePercent : 0;
    const enabled = server.enabled !== false;
    const isIsolated = Boolean(server.isIsolated);
    const keyCount = Array.isArray(server.apiKeys) ? server.apiKeys.length : undefined;

    let requests = 0;
    let success = 0;
    let error = 0;
    let totalDuration = 0;
    let durationCount = 0;

    const nodeKey = String(serverIndex);

    series.forEach(point => {
      if (!point || !point.modelNodes || typeof point.modelNodes !== 'object') return;
      Object.values(point.modelNodes).forEach((nodeMap: any) => {
        if (!nodeMap || typeof nodeMap !== 'object') return;
        const m = nodeMap[nodeKey];
        if (m) {
          requests += Number(m.requests) || 0;
          success += Number(m.success) || 0;
          error += Number(m.error) || 0;
          totalDuration += Number(m.totalDuration) || 0;
          durationCount += Number(m.durationCount) || 0;
        }
      });
    });

    const successRate = requests > 0
      ? parseFloat(((requests - error) / requests * 100).toFixed(1))
      : 100.0;
    const avgLatency = durationCount > 0
      ? Math.round(totalDuration / durationCount)
      : 0;

    return {
      serverIndex,
      name,
      host,
      url,
      type,
      weight,
      effectivePercent,
      enabled,
      isIsolated,
      keyCount,
      requests,
      success,
      error,
      successRate,
      avgLatency,
    };
  });
}
