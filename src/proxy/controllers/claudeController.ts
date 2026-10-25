import { Request, Response } from 'express';
import fetch from 'node-fetch';
import config from '../../../config/default';
import { ModelConfig, GeminiModelsResponse, GeminiModelEntry, UpstreamServerSelection } from '../../types';
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
import accountUsageService from '../../admin/services/accountUsageService';
import logger from '../../utils/logger';
import { StreamLifecycleManager } from '../../utils/streamLifecycleManager';
import upstreamManager from '../../utils/upstreamManager';
import proxyAgentManager from '../../utils/proxyAgentManager';
import { parseModelThinkingSuffix, applyThinkingConfigHigh } from '../../utils/modelThinkingHelper';
import {
  extractClientKey,
  extractTimeoutMs,
  extractClientSchedulingStrategy,
  getUpstreamUrl,
  generateShortId,
  generateTransactionId,
  buildUpstreamHeaders,
  buildDirectUpstreamHeaders,
  maskApiKey
} from '../../utils/requestHelper';

const SUPPORTED_MODELS: ModelConfig[] = [];

class ClaudeController {
  public async handleMessages(req: Request, res: Response): Promise<any> {
    const transactionId = generateShortId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint}`);

    // Deep clone the client request body immediately upon entry to prevent reference mutations
    const clientReq = req.body ? JSON.parse(JSON.stringify(req.body)) : null;
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
      const timeoutMs = extractTimeoutMs(req);

      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Request rejected: API Key is missing or invalid. (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 401, false);
        return res.status(401).json(errPayload);
      }

      if (!clientReq || !clientReq.model) {
        throw { status: 400, message: "Missing required parameter: 'model'" };
      }

      const clientModel = clientReq.model;
      const mappingInfo = claudeTranslator.getModelMappingInfo(clientModel);
      const cleanModelName = mappingInfo.targetModel || clientModel.replace(/^models\//, '');

      if (!upstreamManager.hasUpstreamForModel(clientModel, cleanModelName)) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'permission_error',
            message: `Model '${clientModel || cleanModelName}' is not supported by any configured upstream server.`
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[UpstreamManager] [Transaction: ${transactionId}] Request rejected: Model '${clientModel}' is not supported by any configured upstream server.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 403, false);
        return res.status(403).json(errPayload);
      }

      const isStream = Boolean(clientReq.stream);
      const targetPath = isStream
        ? `/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`
        : `/v1beta/models/${cleanModelName}:generateContent`;
      const serverSelection = upstreamManager.getUpstreamUrl(targetPath, {
        model: cleanModelName,
        originalModel: clientModel,
        resolvedModel: cleanModelName
      });

      if (serverSelection.serverType === 'direct') {
        return await this.handleDirectMessages(
          req,
          res,
          clientReq,
          apiKey,
          timeoutMs,
          transactionId,
          startTime,
          requestPath,
          serverSelection
        );
      }

      const { googleRequest, cleanModelName: proxyModelName, strategy } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      // Determine effective scheduling strategy: mapping config takes precedence over client header
      const clientStrategy = extractClientSchedulingStrategy(req);
      const effectiveStrategy = strategy || clientStrategy;
      const customUpstreamHeaders: Record<string, string> = {};
      if (effectiveStrategy) {
        customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
      }

      if (isStream) {
        const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs, enableSseHeartbeat: true });
        let targetUrl = serverSelection.targetUrl || `${serverSelection.serverUrl.replace(/\/+$/, '')}${targetPath}`;
        const serverIndex = serverSelection.serverIndex;
        const serverUrl = serverSelection.serverUrl;
        logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini [server ${serverIndex + 1}: ${serverUrl}]: POST ${targetPath}`);

        // Strip -high and inject thinkingConfig for all upstream servers
        const thinkingInfo = parseModelThinkingSuffix(proxyModelName);
        if (thinkingInfo.isHigh) {
          targetUrl = targetUrl.replace(`models/${proxyModelName}:`, `models/${thinkingInfo.baseModel}:`);
          gemReq.generationConfig = gemReq.generationConfig || {};
          applyThinkingConfigHigh(gemReq.generationConfig);
        }

        const effectiveApiKey = apiKey;
        const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders);
        const agent = proxyAgentManager.getAgent(serverSelection);

        try {
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: upstreamHeaders,
            body: JSON.stringify(gemReq),
            signal: streamManager.signal,
            agent
          });

          let accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;

          const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);

          if (!isOk) {
            streamManager.markFinished();
            if (response.status >= 500 && response.status < 600) {
              upstreamManager.recordRequestResult(serverIndex, false, response.status);
            } else {
              upstreamManager.recordRequestResult(serverIndex, true);
            }
            const errorText = typeof response.text === 'function' ? await response.text() : '';
            let errorJson;
            try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
            const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
            const errStatus = response.status;
            const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

            accountUsageService.record(accountName, cleanModelName, false);

            const duration = Date.now() - startTime;
            const isHtml = typeof errMessage === 'string' && /<html|<!doctype/i.test(errMessage);
            const logErrMessage = isHtml ? `HTML error page (${errStatus})` : (errMessage.length > 500 ? errMessage.slice(0, 500) + '...' : errMessage);
            logger.error(`[Error] [Transaction: ${transactionId}] Stream request failed with status ${errStatus}: ${logErrMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, true, ...(accountName ? [accountName] : []));
            if (!res.headersSent) {
              if (normalized.headers) {
                res.set(normalized.headers);
              }
              return res.status(normalized.status).json(normalized.payload);
            }
            if (!res.writableEnded) {
              res.write(`event: error\ndata: ${JSON.stringify(normalized.payload)}\n\n`);
              res.end();
            }
            return;
          }

          streamManager.attachStream(response.body);
          streamManager.ensureSseHeaders();

          const streamState = { tools: clientReq.tools };
          const gemResChunks: any[] = [];
          const claudeResChunks: any[] = [];
          let streamBuffer = '';

          response.body!.on('data', (buffer: Buffer) => {
            if (streamManager.isAborted) return;
            streamBuffer += buffer.toString('utf8');
            const lines = streamBuffer.split('\n');
            streamBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              // Pass through SSE comment/heartbeat frames (e.g. ": ping") directly to downstream client
              if (trimmed.startsWith(':')) {
                if (!res.writableEnded) {
                  res.write(`${trimmed}\n\n`);
                }
                continue;
              }

              if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.substring(5).trim();
                if (jsonStr !== '[DONE]') {
                  try {
                    gemResChunks.push(JSON.parse(jsonStr));
                  } catch (e) { /* ignore */ }
                }
              }

              const events = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
              if (events && events.length > 0) {
                claudeResChunks.push(...events);
                if (!res.writableEnded) {
                  const sseText = events.map((ev: any) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join('');
                  res.write(sseText);
                }
              }
            }
          });

          response.body!.on('end', () => {
            streamManager.markFinished();
            if (streamManager.isAborted) return;

            if (streamBuffer.trim()) {
              const trimmed = streamBuffer.trim();
              if (trimmed.startsWith(':')) {
                if (!res.writableEnded) {
                  res.write(`${trimmed}\n\n`);
                }
              } else {
                if (trimmed.startsWith('data:')) {
                  const jsonStr = trimmed.substring(5).trim();
                  if (jsonStr !== '[DONE]') {
                    try {
                      gemResChunks.push(JSON.parse(jsonStr));
                    } catch (e) { /* ignore */ }
                  }
                }

                const events = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
                if (events && events.length > 0) {
                  claudeResChunks.push(...events);
                  if (!res.writableEnded) {
                    const sseText = events.map((ev: any) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join('');
                    res.write(sseText);
                  }
                }
              }
            }

            accountUsageService.record(accountName, cleanModelName, true);
            upstreamManager.recordRequestResult(serverIndex, true);
            const duration = Date.now() - startTime;
            logger.info(`[Response] [Transaction: ${transactionId}] Stream generated content finished successfully (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks, claudeResChunks, duration, requestPath, 200, true, ...(accountName ? [accountName] : []));
            res.end();
          });

          response.body!.on('error', (err: any) => {
            streamManager.markFinished();
            accountUsageService.record(accountName, cleanModelName, false);
            const duration = Date.now() - startTime;
            if (streamManager.isAborted || err.name === 'AbortError') {
              if (streamManager.reason === 'timeout') {
                upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
                const errPayload = {
                  type: 'error',
                  error: {
                    type: 'timeout_error',
                    message: `Upstream request to Gemini API timed out after ${timeoutMs}ms`
                  }
                };
                logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Stream request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
                payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, true, ...(accountName ? [accountName] : []));

                if (!res.headersSent) {
                  return res.status(504).json(errPayload);
                } else if (!res.writableEnded) {
                  res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
                  res.end();
                  return;
                }
              }
              logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Stream aborted due to client disconnect (duration: ${(duration / 1000).toFixed(2)}s)`);
              return;
            }
            upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Downstream connection lost');
            logger.error(`[Error] [Transaction: ${transactionId}] Stream reading error: ${err.message} (duration: ${(duration / 1000).toFixed(2)}s)`);
            const errPayload = {
              type: 'error',
              error: { type: 'api_error', message: 'Downstream connection lost' }
            };
            if (!res.writableEnded) {
              res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
              res.end();
            }
            payloadLogger.saveTransaction(
              transactionId,
              clientReq,
              gemReq,
              { error: err.message, partial_chunks: gemResChunks },
              { error: err.message, partial_chunks: claudeResChunks },
              duration,
              requestPath,
              500,
              true,
              ...(accountName ? [accountName] : [])
            );
          });

          return;
        } catch (err: any) {
          streamManager.markFinished();
          const duration = Date.now() - startTime;
          if (err.name === 'AbortError' || streamManager.isAborted) {
            if (streamManager.reason === 'timeout') {
              upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
              const errPayload = {
                type: 'error',
                error: {
                  type: 'timeout_error',
                  message: `Upstream request to Gemini API timed out after ${timeoutMs}ms`
                }
              };
              logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Stream request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
              payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, true);

              if (!res.headersSent) {
                return res.status(504).json(errPayload);
              } else if (!res.writableEnded) {
                res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
                res.end();
                return;
              }
            }
            logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
            return;
          }
          upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Fetch error');
          throw err;
        }
      }

      // Non-Streaming generation
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      const nonStreamPath = `/v1beta/models/${proxyModelName}:generateContent`;
      let targetUrl = serverSelection.targetUrl || `${serverSelection.serverUrl.replace(/\/+$/, '')}${nonStreamPath}`;
      const serverIndex = serverSelection.serverIndex;
      const serverUrl = serverSelection.serverUrl;
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini [server ${serverIndex + 1}: ${serverUrl}]: POST ${nonStreamPath}`);

      // Strip -high and inject thinkingConfig for all upstream servers
      const thinkingInfo = parseModelThinkingSuffix(proxyModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${proxyModelName}:`, `models/${thinkingInfo.baseModel}:`);
        gemReq.generationConfig = gemReq.generationConfig || {};
        applyThinkingConfigHigh(gemReq.generationConfig);
      }

      const effectiveApiKey = apiKey;
      const upstreamHeaders = buildUpstreamHeaders(effectiveApiKey, customUpstreamHeaders);
      const agent = proxyAgentManager.getAgent(serverSelection);

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: JSON.stringify(gemReq),
          signal: streamManager.signal,
          agent
        });

        streamManager.markFinished();
        let accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;

        const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);

        if (!isOk) {
          if (response.status >= 500 && response.status < 600) {
            upstreamManager.recordRequestResult(serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverIndex, true);
          }
          const errorText = typeof response.text === 'function' ? await response.text() : '';
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          accountUsageService.record(accountName, cleanModelName, false);

          const duration = Date.now() - startTime;
          const isHtml = typeof errMessage === 'string' && /<html|<!doctype/i.test(errMessage);
          const logErrMessage = isHtml ? `HTML error page (${errStatus})` : (errMessage.length > 500 ? errMessage.slice(0, 500) + '...' : errMessage);
          logger.error(`[Error] [Transaction: ${transactionId}] Non-stream request failed with status ${errStatus}: ${logErrMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false, ...(accountName ? [accountName] : []));
          if (normalized.headers && !res.headersSent) {
            res.set(normalized.headers);
          }
          return res.status(normalized.status).json(normalized.payload);
        }

        upstreamManager.recordRequestResult(serverIndex, true);
        let geminiData: any;
        if (typeof response.json === 'function') {
          geminiData = await response.json();
        } else if (response.body) {
          const chunks: Buffer[] = [];
          for await (const chunk of (response.body as any)) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          geminiData = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        }
        const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName, clientReq.tools);

        accountUsageService.record(accountName, cleanModelName, true);

        const duration = Date.now() - startTime;
        logger.info(`[Response] [Transaction: ${transactionId}] Non-stream content successfully returned with 200 OK (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, translatedResponse, duration, requestPath, 200, false, ...(accountName ? [accountName] : []));
        return res.status(200).json(translatedResponse);
      } catch (err: any) {
        streamManager.markFinished();
        const duration = Date.now() - startTime;
        if (err.name === 'AbortError' || streamManager.isAborted) {
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
            const errPayload = {
              type: 'error',
              error: {
                type: 'timeout_error',
                message: `Upstream request to Gemini API timed out after ${timeoutMs}ms`
              }
            };
            logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
            return res.status(504).json(errPayload);
          }
          logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Non-stream request fetch aborted due to client disconnect.`);
          return;
        }
        upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Fetch error');
        throw err;
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled error: ${err.message} (duration: ${(duration / 1000).toFixed(2)}s)`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, Boolean(clientReq && clientReq.stream));
      if (!res.headersSent) {
        if (normalized.headers) {
          res.set(normalized.headers);
        }
        return res.status(normalized.status).json(normalized.payload);
      }
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify(normalized.payload)}\n\n`);
        res.end();
      }
      return;
    }
  }

  private async handleDirectMessages(
    req: Request,
    res: Response,
    clientReq: any,
    apiKey: string,
    timeoutMs: number,
    transactionId: string,
    startTime: number,
    requestPath: string,
    serverSelection: UpstreamServerSelection
  ): Promise<any> {
    const { directRequest, cleanModelName, strategy, isStream } =
      claudeTranslator.preprocessClaudeDirectRequest(clientReq);

    const clientStrategy = extractClientSchedulingStrategy(req);
    const effectiveStrategy = strategy || clientStrategy;
    const customUpstreamHeaders: Record<string, string> = {};
    if (effectiveStrategy) {
      customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
    }

    const pathPart = (requestPath.split('?')[0] || '').replace(/^\/+/, '');
    const queryPart = requestPath.includes('?') ? '?' + requestPath.split('?').slice(1).join('?') : '';
    const normalizedPath = pathPart || 'v1/messages';
    const targetUrl = (serverSelection as any).targetUrl && (serverSelection as any).targetUrl.startsWith('http') && (serverSelection as any).targetUrl.includes(normalizedPath)
      ? (serverSelection as any).targetUrl
      : `${serverSelection.serverUrl.replace(/\/+$/, '')}/${normalizedPath}${queryPart}`;

    const upstreamHeaders = buildDirectUpstreamHeaders(req, apiKey, customUpstreamHeaders);
    const agent = proxyAgentManager.getAgent(serverSelection);
    const serverIndex = serverSelection.serverIndex;

    if (isStream) {
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs, enableSseHeartbeat: true });
      logger.info(`[Request] [Transaction: ${transactionId}] Direct proxying stream to [server ${serverIndex + 1}: ${serverSelection.serverUrl}]: POST ${targetUrl}`);

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: JSON.stringify(directRequest),
          signal: streamManager.signal,
          agent
        });

        const rawAccountHeader = response.headers?.get ? response.headers.get('x-account-name') : null;
        const accountKey = (rawAccountHeader && rawAccountHeader !== 'application/json')
          ? rawAccountHeader
          : `__direct_node_${serverIndex}__`;
        const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);

        if (!isOk) {
          streamManager.markFinished();
          if (response.status >= 500 && response.status < 600) {
            upstreamManager.recordRequestResult(serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverIndex, true);
          }
          const errorText = typeof response.text === 'function' ? await response.text() : '';
          let errorJson: any;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Direct upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          accountUsageService.record(accountKey, cleanModelName, false);

          const duration = Date.now() - startTime;
          const isHtml = typeof errMessage === 'string' && /<html|<!doctype/i.test(errMessage);
          const logErrMessage = isHtml ? `HTML error page (${errStatus})` : (errMessage.length > 500 ? errMessage.slice(0, 500) + '...' : errMessage);
          logger.error(`[Error] [Transaction: ${transactionId}] Direct stream failed with status ${errStatus}: ${logErrMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, true, accountKey);
          if (!res.headersSent) {
            if (normalized.headers) {
              res.set(normalized.headers);
            }
            return res.status(normalized.status).json(normalized.payload);
          }
          if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify(normalized.payload)}\n\n`);
            res.end();
          }
          return;
        }

        streamManager.attachStream(response.body);
        streamManager.ensureSseHeaders();

        const sseEvents: any[] = [];
        let streamBuffer = '';

        response.body!.on('data', (buffer: Buffer) => {
          if (streamManager.isAborted) return;
          if (!res.writableEnded) {
            res.write(buffer);
          }

          streamBuffer += buffer.toString('utf8');
          const lines = streamBuffer.split('\n');
          streamBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              const jsonStr = trimmed.substring(5).trim();
              if (jsonStr && jsonStr !== '[DONE]') {
                try {
                  sseEvents.push(JSON.parse(jsonStr));
                } catch (e) { /* ignore */ }
              }
            }
          }
        });

        response.body!.on('end', () => {
          streamManager.markFinished();
          if (streamManager.isAborted) return;

          if (streamBuffer.trim()) {
            const trimmed = streamBuffer.trim();
            if (trimmed.startsWith('data:')) {
              const jsonStr = trimmed.substring(5).trim();
              if (jsonStr && jsonStr !== '[DONE]') {
                try {
                  sseEvents.push(JSON.parse(jsonStr));
                } catch (e) { /* ignore */ }
              }
            }
          }

          accountUsageService.record(accountKey, cleanModelName, true);
          upstreamManager.recordRequestResult(serverIndex, true);
          const duration = Date.now() - startTime;
          logger.info(`[Response] [Transaction: ${transactionId}] Direct stream finished successfully (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, directRequest, sseEvents, sseEvents, duration, requestPath, 200, true, accountKey);
          res.end();
        });

        response.body!.on('error', (err: any) => {
          streamManager.markFinished();
          accountUsageService.record(accountKey, cleanModelName, false);
          const duration = Date.now() - startTime;
          if (streamManager.isAborted || err.name === 'AbortError') {
            if (streamManager.reason === 'timeout') {
              upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
              const errPayload = {
                type: 'error',
                error: {
                  type: 'timeout_error',
                  message: `Upstream request timed out after ${timeoutMs}ms`
                }
              };
              logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Direct stream timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
              payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: 'Timeout' }, errPayload, duration, requestPath, 504, true, accountKey);

              if (!res.headersSent) {
                return res.status(504).json(errPayload);
              } else if (!res.writableEnded) {
                res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
                res.end();
                return;
              }
            }
            logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Direct stream aborted due to client disconnect (duration: ${(duration / 1000).toFixed(2)}s)`);
            return;
          }
          upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Downstream connection lost');
          logger.error(`[Error] [Transaction: ${transactionId}] Direct stream reading error: ${err.message} (duration: ${(duration / 1000).toFixed(2)}s)`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
            res.end();
          }
          payloadLogger.saveTransaction(
            transactionId,
            clientReq,
            directRequest,
            { error: err.message, partial_chunks: sseEvents },
            { error: err.message, partial_chunks: sseEvents },
            duration,
            requestPath,
            500,
            true,
            accountKey
          );
        });

        return;
      } catch (err: any) {
        streamManager.markFinished();
        const duration = Date.now() - startTime;
        if (err.name === 'AbortError' || streamManager.isAborted) {
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
            const errPayload = {
              type: 'error',
              error: {
                type: 'timeout_error',
                message: `Upstream request timed out after ${timeoutMs}ms`
              }
            };
            logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Direct stream request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: 'Timeout' }, errPayload, duration, requestPath, 504, true);

            if (!res.headersSent) {
              return res.status(504).json(errPayload);
            } else if (!res.writableEnded) {
              res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
              res.end();
              return;
            }
          }
          logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Direct request fetch aborted due to client disconnect.`);
          return;
        }
        upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Fetch error');
        throw err;
      }
    }

    // Non-Streaming direct request
    const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
    logger.info(`[Request] [Transaction: ${transactionId}] Direct proxying non-stream to [server ${serverIndex + 1}: ${serverSelection.serverUrl}]: POST ${targetUrl}`);

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(directRequest),
        signal: streamManager.signal,
        agent
      });

      streamManager.markFinished();
      const rawAccountHeader = response.headers?.get ? response.headers.get('x-account-name') : null;
      const accountKey = (rawAccountHeader && rawAccountHeader !== 'application/json')
        ? rawAccountHeader
        : `__direct_node_${serverIndex}__`;
      const isOk = response.ok !== undefined ? response.ok : (response.status >= 200 && response.status < 300);

      if (!isOk) {
        if (response.status >= 500 && response.status < 600) {
          upstreamManager.recordRequestResult(serverIndex, false, response.status);
        } else {
          upstreamManager.recordRequestResult(serverIndex, true);
        }
        const errorText = typeof response.text === 'function' ? await response.text() : '';
        let errorJson: any;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Direct upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        accountUsageService.record(accountKey, cleanModelName, false);

        const duration = Date.now() - startTime;
        const isHtml = typeof errMessage === 'string' && /<html|<!doctype/i.test(errMessage);
        const logErrMessage = isHtml ? `HTML error page (${errStatus})` : (errMessage.length > 500 ? errMessage.slice(0, 500) + '...' : errMessage);
        logger.error(`[Error] [Transaction: ${transactionId}] Direct non-stream request failed with status ${errStatus}: ${logErrMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false, accountKey);
        if (normalized.headers && !res.headersSent) {
          res.set(normalized.headers);
        }
        return res.status(normalized.status).json(normalized.payload);
      }

      let upstreamData: any;
      if (typeof response.json === 'function') {
        try {
          upstreamData = await response.json();
        } catch {
          upstreamData = typeof response.text === 'function' ? await response.text() : null;
        }
      } else if (typeof response.text === 'function') {
        const upstreamText = await response.text();
        try {
          upstreamData = JSON.parse(upstreamText);
        } catch (e) {
          upstreamData = upstreamText;
        }
      }

      accountUsageService.record(accountKey, cleanModelName, true);
      upstreamManager.recordRequestResult(serverIndex, true);

      const duration = Date.now() - startTime;
      logger.info(`[Response] [Transaction: ${transactionId}] Direct non-stream generated content finished successfully (duration: ${(duration / 1000).toFixed(2)}s)`);
      payloadLogger.saveTransaction(transactionId, clientReq, directRequest, upstreamData, upstreamData, duration, requestPath, 200, false, accountKey);
      return res.status(200).json(upstreamData);
    } catch (err: any) {
      streamManager.markFinished();
      const duration = Date.now() - startTime;
      if (err.name === 'AbortError' || streamManager.isAborted) {
        if (streamManager.reason === 'timeout') {
          upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
          const errPayload = {
            type: 'error',
            error: {
              type: 'timeout_error',
              message: `Upstream request timed out after ${timeoutMs}ms`
            }
          };
          logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Direct non-stream request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
          if (!res.headersSent) {
            return res.status(504).json(errPayload);
          }
          return;
        }
        logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Direct request aborted due to client disconnect.`);
        return;
      }
      upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Fetch error');
      throw err;
    }
  }

  public async handleCountTokens(req: Request, res: Response): Promise<any> {
    const transactionId = generateShortId();
    const startTime = Date.now();
    const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint}`);

    // Deep clone immediately
    const clientReq = req.body ? JSON.parse(JSON.stringify(req.body)) : null;
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
      const timeoutMs = extractTimeoutMs(req);
      const requestPath = req.originalUrl || req.path;

      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Token count request rejected: API Key is missing. (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 401, false);
        return res.status(401).json(errPayload);
      }

      const requestedModel = (clientReq.model || config.countTokensModel || '').trim();
      const resolvedCountModel = requestedModel ? claudeTranslator.getCleanModelName(requestedModel) : '';
      if (!upstreamManager.hasUpstreamForModel(requestedModel, resolvedCountModel)) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'permission_error',
            message: `Model '${requestedModel || resolvedCountModel}' is not supported by any configured upstream server.`
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[UpstreamManager] [Transaction: ${transactionId}] Token count rejected: Model '${requestedModel || resolvedCountModel}' is not supported by any configured upstream server.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 403, false);
        return res.status(403).json(errPayload);
      }

      const effectiveCountModel = (config.countTokensModel && config.countTokensModel.trim())
        ? claudeTranslator.getCleanModelName(config.countTokensModel.trim())
        : resolvedCountModel;

      const countTargetPath = `/v1beta/models/${effectiveCountModel}:countTokens`;
      const serverSelection = upstreamManager.getUpstreamUrl(countTargetPath, {
        model: effectiveCountModel,
        originalModel: requestedModel,
        resolvedModel: effectiveCountModel
      });

      if (serverSelection.serverType === 'direct') {
        const { directRequest } = claudeTranslator.preprocessClaudeDirectRequest(clientReq);
        if (config.countTokensModel && config.countTokensModel.trim()) {
          directRequest.model = claudeTranslator.getCleanModelName(config.countTokensModel.trim());
        }
        const targetUrl = (serverSelection as any).targetUrl && (serverSelection as any).targetUrl.startsWith('http') && (serverSelection as any).targetUrl.includes('count_tokens')
          ? (serverSelection as any).targetUrl
          : `${serverSelection.serverUrl.replace(/\/+$/, '')}/v1/messages/count_tokens`;
        const headers = buildDirectUpstreamHeaders(req, apiKey);
        const agent = proxyAgentManager.getAgent(serverSelection);

        const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
        let response;
        try {
          response = await fetch(targetUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(directRequest),
            signal: streamManager.signal,
            agent
          });
        } catch (fetchErr: any) {
          streamManager.markFinished();
          if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
            const duration = Date.now() - startTime;
            if (streamManager.reason === 'timeout') {
              upstreamManager.recordRequestResult(serverSelection.serverIndex, false, 'Timeout');
              const errPayload = {
                type: 'error',
                error: {
                  type: 'timeout_error',
                  message: `Upstream request timed out after ${timeoutMs}ms`
                }
              };
              logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
              payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
              if (!res.headersSent) {
                return res.status(504).json(errPayload);
              }
              return;
            }
            logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
            return;
          }
          upstreamManager.recordRequestResult(serverSelection.serverIndex, false, fetchErr.message || 'Fetch error');
          throw fetchErr;
        }

        if (!response.ok) {
          if (response.status >= 500 && response.status < 600) {
            upstreamManager.recordRequestResult(serverSelection.serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverSelection.serverIndex, true);
          }
          const errorText = await response.text();
          streamManager.markFinished();
          let errorJson: any;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Direct upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          const duration = Date.now() - startTime;
          logger.error(`[Error] [Transaction: ${transactionId}] Direct token count failed with status ${errStatus}: ${errMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, directRequest, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
          if (normalized.headers && !res.headersSent) {
            res.set(normalized.headers);
          }
          return res.status(normalized.status).json(normalized.payload);
        }

        upstreamManager.recordRequestResult(serverSelection.serverIndex, true);
        const data = await response.json();
        streamManager.markFinished();
        const tokenResponse = {
          input_tokens: data.input_tokens ?? data.totalTokens ?? 0
        };

        const duration = Date.now() - startTime;
        logger.info(`[Response] [Transaction: ${transactionId}] Direct token count successfully returned: ${tokenResponse.input_tokens} input tokens (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, directRequest, data, tokenResponse, duration, requestPath, 200, false);
        return res.status(200).json(tokenResponse);
      }

      let { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);

      if (config.countTokensModel && config.countTokensModel.trim()) {
        cleanModelName = claudeTranslator.getCleanModelName(config.countTokensModel.trim());
      }

      // Clean generationConfig maxOutputTokens if present as countTokens only evaluates input
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

      const proxyCountTargetPath = `/v1beta/models/${cleanModelName}:countTokens`;
      let targetUrl = serverSelection.targetUrl || `${serverSelection.serverUrl.replace(/\/+$/, '')}${proxyCountTargetPath}`;
      const serverIndex = serverSelection.serverIndex;
      const serverUrl = serverSelection.serverUrl;

      const thinkingInfo = parseModelThinkingSuffix(cleanModelName);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${cleanModelName}:`, `models/${thinkingInfo.baseModel}:`);
        countTokensPayload.generateContentRequest.model = `models/${thinkingInfo.baseModel}`;
      }
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini [server ${serverIndex + 1}: ${serverUrl}]: POST ${proxyCountTargetPath}`);

      const effectiveApiKey = apiKey;
      const agent = proxyAgentManager.getAgent(serverSelection);

      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      let response;
      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          headers: buildUpstreamHeaders(effectiveApiKey),
          body: JSON.stringify(countTokensPayload),
          signal: streamManager.signal,
          agent
        });
      } catch (fetchErr: any) {
        streamManager.markFinished();
        if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
          const duration = Date.now() - startTime;
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
            const errPayload = {
              type: 'error',
              error: {
                type: 'timeout_error',
                message: `Upstream request timed out after ${timeoutMs}ms`
              }
            };
            logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
            if (!res.headersSent) {
              return res.status(504).json(errPayload);
            }
            return;
          }
          logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
          return;
        }
        upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error');
        throw fetchErr;
      }

      if (!response.ok) {
        if (response.status >= 500 && response.status < 600) {
          upstreamManager.recordRequestResult(serverIndex, false, response.status);
        } else {
          upstreamManager.recordRequestResult(serverIndex, true);
        }
        const errorText = await response.text();
        streamManager.markFinished();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        const duration = Date.now() - startTime;
        logger.error(`[Error] [Transaction: ${transactionId}] Token count failed with status ${errStatus}: ${errMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
        if (normalized.headers && !res.headersSent) {
          res.set(normalized.headers);
        }
        return res.status(normalized.status).json(normalized.payload);
      }

      upstreamManager.recordRequestResult(serverIndex, true);
      const geminiData = await response.json();
      streamManager.markFinished();
      const tokenResponse = {
        input_tokens: (geminiData as any).totalTokens || 0
      };

      const duration = Date.now() - startTime;
      logger.info(`[Response] [Transaction: ${transactionId}] Token count successfully returned: ${tokenResponse.input_tokens} input tokens (duration: ${(duration / 1000).toFixed(2)}s)`);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, tokenResponse, duration, requestPath, 200, false);
      return res.status(200).json(tokenResponse);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled count tokens error: ${err.message} (duration: ${(duration / 1000).toFixed(2)}s)`);
      const normalized = claudeTranslator.normalizeError(err);
      const requestPath = req.originalUrl || req.path;
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, false);
      if (normalized.headers && !res.headersSent) {
        res.set(normalized.headers);
      }
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleListModels(req: Request, res: Response): Promise<any> {
    const transactionId = generateShortId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received models list query: ${clientEndpoint}`);

    const clientReq = { method: req.method, query: req.query };
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
      const timeoutMs = extractTimeoutMs(req);
      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Models list request rejected: API Key is missing.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 401, false);
        return res.status(401).json(errPayload);
      }

      const serverSelection = upstreamManager.getUpstreamServer();
      const { serverUrl, serverIndex, serverType } = serverSelection;

      if (serverType === 'direct') {
        const targetUrl = `${serverUrl.replace(/\/+$/, '')}/v1/models`;
        logger.info(`[Request] [Transaction: ${transactionId}] Direct proxying models list [server ${serverIndex + 1}: ${serverUrl}]: GET ${targetUrl}`);
        gemReq = { endpoint: targetUrl };

        const headers = buildDirectUpstreamHeaders(req, apiKey);
        const agent = proxyAgentManager.getAgent(serverSelection);

        const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
        let response;
        try {
          response = await fetch(targetUrl, {
            method: 'GET',
            headers,
            signal: streamManager.signal,
            agent
          });
        } catch (fetchErr: any) {
          streamManager.markFinished();
          if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
            const duration = Date.now() - startTime;
            if (streamManager.reason === 'timeout') {
              upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
              const errPayload = {
                type: 'error',
                error: {
                  type: 'timeout_error',
                  message: `Upstream request timed out after ${timeoutMs}ms`
                }
              };
              logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
              payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
              if (!res.headersSent) {
                return res.status(504).json(errPayload);
              }
              return;
            }
            logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
            return;
          }
          upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error');
          throw fetchErr;
        }

        if (!response.ok) {
          if (response.status >= 500 && response.status < 600) {
            upstreamManager.recordRequestResult(serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverIndex, true);
          }
          const errorText = await response.text();
          streamManager.markFinished();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Direct upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          const duration = Date.now() - startTime;
          logger.error(`[Error] [Transaction: ${transactionId}] Models list request failed with status ${errStatus}: ${errMessage}`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
          if (normalized.headers && !res.headersSent) {
            res.set(normalized.headers);
          }
          return res.status(normalized.status).json(normalized.payload);
        }

        upstreamManager.recordRequestResult(serverIndex, true);
        const upstreamData: any = await response.json();
        streamManager.markFinished();

        let responsePayload;
        if (upstreamData && Array.isArray(upstreamData.data)) {
          responsePayload = upstreamData;
        } else if (upstreamData && Array.isArray(upstreamData.models)) {
          const dynamicModels: ModelConfig[] = (upstreamData.models || [])
            .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => {
              const id = m.name.replace(/^models\//, '');
              return {
                type: 'model' as const,
                id: id,
                display_name: m.displayName || id,
                created_at: '2026-07-18T00:00:00Z'
              };
            });

          responsePayload = {
            data: dynamicModels,
            has_more: false,
            first_id: dynamicModels.length > 0 ? dynamicModels[0].id : '',
            last_id: dynamicModels.length > 0 ? dynamicModels[dynamicModels.length - 1].id : ''
          };
        } else {
          responsePayload = upstreamData;
        }

        const duration = Date.now() - startTime;
        logger.info(`[Response] [Transaction: ${transactionId}] Direct models list query finished successfully`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, upstreamData, responsePayload, duration, requestPath, 200, false);
        return res.status(200).json(responsePayload);
      }

      const targetPath = `/v1beta/models`;
      const targetUrl = `${serverUrl.replace(/\/+$/, '')}${targetPath}`;
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying models list to Gemini [server ${serverIndex + 1}: ${serverUrl}]: GET ${targetPath}`);
      gemReq = { endpoint: targetPath };

      const effectiveApiKey = apiKey;
      const agent = proxyAgentManager.getAgent(serverSelection);

      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      let response;
      try {
        response = await fetch(targetUrl, {
          method: 'GET',
          headers: buildUpstreamHeaders(effectiveApiKey),
          signal: streamManager.signal,
          agent
        });
      } catch (fetchErr: any) {
        streamManager.markFinished();
        if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
          const duration = Date.now() - startTime;
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
            const errPayload = {
              type: 'error',
              error: {
                type: 'timeout_error',
                message: `Upstream request timed out after ${timeoutMs}ms`
              }
            };
            logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
            if (!res.headersSent) {
              return res.status(504).json(errPayload);
            }
            return;
          }
          logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
          return;
        }
        upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error');
        throw fetchErr;
      }

      if (!response.ok) {
        if (response.status >= 500 && response.status < 600) {
          upstreamManager.recordRequestResult(serverIndex, false, response.status);
        } else {
          upstreamManager.recordRequestResult(serverIndex, true);
        }
        const errorText = await response.text();
        streamManager.markFinished();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        const duration = Date.now() - startTime;
        logger.error(`[Error] [Transaction: ${transactionId}] Models list request failed with status ${errStatus}: ${errMessage}`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
        if (normalized.headers && !res.headersSent) {
          res.set(normalized.headers);
        }
        return res.status(normalized.status).json(normalized.payload);
      }

      upstreamManager.recordRequestResult(serverIndex, true);
      const geminiData = await response.json() as GeminiModelsResponse;
      streamManager.markFinished();

      const dynamicModels: ModelConfig[] = (geminiData.models || [])
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => {
          const id = m.name.replace(/^models\//, '');
          return {
            type: 'model' as const,
            id: id,
            display_name: m.displayName || id,
            created_at: '2026-07-18T00:00:00Z'
          };
        });

      const responsePayload = {
        data: dynamicModels,
        has_more: false,
        first_id: dynamicModels.length > 0 ? dynamicModels[0].id : '',
        last_id: dynamicModels.length > 0 ? dynamicModels[dynamicModels.length - 1].id : ''
      };

      const duration = Date.now() - startTime;
      logger.info(`[Response] [Transaction: ${transactionId}] Models list query finished successfully: Returning ${dynamicModels.length} dynamic models from Gemini`);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, responsePayload, duration, requestPath, 200, false);
      return res.status(200).json(responsePayload);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled list models error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, false);
      if (normalized.headers && !res.headersSent) {
        res.set(normalized.headers);
      }
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleRetrieveModel(req: Request, res: Response): Promise<any> {
    const transactionId = generateShortId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const modelId = req.params.model_id;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received specific model metadata query: ${clientEndpoint} for ID: '${modelId}'`);

    const clientReq = { method: req.method, model_id: modelId, query: req.query };
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
      const timeoutMs = extractTimeoutMs(req);
      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Retrieve model metadata request rejected: API Key is missing.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 401, false);
        return res.status(401).json(errPayload);
      }

      // Check if it's an alias configured locally first
      const cleanModelId = modelId as string;
      const resolvedModelId = claudeTranslator.getCleanModelName(cleanModelId);

      if (!upstreamManager.hasUpstreamForModel(cleanModelId, resolvedModelId)) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'permission_error',
            message: `Model '${cleanModelId || resolvedModelId}' is not supported by any configured upstream server.`
          }
        };
        const duration = Date.now() - startTime;
        logger.warn(`[UpstreamManager] [Transaction: ${transactionId}] Retrieve model metadata request rejected: Model '${cleanModelId}' is not supported by any configured upstream server.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration, requestPath, 403, false);
        return res.status(403).json(errPayload);
      }

      const targetPath = `/v1beta/models/${resolvedModelId}`;
      const serverSelection = upstreamManager.getUpstreamUrl(targetPath, { model: resolvedModelId, originalModel: cleanModelId, resolvedModel: resolvedModelId });
      const { serverUrl, serverIndex, serverType } = serverSelection;

      if (serverType === 'direct') {
        const targetUrl = (serverSelection as any).targetUrl && (serverSelection as any).targetUrl.startsWith('http') && (serverSelection as any).targetUrl.includes('/v1/models')
          ? (serverSelection as any).targetUrl
          : `${serverUrl.replace(/\/+$/, '')}/v1/models/${resolvedModelId}`;
        logger.info(`[Request] [Transaction: ${transactionId}] Direct proxying model metadata [server ${serverIndex + 1}: ${serverUrl}]: GET ${targetUrl}`);
        gemReq = { endpoint: targetUrl };
        const headers = buildDirectUpstreamHeaders(req, apiKey);
        const agent = proxyAgentManager.getAgent(serverSelection);

        const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
        let response;
        try {
          response = await fetch(targetUrl, {
            method: 'GET',
            headers,
            signal: streamManager.signal,
            agent
          });
        } catch (fetchErr: any) {
          streamManager.markFinished();
          if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
            const duration = Date.now() - startTime;
            if (streamManager.reason === 'timeout') {
              upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
              const errPayload = {
                type: 'error',
                error: {
                  type: 'timeout_error',
                  message: `Upstream request timed out after ${timeoutMs}ms`
                }
              };
              logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
              payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
              if (!res.headersSent) {
                return res.status(504).json(errPayload);
              }
              return;
            }
            logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
            return;
          }
          upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error');
          throw fetchErr;
        }

        if (!response.ok) {
          streamManager.markFinished();
          if (response.status >= 500 && response.status < 600) {
            upstreamManager.recordRequestResult(serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverIndex, true);
          }
          const duration = Date.now() - startTime;
          logger.warn(`[Retrieve Model Error] [Transaction: ${transactionId}] Direct requested model '${resolvedModelId}' failed with status ${response.status}`);
          const errPayload = {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: `Model '${modelId}' does not exist.`
            }
          };
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: `HTTP ${response.status}` }, errPayload, duration, requestPath, response.status === 404 ? 404 : 400, false);
          return res.status(response.status === 404 ? 404 : 400).json(errPayload);
        }

        upstreamManager.recordRequestResult(serverIndex, true);
        const upstreamData: any = await response.json();
        streamManager.markFinished();

        let responsePayload;
        if (upstreamData && upstreamData.type === 'model') {
          responsePayload = upstreamData;
        } else if (upstreamData && (upstreamData.name || upstreamData.displayName)) {
          responsePayload = {
            type: 'model',
            id: upstreamData.name ? upstreamData.name.replace(/^models\//, '') : resolvedModelId,
            display_name: upstreamData.displayName || resolvedModelId,
            created_at: '2026-07-18T00:00:00Z'
          };
        } else {
          responsePayload = upstreamData;
        }

        const duration = Date.now() - startTime;
        logger.info(`[Response] [Transaction: ${transactionId}] Direct retrieve model finished successfully`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, upstreamData, responsePayload, duration, requestPath, 200, false);
        return res.status(200).json(responsePayload);
      }

      let targetUrl = serverSelection.targetUrl || `${serverUrl.replace(/\/+$/, '')}${targetPath}`;
      const thinkingInfo = parseModelThinkingSuffix(resolvedModelId);
      if (thinkingInfo.isHigh) {
        targetUrl = targetUrl.replace(`models/${resolvedModelId}`, `models/${thinkingInfo.baseModel}`);
      }
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying model metadata to Gemini [server ${serverIndex + 1}: ${serverUrl}]: GET ${targetPath}`);
      gemReq = { endpoint: targetPath };
      const agent = proxyAgentManager.getAgent(serverSelection);

      const effectiveApiKey = apiKey;

      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      let response;
      try {
        response = await fetch(targetUrl, {
          method: 'GET',
          headers: buildUpstreamHeaders(effectiveApiKey),
          signal: streamManager.signal,
          agent
        });
      } catch (fetchErr: any) {
        streamManager.markFinished();
        if (fetchErr.name === 'AbortError' || streamManager.isAborted) {
          const duration = Date.now() - startTime;
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
            const errPayload = {
              type: 'error',
              error: {
                type: 'timeout_error',
                message: `Upstream request timed out after ${timeoutMs}ms`
              }
            };
            logger.warn(`[Timeout Error] [Transaction: ${transactionId}] Request timed out after ${timeoutMs}ms (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: 'Timeout' }, errPayload, duration, requestPath, 504, false);
            if (!res.headersSent) {
              return res.status(504).json(errPayload);
            }
            return;
          }
          logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Request fetch aborted due to client disconnect.`);
          return;
        }
        upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error');
        throw fetchErr;
      }

      if (!response.ok) {
        streamManager.markFinished();
        if (response.status >= 500 && response.status < 600) {
          upstreamManager.recordRequestResult(serverIndex, false, response.status);
        } else {
          upstreamManager.recordRequestResult(serverIndex, true);
        }
        const duration = Date.now() - startTime;
        logger.warn(`[Retrieve Model Error] [Transaction: ${transactionId}] Requested model '${resolvedModelId}' does not exist or fetch failed`);
        const errPayload = {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${modelId}' does not exist.`
          }
        };
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: `Model not found: ${response.status}` }, errPayload, duration, requestPath, 404, false);
        return res.status(404).json(errPayload);
      }

      upstreamManager.recordRequestResult(serverIndex, true);
      const m = await response.json() as GeminiModelEntry;
      streamManager.markFinished();
      const cleanId = m.name.replace(/^models\//, '');
      const mappedModel: ModelConfig = {
        type: 'model',
        id: cleanId,
        display_name: m.displayName || cleanId,
        created_at: '2026-07-18T00:00:00Z'
      };

      const duration = Date.now() - startTime;
      logger.info(`[Response] [Transaction: ${transactionId}] Retrieve model metadata finished: Returning specs for '${modelId}'`);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, m, mappedModel, duration, requestPath, 200, false);
      return res.status(200).json(mappedModel);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled retrieve model error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, false);
      if (normalized.headers && !res.headersSent) {
        res.set(normalized.headers);
      }
      return res.status(normalized.status).json(normalized.payload);
    }
  }
}

export const claudeController = new ClaudeController();
export default claudeController;
