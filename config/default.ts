import * as dotenv from 'dotenv';
dotenv.config();

// Parse model mapping env var if provided, or default to standard fallback mappings
let parsedModelMappings: Record<string, string> = {
  'gemini-pro-latest': 'gemini-flash-latest' // Default fallback mapping
};

if (process.env.MODEL_MAPPINGS) {
  try {
    parsedModelMappings = JSON.parse(process.env.MODEL_MAPPINGS);
  } catch (err) {
    // Falls back to defaults if parsing fails
  }
}

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  logLevel: process.env.LOG_LEVEL || 'info',
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  modelMappings: parsedModelMappings,
  allowedKeys: [] as string[]
};

export default config;
// ts-lint: ignore
