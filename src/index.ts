import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WorkerEnv } from './env';
import { claudeRoutes } from './proxy/routes/claudeRoutes';
import { geminiRoutes } from './proxy/routes/geminiRoutes';
import { adminRoutes } from './admin/routes/adminRoutes';
import { claudeTranslator } from './proxy/services/claudeTranslator';

const app = new Hono<{ Bindings: WorkerEnv }>();

// Global CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['*'],
  exposeHeaders: ['*'],
}));

// Mount API routes
app.route('/v1', claudeRoutes);
app.route('/v1beta', geminiRoutes);
app.route('/api/admin', adminRoutes);

// Global Error Handler
app.onError((err, c) => {
  console.error('[Worker Error]', err);
  const normalized = claudeTranslator.normalizeError(err);
  return c.json(normalized.payload, normalized.status as any);
});

// 404 / Assets Fallback
app.notFound(async (c) => {
  const path = c.req.path;
  if (path.startsWith('/v1') || path.startsWith('/api')) {
    return c.json({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: `Endpoint not found: ${c.req.method} ${path}`,
      },
    }, 404);
  }

  // Fallback to static SPA assets
  if (c.env.ASSETS) {
    return await c.env.ASSETS.fetch(c.req.raw);
  }

  return c.text('Gemini Proxy Worker is running.', 200);
});

export default app;
