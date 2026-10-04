import { WorkerEnv, WorkerConfig } from '../env';
import { ModelMappingsConfig, CustomWebAppItem } from '../types';

export const DEFAULT_IGNORED_TOOLS: string[] = [
  'Artifact',
  'ArtifactCheck',
  'ArtifactData',
  'ArtifactComments'
];

export const PRESET_CUSTOM_WEB_APPS: CustomWebAppItem[] = [
  {
    id: 'preset_ubuntu_ui',
    name: 'Ubuntu Web UI',
    url: 'https://ubuntu.yatao.cc.cd/ui/',
    icon: 'Layout',
    color: 'from-orange-500 to-amber-600',
    createdAt: 1726045000000,
  },
];

let cachedConfig: WorkerConfig | null = null;
let lastFetchTime: number = 0;
const CACHE_TTL_MS = 15000;

export function clearConfigCache(): void {
  cachedConfig = null;
  lastFetchTime = 0;
}

function parseList(val: any, defaultVal: string[]): string[] {
  if (!val) return defaultVal;
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return val.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    }
  }
  return defaultVal;
}

function parseJson<T>(val: any, defaultVal: T): T {
  if (!val) return defaultVal;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return defaultVal;
  }
}

export function buildBaseConfig(env: WorkerEnv): WorkerConfig {
  return {
    GEMINI_BASE_URL: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    LOG_LEVEL: env.LOG_LEVEL || 'info',
    TIME_ZONE: env.TIME_ZONE || 'Asia/Shanghai',
    LOG_RETENTION_DAYS: parseInt(env.LOG_RETENTION_DAYS || '3', 10),
    ADMIN_SECRET_KEY: env.ADMIN_SECRET_KEY || '',
    ENABLE_UI: env.ENABLE_UI !== 'false',
    SYSTEM_ROLE_TO_INSTRUCTION: env.SYSTEM_ROLE_TO_INSTRUCTION === 'true',
    RUNTIME_CONTEXT_TAG: env.RUNTIME_CONTEXT_TAG || 'system-context',
    UPSTREAM_TIMEOUT_MS: parseInt(env.UPSTREAM_TIMEOUT_MS || '180000', 10),
    CUSTOM_SYSTEM_INSTRUCTION: env.CUSTOM_SYSTEM_INSTRUCTION || '',
    MODEL_MAPPINGS: parseJson<ModelMappingsConfig>(env.MODEL_MAPPINGS, {}),
    CUSTOM_WEB_APPS: parseJson<CustomWebAppItem[]>(env.CUSTOM_WEB_APPS, PRESET_CUSTOM_WEB_APPS),
    EPHEMERAL_USER_MESSAGES: parseList(
      env.EPHEMERAL_USER_MESSAGES,
      ["[Your previous response had no visible output. Please continue and produce a user-visible response.]"]
    ),
    EPHEMERAL_SYSTEM_MESSAGES: parseList(env.EPHEMERAL_SYSTEM_MESSAGES, []),
    IGNORED_TOOLS: parseList(env.IGNORED_TOOLS, DEFAULT_IGNORED_TOOLS),
    GEMINI_API_KEYS: parseList(env.GEMINI_API_KEYS, []),
  };
}

export async function getConfig(env: WorkerEnv): Promise<WorkerConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const baseConfig = buildBaseConfig(env);
  let overrides: Partial<WorkerConfig> = {};

  if (env.CONFIG_KV) {
    try {
      const kvVal = await env.CONFIG_KV.get('runtime_config', 'json');
      if (kvVal && typeof kvVal === 'object') {
        overrides = kvVal as Partial<WorkerConfig>;
      }
    } catch {
      // Ignore KV read failure and fall back to base
    }
  }

  cachedConfig = {
    ...baseConfig,
    ...overrides,
  };
  lastFetchTime = now;
  return cachedConfig;
}

export async function updateConfig(
  env: WorkerEnv,
  updates: Partial<WorkerConfig>
): Promise<WorkerConfig> {
  const current = await getConfig(env);
  const updated: WorkerConfig = {
    ...current,
    ...updates,
  };

  if (env.CONFIG_KV) {
    try {
      await env.CONFIG_KV.put('runtime_config', JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to write runtime_config to KV:', err);
    }
  }

  cachedConfig = updated;
  lastFetchTime = Date.now();
  return updated;
}
