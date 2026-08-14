// tests/accountService.test.ts
import accountService from '../src/admin/services/accountService';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

describe('accountService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call GET /api/status with Bearer token and Accept header', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ status: { accountDetails: [] } })
    });

    const res = await accountService.getStatus();
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/status'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json'
        })
      })
    );
  });

  it('should toggle disabled status for account', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ success: true, isDisabled: true })
    });

    const res = await accountService.toggleDisabled(1, true);
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/toggle-disabled'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ index: 1, disabled: true })
      })
    );
  });

  it('should call delete account with force param', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ index: 2, message: 'accountDeleteSuccess' })
    });

    const res = await accountService.deleteAccount(2, true);
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/accounts/2?force=true'),
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });

  it('should call batch delete accounts', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ successCount: 2 })
    });

    const res = await accountService.batchDeleteAccounts([1, 2], true);
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/accounts/batch'),
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ indices: [1, 2], force: true })
      })
    );
  });

  it('should call deduplicate', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ removedIndices: [0] })
    });

    const res = await accountService.deduplicateAccounts();
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/accounts/deduplicate'),
      expect.objectContaining({
        method: 'POST',
        body: '{}'
      })
    );
  });

  it('should call switch current account', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ newIndex: 2 })
    });

    const res = await accountService.switchCurrentAccount(2);
    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/accounts/current'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ targetIndex: 2 })
      })
    );
  });

  it('should upload single file and batch files', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ filename: 'auth-1.json' })
    });

    const res1 = await accountService.uploadFile({ cookies: [] });
    expect(res1.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/files'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: { cookies: [] } })
      })
    );

    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ successCount: 2 })
    });

    const res2 = await accountService.uploadBatchFiles([{ cookies: [] }]);
    expect(res2.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/batch'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ files: [{ cookies: [] }] })
      })
    );
  });
});
