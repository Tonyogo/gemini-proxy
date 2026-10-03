export interface WorkerEnv {
  // Cloudflare KV Namespace for dynamic runtime configuration overrides
  CONFIG_KV?: KVNamespace;

  // Cloudflare R2 Bucket for audit logs storage
  LOGS_BUCKET?: R2Bucket;

  // Cloudflare Static Assets Fetcher for UI hosting
  ASSETS?: Fetcher;

  // Environment variables
  GEMINI_BASE_URL?: string;
  ADMIN_SECRET_KEY?: string;
  UPSTREAM_TIMEOUT_MS?: string;
  TIME_ZONE?: string;
  ENABLE_UI?: string;
  SYSTEM_ROLE_TO_INSTRUCTION?: string;
  STRIP_SYSTEM_FINGERPRINTS?: string;
  RUNTIME_CONTEXT_TAG?: string;
  LOG_RETENTION_DAYS?: string;
  MODEL_MAPPINGS?: string;
  CUSTOM_SYSTEM_INSTRUCTION?: string;
  UPSTREAM_SERVERS?: string;
  CUSTOM_WEB_APPS?: string;
  IGNORED_TOOLS?: string;
  COUNT_TOKENS_MODEL?: string;
  EPHEMERAL_USER_MESSAGES?: string;
  EPHEMERAL_SYSTEM_MESSAGES?: string;
}
