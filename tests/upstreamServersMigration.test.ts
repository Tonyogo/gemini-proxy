import request from 'supertest';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('UpstreamServers Single Source of Truth & geminiBaseUrl Migration', () => {
  const secretKey = 'test-secret-migration';
  const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.test.json');
  const originalAdminKey = config.adminSecretKey;

  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  afterAll(() => {
    config.adminSecretKey = originalAdminKey;
  });

  afterEach(async () => {
    await updateConfig({}, { resetToEnv: true });
    if (fs.existsSync(runtimeJsonPath)) {
      try {
        fs.unlinkSync(runtimeJsonPath);
      } catch {}
    }
  });

  describe('Frontend code static inspection', () => {
    test('ConfigModal.tsx should not contain geminiBaseUrl state, hidden input, or payload submission', () => {
      const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
      const content = fs.readFileSync(modalPath, 'utf-8');

      expect(content).not.toContain('geminiBaseUrl');
      expect(content).not.toContain('setGeminiBaseUrl');
      expect(content).toContain('upstreamServers');
      expect(content).toContain('setUpstreamServers');
    });

    test('LogsView.tsx should not use geminiBaseUrl state for cURL generation', () => {
      const logsPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
      const content = fs.readFileSync(logsPath, 'utf-8');

      expect(content).not.toContain('geminiBaseUrl');
      expect(content).not.toContain('setGeminiBaseUrl');
    });
  });

  describe('Backend API & Runtime Persistence', () => {
    test('/api/admin/config in strict mode should ignore incoming geminiBaseUrl and not persist it', async () => {
      const payload = {
        geminiBaseUrl: 'https://malicious-or-stale.com',
        upstreamServers: [
          { url: 'https://new-upstream.example.com', weight: 1, enabled: true, name: 'Main Node', type: 'proxy' }
        ]
      };

      const res = await request(app)
        .post('/api/admin/config')
        .set('x-admin-key', secretKey)
        .send(payload);

      expect(res.status).toBe(200);

      // Verify returned computed geminiBaseUrl matches upstreamServers, not the incoming stale geminiBaseUrl
      expect(res.body.config.geminiBaseUrl).toBe('https://new-upstream.example.com');
      expect(config.geminiBaseUrl).toBe('https://new-upstream.example.com');

      // Verify runtime.json does NOT contain geminiBaseUrl
      if (fs.existsSync(runtimeJsonPath)) {
        const raw = fs.readFileSync(runtimeJsonPath, 'utf-8');
        const savedJson = JSON.parse(raw);
        expect(savedJson.geminiBaseUrl).toBeUndefined();
        expect(savedJson.upstreamServers).toBeDefined();
        expect(savedJson.upstreamServers[0].url).toBe('https://new-upstream.example.com');
      }
    });

    test('updateConfig cleans up legacy geminiBaseUrl in runtime.json', async () => {
      // Simulate legacy runtime.json having geminiBaseUrl
      const legacyData = {
        geminiBaseUrl: 'https://legacy.example.com',
        logLevel: 'debug'
      };
      fs.writeFileSync(runtimeJsonPath, JSON.stringify(legacyData, null, 2), 'utf-8');

      // Update with new upstreamServers
      await updateConfig({
        upstreamServers: [
          { url: 'https://clean-node.com', weight: 1, enabled: true, type: 'proxy' }
        ]
      });

      expect(config.geminiBaseUrl).toBe('https://clean-node.com');

      const raw = fs.readFileSync(runtimeJsonPath, 'utf-8');
      const savedJson = JSON.parse(raw);
      expect(savedJson.geminiBaseUrl).toBeUndefined();
      expect(savedJson.upstreamServers).toBeDefined();
      expect(savedJson.upstreamServers[0].url).toBe('https://clean-node.com');
    });

    test('config.geminiBaseUrl is a computed getter deriving dynamically from upstreamServers', async () => {
      await updateConfig({
        upstreamServers: [
          { url: 'https://srv-a.com', weight: 1, enabled: true, type: 'proxy' },
          { url: 'https://srv-b.com', weight: 1, enabled: true, type: 'proxy' }
        ]
      });

      expect(config.geminiBaseUrl).toBe('https://srv-a.com,https://srv-b.com');

      await updateConfig({
        upstreamServers: [
          { url: 'https://srv-c.com', weight: 1, enabled: true, type: 'proxy' }
        ]
      });

      expect(config.geminiBaseUrl).toBe('https://srv-c.com');
    });
  });
});
