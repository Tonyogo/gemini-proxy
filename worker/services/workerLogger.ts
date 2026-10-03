import { WorkerEnv } from '../env';
import { sanitizeData } from '../utils/requestHelper';

export interface LogIndexRecord {
  id: string;
  timestamp: string;
  date: string;
  hour: string;
  filename: string;
  path: string;
  status: number;
  duration: number | null;
  reqPath: string | null;
  model: string | null;
  isStream: boolean;
  account?: string | null;
  reqSize?: number;
}

export interface LogItem {
  date: string;
  hour: string;
  filename: string;
  path: string;
  reqPath?: string | null;
  timestamp?: string | null;
  status?: number | null;
  isStream?: boolean;
  duration?: number | null;
  model?: string | null;
  account?: string | null;
  reqSize?: number;
}

export interface LogTreeStructure {
  [date: string]: {
    [hour: string]: number;
  };
}

function getTargetParts(timeZone: string = 'Asia/Shanghai') {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });
    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    if (hour === '24') hour = '00';
    const minStr = getPart('minute').padStart(2, '0');
    const secStr = getPart('second').padStart(2, '0');

    return {
      dateStr: `${year}-${month}-${day}`,
      hourStr: hour,
      minStr,
      secStr
    };
  } catch {
    const iso = new Date().toISOString();
    return {
      dateStr: iso.substring(0, 10),
      hourStr: iso.substring(11, 13),
      minStr: iso.substring(14, 16),
      secStr: iso.substring(17, 19)
    };
  }
}

export class WorkerLogger {
  public static async saveTransactionToR2(
    env: WorkerEnv,
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number,
    reqPath?: string,
    status?: number,
    isStream?: boolean,
    account?: string | null
  ): Promise<void> {
    if (!env.LOGS_BUCKET) {
      return;
    }

    try {
      const { dateStr, hourStr, minStr, secStr } = getTargetParts(env.TIME_ZONE);
      const filename = `${minStr}${secStr}_${transactionId}.json`;
      const objectKey = `logs/${dateStr}/${hourStr}/${filename}`;

      const resolvedStatus = status !== undefined
        ? status
        : (claudeRes && (claudeRes.error || claudeRes.type === 'error') ? 500 : 200);

      const resolvedIsStream = isStream !== undefined
        ? isStream
        : Boolean(clientReq && clientReq.stream);

      const payload = {
        timestamp: new Date().toISOString(),
        duration: duration !== undefined ? duration : null,
        path: reqPath || null,
        status: resolvedStatus,
        is_stream: resolvedIsStream,
        account: account || null,
        client_req: sanitizeData(clientReq) || null,
        gem_req: sanitizeData(gemReq) || null,
        gem_res: sanitizeData(gemRes) || null,
        claude_res: sanitizeData(claudeRes) || null
      };

      const rawModelName = (claudeRes && claudeRes.model) || (clientReq && clientReq.model) || (reqPath ? (reqPath.match(/models\/([^:/?]+)/)?.[1] || null) : null) || null;
      const cleanModelName = rawModelName ? rawModelName.replace(/^models\//, '') : null;

      let reqSize = 0;
      const reqObj = (clientReq && (typeof clientReq !== 'object' || Object.keys(clientReq).length > 0)) ? clientReq : (gemReq || clientReq);
      if (reqObj) {
        try {
          const raw = typeof reqObj === 'string' ? reqObj : JSON.stringify(reqObj);
          reqSize = new TextEncoder().encode(raw).length;
        } catch {
          reqSize = 0;
        }
      }

      // Save main transaction payload
      await env.LOGS_BUCKET.put(objectKey, JSON.stringify(payload, null, 2), {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: {
          transactionId,
          status: String(resolvedStatus),
          duration: String(duration || 0),
          isStream: String(resolvedIsStream),
          model: cleanModelName || '',
          account: account || '',
          reqSize: String(reqSize)
        }
      });
    } catch (err) {
      console.warn('[WorkerLogger] Failed to write transaction to R2:', err);
    }
  }

  public static async listLogs(
    env: WorkerEnv,
    page = 1,
    limit = 50,
    filterDate?: string,
    filterHour?: string
  ): Promise<{ tree: LogTreeStructure; hourCount: number; total: number; page: number; limit: number; logs: LogItem[] }> {
    const tree: LogTreeStructure = {};
    if (!env.LOGS_BUCKET) {
      return { tree, hourCount: 0, total: 0, page, limit, logs: [] };
    }

    try {
      // 1. List directory structure under logs/
      const listOptions: R2ListOptions = {
        prefix: 'logs/',
        delimiter: '/'
      };
      const rootList = await env.LOGS_BUCKET.list(listOptions);
      const delimitedPrefixes = rootList.delimitedPrefixes || [];

      // Extract available dates
      const dates: string[] = [];
      for (const prefix of delimitedPrefixes) {
        const parts = prefix.split('/').filter(Boolean);
        if (parts.length >= 2) {
          dates.push(parts[1]);
        }
      }
      const sortedDates = dates.sort().reverse();

      // Collect tree
      for (const d of sortedDates) {
        tree[d] = {};
        const hoursList = await env.LOGS_BUCKET.list({
          prefix: `logs/${d}/`,
          delimiter: '/'
        });
        for (const hPrefix of hoursList.delimitedPrefixes || []) {
          const hParts = hPrefix.split('/').filter(Boolean);
          if (hParts.length >= 3 && /^\d{2}$/.test(hParts[2])) {
            tree[d][hParts[2]] = 0;
          }
        }
      }

      let targetDate = filterDate;
      let targetHour = filterHour;

      if (!targetDate || !targetHour || targetHour === 'all') {
        if (sortedDates.length > 0) {
          targetDate = sortedDates[0];
          const availableHours = Object.keys(tree[targetDate] || {}).sort().reverse();
          targetHour = availableHours[0] || '00';
        }
      }

      if (!targetDate || !targetHour) {
        return { tree, hourCount: 0, total: 0, page, limit, logs: [] };
      }

      // Fetch items for target date/hour
      const targetPrefix = targetHour === 'all'
        ? `logs/${targetDate}/`
        : `logs/${targetDate}/${targetHour}/`;

      const filesList = await env.LOGS_BUCKET.list({
        prefix: targetPrefix,
        limit: 1000
      });

      const jsonObjects = filesList.objects.filter(o => o.key.endsWith('.json'));
      const sortedObjects = jsonObjects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());

      const total = sortedObjects.length;
      const startIndex = (page - 1) * limit;
      const paginated = sortedObjects.slice(startIndex, startIndex + limit);

      const logs: LogItem[] = paginated.map(obj => {
        const parts = obj.key.split('/');
        const date = parts[1] || '';
        const hour = parts[2] || '';
        const filename = parts[3] || '';
        const meta = obj.customMetadata || {};

        return {
          date,
          hour,
          filename,
          path: `${date}/${hour}/${filename}`,
          timestamp: obj.uploaded.toISOString(),
          status: meta.status ? parseInt(meta.status, 10) : 200,
          isStream: meta.isStream === 'true',
          duration: meta.duration ? parseFloat(meta.duration) : null,
          model: meta.model || null,
          account: meta.account || null,
          reqSize: meta.reqSize ? parseInt(meta.reqSize, 10) : undefined
        };
      });

      return {
        tree,
        hourCount: total,
        total,
        page,
        limit,
        logs
      };
    } catch (err) {
      console.warn('[WorkerLogger] Failed to list logs from R2:', err);
      return { tree, hourCount: 0, total: 0, page, limit, logs: [] };
    }
  }

  public static async getLogDetail(env: WorkerEnv, date: string, hour: string, filename: string): Promise<any> {
    if (!env.LOGS_BUCKET) {
      throw new Error('LOGS_BUCKET is not bound in worker environment');
    }
    const key = `logs/${date}/${hour}/${filename}`;
    const obj = await env.LOGS_BUCKET.get(key);
    if (!obj) {
      throw new Error('Log not found');
    }
    return await obj.json();
  }

  public static async getStats(env: WorkerEnv, range: number | 'today' = 'today'): Promise<any> {
    // Provide aggregated metrics overview from R2 metadata
    const summary = {
      totalRequests: 0,
      totalSuccess: 0,
      totalError: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      byModel: {} as Record<string, { requests: number; success: number; error: number }>,
      byHour: {} as Record<string, number>
    };

    if (!env.LOGS_BUCKET) {
      return summary;
    }

    try {
      const { dateStr } = getTargetParts(env.TIME_ZONE);
      const objects = await env.LOGS_BUCKET.list({
        prefix: `logs/${dateStr}/`,
        limit: 1000
      });

      for (const obj of objects.objects) {
        if (!obj.key.endsWith('.json')) continue;
        const meta = obj.customMetadata || {};
        const status = meta.status ? parseInt(meta.status, 10) : 200;
        const duration = meta.duration ? parseFloat(meta.duration) : 0;
        const model = meta.model || 'unknown';

        summary.totalRequests++;
        if (status >= 200 && status < 400) {
          summary.totalSuccess++;
        } else {
          summary.totalError++;
        }
        summary.totalDurationMs += duration;

        if (!summary.byModel[model]) {
          summary.byModel[model] = { requests: 0, success: 0, error: 0 };
        }
        summary.byModel[model].requests++;
        if (status >= 200 && status < 400) {
          summary.byModel[model].success++;
        } else {
          summary.byModel[model].error++;
        }
      }

      if (summary.totalRequests > 0) {
        summary.avgDurationMs = Math.round(summary.totalDurationMs / summary.totalRequests);
      }

      return summary;
    } catch {
      return summary;
    }
  }
}
