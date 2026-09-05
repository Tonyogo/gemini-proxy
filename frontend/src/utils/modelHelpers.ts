export interface NormalizedModelInfo {
  baseModel: string;
  isHigh: boolean;
}

export const STANDARD_MODELS = [
  'gemini-pro-latest',
  'gemini-flash-latest',
  'gemini-flash-lite-latest'
] as const;

export type StandardModel = (typeof STANDARD_MODELS)[number];

export interface ModelStatItem {
  model: string;
  requests: number;
  standardRequests: number;
  highRequests: number;
  percentage: number;
  avgLatency: number;
}

/**
 * Normalizes model names by stripping suffixes like '-high'.
 */
export function normalizeModelName(rawModel: string): NormalizedModelInfo {
  if (!rawModel) return { baseModel: 'unknown', isHigh: false };
  if (rawModel.endsWith('-high')) {
    return {
      baseModel: rawModel.slice(0, -5),
      isHigh: true
    };
  }
  return {
    baseModel: rawModel,
    isHigh: false
  };
}

/**
 * Aggregates model metrics across timeSeries into grouped base models with standard vs high requests.
 */
export function aggregateModelStats(timeSeries: any[]): { totalRequests: number; list: ModelStatItem[] } {
  const summary: Record<string, {
    requests: number;
    standardRequests: number;
    highRequests: number;
    totalDuration: number;
    durationCount: number;
  }> = {};

  let totalReqs = 0;

  timeSeries.forEach(p => {
    if (p.models) {
      Object.entries(p.models).forEach(([rawModel, count]) => {
        const numCount = Number(count) || 0;
        const { baseModel, isHigh } = normalizeModelName(rawModel);

        if (!summary[baseModel]) {
          summary[baseModel] = {
            requests: 0,
            standardRequests: 0,
            highRequests: 0,
            totalDuration: 0,
            durationCount: 0
          };
        }

        summary[baseModel].requests += numCount;
        if (isHigh) {
          summary[baseModel].highRequests += numCount;
        } else {
          summary[baseModel].standardRequests += numCount;
        }
        totalReqs += numCount;
      });
    }

    if (p.modelDurations) {
      Object.entries(p.modelDurations).forEach(([rawModel, dur]) => {
        const numDur = Number(dur) || 0;
        const { baseModel } = normalizeModelName(rawModel);

        if (!summary[baseModel]) {
          summary[baseModel] = {
            requests: 0,
            standardRequests: 0,
            highRequests: 0,
            totalDuration: 0,
            durationCount: 0
          };
        }

        summary[baseModel].totalDuration += numDur;
        summary[baseModel].durationCount += 1;
      });
    }
  });

  const list: ModelStatItem[] = Object.entries(summary)
    .map(([model, data]) => ({
      model,
      requests: data.requests,
      standardRequests: data.standardRequests,
      highRequests: data.highRequests,
      percentage: totalReqs > 0 ? (data.requests / totalReqs) * 100 : 0,
      avgLatency: data.durationCount > 0 ? Math.round(data.totalDuration / data.durationCount) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  return {
    totalRequests: totalReqs,
    list
  };
}
