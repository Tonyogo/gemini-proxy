import { Hono } from 'hono';
import { WorkerEnv } from '../env';
import { getWorkerConfig, updateWorkerConfig } from '../config/workerConfig';
import { WorkerLogger } from '../services/workerLogger';
import { WorkerUpstreamManager } from '../services/workerUpstream';
import { maskApiKey } from '../utils/requestHelper';

const adminRouter = new Hono<{ Bindings: WorkerEnv }>();

/**
 * Admin Authentication Middleware
 */
adminRouter.use('*', async (c, next) => {
  const workerConfig = await getWorkerConfig(c.env);
  const secretKey = workerConfig.adminSecretKey;

  if (!secretKey) {
    return next();
  }

  const providedKey =
    c.req.header('x-admin-key') ||
    c.req.query('x-admin-key') ||
    c.req.query('key');

  if (providedKey !== secretKey) {
    return c.json({ error: 'Unauthorized: Invalid x-admin-key' }, 401);
  }

  return next();
});

/**
 * GET /api/admin/status
 */
adminRouter.get('/status', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const upstreamStatus = WorkerUpstreamManager.getStatusList(workerConfig);

  return c.json({
    status: 'ok',
    runtime: 'cloudflare-workers',
    config: {
      logLevel: workerConfig.logLevel,
      geminiBaseUrl: workerConfig.geminiBaseUrl,
      geminiBaseUrls: workerConfig.upstreamServers.map(s => s.url),
      upstreamServers: workerConfig.upstreamServers,
      systemRoleToInstruction: workerConfig.systemRoleToInstruction,
      stripSystemFingerprints: workerConfig.stripSystemFingerprints,
      runtimeContextTag: workerConfig.runtimeContextTag,
      upstreamTimeoutMs: workerConfig.upstreamTimeoutMs,
      customSystemInstruction: workerConfig.customSystemInstruction,
      modelMappings: workerConfig.modelMappings,
      enableUi: workerConfig.enableUi,
      timeZone: workerConfig.timeZone,
      logRetentionDays: workerConfig.logRetentionDays,
      countTokensModel: workerConfig.countTokensModel,
      ephemeralUserMessages: workerConfig.ephemeralUserMessages,
      ephemeralSystemMessages: workerConfig.ephemeralSystemMessages,
      customWebApps: workerConfig.customWebApps,
      ignoredTools: workerConfig.ignoredTools
    },
    upstreamStatus
  });
});

/**
 * GET /api/admin/models
 */
adminRouter.get('/models', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  return c.json({
    mappings: workerConfig.modelMappings
  });
});

/**
 * GET /api/admin/logs
 */
adminRouter.get('/logs', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const filterDate = c.req.query('date');
  const filterHour = c.req.query('hour');

  const result = await WorkerLogger.listLogs(c.env, page, limit, filterDate, filterHour);
  return c.json(result);
});

/**
 * GET /api/admin/logs/:date/:hour/:filename
 */
adminRouter.get('/logs/:date/:hour/:filename', async (c) => {
  const { date, hour, filename } = c.req.param();
  try {
    const detail = await WorkerLogger.getLogDetail(c.env, date, hour, filename);
    c.header('Cache-Control', 'public, max-age=3600, immutable');
    return c.json(detail);
  } catch {
    return c.json({ error: 'Log file not found' }, 404);
  }
});

/**
 * GET /api/admin/stats
 */
adminRouter.get('/stats', async (c) => {
  const rangeParam = c.req.query('range');
  let range: number | 'today' = 'today';
  if (rangeParam) {
    if (rangeParam === 'today') {
      range = 'today';
    } else {
      const parsed = parseInt(rangeParam, 10);
      if ([6, 12, 24, 48].includes(parsed)) {
        range = parsed;
      }
    }
  }

  const stats = await WorkerLogger.getStats(c.env, range);
  return c.json(stats);
});

/**
 * POST & PUT /api/admin/config
 */
const handleConfigUpdate = async (c: any) => {
  try {
    const newConfig = await c.req.json();
    if (newConfig.stripSystemFingerprints !== undefined) {
      newConfig.stripSystemFingerprints =
        newConfig.stripSystemFingerprints === true ||
        newConfig.stripSystemFingerprints === 'true';
    }
    if (newConfig.ignoredTools !== undefined) {
      let tools: string[] = [];
      if (typeof newConfig.ignoredTools === 'string') {
        tools = newConfig.ignoredTools
          .split(/[,\n]/)
          .map((s: string) => s.trim())
          .filter(Boolean);
      } else if (Array.isArray(newConfig.ignoredTools)) {
        tools = newConfig.ignoredTools.map((s: any) => String(s).trim()).filter(Boolean);
      }
      newConfig.ignoredTools = tools;
    }

    const updated = await updateWorkerConfig(c.env, newConfig);
    return c.json({
      status: 'ok',
      config: {
        logLevel: updated.logLevel,
        geminiBaseUrl: updated.geminiBaseUrl,
        upstreamServers: updated.upstreamServers,
        systemRoleToInstruction: updated.systemRoleToInstruction,
        stripSystemFingerprints: updated.stripSystemFingerprints,
        runtimeContextTag: updated.runtimeContextTag,
        upstreamTimeoutMs: updated.upstreamTimeoutMs,
        customSystemInstruction: updated.customSystemInstruction,
        modelMappings: updated.modelMappings,
        enableUi: updated.enableUi,
        timeZone: updated.timeZone,
        logRetentionDays: updated.logRetentionDays,
        countTokensModel: updated.countTokensModel,
        ephemeralUserMessages: updated.ephemeralUserMessages,
        ephemeralSystemMessages: updated.ephemeralSystemMessages,
        customWebApps: updated.customWebApps,
        ignoredTools: updated.ignoredTools
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
};

adminRouter.post('/config', handleConfigUpdate);
adminRouter.put('/config', handleConfigUpdate);

/**
 * Helpers for Accounts Management
 */
function getSelectedServer(workerConfig: any, serverIndexParam?: string | null) {
  const servers = workerConfig.upstreamServers || [];
  let idx = 0;
  if (serverIndexParam) {
    const parsed = parseInt(serverIndexParam, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < servers.length) {
      idx = parsed;
    }
  }
  return { server: servers[idx], serverIndex: idx };
}

async function proxyAccountRequest(
  server: any,
  path: string,
  method: string,
  data?: any,
  params?: Record<string, string>,
  adminSecretKey?: string
) {
  let url = `${server.url.replace(/\/+$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  if (params) {
    const sp = new URLSearchParams(params);
    const q = sp.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (adminSecretKey) {
    headers['Authorization'] = `Bearer ${adminSecretKey}`;
  }

  const options: RequestInit = {
    method: method.toUpperCase(),
    headers
  };
  if (data !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method!)) {
    options.body = JSON.stringify(data);
  }

  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  let resData: any;
  if (contentType.includes('application/json')) {
    try {
      resData = await res.json();
    } catch {
      resData = await res.text();
    }
  } else {
    resData = await res.text();
  }

  return { status: res.status, data: resData };
}

/**
 * GET /api/admin/accounts/servers
 */
adminRouter.get('/accounts/servers', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const statusList = WorkerUpstreamManager.getStatusList(workerConfig);

  return c.json({
    servers: workerConfig.upstreamServers.map(s => s.url),
    serversMeta: statusList.map(s => ({
      url: s.url,
      name: s.name,
      weight: s.weight,
      enabled: s.enabled,
      type: s.type || 'proxy',
      keyCount: s.apiKeys?.length || 0,
      allowedModels: s.allowedModels
    })),
    circuits: statusList.map(s => ({
      ...s,
      serverUrl: s.url
    }))
  });
});

/**
 * GET /api/admin/accounts/status
 */
adminRouter.get('/accounts/status', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server, serverIndex } = getSelectedServer(workerConfig, serverIdParam);

  if (server && server.type === 'direct') {
    const keys = server.apiKeys || [];
    const accountDetails = keys.map((key: string, idx: number) => {
      const maskedName = maskApiKey(key);
      return {
        index: idx,
        name: maskedName,
        status: 'ACTIVE',
        isDisabled: false,
        isInvalid: false,
        isDuplicate: false,
        isExpired: false,
        isRotation: false,
        hasContext: false,
        canonicalIndex: null,
        usage: {
          total: 0,
          totalRequests: 0,
          totalSuccess: 0,
          totalError: 0,
          byModel: {}
        }
      };
    });

    return c.json({
      isDirectMode: true,
      status: {
        isSystemBusy: false,
        streamingMode: 'DIRECT',
        usageCount: 0,
        failureCount: 0,
        accountDetails
      }
    });
  }

  // Proxy to upstream server
  if (server) {
    try {
      const result = await proxyAccountRequest(server, '/api/status', 'GET', undefined, undefined, workerConfig.adminSecretKey);
      return c.json(result.data, result.status as any);
    } catch (err: any) {
      return c.json({ error: `Failed to query upstream account status: ${err.message}` }, 502);
    }
  }

  return c.json({ status: { accountDetails: [] } });
});

/**
 * GET /api/admin/accounts/usage
 */
adminRouter.get('/accounts/usage', async (c) => {
  return c.json({});
});

/**
 * POST /api/admin/accounts/upload
 */
adminRouter.post('/accounts/upload', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const body = await c.req.json();
  const path = Array.isArray(body.files) ? '/api/files/batch' : '/api/files';
  const payload = Array.isArray(body.files) ? { files: body.files } : { content: body.content };

  const result = await proxyAccountRequest(server, path, 'POST', payload, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * POST /api/admin/accounts/toggle-disabled
 */
adminRouter.post('/accounts/toggle-disabled', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const body = await c.req.json();
  const result = await proxyAccountRequest(server, '/api/auth/toggle-disabled', 'POST', body, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * DELETE /api/admin/accounts/:index
 */
adminRouter.delete('/accounts/:index', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const index = c.req.param('index');
  const force = c.req.query('force') === 'true';
  const result = await proxyAccountRequest(server, `/api/accounts/${index}`, 'DELETE', undefined, { force: String(force) }, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * POST /api/admin/accounts/batch-delete
 */
adminRouter.post('/accounts/batch-delete', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const body = await c.req.json();
  const result = await proxyAccountRequest(server, '/api/accounts/batch', 'DELETE', body, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * POST /api/admin/accounts/deduplicate
 */
adminRouter.post('/accounts/deduplicate', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const result = await proxyAccountRequest(server, '/api/accounts/deduplicate', 'POST', {}, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * PUT /api/admin/accounts/current
 */
adminRouter.put('/accounts/current', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const body = await c.req.json();
  const result = await proxyAccountRequest(server, '/api/accounts/current', 'PUT', body, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * POST /api/admin/accounts/:index/close-context
 */
adminRouter.post('/accounts/:index/close-context', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const index = c.req.param('index');
  const result = await proxyAccountRequest(server, `/api/accounts/${index}/close-context`, 'POST', undefined, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

/**
 * GET /api/admin/accounts/files/:filename
 */
adminRouter.get('/accounts/files/:filename', async (c) => {
  const workerConfig = await getWorkerConfig(c.env);
  const serverIdParam = c.req.query('serverId') || c.req.query('serverIndex');
  const { server } = getSelectedServer(workerConfig, serverIdParam);

  if (server?.type === 'direct') {
    return c.json({ error: '该操作仅在代理模式服务器可用' }, 400);
  }

  const filename = c.req.param('filename');
  const result = await proxyAccountRequest(server, `/api/files/${encodeURIComponent(filename)}`, 'GET', undefined, undefined, workerConfig.adminSecretKey);
  return c.json(result.data, result.status as any);
});

export default adminRouter;
