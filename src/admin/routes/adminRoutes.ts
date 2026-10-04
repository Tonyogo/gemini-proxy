import { Hono } from 'hono';
import { WorkerEnv } from '../../env';
import { getConfig, updateConfig } from '../../config/configManager';
import {
  listAuditLogs,
  getAuditLog,
  deleteAuditLog,
} from '../services/r2LoggerService';
import { getKeyStatesSummary } from '../../proxy/services/upstreamService';

export const adminRoutes = new Hono<{ Bindings: WorkerEnv }>();

// Admin authentication middleware
adminRoutes.use('*', async (c, next) => {
  const adminKey = c.req.header('x-admin-key');
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
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-worker',
    timestamp: new Date().toISOString(),
    hasKv: !!c.env.CONFIG_KV,
    hasR2: !!c.env.LOGS_BUCKET,
    hasAssets: !!c.env.ASSETS,
  });
});

adminRoutes.get('/config', async (c) => {
  const config = await getConfig(c.env);
  return c.json(config);
});

adminRoutes.post('/config', async (c) => {
  try {
    const updates = await c.req.json();
    const updated = await updateConfig(c.env, updates);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: 'Invalid config JSON' }, 400);
  }
});

adminRoutes.get('/models', async (c) => {
  const config = await getConfig(c.env);
  return c.json({
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

adminRoutes.get('/accounts', async (c) => {
  const accounts = getKeyStatesSummary();
  return c.json({ accounts });
});
