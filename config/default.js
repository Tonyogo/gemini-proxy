require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  defaultModel: process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash',
  logLevel: process.env.LOG_LEVEL || 'info',
  modelMapping: {
    "claude-3-5-sonnet": "gemini-2.5-pro",
    "claude-3-5-sonnet-20241022": "gemini-2.5-pro",
    "claude-3-5-haiku": "gemini-2.5-flash",
    "claude-3-5-haiku-20241022": "gemini-2.5-flash",
    "claude-3-opus": "gemini-2.5-pro",
    "claude-3-sonnet": "gemini-2.5-flash",
    "claude-3-haiku": "gemini-.5-flash",
    "claude-opus-4-7": "gemini-3.5-flash",
    "claude-sonnet-4-6": "gemini-flash-lite-latest"
  }
};
