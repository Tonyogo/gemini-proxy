import { WorkerEnv } from '../../env';
import { sanitizeData } from '../../utils/requestHelper';

export interface TransactionRecord {
  transactionId: string;
  timestamp: number;
  durationMs: number;
  clientIp?: string;
  client_req?: any;
  gem_req?: any;
  claude_res?: any;
  gem_res?: any;
  error?: any;
}

export function formatLogKey(
  timestamp: number,
  transactionId: string,
  timeZone: string = 'Asia/Shanghai'
): string {
  try {
    const d = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    return `logs/${year}-${month}-${day}/${hour}/${minute}${second}_${transactionId}.json`;
  } catch {
    const iso = new Date(timestamp).toISOString();
    return `logs/${iso.slice(0, 10)}/${iso.slice(11, 13)}/${iso.slice(14, 16)}${iso.slice(17, 19)}_${transactionId}.json`;
  }
}

export function saveTransactionAuditLog(
  env: WorkerEnv,
  ctx: ExecutionContext | undefined,
  record: TransactionRecord
): void {
  if (!env.LOGS_BUCKET) {
    return;
  }

  const timeZone = env.TIME_ZONE || 'Asia/Shanghai';
  const key = formatLogKey(record.timestamp || Date.now(), record.transactionId, timeZone);
  const sanitizedRecord = sanitizeData(record);
  const jsonContent = JSON.stringify(sanitizedRecord, null, 2);

  const putPromise = env.LOGS_BUCKET.put(key, jsonContent, {
    httpMetadata: {
      contentType: 'application/json',
    },
  });

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(putPromise);
  }
}

export async function listAuditLogs(
  env: WorkerEnv,
  date?: string,
  hour?: string,
  limit: number = 100,
  cursor?: string
): Promise<string[]> {
  if (!env.LOGS_BUCKET) {
    return [];
  }

  let prefix = 'logs/';
  if (date) {
    prefix += `${date}/`;
    if (hour) {
      prefix += `${hour}/`;
    }
  }

  try {
    const listResult = await env.LOGS_BUCKET.list({
      prefix,
      limit,
      cursor,
    });
    return listResult.objects.map(obj => obj.key);
  } catch (err) {
    console.error('Failed to list audit logs from R2:', err);
    return [];
  }
}

export async function getAuditLog(env: WorkerEnv, key: string): Promise<any | null> {
  if (!env.LOGS_BUCKET) {
    return null;
  }

  try {
    const obj = await env.LOGS_BUCKET.get(key);
    if (!obj) return null;
    return await obj.json();
  } catch (err) {
    console.error(`Failed to get audit log ${key} from R2:`, err);
    return null;
  }
}

export async function deleteAuditLog(env: WorkerEnv, key: string): Promise<boolean> {
  if (!env.LOGS_BUCKET) {
    return false;
  }

  try {
    await env.LOGS_BUCKET.delete(key);
    return true;
  } catch (err) {
    console.error(`Failed to delete audit log ${key} from R2:`, err);
    return false;
  }
}
