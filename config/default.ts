import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedKeys: [] as string[]
};

export default config;
// ts-lint: ignore
