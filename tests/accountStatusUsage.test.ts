import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountService from '../src/admin/services/accountService';
import accountUsageService from '../src/admin/services/accountUsageService';
import config from '../config/default';

jest.mock('../src/admin/services/accountService');
const mockedAccountService = accountService as jest.Mocked<typeof accountService>;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Account Controller Usage Integration', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  beforeEach(() => {
    accountUsageService.resetForTest();
  });

  it('should merge local usage into account status response', async () => {
    accountUsageService.record('user1@gmail.com', 'claude-3-5-sonnet', true);
    accountUsageService.record('user1@gmail.com', 'claude-3-5-sonnet', false);

    mockedAccountService.getStatus.mockResolvedValueOnce({
      status: 200,
      data: {
        status: {
          accountDetails: [
            { index: 0, name: 'user1@gmail.com' },
            { index: 1, name: 'user2@gmail.com' }
          ]
        }
      },
      headers: {}
    } as any);

    const res = await request(app)
      .get('/api/admin/accounts/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    const acc0 = res.body.status.accountDetails[0];
    expect(acc0.usage).toBeDefined();
    expect(acc0.usage.totalRequests).toBe(2);
    expect(acc0.usage.total).toBe(1); // totalSuccess
    expect(acc0.usage.byModel['claude-3-5-sonnet'].success).toBe(1);
    expect(acc0.usage.byModel['claude-3-5-sonnet'].error).toBe(1);

    const acc1 = res.body.status.accountDetails[1];
    expect(acc1.usage.totalRequests).toBe(0);
    expect(acc1.usage.byModel).toEqual({});
  });

  it('should completely overwrite upstream dirty usage data with local clean usage', async () => {
    accountUsageService.record('clean-user@example.com', 'models/gemini-2.0-flash', true);

    mockedAccountService.getStatus.mockResolvedValueOnce({
      status: 200,
      data: {
        status: {
          accountDetails: [
            {
              index: 0,
              name: 'clean-user@example.com',
              usage: {
                models: { 'dirty-model': { requests: 999 } }
              }
            },
            {
              index: 1,
              name: 'zero-user@example.com',
              usage: {
                models: { 'old-model': { requests: 50 } }
              }
            }
          ]
        }
      },
      headers: {}
    } as any);

    const res = await request(app)
      .get('/api/admin/accounts/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    const acc0 = res.body.status.accountDetails[0];
    expect(acc0.usage.models).toBeUndefined(); // 上游脏字段被清除
    expect(acc0.usage.byModel['gemini-2.0-flash'].success).toBe(1);
    expect(acc0.usage.totalRequests).toBe(1);

    const acc1 = res.body.status.accountDetails[1];
    expect(acc1.usage.models).toBeUndefined(); // 零用量账号的上游脏字段也被清除
    expect(acc1.usage.totalRequests).toBe(0);
    expect(acc1.usage.byModel).toEqual({});
  });

  it('should return all period usage from GET /api/admin/accounts/usage', async () => {
    accountUsageService.record('user1@gmail.com', 'gemini-1.5-pro', true);

    const res = await request(app)
      .get('/api/admin/accounts/usage')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.periodKey).toBeDefined();
    expect(res.body.accounts['user1@gmail.com']).toBeDefined();
  });
});
