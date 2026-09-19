import * as dotenv from 'dotenv';
import * as path from 'path';
import { existsSync, readFileSync, promises as fs } from 'fs';
import { ModelMappingsConfig, CustomWebAppItem } from '../src/types';

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

const parseListEnv = (envVal: string | undefined, defaultVal: string[]): string[] => {
  if (!envVal) return defaultVal;
  try {
    const parsed = JSON.parse(envVal);
    if (Array.isArray(parsed)) {
      return parsed.map((s: any) => String(s));
    }
  } catch {
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

export function normalizeBaseUrls(raw?: string): string {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return 'https://generativelanguage.googleapis.com';
  }
  const parts = raw
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map(s => (/^https?:\/\//i.test(s) ? s : `https://${s}`));
  return parts.length > 0 ? parts.join(',') : 'https://generativelanguage.googleapis.com';
}

export function parseBaseUrls(raw?: string): string[] {
  const normalized = normalizeBaseUrls(raw);
  return normalized.split(',').map(s => s.trim()).filter(Boolean);
}

const getEnvConfig = () => ({
  geminiBaseUrl: normalizeBaseUrls(process.env.GEMINI_BASE_URL),
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
  customWebApps: parsedCustomWebApps as CustomWebAppItem[]
});

export const config = {
  port: process.env.PORT || 3000,
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  adminSecretKey: process.env.ADMIN_SECRET_KEY || '',
  enableUi: process.env.ENABLE_UI !== 'false',

  ...getEnvConfig(),
  ...runtimeOverrides
};

export async function updateConfig(
  partialConfig: Partial<typeof config>,
  options?: { resetToEnv?: boolean }
): Promise<void> {
  if (options?.resetToEnv) {
    runtimeOverrides = {};
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

  if (partialConfig.geminiBaseUrl !== undefined) {
    if (typeof partialConfig.geminiBaseUrl === 'string') {
      let raw = partialConfig.geminiBaseUrl.trim();
      if (!raw) {
        raw = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
      }
      partialConfig.geminiBaseUrl = normalizeBaseUrls(raw);
    }
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
