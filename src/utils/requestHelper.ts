/**
 * Extracts the Google Gemini API key from various client request headers or query parameters.
 */
export function extractClientKey(req: Request): string | null {
  const headers = req.headers;
  const xApiKey = headers.get('x-api-key');
  if (xApiKey) return xApiKey;

  const xGoogApiKey = headers.get('x-goog-api-key');
  if (xGoogApiKey) return xGoogApiKey;

  const auth = headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.substring(7).trim();
  }

  const xAdminKey = headers.get('x-admin-key');
  if (xAdminKey) return xAdminKey;

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key');
    if (key) return key;
  } catch {
    // URL parsing failed
  }

  return null;
}

/**
 * Extracts per-request timeout in milliseconds from 'x-timeout-ms' header.
 */
export function extractTimeoutMs(req: Request, defaultTimeoutMs: number = 180000): number {
  const headerValue = req.headers.get('x-timeout-ms');
  if (headerValue !== null && headerValue !== undefined) {
    const parsed = parseInt(String(headerValue), 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return defaultTimeoutMs;
}

/**
 * Extracts per-request scheduling strategy from 'x-scheduling-strategy' header.
 */
export function extractClientSchedulingStrategy(req: Request): string | null {
  const headerValue = req.headers.get('x-scheduling-strategy');
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }
  return null;
}

/**
 * Generates a unique transaction ID for tracing request-response cycles.
 */
export function generateTransactionId(): string {
  return Math.random().toString(36).substring(2, 11);
}

/**
 * Builds standard HTTP headers for proxying requests to Gemini upstream.
 */
export function buildUpstreamHeaders(
  apiKey: string,
  adminSecretKey?: string,
  customHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders,
  };

  const hasAuth = Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
  if (adminSecretKey && apiKey === adminSecretKey && !hasAuth) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return headers;
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
      if (['key', 'apikey', 'api_key', 'x-goog-api-key', 'x-api-key', 'x-admin-key'].includes(k.toLowerCase()) && typeof v === 'string') {
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
