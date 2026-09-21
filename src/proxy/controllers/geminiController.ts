import { Request, Response } from 'express';
import fetch from 'node-fetch';
import config from '../../../config/default';
import payloadLogger from '../services/payloadLogger';
import claudeTranslator from '../services/claudeTranslator';
import accountUsageService from '../../admin/services/accountUsageService';
import logger from '../../utils/logger';
import { StreamLifecycleManager } from '../../utils/streamLifecycleManager';
import upstreamManager from '../../utils/upstreamManager';
import {
  extractClientKey,
  extractTimeoutMs,
  extractClientSchedulingStrategy,
  getUpstreamUrl,
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
    if (modelMatch) {
      const originalModel = modelMatch[1];
      targetModelName = originalModel;

      const mappingInfo = claudeTranslator.getModelMappingInfo(originalModel);
      if (mappingInfo && mappingInfo.targetModel && mappingInfo.targetModel !== originalModel) {
        logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Model mapping: ${originalModel} -> ${mappingInfo.targetModel}`);
        cleanPath = cleanPath.replace(`models/${originalModel}`, `models/${mappingInfo.targetModel}`);
        targetModelName = mappingInfo.targetModel;
      }
      if (mappingInfo && mappingInfo.strategy) {
        effectiveStrategy = mappingInfo.strategy;
      }
    }

    const isStream = cleanPath.includes(':streamGenerateContent') || req.query.alt === 'sse';
    const { targetUrl, serverUrl, serverIndex } = upstreamManager.getUpstreamUrl(cleanPath, { model: targetModelName || undefined });
    const customUpstreamHeaders: Record<string, string> = {};
    if (effectiveStrategy) {
      customUpstreamHeaders['x-scheduling-strategy'] = effectiveStrategy;
    }
    const upstreamHeaders = buildUpstreamHeaders(apiKey, customUpstreamHeaders);

    const clientReq = req.body && Object.keys(req.body).length > 0 ? JSON.parse(JSON.stringify(req.body)) : null;

    if (isStream) {
      const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });
      logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Proxying stream to [server ${serverIndex + 1}: ${serverUrl}]: ${req.method} ${targetUrl}`);

      try {
        const response = await fetch(targetUrl, {
          method: req.method,
          headers: upstreamHeaders,
          body: req.method !== 'GET' && req.method !== 'HEAD' && clientReq ? JSON.stringify(clientReq) : undefined,
          signal: streamManager.signal
        });

        const accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;

        if (!response.ok) {
          streamManager.markFinished();
          if (response.status >= 502 && response.status <= 504) {
            upstreamManager.recordRequestResult(serverIndex, false, response.status);
          } else {
            upstreamManager.recordRequestResult(serverIndex, true);
          }
          const errText = await response.text();
          let errJson: any;
          try { errJson = JSON.parse(errText); } catch { errJson = { error: errText }; }
          accountUsageService.record(accountName, targetModelName || 'unknown', false);
          const duration = Date.now() - startTime;
          payloadLogger.saveTransaction(transactionId, clientReq, clientReq, errJson, errJson, duration, requestPath, response.status, true, ...(accountName ? [accountName] : []));
          return res.status(response.status).json(errJson);
        }

        // Forward headers
        res.status(response.status);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('x-transaction-id', transactionId);

        streamManager.setUpstreamStream(response.body);

        let accumulatedStreamText = '';

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
          accountUsageService.record(accountName, targetModelName || 'unknown', false);
          if (streamManager.reason === 'timeout') {
            upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
          } else if (!streamManager.isAborted && err.name !== 'AbortError') {
            upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Stream error');
          }
          logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Stream error: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).json({ error: { code: 502, message: err.message, status: 'BAD_GATEWAY' } });
          } else {
            res.end();
          }
        });

      } catch (err: any) {
        streamManager.markFinished();
        const duration = Date.now() - startTime;
        if (streamManager.reason === 'timeout') {
          upstreamManager.recordRequestResult(serverIndex, false, 'Timeout');
        } else if (!streamManager.isAborted && err.name !== 'AbortError') {
          upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Stream exception');
        }
        logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Stream exception: ${err.message}`);
        const errJson = { error: { code: 500, message: err.message, status: 'INTERNAL' } };
        payloadLogger.saveTransaction(transactionId, clientReq, clientReq, errJson, errJson, duration, requestPath, 500, true);
        if (!res.headersSent) {
          return res.status(500).json(errJson);
        }
      }
      return;
    }

    // Non-streaming request
    try {
      logger.info(`[GeminiProxy] [Transaction: ${transactionId}] Proxying request to [server ${serverIndex + 1}: ${serverUrl}]: ${req.method} ${targetUrl}`);
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: upstreamHeaders,
        body: req.method !== 'GET' && req.method !== 'HEAD' && clientReq ? JSON.stringify(clientReq) : undefined
      });

      const accountName = response.headers?.get ? (response.headers.get('x-account-name') || null) : null;

      if (!response.ok) {
        if (response.status >= 502 && response.status <= 504) {
          upstreamManager.recordRequestResult(serverIndex, false, response.status);
        } else {
          upstreamManager.recordRequestResult(serverIndex, true);
        }
      } else {
        upstreamManager.recordRequestResult(serverIndex, true);
      }

      accountUsageService.record(accountName, targetModelName || 'unknown', response.ok);

      const resText = await response.text();
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
      upstreamManager.recordRequestResult(serverIndex, false, err.message || 'Proxy error');
      const duration = Date.now() - startTime;
      logger.error(`[GeminiProxy] [Transaction: ${transactionId}] Proxy error: ${err.message}`);
      const errJson = { error: { code: 500, message: err.message, status: 'INTERNAL' } };
      payloadLogger.saveTransaction(transactionId, clientReq, clientReq, errJson, errJson, duration, requestPath, 500, false);
      return res.status(500).json(errJson);
    }
  }
}

export default new GeminiController();
