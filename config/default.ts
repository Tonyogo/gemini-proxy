import * as dotenv from 'dotenv';
import * as path from 'path';
import { existsSync, readFileSync, promises as fs } from 'fs';

dotenv.config();

let parsedModelMappings: Record<string, string> = {};
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

const isTestEnv = process.env.NODE_ENV === 'test';
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

const getEnvConfig = () => ({
  logLevel: (process.env.LOG_LEVEL || 'info') as string,
  modelMappings: parsedModelMappings as Record<string, string>,
  ephemeralUserMessages: parsedEphemeralUserMessages as string[],
  ephemeralSystemMessages: parsedEphemeralSystemMessages as string[],
  customSystemInstruction: (process.env.CUSTOM_SYSTEM_INSTRUCTION || '') as string,
  systemRoleToInstruction: (process.env.SYSTEM_ROLE_TO_INSTRUCTION === 'true') as boolean,
  runtimeContextTag: (process.env.RUNTIME_CONTEXT_TAG || 'runtime-context') as string,
  upstreamTimeoutMs: parseInt(process.env.UPSTREAM_TIMEOUT_MS || '180000', 10) as number,
  timeZone: (process.env.TIME_ZONE || process.env.TZ || 'Asia/Shanghai') as string,
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || '3', 10) as number,
  countTokensModel: (process.env.COUNT_TOKENS_MODEL || '') as string
});

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
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
