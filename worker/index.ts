import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { WorkerEnv } from './env';
import claudeRouter from './routes/claudeRoutes';
import geminiRouter from './routes/geminiRoutes';
import adminRouter from './routes/adminRoutes';

const app = new Hono<{ Bindings: WorkerEnv }>();

// 1. Global CORS Middleware
app.use('*', cors({
  origin: '*',
  allowHeaders: ['*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  exposeHeaders: ['Content-Type', 'Cache-Control', 'x-account-name', 'x-request-id']
}));

// 2. Health Check
app.get('/health', (c) => {
  return c.json({ status: 'ok', runtime: 'cloudflare-workers' });
});

// 3. API Routers
app.route('/v1', claudeRouter);
app.route('/v1beta', geminiRouter);
app.route('/api/admin', adminRouter);

// 4. Static Assets & SPA Fallback for Web Console
app.get('*', async (c) => {
  // If request is an API endpoint, do not attempt to serve HTML
  const path = c.req.path;
  if (path.startsWith('/v1') || path.startsWith('/v1beta') || path.startsWith('/api')) {
    return c.text('Not Found', 404);
  }

  // Attempt to serve static asset from ASSETS binding if available
  if (c.env.ASSETS) {
    try {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
      // SPA Fallback: serve index.html for frontend client routes
      const indexReq = new Request(new URL('/', c.req.url).toString(), c.req.raw);
      return await c.env.ASSETS.fetch(indexReq);
    } catch {
      // Fallback
    }
  }

  return c.text('Gemini Proxy Worker is running.', 200);
});

export default app;
