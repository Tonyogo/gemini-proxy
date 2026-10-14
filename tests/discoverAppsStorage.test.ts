import {
  DEFAULT_DISCOVER_APPS,
  reindexApps,
  moveAppInList,
  toggleAppVisibilityInList,
  upsertCustomAppInList,
  deleteCustomAppInList,
  fetchRemoteDiscoverApps,
  saveRemoteDiscoverApps,
} from '../frontend/src/utils/discoverAppsStorage';
import { DiscoverAppItem } from '../frontend/src/types/discoverApps';

describe('discoverAppsStorage (In-Memory & Remote Only)', () => {
  it('provides default in-memory apps', () => {
    expect(DEFAULT_DISCOVER_APPS.length).toBeGreaterThanOrEqual(4);
    expect(DEFAULT_DISCOVER_APPS[0].id).toBe('systemLogs');
  });

  it('moves apps up and down correctly in-memory', () => {
    const list = [...DEFAULT_DISCOVER_APPS];
    const topId = list[0].id;
    const secondId = list[1].id;

    // Moving top item up is no-op
    let moved = moveAppInList(list, topId, 'up');
    expect(moved[0].id).toBe(topId);

    // Moving second item up swaps position
    moved = moveAppInList(list, secondId, 'up');
    expect(moved[0].id).toBe(secondId);
    expect(moved[1].id).toBe(topId);
    expect(moved[0].order).toBe(0);
    expect(moved[1].order).toBe(1);
  });

  it('toggles visibility in-memory', () => {
    const list = [...DEFAULT_DISCOVER_APPS];
    const toggled = toggleAppVisibilityInList(list, 'systemLogs');
    expect(toggled.find((a: DiscoverAppItem) => a.id === 'systemLogs')?.enabled).toBe(false);
  });

  it('upserts and deletes custom app in-memory', () => {
    let list = [...DEFAULT_DISCOVER_APPS];
    list = upsertCustomAppInList(list, {
      name: 'Cloud Note',
      url: 'https://notes.local',
    });
    const item = list.find((a: DiscoverAppItem) => a.name === 'Cloud Note');
    expect(item).toBeDefined();
    expect(item?.type).toBe('custom');

    list = deleteCustomAppInList(list, item!.id);
    expect(list.find((a: DiscoverAppItem) => a.name === 'Cloud Note')).toBeUndefined();
  });

  it('fetches remote discover apps and automatically merges missing builtin apps', async () => {
    const mockApps = [
      { id: 'app1', type: 'custom', name: 'App 1', icon: 'Globe', color: 'blue', enabled: true, order: 0 }
    ];
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ config: { discoverApps: mockApps } }),
    });

    const result = await fetchRemoteDiscoverApps('test-key');
    expect(result.some(a => a.id === 'app1')).toBe(true);
    expect(result.some(a => a.id === 'tasks')).toBe(true);
    expect(result.some(a => a.id === 'systemLogs')).toBe(true);
    expect((global.fetch as jest.Mock)).toHaveBeenCalledWith('/api/admin/status', {
      headers: { 'x-admin-key': 'test-key' },
    });

    global.fetch = originalFetch;
  });

  it('saves remote discover apps using fetch POST', async () => {
    const mockApps = [
      { id: 'app1', type: 'custom', name: 'App 1', icon: 'Globe', color: 'blue', enabled: true, order: 0 }
    ];
    const originalFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
    });

    const success = await saveRemoteDiscoverApps(mockApps as any, 'test-key');
    expect(success).toBe(true);
    expect((global.fetch as jest.Mock)).toHaveBeenCalledWith(
      '/api/admin/config',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': 'test-key',
        },
      })
    );

    global.fetch = originalFetch;
  });
});
