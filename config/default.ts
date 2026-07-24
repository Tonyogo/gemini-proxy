import * as dotenv from 'dotenv';
import * as path from 'path';
import { existsSync, readFileSync, promises as fs } from 'fs';

dotenv.config();

// Parse model mapping env var if provided, or default to standard fallback mappings
let parsedModelMappings: Record<string, string> = {
  // 'gemini-pro-latest': 'gemini-flash-latest' // Default fallback mapping
};

if (process.env.MODEL_MAPPINGS) {
  try {
    parsedModelMappings = JSON.parse(process.env.MODEL_MAPPINGS);
  } catch (err) {
    // Falls back to defaults if parsing fails
  }
}

const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.json');
let runtimeOverrides: Record<string, any> = {};

if (existsSync(runtimeJsonPath)) {
  try {
    const raw = readFileSync(runtimeJsonPath, 'utf8');
    runtimeOverrides = JSON.parse(raw);
  } catch {
    // Ignore corrupted file
  }
}

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  logLevel: (runtimeOverrides.logLevel || process.env.LOG_LEVEL || 'info') as string,
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  modelMappings: (runtimeOverrides.modelMappings || parsedModelMappings) as Record<string, string>,
  customSystemInstruction: (runtimeOverrides.customSystemInstruction !== undefined
    ? runtimeOverrides.customSystemInstruction
    : (process.env.CUSTOM_SYSTEM_INSTRUCTION || '')) as string,
  systemRoleToInstruction: (runtimeOverrides.systemRoleToInstruction !== undefined
    ? runtimeOverrides.systemRoleToInstruction
    : (process.env.SYSTEM_ROLE_TO_INSTRUCTION === 'true')) as boolean,
  runtimeContextTag: (runtimeOverrides.runtimeContextTag || process.env.RUNTIME_CONTEXT_TAG || 'runtime-context') as string,
  upstreamTimeoutMs: (runtimeOverrides.upstreamTimeoutMs || parseInt(process.env.UPSTREAM_TIMEOUT_MS || '180000', 10)) as number,
  allowedKeys: [] as string[],
  adminSecretKey: process.env.ADMIN_SECRET_KEY || '',
  enableUi: process.env.ENABLE_UI !== 'false',
  timeZone: (runtimeOverrides.timeZone || process.env.TIME_ZONE || process.env.TZ || 'Asia/Shanghai') as string
};

export async function updateConfig(partialConfig: Partial<typeof config>): Promise<void> {
  Object.assign(config, partialConfig);

  const persisableData = {
    logLevel: config.logLevel,
    modelMappings: config.modelMappings,
    customSystemInstruction: config.customSystemInstruction,
    systemRoleToInstruction: config.systemRoleToInstruction,
    runtimeContextTag: config.runtimeContextTag,
    upstreamTimeoutMs: config.upstreamTimeoutMs,
    timeZone: config.timeZone
  };

  try {
    await fs.writeFile(runtimeJsonPath, JSON.stringify(persisableData, null, 2), 'utf8');
  } catch {
    // Write failure non-fatal for in-memory mutation
  }
}

export default config;
