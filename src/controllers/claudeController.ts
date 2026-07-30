import { Request, Response } from 'express';
import fetch from 'node-fetch';
import config from '../../config/default';
import { ModelConfig, GeminiModelsResponse, GeminiModelEntry } from '../types';
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
import logger from '../utils/logger';
import { StreamLifecycleManager } from '../utils/streamLifecycleManager';
import {
  extractClientKey,
  extractTimeoutMs,
  getUpstreamUrl,
  generateTransactionId,
  buildUpstreamHeaders
} from '../utils/requestHelper';

const SUPPORTED_MODELS: ModelConfig[] = [];

class ClaudeController {
  public async handleMessages(req: Request, res: Response): Promise<any> {
    const transactionId = generateTransactionId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint}`);

    // Deep clone the client request body immediately upon entry to prevent reference mutations
    const clientReq = JSON.parse(JSON.stringify(req.body));
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

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      if (isStream) {
        const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
        const targetPath = `/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`;
        const targetUrl = getUpstreamUrl(targetPath);
        logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

        try {
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: buildUpstreamHeaders(apiKey),
            body: JSON.stringify(gemReq),
            signal: streamManager.signal
          });

          if (!response.ok) {
            streamManager.markFinished();
            const errorText = await response.text();
            let errorJson;
            try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
            const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
            const errStatus = response.status;
            const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

            const duration = Date.now() - startTime;
            logger.error(`[Error] [Transaction: ${transactionId}] Stream request failed with status ${errStatus}: ${errMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, true);
            return res.status(normalized.status).json(normalized.payload);
          }

          streamManager.attachStream(response.body);

          // Set SSE streaming headers
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

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

              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.substring(6).trim();
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
              if (trimmed.startsWith('data: ')) {
                const jsonStr = trimmed.substring(6).trim();
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

            const duration = Date.now() - startTime;
            logger.info(`[Response] [Transaction: ${transactionId}] Stream generated content finished successfully (duration: ${(duration / 1000).toFixed(2)}s)`);
            payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks, claudeResChunks, duration, requestPath, 200, true);
            res.end();
          });

          response.body!.on('error', (err: any) => {
            streamManager.markFinished();
            const duration = Date.now() - startTime;
            if (streamManager.isAborted || err.name === 'AbortError') {
              if (streamManager.reason === 'timeout') {
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
              logger.info(`[Client Disconnect] [Transaction: ${transactionId}] Stream aborted due to client disconnect (duration: ${(duration / 1000).toFixed(2)}s)`);
              return;
            }
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
              true
            );
          });

          return;
        } catch (err: any) {
          streamManager.markFinished();
          const duration = Date.now() - startTime;
          if (err.name === 'AbortError' || streamManager.isAborted) {
            if (streamManager.reason === 'timeout') {
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
          throw err;
        }
      }

      // Non-Streaming generation
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      const targetPath = `/v1beta/models/${cleanModelName}:generateContent`;
      const targetUrl = getUpstreamUrl(targetPath);
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: buildUpstreamHeaders(apiKey),
          body: JSON.stringify(gemReq),
          signal: streamManager.signal
        });

        streamManager.markFinished();

        if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          const duration = Date.now() - startTime;
          logger.error(`[Error] [Transaction: ${transactionId}] Non-stream request failed with status ${errStatus}: ${errMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
          return res.status(normalized.status).json(normalized.payload);
        }

        const geminiData = await response.json();
        const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName, clientReq.tools);

        const duration = Date.now() - startTime;
        logger.info(`[Response] [Transaction: ${transactionId}] Non-stream content successfully returned with 200 OK (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, translatedResponse, duration, requestPath, 200, false);
        return res.status(200).json(translatedResponse);
      } catch (err: any) {
        streamManager.markFinished();
        const duration = Date.now() - startTime;
        if (err.name === 'AbortError' || streamManager.isAborted) {
          if (streamManager.reason === 'timeout') {
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
        throw err;
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled error: ${err.message} (duration: ${(duration / 1000).toFixed(2)}s)`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration, requestPath, normalized.status, Boolean(clientReq && clientReq.stream));
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleCountTokens(req: Request, res: Response): Promise<any> {
    const transactionId = generateTransactionId();
    const startTime = Date.now();
    const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint}`);

    // Deep clone immediately
    const clientReq = JSON.parse(JSON.stringify(req.body));
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
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

      const targetPath = `/v1beta/models/${cleanModelName}:countTokens`;
      const targetUrl = getUpstreamUrl(targetPath);
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: buildUpstreamHeaders(apiKey),
        body: JSON.stringify(countTokensPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        const duration = Date.now() - startTime;
        logger.error(`[Error] [Transaction: ${transactionId}] Token count failed with status ${errStatus}: ${errMessage} (duration: ${(duration / 1000).toFixed(2)}s)`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
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
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleListModels(req: Request, res: Response): Promise<any> {
    const transactionId = generateTransactionId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received models list query: ${clientEndpoint}`);

    const clientReq = { method: req.method, query: req.query };
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
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

      const targetPath = `/v1beta/models`;
      const targetUrl = getUpstreamUrl(targetPath);
      gemReq = { endpoint: targetPath };

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: buildUpstreamHeaders(apiKey)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        const duration = Date.now() - startTime;
        logger.error(`[Error] [Transaction: ${transactionId}] Models list request failed with status ${errStatus}: ${errMessage}`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload, duration, requestPath, normalized.status, false);
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json() as GeminiModelsResponse;

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
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleRetrieveModel(req: Request, res: Response): Promise<any> {
    const transactionId = generateTransactionId();
    const startTime = Date.now();
    const requestPath = req.originalUrl || req.path;
    const modelId = req.params.model_id;
    const clientEndpoint = `${req.method} ${requestPath}`;
    logger.info(`[Request] [Transaction: ${transactionId}] Received specific model metadata query: ${clientEndpoint} for ID: '${modelId}'`);

    const clientReq = { method: req.method, model_id: modelId, query: req.query };
    let gemReq: any = null;

    try {
      const apiKey = extractClientKey(req);
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

      const targetPath = `/v1beta/models/${resolvedModelId}`;
      const targetUrl = getUpstreamUrl(targetPath);
      gemReq = { endpoint: targetPath };

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: buildUpstreamHeaders(apiKey)
      });

      if (!response.ok) {
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

      const m = await response.json() as GeminiModelEntry;
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
      return res.status(normalized.status).json(normalized.payload);
    }
  }
}

export default new ClaudeController();
