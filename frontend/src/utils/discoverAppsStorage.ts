import { DiscoverAppItem } from '../types/discoverApps';

export const DISCOVER_APPS_STORAGE_KEY = 'discover_hub_apps_config';
export const LEGACY_CUSTOM_APPS_STORAGE_KEY = 'custom_discover_apps';

export const DEFAULT_BUILTIN_APPS: DiscoverAppItem[] = [
  {
    id: 'systemLogs',
    type: 'builtin',
    name: '系统日志',
    description: '实时查看服务端运行日志与请求事件',
    icon: 'FileText',
    color: 'from-blue-500 to-cyan-600',
    badge: 'SSE STREAM',
    enabled: true,
    order: 0,
  },
  {
    id: 'playground',
    type: 'builtin',
    name: '接口演练',
    description: '在线测试 Gemini API 对话与流式调用',
    icon: 'Play',
    color: 'from-orange-500 to-amber-600',
    badge: 'REST & STREAM',
    enabled: true,
    order: 1,
  },
  {
    id: 'translate',
    type: 'builtin',
    name: '双语对照',
    description: '双栏对照沉浸式翻译与提示词调优',
    icon: 'Languages',
    color: 'from-indigo-500 to-purple-600',
    badge: 'BILINGUAL',
    enabled: true,
    order: 2,
  },
];

export const PRESET_CUSTOM_APP: DiscoverAppItem = {
  id: 'preset_ubuntu_ui',
  type: 'custom',
  name: 'Ubuntu Web UI',
  description: '快捷访问内网或外部 Web 页面',
  icon: 'Globe',
  color: 'from-orange-500 to-amber-600',
  badge: undefined,
  enabled: true,
  order: 3,
  url: 'https://ubuntu.yatao.cc.cd/ui/',
  createdAt: 1726045000000,
};

export function normalizeWebAppUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('URL cannot be empty');
  }

  let finalUrl = trimmed;
  if (!/^https?:\/\//i.test(finalUrl)) {
    if (/^[a-zA-Z0-9_-]+:/i.test(finalUrl)) {
      throw new Error('Only HTTP and HTTPS protocols are supported');
    }
    finalUrl = `https://${finalUrl}`;
  }

  try {
    const parsed = new URL(finalUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS protocols are supported');
    }
    return finalUrl;
  } catch (err: any) {
    throw new Error(err.message || 'Invalid URL');
  }
}

export function loadDiscoverApps(): DiscoverAppItem[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DISCOVER_APPS_STORAGE_KEY) : null;
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a: DiscoverAppItem, b: DiscoverAppItem) => a.order - b.order);
      }
    }

    // Check legacy custom apps migration
    const legacyRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_CUSTOM_APPS_STORAGE_KEY) : null;
    if (legacyRaw !== null) {
      try {
        const legacyParsed = JSON.parse(legacyRaw);
        if (Array.isArray(legacyParsed)) {
          const migrated: DiscoverAppItem[] = DEFAULT_BUILTIN_APPS.map((item, index) => ({
            ...item,
            order: index,
          }));

          legacyParsed.forEach((item: any, idx: number) => {
            if (!migrated.some((a) => a.id === item.id)) {
              migrated.push({
                id: item.id || `app_${Date.now()}_${idx}`,
                type: 'custom',
                name: item.name || 'Custom App',
                description: item.description || '',
                icon: item.icon || 'Globe',
                color: item.color || 'from-orange-500 to-amber-600',
                badge: item.useGateway ? 'GW PROXY' : undefined,
                enabled: true,
                order: migrated.length,
                url: item.url,
                useGateway: !!item.useGateway,
                createdAt: item.createdAt || Date.now(),
              });
            }
          });

          saveDiscoverApps(migrated);
          return migrated;
        }
      } catch {
        // ignore legacy parse errors
      }
    }

    // Default initialization
    const defaults: DiscoverAppItem[] = [
      ...DEFAULT_BUILTIN_APPS.map((a, i) => ({ ...a, order: i })),
      { ...PRESET_CUSTOM_APP, order: DEFAULT_BUILTIN_APPS.length },
    ];
    saveDiscoverApps(defaults);
    return defaults;
  } catch {
    return [
      ...DEFAULT_BUILTIN_APPS.map((a, i) => ({ ...a, order: i })),
      { ...PRESET_CUSTOM_APP, order: DEFAULT_BUILTIN_APPS.length },
    ];
  }
}

export function saveDiscoverApps(apps: DiscoverAppItem[], adminKey?: string): void {
  // Re-index contiguous orders
  const normalized = apps.map((app, index) => ({
    ...app,
    order: index,
  }));

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DISCOVER_APPS_STORAGE_KEY, JSON.stringify(normalized));

      // Keep legacy custom_discover_apps synced for backward compatibility
      const customOnly = normalized
        .filter((a) => a.type === 'custom')
        .map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url || '',
          icon: a.icon || 'Globe',
          color: a.color,
          useGateway: !!a.useGateway,
          createdAt: a.createdAt || Date.now(),
        }));
      localStorage.setItem(LEGACY_CUSTOM_APPS_STORAGE_KEY, JSON.stringify(customOnly));
    }
  } catch {
    // ignore storage quota error
  }

  const effectiveKey = adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
  if (effectiveKey) {
    syncDiscoverAppsToRemote(normalized, effectiveKey).catch(() => {});
  }
}

export async function syncDiscoverAppsToRemote(
  apps: DiscoverAppItem[],
  adminKey?: string
): Promise<boolean> {
  const effectiveKey = adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
  if (!effectiveKey || typeof fetch === 'undefined') return false;

  try {
    const customPayload = apps
      .filter((a) => a.type === 'custom')
      .map((a) => ({
        id: a.id,
        name: a.name,
        url: a.url || '',
        icon: a.icon || 'Globe',
        color: a.color,
        useGateway: !!a.useGateway,
        createdAt: a.createdAt || Date.now(),
      }));

    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: {
        'x-admin-key': effectiveKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customWebApps: customPayload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function resetDiscoverAppsToDefault(adminKey?: string): DiscoverAppItem[] {
  const defaultApps: DiscoverAppItem[] = [
    ...DEFAULT_BUILTIN_APPS.map((a, i) => ({ ...a, order: i })),
    { ...PRESET_CUSTOM_APP, order: DEFAULT_BUILTIN_APPS.length },
  ];
  saveDiscoverApps(defaultApps, adminKey);
  return defaultApps;
}

export function moveDiscoverApp(
  id: string,
  direction: 'up' | 'down',
  adminKey?: string
): DiscoverAppItem[] {
  const apps = [...loadDiscoverApps()];
  const index = apps.findIndex((a) => a.id === id);
  if (index === -1) return apps;

  if (direction === 'up') {
    if (index === 0) return apps;
    const prev = apps[index - 1];
    apps[index - 1] = apps[index];
    apps[index] = prev;
  } else if (direction === 'down') {
    if (index === apps.length - 1) return apps;
    const next = apps[index + 1];
    apps[index + 1] = apps[index];
    apps[index] = next;
  }

  saveDiscoverApps(apps, adminKey);
  return loadDiscoverApps();
}

export function toggleDiscoverAppVisibility(id: string, adminKey?: string): DiscoverAppItem[] {
  const apps = [...loadDiscoverApps()];
  const target = apps.find((a) => a.id === id);
  if (!target) return apps;

  target.enabled = !target.enabled;
  saveDiscoverApps(apps, adminKey);
  return loadDiscoverApps();
}

export function saveOrUpdateCustomApp(
  app: Partial<DiscoverAppItem>,
  adminKey?: string
): DiscoverAppItem[] {
  const apps = [...loadDiscoverApps()];

  if (app.id) {
    const index = apps.findIndex((a) => a.id === app.id);
    if (index !== -1) {
      apps[index] = {
        ...apps[index],
        ...app,
        type: 'custom',
        name: app.name ? app.name.trim() : apps[index].name,
        url: app.url ? normalizeWebAppUrl(app.url) : apps[index].url,
        badge: app.useGateway ? 'GW PROXY' : (app.badge || apps[index].badge),
      };
    } else {
      const newItem: DiscoverAppItem = {
        id: app.id,
        type: 'custom',
        name: app.name ? app.name.trim() : 'Custom App',
        description: app.description || '',
        icon: app.icon || 'Globe',
        color: app.color || 'from-orange-500 to-amber-600',
        badge: app.useGateway ? 'GW PROXY' : app.badge,
        enabled: app.enabled !== undefined ? app.enabled : true,
        order: apps.length,
        url: app.url ? normalizeWebAppUrl(app.url) : '',
        useGateway: !!app.useGateway,
        createdAt: app.createdAt || Date.now(),
      };
      apps.push(newItem);
    }
  } else {
    const newItem: DiscoverAppItem = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'custom',
      name: app.name ? app.name.trim() : 'Custom App',
      description: app.description || '',
      icon: app.icon || 'Globe',
      color: app.color || 'from-orange-500 to-amber-600',
      badge: app.useGateway ? 'GW PROXY' : app.badge,
      enabled: app.enabled !== undefined ? app.enabled : true,
      order: apps.length,
      url: app.url ? normalizeWebAppUrl(app.url) : '',
      useGateway: !!app.useGateway,
      createdAt: app.createdAt || Date.now(),
    };
    apps.push(newItem);
  }

  saveDiscoverApps(apps, adminKey);
  return loadDiscoverApps();
}

export function deleteCustomApp(id: string, adminKey?: string): DiscoverAppItem[] {
  const apps = loadDiscoverApps().filter((a) => a.id !== id || a.type === 'builtin');
  saveDiscoverApps(apps, adminKey);
  return loadDiscoverApps();
}
