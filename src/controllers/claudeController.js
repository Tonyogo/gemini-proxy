const fetch = require('node-fetch');
const config = require('../../config/default');
const claudeTranslator = require('../services/claudeTranslator');
const logger = require('../utils/logger');

class ClaudeController {
  async handleMessages(req, res) {
    try {
      const authHeader = req.headers.authorization || '';
      const clientApiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
      const apiKey = clientApiKey || config.geminiApiKey;

      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'No Google API key provided. Set GEMINI_API_KEY env or send Bearer Authorization token.'
          }
        });
      }

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(req.body);

      if (isStream) {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
        logger.info(`Starting streaming request to Gemini Model: ${cleanModelName}`);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(googleRequest)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
          return res.status(normalized.status).json(normalized.payload);
        }

        // Set SSE streaming headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamState = {};

        // Read downstream response body stream chunk by chunk
        response.body.on('data', (buffer) => {
          const text = buffer.toString('utf8');
          // Split multiple SSE chunks separated by newlines
          const lines = text.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const translated = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
            if (translated) {
              res.write(translated);
            }
          }
        });

        response.body.on('end', () => {
          res.end();
        });

        response.body.on('error', (err) => {
          logger.error(`Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          res.end();
        });

        return;
      }

      // Non-Streaming generation
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
      logger.info(`Sending generation request to Gemini Model: ${cleanModelName}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(googleRequest)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      return res.status(200).json(translatedResponse);
    } catch (err) {
      logger.error(`Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  async handleCountTokens(req, res) {
    res.status(501).json({ error: 'Token counting not yet implemented.' });
  }
}

module.exports = new ClaudeController();
