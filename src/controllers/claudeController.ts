import { Request, Response } from 'express';
// @ts-ignore
import fetch from 'node-fetch';
import config from '../../config/default';
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
import logger from '../utils/logger';

const SUPPORTED_MODELS = [
  { "type": "model", "id": "claude-opus-4-7", "display_name": "Claude 4.7 Opus (Gemini Flash)", "created_at": "2026-07-10T00:00:00Z" },
  { "type": "model", "id": "claude-sonnet-4-6", "display_name": "Claude 4.6 Sonnet (Gemini Flash Lite)", "created_at": "2026-07-10T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-sonnet-20241022", "display_name": "Claude 3.5 Sonnet (New)", "created_at": "2024-10-22T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-sonnet", "display_name": "Claude 3.5 Sonnet", "created_at": "2024-06-20T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-haiku-20241022", "display_name": "Claude 3.5 Haiku", "created_at": "2024-10-22T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-haiku", "display_name": "Claude 3.5 Haiku (Standard)", "created_at": "2024-10-22T00:00:00Z" },
  { "type": "model", "id": "claude-3-opus", "display_name": "Claude 3 Opus", "created_at": "2024-03-07T00:00:00Z" },
  { "type": "model", "id": "claude-3-sonnet", "display_name": "Claude 3 Sonnet", "created_at": "2024-02-29T00:00:00Z" },
  { "type": "model", "id": "claude-3-haiku", "display_name": "Claude 3 Haiku", "created_at": "2024-03-07T00:00:00Z" }
];

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
    const clientReq = req.body;
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
        payloadLogger.saveTransaction(transactionId, clientReq, null, errPayload);
        return res.status(401).json(errPayload);
      }

      logger.debug(`[Request] Incoming Claude payload body: ${JSON.stringify(clientReq)}`);

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      logger.debug(`[Adapter] Mapped Gemini request body: ${JSON.stringify(gemReq)}`);

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;

      if (isStream) {
        const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`);
        const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
        logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

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

          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
          return res.status(normalized.status).json(normalized.payload);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamState = {};
        const gemResChunks: any[] = [];

        response.body!.on('data', (buffer: Buffer) => {
          const text = buffer.toString('utf8');
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
              res.write(translated);
            }
          }
        });

        response.body!.on('end', () => {
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks);
          res.end();
        });

        response.body!.on('error', (err: any) => {
          logger.error(`Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message, partial_chunks: gemResChunks });
          res.end();
        });

        return;
      }

      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

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

        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData);
      return res.status(200).json(translatedResponse);
    } catch (err: any) {
      logger.error(`Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message });
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleCountTokens(req: Request, res: Response): Promise<any> {
    const transactionId = this._generateTransactionId();
    const clientReq = req.body;
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
        payloadLogger.saveTransaction(transactionId, clientReq, null, errPayload);
        return res.status(401).json(errPayload);
      }

      logger.debug(`[Request] Incoming Claude CountTokens payload body: ${JSON.stringify(clientReq)}`);

      const { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      logger.debug(`[Adapter] Mapped Gemini CountTokens request body: ${JSON.stringify(gemReq)}`);

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:countTokens?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

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

        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData: any = await response.json();

      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData);
      return res.status(200).json({
        input_tokens: geminiData.totalTokens || 0
      });
    } catch (err: any) {
      logger.error(`Unhandled count tokens error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message });
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleListModels(req: Request, res: Response): Promise<any> {
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      return res.status(200).json({
        data: SUPPORTED_MODELS,
        has_more: false,
        first_id: SUPPORTED_MODELS[0].id,
        last_id: SUPPORTED_MODELS[SUPPORTED_MODELS.length - 1].id
      });
    } catch (err: any) {
      logger.error(`Unhandled list models error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleRetrieveModel(req: Request, res: Response): Promise<any> {
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      const modelId = req.params.model_id;
      const model = SUPPORTED_MODELS.find(m => m.id === modelId);

      if (!model) {
        return res.status(404).json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${modelId}' does not exist.`
          }
        });
      }

      return res.status(200).json(model);
    } catch (err: any) {
      logger.error(`Unhandled retrieve model error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
}

export default new ClaudeController();
