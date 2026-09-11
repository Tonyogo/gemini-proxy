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

export function loadCustomWebApps(): CustomWebAppItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_WEB_APPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomWebApp(
  app: Omit<CustomWebAppItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
): CustomWebAppItem {
  const normalizedUrl = normalizeWebAppUrl(app.url);
  const existingList = loadCustomWebApps();

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
      localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(existingList));
      return updatedItem;
    }
  }

  const newItem: CustomWebAppItem = {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: app.name.trim(),
    url: normalizedUrl,
    icon: app.icon || 'Globe',
    color: app.color || 'from-orange-500 to-amber-600',
    useGateway: !!app.useGateway,
    createdAt: app.createdAt || Date.now(),
  };

  existingList.push(newItem);
  localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(existingList));
  return newItem;
}

export function deleteCustomWebApp(id: string): void {
  const existingList = loadCustomWebApps();
  const filtered = existingList.filter((item) => item.id !== id);
  localStorage.setItem(CUSTOM_WEB_APPS_STORAGE_KEY, JSON.stringify(filtered));
}
