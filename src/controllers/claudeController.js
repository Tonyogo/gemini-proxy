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
        // We will implement full SSE stream in Task 4
        return res.status(501).json({ error: 'Streaming not yet implemented in this milestone.' });
      }

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
