import { Hono } from 'hono';
import { WorkerEnv } from '../../env';
import { getConfig } from '../../config/configManager';
import {
  claudeTranslator,
  translateClaudeToGoogle,
  translateGoogleToClaudeResponse,
} from '../services/claudeTranslator';
import { createClaudeSseTransformStream } from '../services/streamTranscoder';
import {
  getUpstreamKey,
  recordKeyFailure,
  recordKeySuccess,
  fetchUpstream,
} from '../services/upstreamService';
import {
  extractClientKey,
  extractTimeoutMs,
  generateTransactionId,
  buildUpstreamHeaders,
  sanitizeData,
} from '../../utils/requestHelper';
import { saveTransactionAuditLog } from '../../admin/services/r2LoggerService';

export const claudeRoutes = new Hono<{ Bindings: WorkerEnv }>();

claudeRoutes.get('/models', async (c) => {
  const models = [
    { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet', type: 'model', created_at: '2024-10-22' },
    { id: 'claude-3-7-sonnet-20250219', display_name: 'Claude 3.7 Sonnet', type: 'model', created_at: '2025-02-19' },
    { id: 'claude-3-5-haiku-20241022', display_name: 'Claude 3.5 Haiku', type: 'model', created_at: '2024-10-22' },
    { id: 'claude-3-opus-20240229', display_name: 'Claude 3 Opus', type: 'model', created_at: '2024-02-29' },
  ];
  return c.json({ data: models, has_more: false });
});

claudeRoutes.get('/models/:model_id', async (c) => {
  const modelId = c.req.param('model_id');
  return c.json({
    id: modelId,
    display_name: modelId,
    type: 'model',
    created_at: '2024-10-22',
  });
});

claudeRoutes.post('/messages/count_tokens', async (c) => {
  try {
    const body: any = await c.req.json();
    let textLength = 0;
    if (body.messages && Array.isArray(body.messages)) {
      for (const m of body.messages) {
        if (typeof m.content === 'string') textLength += m.content.length;
        else if (Array.isArray(m.content)) {
          for (const b of m.content) {
            if (b?.text) textLength += b.text.length;
          }
        }
      }
    }
    const estimatedTokens = Math.max(1, Math.ceil(textLength / 4));
    return c.json({ input_tokens: estimatedTokens });
  } catch (err: any) {
    return c.json({
      type: 'error',
      error: { type: 'invalid_request_error', message: err.message || 'Invalid JSON body' },
    }, 400);
  }
});

claudeRoutes.post('/messages', async (c) => {
  const startTime = Date.now();
  const transactionId = generateTransactionId();
  let body: any;

  try {
    body = await c.req.json();
  } catch (err: any) {
    return c.json({
      type: 'error',
      error: { type: 'invalid_request_error', message: 'Failed to parse JSON body' },
    }, 400);
  }

  if (!body || !body.model || !body.messages || !Array.isArray(body.messages)) {
    return c.json({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: "Missing required parameters: 'model' and 'messages' are required.",
      },
    }, 400);
  }

  const apiKey = extractClientKey(c.req.raw) || getUpstreamKey(c.env);
  if (!apiKey) {
    return c.json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'No API key provided. Supply via x-api-key header or configure GEMINI_API_KEYS.',
      },
    }, 401);
  }

  const config = await getConfig(c.env);
  const timeoutMs = extractTimeoutMs(c.req.raw, config.UPSTREAM_TIMEOUT_MS);

  let translation: any;
  try {
    translation = translateClaudeToGoogle(body, false, config.CUSTOM_SYSTEM_INSTRUCTION, config);
  } catch (err: any) {
    return c.json({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: err.message || 'Failed to translate Claude request',
      },
    }, err.status || 400);
  }

  const action = translation.isStream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const upstreamUrl = `${config.GEMINI_BASE_URL}/v1beta/models/${translation.cleanModelName}:${action}`;
  const upstreamHeaders = buildUpstreamHeaders(apiKey, config.ADMIN_SECRET_KEY);

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchUpstream(
      upstreamUrl,
      {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(translation.googleRequest),
      },
      timeoutMs,
      c.req.raw.signal
    );
  } catch (err: any) {
    recordKeyFailure(apiKey, 502);
    const normalized = claudeTranslator.normalizeError(err);
    saveTransactionAuditLog(c.env, c.executionCtx, {
      transactionId,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      client_req: { method: 'POST', url: c.req.url, body: sanitizeData(body) },
      gem_req: { url: upstreamUrl, body: sanitizeData(translation.googleRequest) },
      error: err.message,
    });
    return c.json(normalized.payload, normalized.status as any);
  }

  if (!upstreamRes.ok) {
    recordKeyFailure(apiKey, upstreamRes.status);
    let errorBody: any;
    try {
      errorBody = await upstreamRes.json();
    } catch {
      errorBody = { message: await upstreamRes.text() };
    }

    const normalized = claudeTranslator.normalizeError({
      status: upstreamRes.status,
      message: errorBody?.error?.message || errorBody.message || 'Upstream error',
    });

    saveTransactionAuditLog(c.env, c.executionCtx, {
      transactionId,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      client_req: { method: 'POST', url: c.req.url, body: sanitizeData(body) },
      gem_req: { url: upstreamUrl, body: sanitizeData(translation.googleRequest) },
      error: errorBody,
    });

    return c.json(normalized.payload, normalized.status as any);
  }

  recordKeySuccess(apiKey);

  if (translation.isStream) {
    const transformStream = createClaudeSseTransformStream(body.model, (streamResult) => {
      saveTransactionAuditLog(c.env, c.executionCtx, {
        transactionId,
        timestamp: startTime,
        durationMs: Date.now() - startTime,
        client_req: { method: 'POST', url: c.req.url, body: sanitizeData(body) },
        gem_req: { url: upstreamUrl, body: sanitizeData(translation.googleRequest) },
        claude_res: { events: streamResult.events },
      });
    });

    const transformedBody = upstreamRes.body?.pipeThrough(transformStream);
    return new Response(transformedBody, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
    });
  }

  // Non-streaming response
  try {
    const geminiJson = await upstreamRes.json();
    const claudeResponse = translateGoogleToClaudeResponse(geminiJson, body.model, body.tools);

    saveTransactionAuditLog(c.env, c.executionCtx, {
      transactionId,
      timestamp: startTime,
      durationMs: Date.now() - startTime,
      client_req: { method: 'POST', url: c.req.url, body: sanitizeData(body) },
      gem_req: { url: upstreamUrl, body: sanitizeData(translation.googleRequest) },
      claude_res: claudeResponse,
    });

    return c.json(claudeResponse);
  } catch (err: any) {
    const normalized = claudeTranslator.normalizeError(err);
    return c.json(normalized.payload, normalized.status as any);
  }
});
