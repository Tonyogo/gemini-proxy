import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountService from '../src/admin/services/accountService';
import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';

jest.mock('../src/admin/services/accountService');
const mockedAccountService = accountService as jest.Mocked<typeof accountService>;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Multi-Server Account Controller Endpoints', () => {
  const secretKey = 'test-secret-multi-server';
  const originalUrl = config.geminiBaseUrl;

  beforeAll(async () => {
    config.adminSecretKey = secretKey;
    await updateConfig({
      geminiBaseUrl: 'https://acc-srv1.example.com,https://acc-srv2.example.com'
    });
  });

  afterAll(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/accounts/servers', () => {
    it('returns list of configured upstream servers', async () => {
      const res = await request(app)
        .get('/api/admin/accounts/servers')
        .set('x-admin-key', secretKey);

      expect(res.status).toBe(200);
      expect(res.body.servers).toEqual([
        'https://acc-srv1.example.com',
        'https://acc-srv2.example.com'
      ]);
    });
  });

  describe('Server Index Query Parameter Handling in Controller', () => {
    it('omits serverIndex when no query parameter is given', async () => {
      mockedAccountService.getStatus.mockResolvedValueOnce({
        status: 200,
        data: { ok: true },
        headers: {}
      } as any);

      await request(app)
        .get('/api/admin/accounts/status')
        .set('x-admin-key', secretKey);

      expect(mockedAccountService.getStatus).toHaveBeenCalledWith();
    });

    it('passes serverIndex when serverId query param is provided', async () => {
      mockedAccountService.getStatus.mockResolvedValueOnce({
        status: 200,
        data: { ok: true },
        headers: {}
      } as any);

      await request(app)
        .get('/api/admin/accounts/status?serverId=1')
        .set('x-admin-key', secretKey);

      expect(mockedAccountService.getStatus).toHaveBeenCalledWith(1);
    });

    it('passes serverIndex for mutating operations', async () => {
      mockedAccountService.toggleDisabled.mockResolvedValueOnce({
        status: 200,
        data: { ok: true },
        headers: {}
      } as any);

      await request(app)
        .post('/api/admin/accounts/toggle-disabled?serverId=1')
        .set('x-admin-key', secretKey)
        .send({ index: 0, disabled: true });

      expect(mockedAccountService.toggleDisabled).toHaveBeenCalledWith(0, true, 1);
    });

    it('passes serverIndex for deleteAccount operations', async () => {
      mockedAccountService.deleteAccount.mockResolvedValueOnce({
        status: 200,
        data: { deleted: true },
        headers: {}
      } as any);

      await request(app)
        .delete('/api/admin/accounts/2?serverId=1&force=true')
        .set('x-admin-key', secretKey);

      expect(mockedAccountService.deleteAccount).toHaveBeenCalledWith(2, true, 1);
    });
  });
});
