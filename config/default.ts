import * as dotenv from 'dotenv';
import * as path from 'path';
import { existsSync, readFileSync, promises as fs } from 'fs';
import { ModelMappingsConfig, CustomWebAppItem, DiscoverAppItem, UpstreamServerConfig, UpstreamServerType } from '../src/types';

dotenv.config();

export const DEFAULT_BUILTIN_DISCOVER_APPS: DiscoverAppItem[] = [
  {
    id: 'systemLogs',
    type: 'builtin',
    name: '系统日志',
    description: '实时查看服务端运行日志与请求事件',
    icon: 'FileText',
    color: 'from-blue-500 to-cyan-600',
    badge: 'SSE STREAM',
    enabled: true,
    order: 0,
  },
  {
    id: 'playground',
    type: 'builtin',
    name: '接口演练',
    description: '在线测试 Gemini API 对话与流式调用',
    icon: 'Play',
    color: 'from-orange-500 to-amber-600',
    badge: 'REST & STREAM',
    enabled: true,
    order: 1,
  },
  {
    id: 'translate',
    type: 'builtin',
    name: '双语对照',
    description: '双栏对照沉浸式翻译与提示词调优',
    icon: 'Languages',
    color: 'from-indigo-500 to-purple-600',
    badge: 'BILINGUAL',
    enabled: true,
    order: 2,
  },
  {
    id: 'tasks',
    type: 'builtin',
    name: '在线事项',
    description: '轻量高效的待办清单与状态看板，云端实时同步',
    icon: 'CheckSquare',
    color: 'from-emerald-500 to-teal-600',
    badge: 'KANBAN & LIST',
    enabled: true,
    order: 3,
  },
];

export function mergeBuiltinDiscoverApps(existingApps: DiscoverAppItem[]): DiscoverAppItem[] {
  if (!Array.isArray(existingApps) || existingApps.length === 0) {
    return existingApps;
  }
  const result = [...existingApps];
  for (const builtin of DEFAULT_BUILTIN_DISCOVER_APPS) {
    const found = result.some(a => a.id === builtin.id);
    if (!found) {
      const lastBuiltinIdx = result
        .map((a, i) => (a.type === 'builtin' ? i : -1))
        .filter(i => i >= 0)
        .pop();
      if (lastBuiltinIdx !== undefined && lastBuiltinIdx >= 0) {
        result.splice(lastBuiltinIdx + 1, 0, { ...builtin });
      } else {
        result.unshift({ ...builtin });
      }
    }
  }
  return result.map((a, idx) => ({ ...a, order: idx }));
}

export function buildDefaultDiscoverApps(customApps: CustomWebAppItem[] = []): DiscoverAppItem[] {
  const builtin = DEFAULT_BUILTIN_DISCOVER_APPS.map((item, index) => ({
    ...item,
    order: index,
  }));
  const customItems: DiscoverAppItem[] = (customApps || []).map((item, index) => ({
    id: item.id,
    type: 'custom',
    name: item.name,
    icon: item.icon || 'Globe',
    color: item.color || 'from-orange-500 to-amber-600',
    badge: item.useGateway ? 'GW PROXY' : undefined,
    enabled: true,
    order: builtin.length + index,
    url: item.url,
    useGateway: item.useGateway,
    createdAt: item.createdAt,
  }));
  return [...builtin, ...customItems];
}

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

let parsedDiscoverApps: DiscoverAppItem[] | undefined;
if (process.env.DISCOVER_APPS) {
  try {
    const parsed = JSON.parse(process.env.DISCOVER_APPS);
    if (Array.isArray(parsed)) {
      parsedDiscoverApps = parsed;
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
    delete runtimeOverrides.geminiBaseUrl;
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
      let url = String(item.url || '').trim();
      let paramPart = '';
      const hashIdx = url.indexOf('#');
      if (hashIdx !== -1) {
        paramPart = url.slice(hashIdx + 1).trim();
        url = url.slice(0, hashIdx).trim();
      }
      url = url.replace(/\/+$/, '');
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
      let proxyUrl = item.proxyUrl && typeof item.proxyUrl === 'string' && item.proxyUrl.trim() ? item.proxyUrl.trim() : undefined;
      let useProxy = item.useProxy !== undefined
        ? Boolean(item.useProxy)
        : (item.proxyUrl ? true : undefined);

      if (paramPart) {
        const params = new URLSearchParams(paramPart);
        if (useProxy === undefined && params.has('useProxy')) {
          useProxy = params.get('useProxy') === 'true';
        }
        if (!proxyUrl) {
          const proxyParam = params.get('proxyUrl') || params.get('proxy');
          if (proxyParam) {
            proxyUrl = decodeURIComponent(proxyParam);
            if (useProxy === undefined) {
              useProxy = true;
            }
          }
        }
      }

      const res: UpstreamServerConfig = { url, weight, enabled, type };
      if (name) res.name = name;
      if (allowedModels) res.allowedModels = allowedModels;
      if (apiKeys) res.apiKeys = apiKeys;
      if (proxyUrl) res.proxyUrl = proxyUrl;
      if (useProxy !== undefined) res.useProxy = useProxy;
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
      let proxyUrl: string | undefined = undefined;
      let useProxy: boolean | undefined = undefined;

      if (paramPart) {
        const params = new URLSearchParams(paramPart);
        const typeParam = params.get('type');
        if (typeParam === 'direct') {
          type = 'direct';
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

        const proxyParam = params.get('proxyUrl') || params.get('proxy');
        if (proxyParam) {
          proxyUrl = decodeURIComponent(proxyParam);
        }

        if (params.has('useProxy')) {
          useProxy = params.get('useProxy') === 'true';
        } else if (proxyUrl) {
          useProxy = true;
        }
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
      if (proxyUrl) res.proxyUrl = proxyUrl;
      if (useProxy !== undefined) res.useProxy = useProxy;
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
  return {
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
    discoverApps: (parsedDiscoverApps || buildDefaultDiscoverApps(parsedCustomWebApps)) as DiscoverAppItem[],
    stripSystemFingerprints: process.env.STRIP_SYSTEM_FINGERPRINTS !== 'false',
    ignoredTools: (runtimeOverrides.ignoredTools !== undefined ? runtimeOverrides.ignoredTools : parsedIgnoredTools) as string[],
    proxyUrl: (process.env.GLOBAL_PROXY_URL || process.env.PROXY_URL || '') as string,
  };
};

export const config = {
  port: process.env.PORT || 8001,
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  adminSecretKey: process.env.ADMIN_SECRET_KEY || '',
  enableUi: process.env.ENABLE_UI !== 'false',

  ...getEnvConfig(),
  ...runtimeOverrides,

  get geminiBaseUrl(): string {
    const servers = this.upstreamServers;
    if (servers && servers.length > 0) {
      return servers.map(s => s.url).join(',');
    }
    return normalizeBaseUrls(process.env.GEMINI_BASE_URL);
  },

  set geminiBaseUrl(val: string) {
    this.upstreamServers = parseUpstreamServers(val);
  },

  get upstreamServers(): UpstreamServerConfig[] {
    if ((this as any)._upstreamServers !== undefined) {
      return (this as any)._upstreamServers;
    }
    if (runtimeOverrides.upstreamServers !== undefined) {
      return parseUpstreamServers(runtimeOverrides.upstreamServers);
    }
    return parseUpstreamServers(process.env.GEMINI_BASE_URL);
  },

  set upstreamServers(val: UpstreamServerConfig[]) {
    const servers = parseUpstreamServers(val);
    (this as any)._upstreamServers = servers;
    delete (this as any)._geminiBaseUrl;
    delete runtimeOverrides.geminiBaseUrl;
    if (runtimeOverrides.upstreamServers !== undefined) {
      runtimeOverrides.upstreamServers = servers;
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
  },

  get proxyUrl(): string {
    if ((this as any)._proxyUrl !== undefined) {
      return (this as any)._proxyUrl;
    }
    if (runtimeOverrides.proxyUrl !== undefined) {
      return runtimeOverrides.proxyUrl;
    }
    return (process.env.GLOBAL_PROXY_URL || process.env.PROXY_URL || '') as string;
  },

  set proxyUrl(val: string) {
    (this as any)._proxyUrl = val;
    if (runtimeOverrides.proxyUrl !== undefined) {
      runtimeOverrides.proxyUrl = val;
    }
  },

  get discoverApps(): DiscoverAppItem[] {
    if ((this as any)._discoverApps !== undefined) {
      return (this as any)._discoverApps;
    }
    if (runtimeOverrides.discoverApps !== undefined && Array.isArray(runtimeOverrides.discoverApps)) {
      return mergeBuiltinDiscoverApps(runtimeOverrides.discoverApps);
    }
    if (process.env.DISCOVER_APPS) {
      try {
        const parsed = JSON.parse(process.env.DISCOVER_APPS);
        if (Array.isArray(parsed)) return mergeBuiltinDiscoverApps(parsed);
      } catch {
        // ignore
      }
    }
    return buildDefaultDiscoverApps(this.customWebApps);
  },

  set discoverApps(val: DiscoverAppItem[]) {
    (this as any)._discoverApps = val;
    if (runtimeOverrides.discoverApps !== undefined) {
      runtimeOverrides.discoverApps = val;
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
    delete (config as any)._proxyUrl;
    delete (config as any)._discoverApps;
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

  // Ensure legacy geminiBaseUrl is stripped from runtimeOverrides
  delete runtimeOverrides.geminiBaseUrl;
  delete (config as any)._geminiBaseUrl;

  if (partialConfig.upstreamServers !== undefined) {
    const servers = parseUpstreamServers(partialConfig.upstreamServers);
    partialConfig.upstreamServers = servers;
    delete partialConfig.geminiBaseUrl;
  } else if (partialConfig.geminiBaseUrl !== undefined) {
    if (typeof partialConfig.geminiBaseUrl === 'string') {
      let raw = partialConfig.geminiBaseUrl.trim();
      if (!raw) {
        raw = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
      }
      partialConfig.upstreamServers = parseUpstreamServers(raw);
    }
    delete partialConfig.geminiBaseUrl;
  }

  if (partialConfig.stripSystemFingerprints !== undefined) {
    const rawVal = partialConfig.stripSystemFingerprints as unknown;
    partialConfig.stripSystemFingerprints = rawVal === true || rawVal === 'true';
  }

  if (partialConfig.proxyUrl !== undefined) {
    partialConfig.proxyUrl = typeof partialConfig.proxyUrl === 'string' ? partialConfig.proxyUrl.trim() : '';
  }

  if (partialConfig.discoverApps !== undefined) {
    if (Array.isArray(partialConfig.discoverApps)) {
      const normalized = partialConfig.discoverApps.map((item, idx) => ({
        ...item,
        order: idx,
      }));
      partialConfig.discoverApps = normalized;
      const customApps = normalized
        .filter(a => a.type === 'custom')
        .map(a => ({
          id: a.id,
          name: a.name,
          url: a.url || '',
          icon: a.icon || 'Globe',
          color: a.color || 'from-orange-500 to-amber-600',
          useGateway: !!a.useGateway,
          createdAt: a.createdAt || Date.now(),
        }));
      partialConfig.customWebApps = customApps;
    }
  } else if (partialConfig.customWebApps !== undefined) {
    delete (config as any)._discoverApps;
    if (runtimeOverrides.discoverApps && Array.isArray(runtimeOverrides.discoverApps)) {
      const builtinApps = runtimeOverrides.discoverApps.filter((a: DiscoverAppItem) => a.type === 'builtin');
      const customItems: DiscoverAppItem[] = partialConfig.customWebApps.map((item, index) => {
        const existing = runtimeOverrides.discoverApps.find((a: DiscoverAppItem) => a.id === item.id);
        return {
          id: item.id,
          type: 'custom',
          name: item.name,
          icon: item.icon || 'Globe',
          color: item.color || 'from-orange-500 to-amber-600',
          badge: item.useGateway ? 'GW PROXY' : undefined,
          enabled: existing ? existing.enabled : true,
          order: existing ? existing.order : builtinApps.length + index,
          url: item.url,
          useGateway: item.useGateway,
          createdAt: item.createdAt,
        };
      });
      partialConfig.discoverApps = [...builtinApps, ...customItems]
        .sort((a, b) => a.order - b.order)
        .map((a, idx) => ({ ...a, order: idx }));
    }
  }

  // Record only explicit keys, ensuring geminiBaseUrl is never saved in runtimeOverrides
  Object.assign(runtimeOverrides, partialConfig);
  delete runtimeOverrides.geminiBaseUrl;
  Object.assign(config, partialConfig);
  delete (config as any)._geminiBaseUrl;

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
