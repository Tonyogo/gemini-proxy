import * as dotenv from 'dotenv';
import * as path from 'path';
import { existsSync, readFileSync, promises as fs } from 'fs';
import { ModelMappingsConfig, CustomWebAppItem, UpstreamServerConfig, UpstreamServerType } from '../src/types';

dotenv.config();

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

let parsedCustomWebApps: CustomWebAppItem[] = PRESET_CUSTOM_WEB_APPS;
if (process.env.CUSTOM_WEB_APPS) {
  try {
    const parsed = JSON.parse(process.env.CUSTOM_WEB_APPS);
    if (Array.isArray(parsed)) {
      parsedCustomWebApps = parsed;
    }
  } catch (err) {
    // Falls back to defaults
  }
}

let parsedModelMappings: ModelMappingsConfig = {};
if (process.env.MODEL_MAPPINGS) {
  try {
    parsedModelMappings = JSON.parse(process.env.MODEL_MAPPINGS);
  } catch (err) {
    // Falls back to defaults
  }
}

export const DEFAULT_IGNORED_TOOLS: string[] = [
  'Artifact',
  'ArtifactCheck',
  'ArtifactData',
  'ArtifactComments'
];

const parseListEnv = (envVal: string | undefined, defaultVal: string[], allowComma: boolean = false): string[] => {
  if (!envVal) return defaultVal;
  try {
    const parsed = JSON.parse(envVal);
    if (Array.isArray(parsed)) {
      return parsed.map((s: any) => String(s));
    }
  } catch {
    if (allowComma && envVal.includes(',')) {
      return envVal.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    }
    return envVal.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return defaultVal;
};

const parsedEphemeralUserMessages = parseListEnv(
  process.env.EPHEMERAL_USER_MESSAGES,
  ["[Your previous response had no visible output. Please continue and produce a user-visible response.]"]
);

const parsedEphemeralSystemMessages = parseListEnv(
  process.env.EPHEMERAL_SYSTEM_MESSAGES,
  []
);

const parsedIgnoredTools = parseListEnv(
  process.env.IGNORED_TOOLS,
  DEFAULT_IGNORED_TOOLS,
  true
);

const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.JEST_WORKER_ID);
const runtimeFileName = isTestEnv ? 'runtime.test.json' : 'runtime.json';
const runtimeJsonPath = path.join(process.cwd(), 'config', runtimeFileName);
let runtimeOverrides: Record<string, any> = {};

if (existsSync(runtimeJsonPath)) {
  try {
    const raw = readFileSync(runtimeJsonPath, 'utf8');
    runtimeOverrides = JSON.parse(raw);
  } catch {
    // Ignore corrupted file
  }
}

function sanitizeModelList(models?: any): string[] | undefined {
  if (!models) return undefined;
  if (Array.isArray(models)) {
    const list = Array.from(new Set(models.map(m => String(m || '').trim()).filter(Boolean)));
    return list.length > 0 ? list : undefined;
  }
  if (typeof models === 'string') {
    const list = Array.from(new Set(models.split(/[+,|\s]+/).map(m => m.trim()).filter(Boolean)));
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

function sanitizeApiKeys(keys?: any): string[] | undefined {
  if (!keys) return undefined;
  if (Array.isArray(keys)) {
    const list = Array.from(new Set(keys.map(k => String(k || '').trim()).filter(Boolean)));
    return list.length > 0 ? list : undefined;
  }
  if (typeof keys === 'string') {
    const list = Array.from(new Set(keys.split(/[+,|\r\n\s]+/).map(k => k.trim()).filter(Boolean)));
    return list.length > 0 ? list : undefined;
  }
  return undefined;
}

export function parseUpstreamServers(raw?: any): UpstreamServerConfig[] {
  const defaultFallback: UpstreamServerConfig[] = [
    { url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API', type: 'proxy' }
  ];

  if (!raw) return defaultFallback;

  // 1. JSON Array input
  if (Array.isArray(raw)) {
    const list = raw.map(item => {
      if (!item || typeof item !== 'object') return null;
      const type: UpstreamServerType = item.type === 'direct' ? 'direct' : 'proxy';
      const agentId = (type === 'direct' && item.agentId) ? String(item.agentId).trim() : undefined;
      let url = String(item.url || '').trim().replace(/\/+$/, '');
      if (type === 'direct' && !url) {
        url = 'https://generativelanguage.googleapis.com';
      }
      if (!url) return null;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      let weight = parseInt(String(item.weight), 10);
      if (isNaN(weight) || weight < 1) weight = 1;
      if (weight > 1000) weight = 1000;
      const enabled = item.enabled !== false;
      const name = item.name ? String(item.name).trim() : undefined;
      const allowedModels = sanitizeModelList(item.allowedModels);
      const apiKeys = sanitizeApiKeys(item.apiKeys || item.keys);
      const res: UpstreamServerConfig = { url, weight, enabled, type };
      if (name) res.name = name;
      if (allowedModels) res.allowedModels = allowedModels;
      if (apiKeys) res.apiKeys = apiKeys;
      if (agentId) res.agentId = agentId;
      return res;
    }).filter(Boolean) as UpstreamServerConfig[];

    return list.length > 0 ? list : defaultFallback;
  }

  // 2. String input (comma separated, with optional #params)
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return defaultFallback;

    // Check if it's a JSON string representation of an array
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseUpstreamServers(parsed);
        }
      } catch {
        // Fall back to comma-separated parsing
      }
    }

    const segments = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    const list = segments.map(seg => {
      const hashIdx = seg.indexOf('#');
      let basePart = hashIdx !== -1 ? seg.slice(0, hashIdx).trim() : seg;
      const paramPart = hashIdx !== -1 ? seg.slice(hashIdx + 1).trim() : '';

      basePart = basePart.replace(/\/+$/, '');

      let weight = 1;
      let enabled = true;
      let name: string | undefined = undefined;
      let allowedModels: string[] | undefined = undefined;
      let type: UpstreamServerType = 'proxy';
      let apiKeys: string[] | undefined = undefined;
      let agentId: string | undefined = undefined;

      if (paramPart) {
        const params = new URLSearchParams(paramPart);
        const typeParam = params.get('type');
        if (typeParam === 'direct') {
          type = 'direct';
        }

        const agentParam = params.get('agentId') || params.get('agent');
        if (agentParam) {
          agentId = decodeURIComponent(agentParam).trim();
        }

        const wStr = params.get('weight') || params.get('percent');
        if (wStr !== null) {
          const w = parseInt(wStr, 10);
          if (!isNaN(w)) weight = Math.max(1, Math.min(1000, w));
        }

        if (params.has('disabled') || params.get('enabled') === 'false') {
          enabled = false;
        }

        const nameParam = params.get('name');
        if (nameParam) {
          name = decodeURIComponent(nameParam);
        }

        const modelsParam = params.get('models') || params.get('allowedModels');
        if (modelsParam !== null) {
          allowedModels = sanitizeModelList(modelsParam);
        }

        const keysParam = params.get('keys') || params.get('apiKeys');
        if (keysParam !== null) {
          apiKeys = sanitizeApiKeys(keysParam);
        }
      }

      if (type !== 'direct') {
        agentId = undefined;
      }

      if (type === 'direct' && !basePart) {
        basePart = 'https://generativelanguage.googleapis.com';
      }
      if (!basePart) return null;
      if (!/^https?:\/\//i.test(basePart)) basePart = `https://${basePart}`;

      const res: UpstreamServerConfig = { url: basePart, weight, enabled, type };
      if (name) res.name = name;
      if (allowedModels) res.allowedModels = allowedModels;
      if (apiKeys) res.apiKeys = apiKeys;
      if (agentId) res.agentId = agentId;
      return res;
    }).filter(Boolean) as UpstreamServerConfig[];

    return list.length > 0 ? list : defaultFallback;
  }

  return defaultFallback;
}

export function normalizeBaseUrls(raw?: string): string {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return 'https://generativelanguage.googleapis.com';
  }
  const servers = parseUpstreamServers(raw);
  return servers.map(s => s.url).join(',');
}

export function parseBaseUrls(raw?: string): string[] {
  const normalized = normalizeBaseUrls(raw);
  return normalized.split(',').map(s => s.trim()).filter(Boolean);
}

const getEnvConfig = () => {
  const envServers = parseUpstreamServers(process.env.GEMINI_BASE_URL);
  return {
    geminiBaseUrl: envServers.map(s => s.url).join(','),
    logLevel: (process.env.LOG_LEVEL || 'info') as string,
    modelMappings: parsedModelMappings as ModelMappingsConfig,
    ephemeralUserMessages: parsedEphemeralUserMessages as string[],
    ephemeralSystemMessages: parsedEphemeralSystemMessages as string[],
    customSystemInstruction: (process.env.CUSTOM_SYSTEM_INSTRUCTION || '') as string,
    systemRoleToInstruction: (process.env.SYSTEM_ROLE_TO_INSTRUCTION === 'true') as boolean,
    runtimeContextTag: (process.env.RUNTIME_CONTEXT_TAG || 'system-context') as string,
    upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS || '180000', 10) as number,
    timeZone: (process.env.TIME_ZONE || process.env.TZ || 'Asia/Shanghai') as string,
    logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '3', 10) as number,
    countTokensModel: (process.env.COUNT_TOKENS_MODEL || '') as string,
    customWebApps: parsedCustomWebApps as CustomWebAppItem[],
    stripSystemFingerprints: process.env.STRIP_SYSTEM_FINGERPRINTS !== 'false',
    ignoredTools: (runtimeOverrides.ignoredTools !== undefined ? runtimeOverrides.ignoredTools : parsedIgnoredTools) as string[],
  };
};

export const config = {
  port: process.env.PORT || 3000,
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  adminSecretKey: process.env.ADMIN_SECRET_KEY || '',
  enableUi: process.env.ENABLE_UI !== 'false',

  ...getEnvConfig(),
  ...runtimeOverrides,


  get geminiBaseUrl(): string {
    if ((this as any)._geminiBaseUrl !== undefined) {
      return (this as any)._geminiBaseUrl;
    }
    if (runtimeOverrides.geminiBaseUrl !== undefined) {
      return runtimeOverrides.geminiBaseUrl;
    }
    return normalizeBaseUrls(process.env.GEMINI_BASE_URL);
  },

  set geminiBaseUrl(val: string) {
    (this as any)._geminiBaseUrl = val;
    const currentUrls = ((this as any)._upstreamServers || []).map((s: any) => s.url).join(',');
    const newServers = parseUpstreamServers(val);
    const newUrls = newServers.map(s => s.url).join(',');
    if (currentUrls !== newUrls) {
      (this as any)._upstreamServers = newServers;
      if (runtimeOverrides.upstreamServers !== undefined) {
        delete runtimeOverrides.upstreamServers;
      }
    }
    if (runtimeOverrides.geminiBaseUrl !== undefined) {
      runtimeOverrides.geminiBaseUrl = val;
    }
  },

  get upstreamServers(): UpstreamServerConfig[] {
    if ((this as any)._upstreamServers !== undefined) {
      return (this as any)._upstreamServers;
    }
    if (runtimeOverrides.upstreamServers !== undefined) {
      return parseUpstreamServers(runtimeOverrides.upstreamServers);
    }
    return parseUpstreamServers(this.geminiBaseUrl);
  },

  set upstreamServers(val: UpstreamServerConfig[]) {
    const servers = parseUpstreamServers(val);
    (this as any)._upstreamServers = servers;
    (this as any)._geminiBaseUrl = servers.map(s => s.url).join(',');
    if (runtimeOverrides.upstreamServers !== undefined) {
      runtimeOverrides.upstreamServers = servers;
    }
    if (runtimeOverrides.geminiBaseUrl !== undefined) {
      runtimeOverrides.geminiBaseUrl = servers.map(s => s.url).join(',');
    }
  },

  get ignoredTools(): string[] {
    if ((this as any)._ignoredTools !== undefined) {
      return (this as any)._ignoredTools;
    }
    if (runtimeOverrides.ignoredTools !== undefined) {
      return runtimeOverrides.ignoredTools;
    }
    return parseListEnv(process.env.IGNORED_TOOLS, DEFAULT_IGNORED_TOOLS, true);
  },

  set ignoredTools(val: string[]) {
    (this as any)._ignoredTools = val;
    if (runtimeOverrides.ignoredTools !== undefined) {
      runtimeOverrides.ignoredTools = val;
    }
  }
};

export async function updateConfig(
  partialConfig: Partial<typeof config>,
  options?: { resetToEnv?: boolean }
): Promise<void> {
  if (options?.resetToEnv) {
    runtimeOverrides = {};
    delete (config as any)._geminiBaseUrl;
    delete (config as any)._upstreamServers;
    delete (config as any)._ignoredTools;
    const envDefaults = getEnvConfig();
    Object.assign(config, envDefaults);

    try {
      if (existsSync(runtimeJsonPath)) {
        await fs.unlink(runtimeJsonPath);
      }
    } catch {
      // ignore
    }
    return;
  }

  if (partialConfig.upstreamServers !== undefined) {
    const servers = parseUpstreamServers(partialConfig.upstreamServers);
    partialConfig.upstreamServers = servers;
    if (partialConfig.geminiBaseUrl === undefined) {
      partialConfig.geminiBaseUrl = servers.map(s => s.url).join(',');
    }
  } else if (partialConfig.geminiBaseUrl !== undefined) {
    if (typeof partialConfig.geminiBaseUrl === 'string') {
      let raw = partialConfig.geminiBaseUrl.trim();
      if (!raw) {
        raw = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
      }
      const parsedServers = parseUpstreamServers(raw);
      partialConfig.geminiBaseUrl = parsedServers.map(s => s.url).join(',');
      partialConfig.upstreamServers = parsedServers;
    }
  }

  if (partialConfig.stripSystemFingerprints !== undefined) {
    const rawVal = partialConfig.stripSystemFingerprints as unknown;
    partialConfig.stripSystemFingerprints = rawVal === true || rawVal === 'true';
  }

  // Record only explicit keys
  Object.assign(runtimeOverrides, partialConfig);
  Object.assign(config, partialConfig);

  try {
    if (Object.keys(runtimeOverrides).length > 0) {
      await fs.writeFile(runtimeJsonPath, JSON.stringify(runtimeOverrides, null, 2), 'utf8');
    } else if (existsSync(runtimeJsonPath)) {
      await fs.unlink(runtimeJsonPath);
    }
  } catch {
    // Write failure non-fatal
  }
}

export default config;
