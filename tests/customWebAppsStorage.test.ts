// tests/customWebAppsStorage.test.ts
import {
  normalizeWebAppUrl,
  loadCustomWebApps,
  saveCustomWebApp,
  deleteCustomWebApp,
  CUSTOM_WEB_APPS_STORAGE_KEY,
  PRESET_CUSTOM_WEB_APPS,
} from '../frontend/src/utils/customWebAppsStorage';
import { CustomWebAppItem } from '../frontend/src/types/customWebApps';

// Provide localStorage polyfill for Node.js test environment if not present
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

describe('customWebAppsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('normalizeWebAppUrl', () => {
    it('should normalize URLs without protocol to https://', () => {
      expect(normalizeWebAppUrl('ubuntu.yatao.cc.cd/ui/')).toBe('https://ubuntu.yatao.cc.cd/ui/');
      expect(normalizeWebAppUrl('example.com')).toBe('https://example.com');
    });

    it('should keep existing http and https protocols', () => {
      expect(normalizeWebAppUrl('http://127.0.0.1:9090/ui/')).toBe('http://127.0.0.1:9090/ui/');
      expect(normalizeWebAppUrl('https://ubuntu.yatao.cc.cd/ui/')).toBe('https://ubuntu.yatao.cc.cd/ui/');
    });

    it('should throw or reject non-http/https protocols', () => {
      expect(() => normalizeWebAppUrl('javascript:alert(1)')).toThrow();
      expect(() => normalizeWebAppUrl('data:text/html,<h1>hi</h1>')).toThrow();
      expect(() => normalizeWebAppUrl('file:///etc/passwd')).toThrow();
    });

    it('should throw error on empty url', () => {
      expect(() => normalizeWebAppUrl('')).toThrow();
      expect(() => normalizeWebAppUrl('   ')).toThrow();
    });
  });

  describe('CRUD operations', () => {
    it('should seed preset Ubuntu Web UI on brand new first launch when key is null', () => {
      expect(localStorage.getItem(CUSTOM_WEB_APPS_STORAGE_KEY)).toBeNull();
      const apps = loadCustomWebApps();
      expect(apps).toHaveLength(1);
      expect(apps[0].id).toBe('preset_ubuntu_ui');
      expect(apps[0].name).toBe('Ubuntu Web UI');
      expect(apps[0].url).toBe('https://ubuntu.yatao.cc.cd/ui/');
      // Should now be saved in localStorage
      expect(localStorage.getItem(CUSTOM_WEB_APPS_STORAGE_KEY)).not.toBeNull();
    });

    it('should return empty list when storage is explicitly empty', () => {
      localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify([]));
      expect(loadCustomWebApps()).toEqual([]);
    });

    it('should save a new custom web app with generated id and normalized url', () => {
      localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify([]));
      const saved = saveCustomWebApp({
        name: 'Another Web UI',
        url: 'another.yatao.cc.cd/ui/',
        color: 'from-blue-500 to-cyan-600',
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Another Web UI');
      expect(saved.url).toBe('https://another.yatao.cc.cd/ui/');
      expect(saved.createdAt).toBeGreaterThan(0);

      const list = loadCustomWebApps();
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual(saved);
    });

    it('should update an existing custom web app when id is provided', () => {
      localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify([]));
      const initial = saveCustomWebApp({
        name: 'Initial',
        url: 'https://initial.com',
      });

      const updated = saveCustomWebApp({
        id: initial.id,
        name: 'Updated Name',
        url: 'https://updated.com',
      });

      expect(updated.id).toBe(initial.id);
      expect(updated.name).toBe('Updated Name');
      expect(updated.url).toBe('https://updated.com');

      const list = loadCustomWebApps();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('Updated Name');
    });

    it('should delete an app by id', () => {
      localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify([]));
      const app1 = saveCustomWebApp({ name: 'App 1', url: 'https://1.com' });
      const app2 = saveCustomWebApp({ name: 'App 2', url: 'https://2.com' });

      deleteCustomWebApp(app1.id);

      const list = loadCustomWebApps();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(app2.id);
    });
  });
});
