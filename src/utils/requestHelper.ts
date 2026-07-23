import { Request } from 'express';
import config from '../../config/default';

/**
 * Extracts the Google Gemini API key from various client request headers or query parameters.
 */
export function extractClientKey(req: Request): string | null {
  if (req.headers["x-api-key"]) {
    return req.headers["x-api-key"] as string;
  }
  if (req.headers["x-goog-api-key"]) {
    return req.headers["x-goog-api-key"] as string;
  }
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    return req.headers.authorization.substring(7).trim();
  }
  if (req.query && req.query.key) {
    return req.query.key as string;
  }
  return null;
}

/**
 * Extracts per-request timeout in milliseconds from 'x-timeout-ms' header,
 * falling back to default config.upstreamTimeoutMs.
 */
export function extractTimeoutMs(req: Request): number {
  const headerValue = req.headers['x-timeout-ms'];
  if (headerValue !== undefined && headerValue !== null) {
    const parsed = parseInt(String(headerValue), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return config.upstreamTimeoutMs;
}

/**
 * Normalizes and builds the absolute upstream Gemini URL for proxying.
 */
export function getUpstreamUrl(pathAndQuery: string): string {
  const base = config.geminiBaseUrl.replace(/\/+$/, '');
  const cleanPath = pathAndQuery.replace(/^\/+/, '');
  return `${base}/${cleanPath}`;
}

/**
 * Generates a unique transaction ID for tracing request-response cycles.
 */
export function generateTransactionId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Builds standard HTTP headers for proxying requests to Gemini upstream.
 */
export function buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders
  };
}

/**
 * Masks a sensitive API key for safe logging (e.g., "AIzaSy1234567890" -> "AIzaSy***7890").
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 10) return '***';
  return `${key.substring(0, 6)}***${key.substring(key.length - 4)}`;
}

/**
 * Recursively redacts sensitive API keys and Bearer tokens from objects, strings, or headers.
 */
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
      if (['key', 'apikey', 'api_key', 'x-goog-api-key', 'x-api-key'].includes(k.toLowerCase()) && typeof v === 'string') {
        (sanitized as any)[k] = maskApiKey(v);
      } else if (k.toLowerCase() === 'authorization' && typeof v === 'string') {
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
