import { Hono } from 'hono';
import { WorkerEnv } from '../env';
import { getWorkerConfig } from '../config/workerConfig';
import { WorkerLogger } from '../services/workerLogger';
import { WorkerUpstreamManager } from '../services/workerUpstream';
import {
  extractClientKey,
  extractTimeoutMs,
  extractClientSchedulingStrategy,
  buildUpstreamHeaders,
  generateShortId
} from '../utils/requestHelper';
import claudeTranslator from '../../src/proxy/services/claudeTranslator';
import { parseModelThinkingSuffix, applyThinkingConfigHigh } from '../../src/utils/modelThinkingHelper';

const geminiRouter = new Hono<{ Bindings: WorkerEnv }>();

geminiRouter.all('*', async (c) => {
  const transactionId = generateShortId();
  const startTime = Date.now();
  const requestPath = c.req.path;
  const workerConfig = await getWorkerConfig(c.env);

  const apiKey = extractClientKey(c);
  const timeoutMs = extractTimeoutMs(c, workerConfig.upstreamTimeoutMs);

  if (!apiKey) {
    const errPayload = {
      error: {
        code: 401,
        message: 'API key not valid. Please pass a valid API key via x-goog-api-key header, Authorization Bearer, or key query parameter.',
        status: 'UNAUTHENTICATED'
      }
    };
    const duration = Date.now() - startTime;
    c.executionCtx.waitUntil(
      WorkerLogger.saveTransactionToR2(c.env, transactionId, null, null, null, errPayload, duration, requestPath, 401, false)
    );
    return c.json(errPayload, 401);
  }

  let cleanPath = requestPath.replace(/^\/+/, '');
  const queryStr = c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : '';
  let pathWithQuery = `${cleanPath}${queryStr}`;

  let targetModelName = '';
  let originalModel: string | undefined = undefined;
  let effectiveStrategy = extractClientSchedulingStrategy(c);

  const modelMatch = cleanPath.match(/models\/([^:/?]+)(:[^?]*)?(\?.*)?$/);
  if (modelMatch) {
    originalModel = modelMatch[1];
    targetModelName = originalModel;

    const mappingInfo = claudeTranslator.getModelMappingInfo(originalModel);
    if (mappingInfo && mappingInfo.targetModel && mappingInfo.targetModel !== originalModel) {
      pathWithQuery = pathWithQuery.replace(`models/${originalModel}`, `models/${mappingInfo.targetModel}`);
      targetModelName = mappingInfo.targetModel;
    }
    if (mappingInfo?.strategy) {
      effectiveStrategy = mappingInfo.strategy;
    }
  }

  const isStream = cleanPath.includes(':streamGenerateContent') || c.req.query('alt') === 'sse';
  const serverSelection = WorkerUpstreamManager.selectUpstream(pathWithQuery, workerConfig, {
    model: targetModelName || undefined
  });
  let { targetUrl, serverIndex, serverType, selectedApiKey } = serverSelection;

  const customUpstreamHeaders: Record<string, string> = {};
  if (effectiveStrategy) {
    customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
  }
  const effectiveApiKey = (serverType === 'direct' && selectedApiKey) ? selectedApiKey : apiKey;
  const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders, workerConfig.adminSecretKey);

  let reqBodyText: string | undefined = undefined;
  let clientReqObj: any = null;
  const method = c.req.method.toUpperCase();

  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      reqBodyText = await c.req.text();
      if (reqBodyText) {
        clientReqObj = JSON.parse(reqBodyText);
      }
    } catch {
      clientReqObj = reqBodyText;
    }
  }

  // Direct mode thinking models adjustment
  if (serverType === 'direct' && targetModelName) {
    const thinkingInfo = parseModelThinkingSuffix(targetModelName);
    if (thinkingInfo.isHigh) {
      targetUrl = targetUrl.replace(`models/${targetModelName}:`, `models/${thinkingInfo.baseModel}:`);
      if (clientReqObj && typeof clientReqObj === 'object') {
        if (clientReqObj.generationConfig) {
          applyThinkingConfigHigh(clientReqObj.generationConfig);
        } else if (clientReqObj.generateContentRequest?.generationConfig) {
          applyThinkingConfigHigh(clientReqObj.generateContentRequest.generationConfig);
        } else {
          clientReqObj.generationConfig = {};
          applyThinkingConfigHigh(clientReqObj.generationConfig);
        }
        reqBodyText = JSON.stringify(clientReqObj);
      }
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: upstreamHeaders,
      signal: controller.signal
    };
    if (reqBodyText !== undefined && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = reqBodyText;
    }

    const upstreamRes = await fetch(targetUrl, fetchOptions);
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
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReqObj, clientReqObj, errJson, null, duration, requestPath, upstreamRes.status, isStream)
      );
      return c.json(errJson, upstreamRes.status as any);
    }

    WorkerUpstreamManager.recordResult(serverIndex, true);

    if (isStream && upstreamRes.body) {
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReqObj, clientReqObj, null, { streamed: true }, duration, requestPath, 200, true)
      );

      const responseHeaders = new Headers(upstreamRes.headers);
      responseHeaders.set('Cache-Control', 'no-cache, no-transform');
      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders
      });
    }

    const resContentType = upstreamRes.headers.get('content-type') || '';
    if (resContentType.includes('application/json')) {
      const resJson = await upstreamRes.json();
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReqObj, clientReqObj, resJson, null, duration, requestPath, 200, false)
      );
      return c.json(resJson, upstreamRes.status as any);
    } else {
      const resText = await upstreamRes.text();
      c.executionCtx.waitUntil(
        WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReqObj, clientReqObj, resText, null, duration, requestPath, 200, false)
      );
      return c.text(resText, upstreamRes.status as any);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    WorkerUpstreamManager.recordResult(serverIndex, false, err.message);
    const duration = Date.now() - startTime;
    const errPayload = {
      error: {
        code: 502,
        message: `Upstream gateway error: ${err.message}`,
        status: 'UNAVAILABLE'
      }
    };
    c.executionCtx.waitUntil(
      WorkerLogger.saveTransactionToR2(c.env, transactionId, clientReqObj, clientReqObj, errPayload, null, duration, requestPath, 502, isStream)
    );
    return c.json(errPayload, 502);
  }
});

export default geminiRouter;
