import { Hono } from 'hono';
import { WorkerEnv } from '../../env';
import { getConfig } from '../../config/configManager';
import { extractClientKey, extractTimeoutMs, buildUpstreamHeaders } from '../../utils/requestHelper';
import { getUpstreamKey, fetchUpstream } from '../services/upstreamService';
import { parseModelThinkingSuffix, applyThinkingConfigHigh } from '../../utils/modelThinkingHelper';

export const geminiRoutes = new Hono<{ Bindings: WorkerEnv }>();

geminiRoutes.all('/*', async (c) => {
  const config = await getConfig(c.env);
  const apiKey = extractClientKey(c.req.raw) || getUpstreamKey(c.env);

  if (!apiKey) {
    return c.json({
      error: { code: 401, message: 'Missing Gemini API key', status: 'UNAUTHENTICATED' },
    }, 401);
  }

  const url = new URL(c.req.url);
  let upstreamPath = c.req.path;
  const timeoutMs = extractTimeoutMs(c.req.raw, config.UPSTREAM_TIMEOUT_MS);

  let body: any = null;
  if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    try {
      body = await c.req.json();
    } catch {
      // Body is not JSON
    }
  }

  // Model thinking suffix support (e.g. -high)
  const match = upstreamPath.match(/\/models\/([^:]+)(:.*)?$/);
  if (match) {
    const rawModel = match[1];
    const action = match[2] || '';
    const thinkingInfo = parseModelThinkingSuffix(rawModel);
    if (thinkingInfo.isHigh && body) {
      body.generationConfig = applyThinkingConfigHigh(body.generationConfig || {});
      upstreamPath = upstreamPath.replace(`/models/${rawModel}${action}`, `/models/${thinkingInfo.baseModel}${action}`);
    }
  }

  const upstreamUrl = `${config.GEMINI_BASE_URL}${upstreamPath}${url.search}`;
  const upstreamHeaders = buildUpstreamHeaders(apiKey, config.ADMIN_SECRET_KEY, {
    'content-type': c.req.header('content-type') || 'application/json',
  });

  try {
    const upstreamRes = await fetchUpstream(
      upstreamUrl,
      {
        method: c.req.method,
        headers: upstreamHeaders,
        body: body ? JSON.stringify(body) : undefined,
      },
      timeoutMs,
      c.req.raw.signal
    );

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'content-type': upstreamRes.headers.get('content-type') || 'application/json',
      },
    });
  } catch (err: any) {
    return c.json({
      error: { code: 502, message: err.message || 'Upstream connection error', status: 'BAD_GATEWAY' },
    }, 502);
  }
});
