// tests/accountController.test.ts
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountService from '../src/admin/services/accountService';
import config from '../config/default';

jest.mock('../src/admin/services/accountService');
const mockedAccountService = accountService as jest.Mocked<typeof accountService>;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Account Controller Endpoints', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 without x-admin-key', async () => {
    const res = await request(app).get('/api/admin/accounts/status');
    expect(res.status).toBe(401);
  });

  it('should forward getStatus correctly with valid key', async () => {
    mockedAccountService.getStatus.mockResolvedValueOnce({
      status: 200,
      data: { status: { accountDetails: [{ index: 0, name: 'user@gmail.com' }] } },
      headers: {}
    } as any);

    const res = await request(app)
      .get('/api/admin/accounts/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.status.accountDetails[0].name).toBe('user@gmail.com');
  });

  it('should forward toggleDisabled correctly', async () => {
    mockedAccountService.toggleDisabled.mockResolvedValueOnce({
      status: 200,
      data: { success: true, isDisabled: true },
      headers: {}
    } as any);

    const res = await request(app)
      .post('/api/admin/accounts/toggle-disabled')
      .set('x-admin-key', secretKey)
      .send({ index: 0, disabled: true });

    expect(res.status).toBe(200);
    expect(mockedAccountService.toggleDisabled).toHaveBeenCalledWith(0, true);
  });

  it('should forward deleteAccount with force parameter', async () => {
    mockedAccountService.deleteAccount.mockResolvedValueOnce({
      status: 200,
      data: { index: 0, message: 'accountDeleteSuccess' },
      headers: {}
    } as any);

    const res = await request(app)
      .delete('/api/admin/accounts/0?force=true')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(mockedAccountService.deleteAccount).toHaveBeenCalledWith(0, true);
  });

  it('should forward batch-delete', async () => {
    mockedAccountService.batchDeleteAccounts.mockResolvedValueOnce({
      status: 200,
      data: { successCount: 2, successIndices: [1, 2] },
      headers: {}
    } as any);

    const res = await request(app)
      .post('/api/admin/accounts/batch-delete')
      .set('x-admin-key', secretKey)
      .send({ indices: [1, 2], force: true });

    expect(res.status).toBe(200);
    expect(mockedAccountService.batchDeleteAccounts).toHaveBeenCalledWith([1, 2], true);
  });

  it('should forward deduplicate', async () => {
    mockedAccountService.deduplicateAccounts.mockResolvedValueOnce({
      status: 200,
      data: { removedIndices: [0] },
      headers: {}
    } as any);

    const res = await request(app)
      .post('/api/admin/accounts/deduplicate')
      .set('x-admin-key', secretKey)
      .send({});

    expect(res.status).toBe(200);
    expect(mockedAccountService.deduplicateAccounts).toHaveBeenCalled();
  });

  it('should forward switch current account', async () => {
    mockedAccountService.switchCurrentAccount.mockResolvedValueOnce({
      status: 200,
      data: { newIndex: 2 },
      headers: {}
    } as any);

    const res = await request(app)
      .put('/api/admin/accounts/current')
      .set('x-admin-key', secretKey)
      .send({ targetIndex: 2 });

    expect(res.status).toBe(200);
    expect(mockedAccountService.switchCurrentAccount).toHaveBeenCalledWith(2);
  });

  it('should forward upload file / batch files', async () => {
    mockedAccountService.uploadBatchFiles.mockResolvedValueOnce({
      status: 200,
      data: { successCount: 2 },
      headers: {}
    } as any);

    const res = await request(app)
      .post('/api/admin/accounts/upload')
      .set('x-admin-key', secretKey)
      .send({ files: [{ cookies: [] }] });

    expect(res.status).toBe(200);
    expect(mockedAccountService.uploadBatchFiles).toHaveBeenCalledWith([{ cookies: [] }]);
  });
});
