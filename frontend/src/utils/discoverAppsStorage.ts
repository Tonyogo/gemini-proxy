import { DiscoverAppItem } from '../types/discoverApps';
import { normalizeWebAppUrl } from './customWebAppsStorage';

export { normalizeWebAppUrl };

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
  {
    id: 'tasks',
    type: 'builtin',
    name: '在线事项',
    description: '轻量高效的待办清单与状态看板，云端实时同步',
    icon: 'CheckSquare',
    color: 'from-emerald-500 to-teal-600',
    badge: 'KANBAN & LIST',
    enabled: true,
    order: 3,
  },
  {
    id: 'upstreamNodes',
    type: 'builtin',
    name: '上游节点信息',
    description: '集中管理多节点账号凭据、状态监控与上下文轮换',
    icon: 'Server',
    color: 'from-blue-600 to-indigo-700',
    badge: 'MULTI-NODE',
    enabled: true,
    order: 4,
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
  order: 5,
  url: 'https://ubuntu.yatao.cc.cd/ui/',
  createdAt: 1726045000000,
};

export const DEFAULT_DISCOVER_APPS: DiscoverAppItem[] = [
  ...DEFAULT_BUILTIN_APPS.map((a, i) => ({ ...a, order: i })),
  { ...PRESET_CUSTOM_APP, order: DEFAULT_BUILTIN_APPS.length },
];

export function reindexApps(apps: DiscoverAppItem[]): DiscoverAppItem[] {
  return apps.map((app, index) => ({
    ...app,
    order: index,
  }));
}

export function mergeBuiltinDiscoverApps(existingApps: DiscoverAppItem[]): DiscoverAppItem[] {
  if (!Array.isArray(existingApps) || existingApps.length === 0) {
    return existingApps;
  }
  const result = [...existingApps];
  for (const builtin of DEFAULT_BUILTIN_APPS) {
    const found = result.some(a => a.id === builtin.id);
    if (!found) {
      const lastBuiltinIdx = result
        .map((a, i) => (a.type === 'builtin' ? i : -1))
        .filter(i => i >= 0)
        .pop();
      if (lastBuiltinIdx !== undefined && lastBuiltinIdx >= 0) {
        result.splice(lastBuiltinIdx + 1, 0, { ...builtin });
      } else {
        result.unshift({ ...builtin });
      }
    }
  }
  return reindexApps(result);
}

export function moveAppInList(
  apps: DiscoverAppItem[],
  id: string,
  direction: 'up' | 'down'
): DiscoverAppItem[] {
  const list = [...apps];
  const index = list.findIndex((a) => a.id === id);
  if (index === -1) return list;

  if (direction === 'up') {
    if (index === 0) return list;
    const prev = list[index - 1];
    list[index - 1] = list[index];
    list[index] = prev;
  } else if (direction === 'down') {
    if (index === list.length - 1) return list;
    const next = list[index + 1];
    list[index + 1] = list[index];
    list[index] = next;
  }

  return reindexApps(list);
}

export function toggleAppVisibilityInList(
  apps: DiscoverAppItem[],
  id: string
): DiscoverAppItem[] {
  return apps.map((app) =>
    app.id === id ? { ...app, enabled: !app.enabled } : app
  );
}

export function upsertCustomAppInList(
  apps: DiscoverAppItem[],
  app: Partial<DiscoverAppItem>
): DiscoverAppItem[] {
  const list = [...apps];
  if (app.id) {
    const index = list.findIndex((a) => a.id === app.id);
    if (index !== -1) {
      list[index] = {
        ...list[index],
        ...app,
        type: 'custom',
        name: app.name ? app.name.trim() : list[index].name,
        description: app.description !== undefined ? app.description.trim() : list[index].description,
        url: app.url ? normalizeWebAppUrl(app.url) : list[index].url,
        badge: app.badge !== undefined ? app.badge : list[index].badge,
      };
      return reindexApps(list);
    }
  }

  const newItem: DiscoverAppItem = {
    id: app.id || `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'custom',
    name: app.name ? app.name.trim() : 'Custom App',
    description: app.description ? app.description.trim() : '',
    icon: app.icon || 'Globe',
    color: app.color || 'from-orange-500 to-amber-600',
    badge: app.badge,
    enabled: app.enabled !== undefined ? app.enabled : true,
    order: list.length,
    url: app.url ? normalizeWebAppUrl(app.url) : '',
    createdAt: app.createdAt || Date.now(),
  };
  list.push(newItem);
  return reindexApps(list);
}

export function deleteCustomAppInList(
  apps: DiscoverAppItem[],
  id: string
): DiscoverAppItem[] {
  const filtered = apps.filter((a) => a.id !== id || a.type === 'builtin');
  return reindexApps(filtered);
}

export async function fetchRemoteDiscoverApps(
  adminKey?: string
): Promise<DiscoverAppItem[]> {
  if (typeof fetch === 'undefined') return DEFAULT_DISCOVER_APPS;
  try {
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    const res = await fetch('/api/admin/status', { headers });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (
        data?.config?.discoverApps &&
        Array.isArray(data.config.discoverApps) &&
        data.config.discoverApps.length > 0
      ) {
        return mergeBuiltinDiscoverApps(data.config.discoverApps);
      }
    }
  } catch {
    // network failure fallback
  }
  return DEFAULT_DISCOVER_APPS;
}

export async function saveRemoteDiscoverApps(
  apps: DiscoverAppItem[],
  adminKey?: string
): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  try {
    const normalized = reindexApps(apps);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (adminKey) {
      headers['x-admin-key'] = adminKey;
    }
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers,
      body: JSON.stringify({ discoverApps: normalized }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// In-memory / remote backward compatibility helpers
export function loadDiscoverApps(): DiscoverAppItem[] {
  return [...DEFAULT_DISCOVER_APPS];
}

export function saveDiscoverApps(apps: DiscoverAppItem[], adminKey?: string): void {
  saveRemoteDiscoverApps(apps, adminKey).catch(() => {});
}

export function resetDiscoverAppsToDefault(adminKey?: string): DiscoverAppItem[] {
  saveRemoteDiscoverApps(DEFAULT_DISCOVER_APPS, adminKey).catch(() => {});
  return [...DEFAULT_DISCOVER_APPS];
}

export function moveDiscoverApp(
  id: string,
  direction: 'up' | 'down',
  adminKey?: string
): DiscoverAppItem[] {
  const updated = moveAppInList(DEFAULT_DISCOVER_APPS, id, direction);
  saveRemoteDiscoverApps(updated, adminKey).catch(() => {});
  return updated;
}

export function toggleDiscoverAppVisibility(
  id: string,
  adminKey?: string
): DiscoverAppItem[] {
  const updated = toggleAppVisibilityInList(DEFAULT_DISCOVER_APPS, id);
  saveRemoteDiscoverApps(updated, adminKey).catch(() => {});
  return updated;
}

export function saveOrUpdateCustomApp(
  app: Partial<DiscoverAppItem>,
  adminKey?: string
): DiscoverAppItem[] {
  const updated = upsertCustomAppInList(DEFAULT_DISCOVER_APPS, app);
  saveRemoteDiscoverApps(updated, adminKey).catch(() => {});
  return updated;
}

export function deleteCustomApp(
  id: string,
  adminKey?: string
): DiscoverAppItem[] {
  const updated = deleteCustomAppInList(DEFAULT_DISCOVER_APPS, id);
  saveRemoteDiscoverApps(updated, adminKey).catch(() => {});
  return updated;
}
