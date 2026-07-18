import { Request, Response } from 'express';
// @ts-ignore
import fetch from 'node-fetch';
import config from '../../config/default';
import modelsList from '../../config/models.json';
import { ModelConfig, GeminiModelsResponse } from '../types';
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
import logger from '../utils/logger';

const SUPPORTED_MODELS: ModelConfig[] = (modelsList as GeminiModelsResponse).models
  .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
  .map(m => {
    const id = m.name.replace(/^models\//, '');
    return {
      type: 'model' as const,
      id: id,
      display_name: m.displayName,
      created_at: '2026-07-18T00:00:00Z'
    };
  });

class ClaudeController {
  private _extractClientKey(req: Request): string | null {
    let clientKey: string | null = null;
    if (req.headers["x-api-key"]) {
      clientKey = req.headers["x-api-key"] as string;
    } else if (req.headers["x-goog-api-key"]) {
      clientKey = req.headers["x-goog-api-key"] as string;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      clientKey = req.headers.authorization.substring(7).trim();
    } else if (req.query && req.query.key) {
      clientKey = req.query.key as string;
    }
    return clientKey;
  }

  private _getUpstreamUrl(pathAndQuery: string): string {
    const base = config.geminiBaseUrl.replace(/\/+$/, '');
    const cleanPath = pathAndQuery.replace(/^\/+/, '');
    return `${base}/${cleanPath}`;
  }

  private _generateTransactionId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  public async handleMessages(req: Request, res: Response): Promise<any> {
    const transactionId = this._generateTransactionId();
    // Deep clone the client request body immediately upon entry to prevent reference mutations
    const clientReq = JSON.parse(JSON.stringify(req.body));
    let gemReq: any = null;

    try {
      const apiKey = this._extractClientKey(req);

      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        };
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Request rejected: API Key is missing or invalid.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload);
        return res.status(401).json(errPayload);
      }

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;

      if (isStream) {
        const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`);
        const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
        logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gemReq)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          logger.error(`[Error] [Transaction: ${transactionId}] Stream request failed with status ${errStatus}: ${errMessage}`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload);
          return res.status(normalized.status).json(normalized.payload);
        }

        // Set SSE streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamState = {};
        const gemResChunks: any[] = [];
        const claudeResChunks: string[] = [];

        // Read downstream response body stream chunk by chunk
        response.body!.on('data', (buffer: Buffer) => {
          const text = buffer.toString('utf8');
          // Split multiple SSE chunks separated by newlines
          const lines = text.split('\n');
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

            const translated = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
            if (translated) {
              claudeResChunks.push(translated);
              res.write(translated);
            }
          }
        });

        response.body!.on('end', () => {
          logger.info(`[Response] [Transaction: ${transactionId}] Stream generated content finished successfully`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks, claudeResChunks);
          res.end();
        });

        response.body!.on('error', (err: any) => {
          logger.error(`[Error] [Transaction: ${transactionId}] Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          payloadLogger.saveTransaction(
            transactionId,
            clientReq,
            gemReq,
            { error: err.message, partial_chunks: gemResChunks },
            { error: err.message, partial_chunks: claudeResChunks }
          );
          res.end();
        });

        return;
      }

      // Non-Streaming generation
      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gemReq)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        logger.error(`[Error] [Transaction: ${transactionId}] Non-stream request failed with status ${errStatus}: ${errMessage}`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload);
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      logger.info(`[Response] [Transaction: ${transactionId}] Non-stream content successfully returned with 200 OK`);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, translatedResponse);
      return res.status(200).json(translatedResponse);
    } catch (err: any) {
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleCountTokens(req: Request, res: Response): Promise<any> {
    const transactionId = this._generateTransactionId();
    // Deep clone immediately
    const clientReq = JSON.parse(JSON.stringify(req.body));
    let gemReq: any = null;

    try {
      const apiKey = this._extractClientKey(req);

      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        };
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Token count request rejected: API Key is missing.`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload);
        return res.status(401).json(errPayload);
      }

      const { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:countTokens?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] [Transaction: ${transactionId}] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gemReq)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        logger.error(`[Error] [Transaction: ${transactionId}] Token count failed with status ${errStatus}: ${errMessage}`);
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload);
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const tokenResponse = {
        input_tokens: (geminiData as any).totalTokens || 0
      };

      logger.info(`[Response] [Transaction: ${transactionId}] Token count successfully returned: ${tokenResponse.input_tokens} input tokens`);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, tokenResponse);
      return res.status(200).json(tokenResponse);
    } catch (err: any) {
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled count tokens error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleListModels(req: Request, res: Response): Promise<any> {
    const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
    logger.info(`[Request] Received models list query: ${clientEndpoint}`);
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        logger.warn(`[Authentication Error] Models list request rejected: API Key is missing.`);
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      logger.info(`[Response] Models list query finished successfully: Returning ${SUPPORTED_MODELS.length} configured models`);
      return res.status(200).json({
        data: SUPPORTED_MODELS,
        has_more: false,
        first_id: SUPPORTED_MODELS[0].id,
        last_id: SUPPORTED_MODELS[SUPPORTED_MODELS.length - 1].id
      });
    } catch (err: any) {
      logger.error(`[Error] Unhandled list models error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleRetrieveModel(req: Request, res: Response): Promise<any> {
    const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
    const modelId = req.params.model_id;
    logger.info(`[Request] Received specific model metadata query: ${clientEndpoint} for ID: '${modelId}'`);
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        logger.warn(`[Authentication Error] Retrieve model metadata request rejected: API Key is missing.`);
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      const model = SUPPORTED_MODELS.find(m => m.id === modelId);

      if (!model) {
        logger.warn(`[Retrieve Model Error] Requested model '${modelId}' does not exist in configured list`);
        return res.status(404).json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${modelId}' does not exist.`
          }
        });
      }

      logger.info(`[Response] Retrieve model metadata finished: Returning specs for '${modelId}'`);
      return res.status(200).json(model);
    } catch (err: any) {
      logger.error(`Unhandled retrieve model error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
}

export default new ClaudeController();
