export interface ModelUsageDetail {
  usage?: number;
  requests?: number;
  success?: number;
  error?: number;
}

export interface AccountUsage {
  total?: number;
  totalRequests?: number;
  totalSuccess?: number;
  totalError?: number;
  byModel?: Record<string, ModelUsageDetail>;
  models?: Record<string, { requests?: number }>;
}

export interface AccountDetail {
  index: number;
  name: string | null;
  status: string;
  isDisabled: boolean;
  isInvalid: boolean;
  isDuplicate: boolean;
  isExpired: boolean;
  isRotation: boolean;
  hasContext: boolean;
  canonicalIndex: number | null;
  concurrentStatus?: 'INACTIVE' | 'ACTIVATING' | 'ACTIVATED' | 'RETIRED' | string;
  inFlight?: number;
  isSuspended?: boolean;
  usage?: AccountUsage;
}

export interface ModelStatItem {
  model: string;
  requests: number;
  success: number;
  error: number;
  successRate: number;
  sharePercent: number;
}

export interface ServerModelStats {
  totalRequests: number;
  totalSuccess: number;
  totalError: number;
  successRate: number;
  models: ModelStatItem[];
}

export function calculateServerModelStats(accounts: AccountDetail[]): ServerModelStats {
  let totalRequests = 0;
  let totalSuccess = 0;
  let totalError = 0;

  const modelMap = new Map<string, { requests: number; success: number; error: number }>();

  for (const acc of accounts) {
    const usage = acc.usage;
    if (!usage) continue;

    const accReqs = typeof usage.totalRequests === 'number'
      ? usage.totalRequests
      : (typeof usage.total === 'number' ? usage.total : 0);
    const accSucc = usage.totalSuccess ?? (usage as any).total ?? accReqs;
    const accErr = usage.totalError ?? 0;

    totalRequests += accReqs;
    totalSuccess += accSucc;
    totalError += accErr;

    if (usage.byModel) {
      for (const [rawModel, item] of Object.entries(usage.byModel)) {
        const cleanModel = rawModel.replace(/^models\//, '').trim();
        const reqCount = item.requests ?? item.usage ?? 0;
        const succCount = item.success ?? reqCount;
        const errCount = item.error ?? 0;

        const current = modelMap.get(cleanModel) || { requests: 0, success: 0, error: 0 };
        current.requests += reqCount;
        current.success += succCount;
        current.error += errCount;
        modelMap.set(cleanModel, current);
      }
    }
  }

  const overallSuccessRate = totalRequests > 0
    ? parseFloat(((totalSuccess / totalRequests) * 100).toFixed(1))
    : 100.0;

  const models: ModelStatItem[] = Array.from(modelMap.entries()).map(([model, data]) => {
    const rate = data.requests > 0
      ? parseFloat(((data.success / data.requests) * 100).toFixed(1))
      : 100.0;
    const share = totalRequests > 0
      ? parseFloat(((data.requests / totalRequests) * 100).toFixed(1))
      : 0.0;

    return {
      model,
      requests: data.requests,
      success: data.success,
      error: data.error,
      successRate: rate,
      sharePercent: share
    };
  }).sort((a, b) => b.requests - a.requests);

  return {
    totalRequests,
    totalSuccess,
    totalError,
    successRate: overallSuccessRate,
    models
  };
}

export function getAccountTopModels(usage?: AccountUsage, limit: number = 2): Array<{ model: string; count: number }> {
  if (!usage?.byModel) return [];

  const list: Array<{ model: string; count: number }> = [];
  for (const [rawModel, item] of Object.entries(usage.byModel)) {
    const cleanModel = rawModel.replace(/^models\//, '').trim();
    const count = item.requests ?? item.usage ?? 0;
    if (count > 0) {
      list.push({ model: cleanModel, count });
    }
  }

  return list.sort((a, b) => b.count - a.count).slice(0, limit);
}
