import { Hono } from 'hono';
import { WorkerEnv, WorkerConfig } from '../../env';
import { getConfig, updateConfig, clearConfigCache } from '../../config/configManager';
import {
  listAuditLogs,
  getAuditLog,
  deleteAuditLog,
} from '../services/r2LoggerService';
import { getKeyStatesSummary, parseKeys } from '../../proxy/services/upstreamService';
import { maskApiKey } from '../../utils/requestHelper';

export const adminRoutes = new Hono<{ Bindings: WorkerEnv }>();

function formatConfigResponse(config: WorkerConfig) {
  const baseUrl = config.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  return {
    ...config,
    logLevel: config.LOG_LEVEL,
    geminiBaseUrl: baseUrl,
    geminiBaseUrls: [baseUrl],
    upstreamServers: [
      {
        url: baseUrl,
        name: 'Cloudflare Edge Gateway',
        weight: 1,
        enabled: true,
        type: 'direct',
      },
    ],
    systemRoleToInstruction: config.SYSTEM_ROLE_TO_INSTRUCTION,
    stripSystemFingerprints: true,
    runtimeContextTag: config.RUNTIME_CONTEXT_TAG,
    upstreamTimeoutMs: config.UPSTREAM_TIMEOUT_MS,
    customSystemInstruction: config.CUSTOM_SYSTEM_INSTRUCTION,
    modelMappings: config.MODEL_MAPPINGS,
    enableUi: config.ENABLE_UI,
    timeZone: config.TIME_ZONE,
    logRetentionDays: config.LOG_RETENTION_DAYS,
    countTokensModel: 'gemini-2.5-flash',
    ephemeralUserMessages: config.EPHEMERAL_USER_MESSAGES,
    ephemeralSystemMessages: config.EPHEMERAL_SYSTEM_MESSAGES,
    customWebApps: config.CUSTOM_WEB_APPS,
    ignoredTools: config.IGNORED_TOOLS,
  };
}

// Admin authentication middleware
adminRoutes.use('*', async (c, next) => {
  const adminKey = c.req.header('x-admin-key') || c.req.query('x-admin-key') || c.req.query('key');
  const auth = c.req.header('authorization');
  const bearerKey = auth && auth.startsWith('Bearer ') ? auth.substring(7).trim() : null;
  const provided = adminKey || bearerKey;

  const expected = c.env.ADMIN_SECRET_KEY;
  if (!expected || provided !== expected) {
    return c.json({ error: 'Unauthorized: Invalid admin key' }, 401);
  }
  await next();
});

adminRoutes.get('/status', async (c) => {
  const config = await getConfig(c.env);
  const formattedConfig = formatConfigResponse(config);
  const baseUrl = config.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

  return c.json({
    status: 'ok',
    runtime: 'cloudflare-worker',
    timestamp: new Date().toISOString(),
    uptime: 0,
    hasKv: !!c.env.CONFIG_KV,
    hasR2: !!c.env.LOGS_BUCKET,
    hasAssets: !!c.env.ASSETS,
    config: formattedConfig,
    upstreamStatus: [
      {
        url: baseUrl,
        name: 'Cloudflare Edge Gateway',
        weight: 1,
        enabled: true,
        type: 'direct',
        circuitBreaker: {
          state: 'CLOSED',
          consecutiveFailures: 0,
        },
      },
    ],
  });
});

adminRoutes.get('/config', async (c) => {
  const config = await getConfig(c.env);
  return c.json(formatConfigResponse(config));
});

adminRoutes.post('/config', async (c) => {
  try {
    const updates = await c.req.json();
    if (updates.resetToEnv) {
      if (c.env.CONFIG_KV) {
        await c.env.CONFIG_KV.delete('runtime_config');
      }
      clearConfigCache();
      const fresh = await getConfig(c.env);
      return c.json(formatConfigResponse(fresh));
    }

    const normalizedUpdates: Partial<WorkerConfig> = {};
    if (updates.systemRoleToInstruction !== undefined) normalizedUpdates.SYSTEM_ROLE_TO_INSTRUCTION = Boolean(updates.systemRoleToInstruction);
    if (updates.SYSTEM_ROLE_TO_INSTRUCTION !== undefined) normalizedUpdates.SYSTEM_ROLE_TO_INSTRUCTION = Boolean(updates.SYSTEM_ROLE_TO_INSTRUCTION);
    if (updates.geminiBaseUrl !== undefined) normalizedUpdates.GEMINI_BASE_URL = String(updates.geminiBaseUrl);
    if (updates.GEMINI_BASE_URL !== undefined) normalizedUpdates.GEMINI_BASE_URL = String(updates.GEMINI_BASE_URL);
    if (updates.upstreamTimeoutMs !== undefined) normalizedUpdates.UPSTREAM_TIMEOUT_MS = Number(updates.upstreamTimeoutMs);
    if (updates.UPSTREAM_TIMEOUT_MS !== undefined) normalizedUpdates.UPSTREAM_TIMEOUT_MS = Number(updates.UPSTREAM_TIMEOUT_MS);
    if (updates.logLevel !== undefined) normalizedUpdates.LOG_LEVEL = String(updates.logLevel);
    if (updates.LOG_LEVEL !== undefined) normalizedUpdates.LOG_LEVEL = String(updates.LOG_LEVEL);
    if (updates.logRetentionDays !== undefined) normalizedUpdates.LOG_RETENTION_DAYS = Number(updates.logRetentionDays);
    if (updates.LOG_RETENTION_DAYS !== undefined) normalizedUpdates.LOG_RETENTION_DAYS = Number(updates.LOG_RETENTION_DAYS);
    if (updates.timeZone !== undefined) normalizedUpdates.TIME_ZONE = String(updates.timeZone);
    if (updates.TIME_ZONE !== undefined) normalizedUpdates.TIME_ZONE = String(updates.TIME_ZONE);
    if (updates.customSystemInstruction !== undefined) normalizedUpdates.CUSTOM_SYSTEM_INSTRUCTION = String(updates.customSystemInstruction);
    if (updates.CUSTOM_SYSTEM_INSTRUCTION !== undefined) normalizedUpdates.CUSTOM_SYSTEM_INSTRUCTION = String(updates.CUSTOM_SYSTEM_INSTRUCTION);
    if (updates.modelMappings !== undefined) normalizedUpdates.MODEL_MAPPINGS = updates.modelMappings;
    if (updates.MODEL_MAPPINGS !== undefined) normalizedUpdates.MODEL_MAPPINGS = updates.MODEL_MAPPINGS;
    if (updates.ignoredTools !== undefined) normalizedUpdates.IGNORED_TOOLS = updates.ignoredTools;
    if (updates.IGNORED_TOOLS !== undefined) normalizedUpdates.IGNORED_TOOLS = updates.IGNORED_TOOLS;
    if (updates.ephemeralUserMessages !== undefined) normalizedUpdates.EPHEMERAL_USER_MESSAGES = updates.ephemeralUserMessages;
    if (updates.EPHEMERAL_USER_MESSAGES !== undefined) normalizedUpdates.EPHEMERAL_USER_MESSAGES = updates.EPHEMERAL_USER_MESSAGES;
    if (updates.ephemeralSystemMessages !== undefined) normalizedUpdates.EPHEMERAL_SYSTEM_MESSAGES = updates.ephemeralSystemMessages;
    if (updates.EPHEMERAL_SYSTEM_MESSAGES !== undefined) normalizedUpdates.EPHEMERAL_SYSTEM_MESSAGES = updates.EPHEMERAL_SYSTEM_MESSAGES;
    if (updates.customWebApps !== undefined) normalizedUpdates.CUSTOM_WEB_APPS = updates.customWebApps;
    if (updates.CUSTOM_WEB_APPS !== undefined) normalizedUpdates.CUSTOM_WEB_APPS = updates.CUSTOM_WEB_APPS;

    const updated = await updateConfig(c.env, normalizedUpdates);
    return c.json(formatConfigResponse(updated));
  } catch (err: any) {
    return c.json({ error: 'Invalid config JSON' }, 400);
  }
});

adminRoutes.get('/models', async (c) => {
  const config = await getConfig(c.env);
  return c.json({
    mappings: config.MODEL_MAPPINGS,
    modelMappings: config.MODEL_MAPPINGS,
    defaultModels: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
  });
});

adminRoutes.get('/stats', async (c) => {
  return c.json({
    uptime: 0,
    activeConnections: 0,
    requestsTotal: 0,
    successTotal: 0,
    errorTotal: 0,
    timeSeries: [],
  });
});

adminRoutes.get('/logs', async (c) => {
  const date = c.req.query('date');
  const hour = c.req.query('hour');
  const logs = await listAuditLogs(c.env, date, hour);
  return c.json({ logs });
});

adminRoutes.get('/logs/:date/:hour/:filename', async (c) => {
  const { date, hour, filename } = c.req.param();
  const key = `logs/${date}/${hour}/${filename}`;
  const log = await getAuditLog(c.env, key);
  if (!log) {
    return c.json({ error: 'Log not found' }, 404);
  }
  return c.json(log);
});

adminRoutes.delete('/logs/:date/:hour/:filename', async (c) => {
  const { date, hour, filename } = c.req.param();
  const key = `logs/${date}/${hour}/${filename}`;
  const success = await deleteAuditLog(c.env, key);
  return c.json({ success });
});

// Multi-server & Accounts View endpoints
adminRoutes.get('/accounts/servers', async (c) => {
  const config = await getConfig(c.env);
  const keys = parseKeys(c.env);
  const baseUrl = config.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

  return c.json({
    servers: [baseUrl],
    serversMeta: [
      {
        url: baseUrl,
        name: 'Cloudflare Edge Gateway',
        weight: 1,
        enabled: true,
        type: 'direct',
        keyCount: keys.length,
        allowedModels: Object.keys(config.MODEL_MAPPINGS || {}),
      },
    ],
    circuits: [
      {
        url: baseUrl,
        serverUrl: baseUrl,
        name: 'Cloudflare Edge Gateway',
        enabled: true,
        weight: 1,
        type: 'direct',
        circuitBreaker: {
          state: 'CLOSED',
          consecutiveFailures: 0,
        },
      },
    ],
  });
});

adminRoutes.get('/accounts/status', async (c) => {
  const keys = parseKeys(c.env);
  const keyStates = getKeyStatesSummary();
  const stateMap = new Map(keyStates.map(s => [s.key, s]));

  let totalUsage = 0;
  let totalFailures = 0;
  const now = Date.now();

  const accountDetails = keys.map((key: string, idx: number) => {
    const maskedName = maskApiKey(key);
    const state = stateMap.get(key);
    const sCount = state?.successCount || 0;
    const fCount = state?.failCount || 0;
    totalUsage += sCount + fCount;
    totalFailures += fCount;
    const isCooldown = state ? state.cooldownUntil > now : false;

    return {
      index: idx,
      name: maskedName,
      status: isCooldown ? 'COOLDOWN' : 'ACTIVE',
      isDisabled: false,
      isInvalid: false,
      isDuplicate: false,
      isExpired: false,
      isRotation: keys.length > 1,
      hasContext: false,
      canonicalIndex: null,
      usage: {
        total: sCount + fCount,
        totalRequests: sCount + fCount,
        totalSuccess: sCount,
        totalError: fCount,
        byModel: {},
      },
    };
  });

  return c.json({
    isDirectMode: true,
    status: {
      isSystemBusy: false,
      streamingMode: 'DIRECT',
      usageCount: totalUsage,
      failureCount: totalFailures,
      accountDetails,
    },
  });
});

adminRoutes.get('/accounts/usage', async (c) => {
  return c.json({});
});

adminRoutes.post('/accounts/upload', async (c) => {
  return c.json({ error: 'Direct 模式仅支持环境变量或 KV 配置 GEMINI_API_KEYS' }, 400);
});

adminRoutes.post('/accounts/toggle-disabled', async (c) => {
  return c.json({ error: 'Direct 模式不支持此操作' }, 400);
});

adminRoutes.delete('/accounts/:index', async (c) => {
  return c.json({ error: 'Direct 模式不支持此操作' }, 400);
});

adminRoutes.post('/accounts/batch-delete', async (c) => {
  return c.json({ error: 'Direct 模式不支持此操作' }, 400);
});

adminRoutes.post('/accounts/deduplicate', async (c) => {
  return c.json({ error: 'Direct 模式不支持此操作' }, 400);
});

adminRoutes.put('/accounts/current', async (c) => {
  return c.json({ error: 'Direct 模式使用自动轮询' }, 400);
});

adminRoutes.post('/accounts/:index/close-context', async (c) => {
  return c.json({ error: 'Direct 模式无上下文管理' }, 400);
});

adminRoutes.get('/accounts/files/:filename', async (c) => {
  return c.json({ error: 'Direct 模式无文件存储' }, 404);
});

adminRoutes.get('/accounts', async (c) => {
  const accounts = getKeyStatesSummary();
  return c.json({ accounts });
});
