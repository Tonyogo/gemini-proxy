import { Hono } from 'hono';
import { WorkerEnv } from '../env';
import { getWorkerConfig } from '../config/workerConfig';
import { WorkerLogger } from '../services/workerLogger';
import { WorkerUpstreamManager } from '../services/workerUpstream';
import { createGeminiToClaudeTransformStream } from '../services/workerStream';
import {
  extractClientKey,
  extractTimeoutMs,
  extractClientSchedulingStrategy,
  buildUpstreamHeaders,
  generateShortId
} from '../utils/requestHelper';
import claudeTranslator from '../../src/proxy/services/claudeTranslator';
import { parseModelThinkingSuffix, applyThinkingConfigHigh } from '../../src/utils/modelThinkingHelper';
import config from '../../config/default';

const claudeRouter = new Hono<{ Bindings: WorkerEnv }>();

/**
 * Sync active worker configuration to claudeTranslator's shared config context
 */
function syncConfigToTranslator(workerConfig: any) {
  try {
    Object.assign(config, {
      modelMappings: workerConfig.modelMappings,
      systemRoleToInstruction: workerConfig.systemRoleToInstruction,
      stripSystemFingerprints: workerConfig.stripSystemFingerprints,
      runtimeContextTag: workerConfig.runtimeContextTag,
      customSystemInstruction: workerConfig.customSystemInstruction,
      ignoredTools: workerConfig.ignoredTools,
      ephemeralUserMessages: workerConfig.ephemeralUserMessages,
      ephemeralSystemMessages: workerConfig.ephemeralSystemMessages,
      countTokensModel: workerConfig.countTokensModel,
      upstreamTimeoutMs: workerConfig.upstreamTimeoutMs,
      timeZone: workerConfig.timeZone,
      upstreamServers: workerConfig.upstreamServers
    });
  } catch {}
}

/**
 * POST /v1/messages
 */
claudeRouter.post('/messages', async (c) => {
  const transactionId = generateShortId();
  const startTime = Date.now();
  const requestPath = c.req.path;
  const workerConfig = await getWorkerConfig(c.env);
  syncConfigToTranslator(workerConfig);

  let clientReq: any = null;
  try {
    clientReq = await c.req.json();
  } catch {
    clientReq = null;
  }

  let gemReq: any = null;

  try {
    const apiKey = extractClientKey(c);
    const timeoutMs = extractTimeoutMs(c, workerConfig.upstreamTimeoutMs);

    if (!apiKey) {
      const errPayload = {
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
        }
      };
      const duration = Date.now() - startTime;
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, null, null, errPayload, duration, requestPath, 401, false)
      );
      return c.json(errPayload, 401);
    }

    const { googleRequest, cleanModelName, strategy, isStream } = claudeTranslator.translateClaudeToGoogle(clientReq);
    gemReq = googleRequest;

    const clientModel = clientReq?.model || '';
    const clientStrategy = extractClientSchedulingStrategy(c);
    const effectiveStrategy = strategy || clientStrategy;

    const customUpstreamHeaders: Record<string, string> = {};
    if (effectiveStrategy) {
      customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
    }

    if (isStream) {
      const targetPath = `/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`;
      const serverSelection = WorkerUpstreamManager.selectUpstream(targetPath, workerConfig, { model: cleanModelName });
      let { targetUrl, serverIndex, serverType, selectedApiKey } = serverSelection;

      if (serverType === 'direct') {
        const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
        if (thinkingInfo.isHigh) {
          targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
          gemReq.generationConfig = gemReq.generationConfig || {};
          applyThinkingConfigHigh(gemReq.generationConfig);
        }
      }

      const effectiveApiKey = (serverType === 'direct' && selectedApiKey) ? selectedApiKey : apiKey;
      const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders, workerConfig.adminSecretKey);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let upstreamRes: Response;
      try {
        upstreamRes = await fetch(targetUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: JSON.stringify(gemReq),
          signal: controller.signal
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        WorkerUpstreamManager.recordResult(serverIndex, false, fetchErr.message);
        throw fetchErr;
      }
      clearTimeout(timeoutId);

      if (!upstreamRes.ok) {
        WorkerUpstreamManager.recordResult(serverIndex, false, `HTTP ${upstreamRes.status}`);
        const errText = await upstreamRes.text();
        let errJson: any;
        try {
          errJson = JSON.parse(errText);
        } catch {
          errJson = { error: { message: errText } };
        }
        const normalized = claudeTranslator.normalizeError(errJson);
        const duration = Date.now() - startTime;
        c.executionCtx.waitUntil(
          WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, errJson, normalized.payload, duration, requestPath, normalized.status, true)
        );
        return c.json(normalized.payload, normalized.status as any);
      }

      WorkerUpstreamManager.recordResult(serverIndex, true);

      if (!upstreamRes.body) {
        return c.text('No upstream response stream', 500);
      }

      // Web Stream transform
      const transformStream = createGeminiToClaudeTransformStream(cleanModelName, clientReq.tools);
      const transformedStream = upstreamRes.body.pipeThrough(transformStream);

      const duration = Date.now() - startTime;
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, null, { streamed: true }, duration, requestPath, 200, true)
      );

      return new Response(transformedStream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive'
        }
      });
    }

    // Non-streaming handler
    const targetPath = `/v1beta/models/${cleanModelName}:generateContent`;
    const serverSelection = WorkerUpstreamManager.selectUpstream(targetPath, workerConfig, { model: cleanModelName });
    let { targetUrl, serverIndex, serverType, selectedApiKey } = serverSelection;

    if (serverType === 'direct') {
      const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
        gemReq.generationConfig = gemReq.generationConfig || {};
        applyThinkingConfigHigh(gemReq.generationConfig);
      }
    }

    const effectiveApiKey = (serverType === 'direct' && selectedApiKey) ? selectedApiKey : apiKey;
    const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders, workerConfig.adminSecretKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(gemReq),
        signal: controller.signal
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      WorkerUpstreamManager.recordResult(serverIndex, false, fetchErr.message);
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    if (!upstreamRes.ok) {
      WorkerUpstreamManager.recordResult(serverIndex, false, `HTTP ${upstreamRes.status}`);
      const errText = await upstreamRes.text();
      let errJson: any;
      try {
        errJson = JSON.parse(errText);
      } catch {
        errJson = { error: { message: errText } };
      }
      const normalized = claudeTranslator.normalizeError(errJson);
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, errJson, normalized.payload, duration, requestPath, normalized.status, false)
      );
      return c.json(normalized.payload, normalized.status as any);
    }

    WorkerUpstreamManager.recordResult(serverIndex, true);
    const geminiData = await upstreamRes.json();
    const claudeResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName, clientReq.tools);

    c.executionCtx.waitUntil(
      WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, geminiData, claudeResponse, duration, requestPath, 200, false)
    );

    return c.json(claudeResponse);
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const normalized = claudeTranslator.normalizeError(err);
    c.executionCtx.waitUntil(
      WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, false)
    );
    return c.json(normalized.payload, normalized.status as any);
  }
});

/**
 * POST /v1/messages/count_tokens
 */
claudeRouter.post('/messages/count_tokens', async (c) => {
  const transactionId = generateShortId();
  const startTime = Date.now();
  const requestPath = c.req.path;
  const workerConfig = await getWorkerConfig(c.env);
  syncConfigToTranslator(workerConfig);

  let clientReq: any = null;
  try {
    clientReq = await c.req.json();
  } catch {
    clientReq = null;
  }

  let gemReq: any = null;

  try {
    const apiKey = extractClientKey(c);
    if (!apiKey) {
      const errPayload = {
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Access denied. A valid Google Gemini API key was not provided.'
        }
      };
      return c.json(errPayload, 401);
    }

    const requestedModel = (clientReq?.model || workerConfig.countTokensModel || '').trim();
    let { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);

    if (workerConfig.countTokensModel && workerConfig.countTokensModel.trim()) {
      cleanModelName = claudeTranslator.getCleanModelName(workerConfig.countTokensModel.trim());
    }

    if (googleRequest.generationConfig) {
      delete googleRequest.generationConfig.maxOutputTokens;
      if (Object.keys(googleRequest.generationConfig).length === 0) {
        delete googleRequest.generationConfig;
      }
    }

    const countTokensPayload = {
      generateContentRequest: {
        model: `models/${cleanModelName}`,
        ...googleRequest
      }
    };
    gemReq = countTokensPayload;

    const targetPath = `/v1beta/models/${cleanModelName}:countTokens`;
    const serverSelection = WorkerUpstreamManager.selectUpstream(targetPath, workerConfig, { model: cleanModelName });
    let { targetUrl, serverIndex, serverType, selectedApiKey } = serverSelection;

    if (serverType === 'direct') {
      const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
        countTokensPayload.generateContentRequest.model = `models/${thinkingInfo.baseModel}`;
      }
    }

    const effectiveApiKey = (serverType === 'direct' && selectedApiKey) ? selectedApiKey : apiKey;
    const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, {}, workerConfig.adminSecretKey);

    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(countTokensPayload)
    });

    const duration = Date.now() - startTime;
    if (!upstreamRes.ok) {
      WorkerUpstreamManager.recordResult(serverIndex, false, `HTTP ${upstreamRes.status}`);
      const errText = await upstreamRes.text();
      let errJson: any;
      try {
        errJson = JSON.parse(errText);
      } catch {
        errJson = { error: { message: errText } };
      }
      const normalized = claudeTranslator.normalizeError(errJson);
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, errJson, normalized.payload, duration, requestPath, normalized.status, false)
      );
      return c.json(normalized.payload, normalized.status as any);
    }

    WorkerUpstreamManager.recordResult(serverIndex, true);
    const geminiData: any = await upstreamRes.json();
    const tokenResponse = {
      input_tokens: geminiData.totalTokens || 0
    };

    c.executionCtx.waitUntil(
      WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, geminiData, tokenResponse, duration, requestPath, 200, false)
    );

    return c.json(tokenResponse);
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const normalized = claudeTranslator.normalizeError(err);
    c.executionCtx.waitUntil(
      WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, false)
    );
    return c.json(normalized.payload, normalized.status as any);
  }
});

/**
 * GET /v1/models
 */
claudeRouter.get('/models', async (c) => {
  const transactionId = generateShortId();
  const startTime = Date.now();
  const workerConfig = await getWorkerConfig(c.env);
  syncConfigToTranslator(workerConfig);

  const apiKey = extractClientKey(c);
  if (!apiKey) {
    return c.json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Access denied. A valid Google Gemini API key was not provided.'
      }
    }, 401);
  }

  const targetPath = '/v1beta/models';
  const serverSelection = WorkerUpstreamManager.selectUpstream(targetPath, workerConfig);
  const { targetUrl, selectedApiKey, serverType } = serverSelection;

  const effectiveApiKey = (serverType === 'direct' && selectedApiKey) ? selectedApiKey : apiKey;
  const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, {}, workerConfig.adminSecretKey);

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: upstreamHeaders
    });

    if (!upstreamRes.ok) {
      const errData = await upstreamRes.json();
      return c.json(errData, upstreamRes.status as any);
    }

    const geminiModelsResponse: any = await upstreamRes.json();
    const claudeModelsResponse = claudeTranslator.convertGoogleModelsToClaude(geminiModelsResponse);

    return c.json(claudeModelsResponse);
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 500);
  }
});

/**
 * GET /v1/models/:model_id
 */
claudeRouter.get('/models/:model_id', async (c) => {
  const modelId = c.req.param('model_id');
  const workerConfig = await getWorkerConfig(c.env);
  syncConfigToTranslator(workerConfig);

  const apiKey = extractClientKey(c);
  if (!apiKey) {
    return c.json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Access denied. A valid Google Gemini API key was not provided.'
      }
    }, 401);
  }

  const cleanModelName = claudeTranslator.getCleanModelName(modelId);
  const targetPath = `/v1beta/models/${cleanModelName}`;
  const serverSelection = WorkerUpstreamManager.selectUpstream(targetPath, workerConfig, { model: cleanModelName });
  const { targetUrl, selectedApiKey, serverType } = serverSelection;

  const effectiveApiKey = (serverType === 'direct' && selectedApiKey) ? selectedApiKey : apiKey;
  const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, {}, workerConfig.adminSecretKey);

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: upstreamHeaders
    });

    if (!upstreamRes.ok) {
      const errData = await upstreamRes.json();
      return c.json(errData, upstreamRes.status as any);
    }

    const geminiModelEntry: any = await upstreamRes.json();
    const claudeModel = claudeTranslator.convertGoogleModelEntryToClaude(geminiModelEntry);
    return c.json(claudeModel);
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 500);
  }
});

export default claudeRouter;
