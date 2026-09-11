import {
  syncCustomWebAppsFromRemote,
  syncCustomWebAppsToRemote,
  loadCustomWebApps,
  saveCustomWebApp,
  deleteCustomWebApp,
  CUSTOM_WEB_APPS_STORAGE_KEY,
} from '../frontend/src/utils/customWebAppsStorage';

if (typeof (global as any).localStorage === 'undefined') {
  let store: Record<string, string> = {};
  (global as any).localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

describe('customWebAppsStorage Cloud Sync', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('syncCustomWebAppsFromRemote updates localStorage and returns remote list when non-empty', () => {
    const remoteList = [
      {
        id: 'remote_1',
        name: 'Remote App',
        url: 'https://remote.com',
        createdAt: 1000,
      },
    ];

    const result = syncCustomWebAppsFromRemote(remoteList);
    expect(result).toEqual(remoteList);
    expect(loadCustomWebApps()).toEqual(remoteList);
  });

  it('syncCustomWebAppsFromRemote retains local apps if remoteApps is undefined or null', () => {
    const local = saveCustomWebApp({ name: 'Local Only', url: 'https://local.com' });
    const result = syncCustomWebAppsFromRemote(undefined);
    expect(result.some((a: any) => a.id === local.id)).toBe(true);
  });

  it('syncCustomWebAppsToRemote sends POST /api/admin/config with admin key', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    const apps = [
      {
        id: 'app_1',
        name: 'App 1',
        url: 'https://app1.com',
        createdAt: 2000,
      },
    ];

    const success = await syncCustomWebAppsToRemote(apps, 'test-key');
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/config',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-admin-key': 'test-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ customWebApps: apps }),
      })
    );
  });

  it('saveCustomWebApp triggers remote sync when adminKey is provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    const saved = saveCustomWebApp(
      { name: 'Synced App', url: 'https://synced.com' },
      'my-admin-key'
    );
    expect(saved.name).toBe('Synced App');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/config',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-admin-key': 'my-admin-key',
        }),
      })
    );
  });

  it('deleteCustomWebApp triggers remote sync when adminKey is provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    const app = saveCustomWebApp({ name: 'To Delete', url: 'https://delete.me' });
    (global.fetch as jest.Mock).mockClear();

    deleteCustomWebApp(app.id, 'my-admin-key');
    expect(loadCustomWebApps().find((a) => a.id === app.id)).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/config',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-admin-key': 'my-admin-key',
        }),
      })
    );
  });
});
