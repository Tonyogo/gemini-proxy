import { CustomWebAppItem } from '../types/customWebApps';

export const CUSTOM_WEB_APPS_STORAGE_KEY = 'custom_discover_apps';

export function normalizeWebAppUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('URL cannot be empty');
  }

  let finalUrl = trimmed;
  if (!/^https?:\/\//i.test(finalUrl)) {
    // If it contains illegal protocol
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

export const PRESET_CUSTOM_WEB_APPS: CustomWebAppItem[] = [
  {
    id: 'preset_ubuntu_ui',
    name: 'Ubuntu Web UI',
    url: 'https://ubuntu.yatao.cc.cd/ui/',
    icon: 'Layout',
    color: 'from-orange-500 to-amber-600',
    createdAt: 1726045000000,
  },
];

export function loadCustomWebApps(): CustomWebAppItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_WEB_APPS_STORAGE_KEY);
    if (raw === null) {
      try {
        localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(PRESET_CUSTOM_WEB_APPS));
      } catch {
        // ignore potential quota error
      }
      return [...PRESET_CUSTOM_WEB_APPS];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function syncCustomWebAppsFromRemote(remoteApps?: CustomWebAppItem[]): CustomWebAppItem[] {
  if (Array.isArray(remoteApps) && remoteApps.length > 0) {
    try {
      localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(remoteApps));
    } catch {
      // ignore storage quota error
    }
    return remoteApps;
  }
  return loadCustomWebApps();
}

export async function syncCustomWebAppsToRemote(
  apps: CustomWebAppItem[],
  adminKey?: string
): Promise<boolean> {
  if (!adminKey) return false;
  try {
    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customWebApps: apps }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function saveCustomWebApp(
  app: Omit<CustomWebAppItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
  adminKey?: string
): CustomWebAppItem {
  const normalizedUrl = normalizeWebAppUrl(app.url);
  const existingList = loadCustomWebApps();

  let targetItem: CustomWebAppItem;

  if (app.id) {
    const index = existingList.findIndex((item) => item.id === app.id);
    if (index !== -1) {
      const updatedItem: CustomWebAppItem = {
        ...existingList[index],
        ...app,
        id: app.id,
        url: normalizedUrl,
      };
      existingList[index] = updatedItem;
      targetItem = updatedItem;
    } else {
      targetItem = {
        id: app.id,
        name: app.name.trim(),
        url: normalizedUrl,
        icon: app.icon || 'Globe',
        color: app.color || 'from-orange-500 to-amber-600',
        useGateway: !!app.useGateway,
        createdAt: app.createdAt || Date.now(),
      };
      existingList.push(targetItem);
    }
  } else {
    targetItem = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: app.name.trim(),
      url: normalizedUrl,
      icon: app.icon || 'Globe',
      color: app.color || 'from-orange-500 to-amber-600',
      useGateway: !!app.useGateway,
      createdAt: app.createdAt || Date.now(),
    };
    existingList.push(targetItem);
  }

  localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(existingList));

  if (adminKey) {
    syncCustomWebAppsToRemote(existingList, adminKey).catch(() => {});
  }

  return targetItem;
}

export function deleteCustomWebApp(id: string, adminKey?: string): void {
  const existingList = loadCustomWebApps();
  const filtered = existingList.filter((item) => item.id !== id);
  localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(filtered));

  if (adminKey) {
    syncCustomWebAppsToRemote(filtered, adminKey).catch(() => {});
  }
}
