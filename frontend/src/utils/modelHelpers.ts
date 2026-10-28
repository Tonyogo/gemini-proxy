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
  highAvgLatency: number;
}

export interface ModelFamilyConfig {
  label: string;
  badgeClass: string;
}

export function detectModelFamily(modelName: string): ModelFamilyConfig {
  const lower = (modelName || '').toLowerCase();
  if (lower.includes('gemini')) {
    return {
      label: 'Gemini',
      badgeClass: 'bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/25'
    };
  }
  if (lower.includes('claude')) {
    return {
      label: 'Claude',
      badgeClass: 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/25'
    };
  }
  if (lower.includes('gpt') || lower.includes('o1') || lower.includes('o3') || lower.includes('o4')) {
    return {
      label: 'OpenAI',
      badgeClass: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/25'
    };
  }
  if (lower.includes('deepseek')) {
    return {
      label: 'DeepSeek',
      badgeClass: 'bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border-cyan-500/25'
    };
  }
  if (lower.includes('qwen')) {
    return {
      label: 'Qwen',
      badgeClass: 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/25'
    };
  }
  if (lower.includes('llama')) {
    return {
      label: 'Llama',
      badgeClass: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/25'
    };
  }
  return {
    label: 'LLM',
    badgeClass: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/25'
  };
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
    highTotalDuration?: number;
    highDurationCount?: number;
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
            durationCount: 0,
            highTotalDuration: 0,
            highDurationCount: 0
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
        const { baseModel, isHigh } = normalizeModelName(rawModel);

        if (!summary[baseModel]) {
          summary[baseModel] = {
            requests: 0,
            standardRequests: 0,
            highRequests: 0,
            totalDuration: 0,
            durationCount: 0,
            highTotalDuration: 0,
            highDurationCount: 0
          };
        }

        summary[baseModel].totalDuration += numDur;
        summary[baseModel].durationCount += 1;
        if (isHigh) {
          summary[baseModel].highTotalDuration = (summary[baseModel].highTotalDuration || 0) + numDur;
          summary[baseModel].highDurationCount = (summary[baseModel].highDurationCount || 0) + 1;
        }
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
      highAvgLatency: (data.highDurationCount || 0) > 0 ? Math.round((data.highTotalDuration || 0) / data.highDurationCount!) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  return {
    totalRequests: totalReqs,
    list
  };
}
