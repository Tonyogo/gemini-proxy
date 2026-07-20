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
