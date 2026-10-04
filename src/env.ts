import { ModelMappingsConfig, CustomWebAppItem } from './types';

export interface WorkerEnv {
  // Cloudflare Bindings
  CONFIG_KV?: KVNamespace;
  LOGS_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;

  // Environment variables
  GEMINI_BASE_URL?: string;
  ADMIN_SECRET_KEY?: string;
  LOG_LEVEL?: string;
  TIME_ZONE?: string;
  LOG_RETENTION_DAYS?: string;
  ENABLE_UI?: string;
  SYSTEM_ROLE_TO_INSTRUCTION?: string;
  RUNTIME_CONTEXT_TAG?: string;
  UPSTREAM_TIMEOUT_MS?: string;
  CUSTOM_SYSTEM_INSTRUCTION?: string;
  MODEL_MAPPINGS?: string;
  CUSTOM_WEB_APPS?: string;
  EPHEMERAL_USER_MESSAGES?: string;
  EPHEMERAL_SYSTEM_MESSAGES?: string;
  IGNORED_TOOLS?: string;
  GEMINI_API_KEYS?: string;
  [key: string]: any;
}

export interface WorkerConfig {
  PORT?: number;
  GEMINI_BASE_URL: string;
  LOG_LEVEL: string;
  TRANSACTION_LOGS_DIR?: string;
  TIME_ZONE: string;
  LOG_RETENTION_DAYS: number;
  ADMIN_SECRET_KEY: string;
  ENABLE_UI: boolean;
  SYSTEM_ROLE_TO_INSTRUCTION: boolean;
  RUNTIME_CONTEXT_TAG: string;
  UPSTREAM_TIMEOUT_MS: number;
  CUSTOM_SYSTEM_INSTRUCTION?: string;
  MODEL_MAPPINGS: ModelMappingsConfig;
  CUSTOM_WEB_APPS: CustomWebAppItem[];
  EPHEMERAL_USER_MESSAGES: string[];
  EPHEMERAL_SYSTEM_MESSAGES: string[];
  IGNORED_TOOLS: string[];
  GEMINI_API_KEYS: string[];
}
