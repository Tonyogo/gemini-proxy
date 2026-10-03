import { WorkerEnv } from '../env';
import { ModelMappingsConfig, UpstreamServerConfig, CustomWebAppItem } from '../../src/types';

export interface WorkerRuntimeConfig {
  geminiBaseUrl: string;
  adminSecretKey: string;
  logLevel: string;
  upstreamTimeoutMs: number;
  timeZone: string;
  enableUi: boolean;
  systemRoleToInstruction: boolean;
  stripSystemFingerprints: boolean;
  runtimeContextTag: string;
  logRetentionDays: number;
  countTokensModel: string;
  customSystemInstruction: string;
  modelMappings: ModelMappingsConfig;
  upstreamServers: UpstreamServerConfig[];
  customWebApps: CustomWebAppItem[];
  ignoredTools: string[];
  ephemeralUserMessages: string[];
  ephemeralSystemMessages: string[];
}

export const DEFAULT_IGNORED_TOOLS = [
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

let cachedConfig: WorkerRuntimeConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15000; // 15 seconds in-memory cache for KV reads

function parseUpstreamServers(val: any): UpstreamServerConfig[] {
  if (Array.isArray(val) && val.length > 0) {
    return val.map((s, idx) => ({
      url: (s.url || '').replace(/\/+$/, ''),
      weight: Number(s.weight) || 1,
      enabled: s.enabled !== false,
      name: s.name || `Server ${idx + 1}`,
      allowedModels: Array.isArray(s.allowedModels) ? s.allowedModels : undefined,
      type: s.type || 'proxy',
      apiKeys: Array.isArray(s.apiKeys) ? s.apiKeys.filter(Boolean) : undefined
    }));
  }
  if (typeof val === 'string' && val.trim()) {
    return val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map((url, idx) => ({
        url: url.replace(/\/+$/, ''),
        weight: 1,
        enabled: true,
        name: `Server ${idx + 1}`,
        type: 'proxy'
      }));
  }
  return [{ url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API', type: 'proxy' }];
}

export async function getWorkerConfig(env: WorkerEnv): Promise<WorkerRuntimeConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // 1. Default config from environment variables
  let parsedModelMappings: ModelMappingsConfig = {};
  if (env.MODEL_MAPPINGS) {
    try {
      parsedModelMappings = JSON.parse(env.MODEL_MAPPINGS);
    } catch {}
  }

  let parsedCustomWebApps: CustomWebAppItem[] = PRESET_CUSTOM_WEB_APPS;
  if (env.CUSTOM_WEB_APPS) {
    try {
      const arr = JSON.parse(env.CUSTOM_WEB_APPS);
      if (Array.isArray(arr)) parsedCustomWebApps = arr;
    } catch {}
  }

  let parsedIgnoredTools = DEFAULT_IGNORED_TOOLS;
  if (env.IGNORED_TOOLS) {
    try {
      const arr = JSON.parse(env.IGNORED_TOOLS);
      if (Array.isArray(arr)) parsedIgnoredTools = arr;
    } catch {
      parsedIgnoredTools = env.IGNORED_TOOLS.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  const baseConfig: WorkerRuntimeConfig = {
    geminiBaseUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    adminSecretKey: env.ADMIN_SECRET_KEY || '',
    logLevel: 'info',
    upstreamTimeoutMs: parseInt(env.UPSTREAM_TIMEOUT_MS || '180000', 10),
    timeZone: env.TIME_ZONE || 'Asia/Shanghai',
    enableUi: env.ENABLE_UI !== 'false',
    systemRoleToInstruction: env.SYSTEM_ROLE_TO_INSTRUCTION === 'true',
    stripSystemFingerprints: env.STRIP_SYSTEM_FINGERPRINTS !== 'false',
    runtimeContextTag: env.RUNTIME_CONTEXT_TAG || 'system-context',
    logRetentionDays: parseInt(env.LOG_RETENTION_DAYS || '3', 10),
    countTokensModel: env.COUNT_TOKENS_MODEL || '',
    customSystemInstruction: env.CUSTOM_SYSTEM_INSTRUCTION || '',
    modelMappings: parsedModelMappings,
    upstreamServers: parseUpstreamServers(env.UPSTREAM_SERVERS || env.GEMINI_BASE_URL),
    customWebApps: parsedCustomWebApps,
    ignoredTools: parsedIgnoredTools,
    ephemeralUserMessages: env.EPHEMERAL_USER_MESSAGES ? JSON.parse(env.EPHEMERAL_USER_MESSAGES) : [],
    ephemeralSystemMessages: env.EPHEMERAL_SYSTEM_MESSAGES ? JSON.parse(env.EPHEMERAL_SYSTEM_MESSAGES) : []
  };

  // 2. Fetch runtime overrides from Cloudflare KV if configured
  if (env.CONFIG_KV) {
    try {
      const kvValue = await env.CONFIG_KV.get('runtime_config', 'json');
      if (kvValue && typeof kvValue === 'object') {
        Object.assign(baseConfig, kvValue);
      }
    } catch (err) {
      console.warn('[WorkerConfig] Failed to fetch runtime_config from KV:', err);
    }
  }

  cachedConfig = baseConfig;
  lastFetchTime = now;
  return baseConfig;
}

export async function updateWorkerConfig(env: WorkerEnv, partial: Partial<WorkerRuntimeConfig>): Promise<WorkerRuntimeConfig> {
  const current = await getWorkerConfig(env);
  const updated = { ...current, ...partial };

  if (env.CONFIG_KV) {
    await env.CONFIG_KV.put('runtime_config', JSON.stringify(updated));
  }

  cachedConfig = updated;
  lastFetchTime = Date.now();
  return updated;
}
