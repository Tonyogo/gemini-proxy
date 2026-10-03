import { Context } from 'hono';

export function maskApiKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 10) return '***';
  return `${key.substring(0, 6)}***${key.substring(key.length - 4)}`;
}

export function sanitizeData(data: any): any {
  if (!data) return data;
  if (typeof data === 'string') {
    return data
      .replace(/([?&]key=)[^&\s]+/gi, '$1***')
      .replace(/(bearer\s+)[A-Za-z0-9_\-\.]+/gi, '$1***');
  }
  if (typeof data === 'object') {
    const sanitized = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      const lowerKey = k.toLowerCase();
      if (['key', 'apikey', 'api_key', 'x-goog-api-key', 'x-api-key'].includes(lowerKey) && typeof v === 'string') {
        (sanitized as any)[k] = maskApiKey(v);
      } else if (lowerKey === 'authorization' && typeof v === 'string') {
        if (/^bearer\s+/i.test(v)) {
          (sanitized as any)[k] = 'Bearer***';
        } else {
          (sanitized as any)[k] = sanitizeData(v);
        }
      } else {
        (sanitized as any)[k] = sanitizeData(v);
      }
    }
    return sanitized;
  }
  return data;
}

export function generateShortId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function extractClientKey(c: Context): string | null {
  const headers = c.req.header();
  if (headers['x-api-key']) return headers['x-api-key'];
  if (headers['x-goog-api-key']) return headers['x-goog-api-key'];
  if (headers['authorization'] && headers['authorization'].startsWith('Bearer ')) {
    return headers['authorization'].substring(7).trim();
  }
  if (headers['x-admin-key']) return headers['x-admin-key'];
  const queryKey = c.req.query('key');
  if (queryKey) return queryKey;
  return null;
}

export function extractTimeoutMs(c: Context, defaultTimeoutMs: number): number {
  const headerVal = c.req.header('x-timeout-ms');
  if (headerVal !== undefined && headerVal !== null) {
    const parsed = parseInt(String(headerVal), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return defaultTimeoutMs;
}

export function extractClientSchedulingStrategy(c: Context): string | null {
  const headerVal = c.req.header('x-scheduling-strategy');
  if (typeof headerVal === 'string' && headerVal.trim()) {
    return headerVal.trim();
  }
  return null;
}

export function buildUpstreamHeaders(
  apiKey: string,
  customHeaders?: Record<string, string>,
  adminSecretKey?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders
  };

  const hasAuth = Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
  if (adminSecretKey && apiKey === adminSecretKey && !hasAuth) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
}
