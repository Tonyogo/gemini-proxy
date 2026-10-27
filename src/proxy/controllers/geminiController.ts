import { Request, Response } from 'express';
import fetch from 'node-fetch';
import payloadLogger from '../services/payloadLogger';
import claudeTranslator from '../services/claudeTranslator';
import accountUsageService from '../../admin/services/accountUsageService';
import logger from '../../utils/logger';
import { StreamLifecycleManager } from '../../utils/streamLifecycleManager';
import upstreamManager from '../../utils/upstreamManager';
import proxyAgentManager from '../../utils/proxyAgentManager';
import {
  parseModelThinkingSuffix,
  applyThinkingConfigHigh,
  applyThinkingConfigMedium,
  hasGeminiExplicitThinking
} from '../../utils/modelThinkingHelper';
import {
  extractClientKey,
  extractTimeoutMs,
  extractClientSchedulingStrategy,
  generateShortId,
  buildUpstreamHeaders
} from '../../utils/requestHelper';

class GeminiController {
  public async handleProxy(req: Request, res: Response): Promise<any> {
    const transactionId = generateShortId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Received ${clientEndpoint}`);

    const apiKey = extractClientKey(req);
    const timeoutMs = extractTimeoutMs(req);

    if (!apiKey) {
      const errPayload = {
        error: {
          code: 401,
          message: 'API key not valid. Please pass a valid API key via x-goog-api-key header, Authorization Bearer, or key query parameter.',
          status: 'UNAUTHENTICATED'
        }
      };
      const duration = Date.now() - startTime;
      logger.warn(`[GeminiProxy] [Transaction: ${transactionId}] Request rejected: API Key missing.`);
      payloadLogger.saveTransaction(transactionId, req.body, null, null, errPayload, duration, requestPath, 401, false);
      return res.status(401).json(errPayload);
    }

    // Resolve model mapping if applicable
    let cleanPath = requestPath.replace(/^\/+/, '');
    // Ensure cleanPath preserves /v1beta or /v1 prefix
    let effectiveStrategy: string | null = extractClientSchedulingStrategy(req);
    let targetModelName = '';

    const modelMatch = cleanPath.match(/models\/([^:/?]+)(:[^?]*)?(\?.*)?$/);
    let originalModel: string | undefined = undefined;
    if (modelMatch) {
      originalModel = modelMatch[1];
      targetModelName = originalModel;

      const mappingInfo = claudeTranslator.getModelMappingInfo(originalModel, true);
      if (mappingInfo && mappingInfo.targetModel && mappingInfo.targetModel !== originalModel) {
        logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Model mapping: ${originalModel} -> ${mappingInfo.targetModel}`);
        cleanPath = cleanPath.replace(`models/${originalModel}`, `models/${mappingInfo.targetModel}`);
        targetModelName = mappingInfo.targetModel;
      }
      if (mappingInfo && mappingInfo.strategy) {
        effectiveStrategy = mappingInfo.strategy;
      }

      if (targetModelName && !upstreamManager.hasUpstreamForModel(originalModel, targetModelName)) {
        const errPayload = {
          error: {
            code: 403,
            message: `Model '${originalModel || targetModelName}' is not supported by any configured upstream server.`,
            status: 'PERMISSION_DENIED'
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[GeminiProxy] [Transaction: ${transactionId}] Request rejected: Model '${originalModel || targetModelName}' is not supported by any configured upstream server.`);
        payloadLogger.saveTransaction(transactionId, req.body, null, null, errPayload, duration, requestPath, 403, false);
        return res.status(403).json(errPayload);
      }
    }

    const isStream = cleanPath.includes(':streamGenerateContent') || req.query.alt === 'sse';
    const serverSelection = upstreamManager.getUpstreamUrl(cleanPath, {
      model: targetModelName || undefined,
      originalModel: originalModel || undefined,
      resolvedModel: targetModelName || undefined
    });
    let { targetUrl, serverUrl, serverIndex, serverType } = serverSelection;
    const customUpstreamHeaders: Record<string, string> = {};
    if (effectiveStrategy) {
      customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
    }
    const effectiveApiKey = apiKey;
    const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders);

    const clientReq = req.body && Object.keys(req.body).length > 0 ? JSON.parse(JSON.stringify(req.body)) : null;

    // Strip -high from URL, strip from body models, and inject thinkingConfig for generate endpoints across both proxy and direct modes
    if (targetModelName) {
      const thinkingInfo = parseModelThinkingSuffix(targetModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${targetModelName}`, `models/${thinkingInfo.baseModel}`);
        if (clientReq) {
          // Strip -high from request body models if present (e.g. in :countTokens or other endpoints)
          if (typeof clientReq.model === 'string' && clientReq.model.toLowerCase().endsWith('-high')) {
            clientReq.model = parseModelThinkingSuffix(clientReq.model).baseModel;
          }
          if (clientReq.generateContentRequest && typeof clientReq.generateContentRequest.model === 'string' && clientReq.generateContentRequest.model.toLowerCase().endsWith('-high')) {
            clientReq.generateContentRequest.model = parseModelThinkingSuffix(clientReq.generateContentRequest.model).baseModel;
          }

          // Only inject generationConfig for content generation routes
          const isGenerateRoute = cleanPath.includes(':generateContent') || cleanPath.includes(':streamGenerateContent');
          if (isGenerateRoute) {
            clientReq.generationConfig = clientReq.generationConfig || {};
            applyThinkingConfigHigh(clientReq.generationConfig);
          }
        }
      } else {
        // Model does NOT have -high suffix
        const isGenerateRoute = cleanPath.includes(':generateContent') || cleanPath.includes(':streamGenerateContent');
        if (isGenerateRoute && clientReq) {
          if (!hasGeminiExplicitThinking(clientReq.generationConfig)) {
            clientReq.generationConfig = clientReq.generationConfig || {};
            applyThinkingConfigMedium(clientReq.generationConfig);
          }
          if (clientReq.generateContentRequest && !hasGeminiExplicitThinking(clientReq.generateContentRequest.generationConfig)) {
            clientReq.generateContentRequest.generationConfig = clientReq.generateContentRequest.generationConfig || {};
            applyThinkingConfigMedium(clientReq.generateContentRequest.generationConfig);
          }
        }
      }
    }

    const agent = proxyAgentManager.getAgent(serverSelection);

    if (isStream) {
      res.setHeader('x-transaction-id', transactionId);
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs, enableSseHeartbeat: true });
      logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Proxying stream to [server ${serverIndex + 1}: ${serverUrl}]: ${req.method} ${targetUrl}`);

      let accountName: string | null = null;
      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: upstreamHeaders,
          body: req.method !== 'GET' && req.method !== 'HEAD' && clientReq ? JSON.stringify(clientReq) : undefined,
          signal: streamManager.signal,
          agent
        });

        accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;
        if (!accountName && serverType === 'direct') {
          accountName = `__direct_node_${serverIndex}__`;
        }

        const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);

        if (!isOk) {
          streamManager.markFinished();
          if (response.status >= 500 && response.status < 600) {
            upstreamManager.recordRequestResult(serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverIndex, true);
          }
          const errText = typeof response.text === 'function' ? await response.text() : '';
          let errJson: any;
          try { errJson = JSON.parse(errText); } catch { errJson = { error: errText }; }
          accountUsageService.record(accountName, targetModelName || 'unknown', false);
          const duration = Date.now() - startTime;
          payloadLogger.saveTransaction(transactionId, clientReq, clientReq, errJson, errJson, duration, requestPath, response.status, true, ...(accountName ? [accountName] : []));
          if (!res.headersSent) {
            return res.status(response.status).json(errJson);
          } else if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(errJson)}\n\n`);
            res.end();
            return;
          }
          return;
        }

        // Forward headers if not yet sent
        if (!res.headersSent) {
          res.status(response.status);
          res.setHeader('Content-Type', response.headers.get('content-type') || 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
        }
        streamManager.ensureSseHeaders();

        if (response.body) {
          streamManager.setUpstreamStream(response.body);
        }

        let accumulatedStreamText = '';

        if (response.body) {
          response.body.on('data', (chunk: Buffer) => {
            if (streamManager.isAborted) return;
            accumulatedStreamText += chunk.toString('utf8');
            res.write(chunk);
          });

          response.body.on('end', () => {
            streamManager.markFinished();
            if (streamManager.isAborted) return;
            accountUsageService.record(accountName, targetModelName || 'unknown', true);
            upstreamManager.recordRequestResult(serverIndex, true);
            res.end();
            const duration = Date.now() - startTime;
            logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Stream finished (duration: ${(duration / 1000).toFixed(2)}s)`);
            let parsedResponse: any = null;
            try {
              parsedResponse = JSON.parse(accumulatedStreamText);
            } catch {
              parsedResponse = accumulatedStreamText;
            }
            payloadLogger.saveTransaction(transactionId, clientReq, clientReq, parsedResponse, parsedResponse, duration, requestPath, 200, true, ...(accountName ? [accountName] : []));
          });

          response.body.on('error', (err: any) => {
            streamManager.markFinished();
            const duration = Date.now() - startTime;
            if (streamManager.reason === 'timeout') {
              upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
              accountUsageService.record(accountName, targetModelName || 'unknown', false);
              const errJson = {
                error: {
                  code: 504,
                  message: `Upstream request timed out after ${timeoutMs}ms`,
                  status: 'DEADLINE_EXCEEDED'
                }
              };
              logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Stream timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
              payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: 'Timeout' }, errJson, duration, requestPath, 504, true, ...(accountName ? [accountName] : []));
              if (!res.headersSent) {
                return res.status(504).json(errJson);
              } else if (!res.writableEnded) {
                res.write(`data: ${JSON.stringify(errJson)}\n\n`);
                res.end();
                return;
              }
              return;
            }
            if (streamManager.reason === 'client_disconnect') {
              logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Stream aborted due to client disconnect.`);
              return;
            }
            if (!streamManager.isAborted && err.name !== 'AbortError') {
              upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Stream error');
            }
            accountUsageService.record(accountName, targetModelName || 'unknown', false);
            logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Stream error: ${err.message}`);
            const errJson = { error: { code: 502, message: err.message, status: 'BAD_GATEWAY' } };
            payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: err.message }, errJson, duration, requestPath, 502, true, ...(accountName ? [accountName] : []));
            if (!res.headersSent) {
              return res.status(502).json(errJson);
            } else if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify(errJson)}\n\n`);
              res.end();
              return;
            }
          });
        }

      } catch (err: any) {
        streamManager.markFinished();
        const duration = Date.now() - startTime;
        if (err.name === 'AbortError' || streamManager.isAborted) {
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
            accountUsageService.record(accountName, targetModelName || 'unknown', false);
            const errJson = {
              error: {
                code: 504,
                message: `Upstream request timed out after ${timeoutMs}ms`,
                status: 'DEADLINE_EXCEEDED'
              }
            };
            logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Stream request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: 'Timeout' }, errJson, duration, requestPath, 504, true, ...(accountName ? [accountName] : []));
            if (!res.headersSent) {
              return res.status(504).json(errJson);
            } else if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify(errJson)}\n\n`);
              res.end();
              return;
            }
            return;
          }
          logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Stream request fetch aborted due to client disconnect.`);
          return;
        }
        upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Stream exception');
        logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Stream exception: ${err.message}`);
        const errJson = { error: { code: 500, message: err.message, status: 'INTERNAL' } };
        payloadLogger.saveTransaction(transactionId, clientReq, clientReq, errJson, errJson, duration, requestPath, 500, true);
        if (!res.headersSent) {
          return res.status(500).json(errJson);
        } else if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(errJson)}\n\n`);
          res.end();
        }
      }
      return;
    }

    // Non-streaming request
    const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
    let accountName: string | null = null;
    try {
      logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Proxying request to [server ${serverIndex + 1}: ${serverUrl}]: ${req.method} ${targetUrl}`);

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: upstreamHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' && clientReq ? JSON.stringify(clientReq) : undefined,
        signal: streamManager.signal,
        agent
      });

      accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;
      if (!accountName && serverType === 'direct') {
        accountName = `__direct_node_${serverIndex}__`;
      }

      const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);

      if (!isOk) {
        if (response.status >= 500 && response.status < 600) {
          upstreamManager.recordRequestResult(serverIndex, false, response.status);
        } else {
          upstreamManager.recordRequestResult(serverIndex, true);
        }
      } else {
        upstreamManager.recordRequestResult(serverIndex, true);
      }

      accountUsageService.record(accountName, targetModelName || 'unknown', isOk);

      const resText = typeof response.text === 'function' ? await response.text() : '';
      streamManager.markFinished();
      let resJson: any;
      try {
        resJson = JSON.parse(resText);
      } catch {
        resJson = resText;
      }

      const duration = Date.now() - startTime;
      payloadLogger.saveTransaction(transactionId, clientReq, clientReq, resJson, resJson, duration, requestPath, response.status, false, ...(accountName ? [accountName] : []));

      res.setHeader('x-transaction-id', transactionId);
      return res.status(response.status).json(resJson);
    } catch (err: any) {
      streamManager.markFinished();
      const duration = Date.now() - startTime;
      if (err.name === 'AbortError' || streamManager.isAborted) {
        if (streamManager.reason === 'timeout') {
          upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
          accountUsageService.record(accountName, targetModelName || 'unknown', false);
          const timeoutErrJson = {
            error: {
              code: 504,
              message: `Upstream request timed out after ${timeoutMs}ms`,
              status: 'DEADLINE_EXCEEDED'
            }
          };
          logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: 'Timeout' }, timeoutErrJson, duration, requestPath, 504, false, ...(accountName ? [accountName] : []));
          if (!res.headersSent) {
            res.setHeader('x-transaction-id', transactionId);
            return res.status(504).json(timeoutErrJson);
          }
          return;
        }
        logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Non-stream request fetch aborted due to client disconnect.`);
        return;
      }
      upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Proxy error');
      logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Proxy error: ${err.message}`);
      const errJson = { error: { code: 500, message: err.message, status: 'INTERNAL' } };
      payloadLogger.saveTransaction(transactionId, clientReq, clientReq, errJson, errJson, duration, requestPath, 500, false);
      if (!res.headersSent) {
        res.setHeader('x-transaction-id', transactionId);
        return res.status(500).json(errJson);
      }
      return;
    }
  }
}

export const geminiController = new GeminiController();
export default geminiController;
