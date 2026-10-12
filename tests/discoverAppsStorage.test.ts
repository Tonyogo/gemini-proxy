import {
  loadDiscoverApps,
  saveDiscoverApps,
  resetDiscoverAppsToDefault,
  moveDiscoverApp,
  toggleDiscoverAppVisibility,
  saveOrUpdateCustomApp,
  deleteCustomApp,
  DISCOVER_APPS_STORAGE_KEY,
} from '../frontend/src/utils/discoverAppsStorage';
import { DiscoverAppItem } from '../frontend/src/types/discoverApps';

// Polyfill localStorage for Node.js test environment if not present
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

describe('discoverAppsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default builtin apps when storage is empty', () => {
    const apps = loadDiscoverApps();
    expect(apps.length).toBeGreaterThanOrEqual(3);
    expect(apps.some(a => a.id === 'systemLogs' && a.type === 'builtin')).toBe(true);
    expect(apps.some(a => a.id === 'playground' && a.type === 'builtin')).toBe(true);
    expect(apps.some(a => a.id === 'translate' && a.type === 'builtin')).toBe(true);
  });

  it('migrates legacy custom_discover_apps cleanly', () => {
    const legacy = [
      {
        id: 'legacy_app_1',
        name: 'My Service',
        url: 'https://example.com',
        color: 'from-orange-500 to-amber-600',
        createdAt: 1000,
      },
    ];
    localStorage.setItem('custom_discover_apps', JSON.stringify(legacy));

    const apps = loadDiscoverApps();
    expect(apps.some(a => a.id === 'legacy_app_1' && a.type === 'custom')).toBe(true);
    expect(apps.find(a => a.id === 'legacy_app_1')?.name).toBe('My Service');
  });

  it('moves apps up and down correctly', () => {
    let apps = resetDiscoverAppsToDefault();
    const firstId = apps[0].id;
    const secondId = apps[1].id;

    // Moving first item up should be a no-op
    apps = moveDiscoverApp(firstId, 'up');
    expect(apps[0].id).toBe(firstId);

    // Moving last item down should be a no-op
    const lastId = apps[apps.length - 1].id;
    apps = moveDiscoverApp(lastId, 'down');
    expect(apps[apps.length - 1].id).toBe(lastId);

    // Moving second item up swaps 0 and 1
    apps = moveDiscoverApp(secondId, 'up');
    expect(apps[0].id).toBe(secondId);
    expect(apps[1].id).toBe(firstId);
  });

  it('toggles visibility of an app', () => {
    let apps = resetDiscoverAppsToDefault();
    const target = apps[0];
    expect(target.enabled).toBe(true);

    apps = toggleDiscoverAppVisibility(target.id);
    expect(apps.find(a => a.id === target.id)?.enabled).toBe(false);

    apps = toggleDiscoverAppVisibility(target.id);
    expect(apps.find(a => a.id === target.id)?.enabled).toBe(true);
  });

  it('adds, edits and deletes custom app', () => {
    let apps = saveOrUpdateCustomApp({
      name: 'Test App',
      url: 'https://test.local',
      color: 'from-blue-500 to-cyan-600',
    });
    const created = apps.find(a => a.name === 'Test App');
    expect(created).toBeDefined();
    expect(created?.type).toBe('custom');
    expect(created?.url).toBe('https://test.local');

    // Edit
    apps = saveOrUpdateCustomApp({
      id: created!.id,
      name: 'Updated App',
      url: 'https://test.local/v2',
    });
    expect(apps.find(a => a.id === created!.id)?.name).toBe('Updated App');

    // Delete
    apps = deleteCustomApp(created!.id);
    expect(apps.find(a => a.id === created!.id)).toBeUndefined();
  });
});
