# Embedded Web Apps & Discover Custom Site Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modular embedded web application container and custom web app manager in the Discover Hub, enabling users to add, manage, and seamlessly browse internal or external web apps (like `https://ubuntu.yatao.cc.cd/ui/`) with a responsive browser toolbar, loading skeletons, i18n support, and test coverage.

**Architecture:** 
- Frontend Data Layer: Type definitions and localStorage utility for `CustomWebAppItem` CRUD.
- Frontend UI Components: `CustomWebAppModal` for adding/editing web apps with protocol validation, `EmbeddedWebView` with navigation toolbar and iframe container, and `DiscoverHubView` integration for Desktop and WeChat-style mobile views.
- Routing & Navigation: `App.tsx` state management for `embeddedWeb` subview routing with breadcrumb navigation.
- i18n & Testing: Complete bilingual keys (zh/en) and Jest component/unit tests.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite, Jest.

## Global Constraints

- URL scheme validation: Only `http://` and `https://` are permitted. Auto-prepend `https://` if protocol omitted.
- Zero static configuration caching; maintain strict TypeScript type safety.
- Responsive design: Full parity across Desktop grid and WeChat-style mobile list view.
- 100% test pass rate with zero regression across all 89+ test suites.

---

### Task 1: Type Definitions & Storage Utility for Custom Web Apps

**Files:**
- Create: `frontend/src/types/customWebApps.ts`
- Create: `frontend/src/utils/customWebAppsStorage.ts`
- Test: `tests/customWebAppsStorage.test.ts`

**Interfaces:**
- Produces:
  - `CustomWebAppItem`: `{ id: string; name: string; url: string; icon?: string; color?: string; useGateway?: boolean; createdAt: number; }`
  - `loadCustomWebApps(): CustomWebAppItem[]`
  - `saveCustomWebApp(app: Omit<CustomWebAppItem, 'id' | 'createdAt'> & { id?: string }): CustomWebAppItem`
  - `deleteCustomWebApp(id: string): void`
  - `normalizeWebAppUrl(rawUrl: string): string`

- [x] **Step 1: Write the failing unit tests for storage utility & URL normalizer**

```typescript
// tests/customWebAppsStorage.test.ts
import {
  normalizeWebAppUrl,
  loadCustomWebApps,
  saveCustomWebApp,
  deleteCustomWebApp,
  CUSTOM_WEB_APPS_STORAGE_KEY,
} from '../frontend/src/utils/customWebAppsStorage';
import { CustomWebAppItem } from '../frontend/src/types/customWebApps';

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
  });

  describe('CRUD operations', () => {
    it('should return empty list when no apps exist', () => {
      expect(loadCustomWebApps()).toEqual([]);
    });

    it('should save a new custom web app with generated id and normalized url', () => {
      const saved = saveCustomWebApp({
        name: 'Ubuntu Web UI',
        url: 'ubuntu.yatao.cc.cd/ui/',
        color: 'from-orange-500 to-amber-600',
      });

      expect(saved.id).toBeDefined();
      expect(saved.name).toBe('Ubuntu Web UI');
      expect(saved.url).toBe('https://ubuntu.yatao.cc.cd/ui/');
      expect(saved.createdAt).toBeGreaterThan(0);

      const list = loadCustomWebApps();
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual(saved);
    });

    it('should update an existing custom web app when id is provided', () => {
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
      const app1 = saveCustomWebApp({ name: 'App 1', url: 'https://1.com' });
      const app2 = saveCustomWebApp({ name: 'App 2', url: 'https://2.com' });

      deleteCustomWebApp(app1.id);

      const list = loadCustomWebApps();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(app2.id);
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/customWebAppsStorage.test.ts`
Expected: FAIL with module not found / function not defined.

- [x] **Step 3: Implement `frontend/src/types/customWebApps.ts` & `frontend/src/utils/customWebAppsStorage.ts`**

```typescript
// frontend/src/types/customWebApps.ts
export interface CustomWebAppItem {
  id: string;
  name: string;
  url: string;
  icon?: string;
  color?: string;
  useGateway?: boolean;
  createdAt: number;
}
```

```typescript
// frontend/src/utils/customWebAppsStorage.ts
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
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/customWebAppsStorage.test.ts`
Expected: PASS with 100% assertions satisfied.

- [x] **Step 5: Commit**

```bash
git add frontend/src/types/customWebApps.ts frontend/src/utils/customWebAppsStorage.ts tests/customWebAppsStorage.test.ts
git commit -m "feat(web-apps): add data structures and storage utility for custom web apps"
```

---

### Task 2: i18n Translation Keys for Custom Web Apps & Embedded View

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/i18nCustomWebApps.test.ts`

**Interfaces:**
- Produces translation keys under `discover`:
  - `customAppsTitle`: "自定义应用" / "Custom Web Apps"
  - `customAppsSubtitle`: "快捷访问内网或外部 Web 页面" / "Quick access to intranet or external web pages"
  - `addCustomApp`: "添加 Web 应用" / "Add Web App"
  - `editCustomApp`: "编辑应用" / "Edit Web App"
  - `deleteCustomApp`: "删除应用" / "Delete Web App"
  - `appName`: "应用名称" / "App Name"
  - `appNamePlaceholder`: "如 Ubuntu Web UI" / "e.g. Ubuntu Web UI"
  - `appUrl`: "目标链接 (URL)" / "Target URL"
  - `appUrlPlaceholder`: "如 https://ubuntu.yatao.cc.cd/ui/" / "e.g. https://ubuntu.yatao.cc.cd/ui/"
  - `colorTheme`: "主题配色" / "Color Theme"
  - `useGatewayProxy`: "启用网关反向代理 (处理跨域/防嵌入)" / "Enable Gateway Reverse Proxy"
  - `confirmDeleteApp`: "确定要删除该应用吗？" / "Are you sure you want to delete this app?"
  - `backToDiscover`: "返回发现" / "Back to Discover"
  - `refresh`: "刷新" / "Refresh"
  - `openExternal`: "在新窗口打开" / "Open External"
  - `fullscreen`: "全屏沉浸" / "Fullscreen"
  - `exitFullscreen`: "退出全屏" / "Exit Fullscreen"
  - `loadingApp`: "正在加载应用..." / "Loading application..."
  - `mixedContentWarn`: "如果无法内嵌显示，请尝试在新窗口打开或启用网关代理。" / "If content fails to load in iframe, try opening externally or enable Gateway Proxy."

- [x] **Step 1: Write failing i18n test**

```typescript
// tests/i18nCustomWebApps.test.ts
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('i18n Custom Web Apps Keys', () => {
  const requiredKeys = [
    'customAppsTitle',
    'customAppsSubtitle',
    'addCustomApp',
    'editCustomApp',
    'deleteCustomApp',
    'appName',
    'appNamePlaceholder',
    'appUrl',
    'appUrlPlaceholder',
    'colorTheme',
    'useGatewayProxy',
    'confirmDeleteApp',
    'backToDiscover',
    'refresh',
    'openExternal',
    'fullscreen',
    'exitFullscreen',
    'loadingApp',
    'mixedContentWarn',
  ];

  it('should have all required keys in zh.ts discover namespace', () => {
    const zhDiscover = (zh as any).discover;
    expect(zhDiscover).toBeDefined();
    for (const key of requiredKeys) {
      expect(zhDiscover[key]).toBeDefined();
      expect(typeof zhDiscover[key]).toBe('string');
    }
  });

  it('should have all required keys in en.ts discover namespace', () => {
    const enDiscover = (en as any).discover;
    expect(enDiscover).toBeDefined();
    for (const key of requiredKeys) {
      expect(enDiscover[key]).toBeDefined();
      expect(typeof enDiscover[key]).toBe('string');
    }
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/i18nCustomWebApps.test.ts`
Expected: FAIL with missing keys.

- [x] **Step 3: Update `zh.ts` and `en.ts`**

Add keys to `frontend/src/i18n/locales/zh.ts` and `frontend/src/i18n/locales/en.ts` within the `discover` object.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/i18nCustomWebApps.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/i18nCustomWebApps.test.ts
git commit -m "feat(i18n): add custom web apps and embedded view translations"
```

---

### Task 3: Custom Web App Modal Component (`CustomWebAppModal`)

**Files:**
- Create: `frontend/src/components/CustomWebAppModal.tsx`
- Test: `tests/customWebAppModal.test.ts`

**Interfaces:**
- Props:
  ```typescript
  export interface CustomWebAppModalProps {
    isOpen: boolean;
    appToEdit?: CustomWebAppItem | null;
    onClose: () => void;
    onSave: (savedApp: CustomWebAppItem) => void;
    onDelete?: (appId: string) => void;
  }
  ```

- [x] **Step 1: Write component tests for CustomWebAppModal**

```typescript
// tests/customWebAppModal.test.ts
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CustomWebAppModal } from '../frontend/src/components/CustomWebAppModal';
import { LanguageProvider } from '../frontend/src/i18n/LanguageContext';

const renderWithContext = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('CustomWebAppModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn();
  const mockOnDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = renderWithContext(
      <CustomWebAppModal
        isOpen={false}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders form inputs and handles submission for new app', () => {
    renderWithContext(
      <CustomWebAppModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />
    );

    const nameInput = screen.getByTestId('app-name-input');
    const urlInput = screen.getByTestId('app-url-input');
    const submitBtn = screen.getByTestId('app-submit-btn');

    fireEvent.change(nameInput, { target: { value: 'Ubuntu Web UI' } });
    fireEvent.change(urlInput, { target: { value: 'ubuntu.yatao.cc.cd/ui/' } });
    fireEvent.click(submitBtn);

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ubuntu Web UI',
        url: 'https://ubuntu.yatao.cc.cd/ui/',
      })
    );
  });

  it('populates fields when editing an existing app and handles delete', () => {
    const existingApp = {
      id: 'app_123',
      name: 'Existing App',
      url: 'https://example.com',
      color: 'from-blue-500 to-cyan-600',
      createdAt: 1000,
    };

    renderWithContext(
      <CustomWebAppModal
        isOpen={true}
        appToEdit={existingApp}
        onClose={mockOnClose}
        onSave={mockOnSave}
        onDelete={mockOnDelete}
      />
    );

    const nameInput = screen.getByTestId('app-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Existing App');

    const deleteBtn = screen.getByTestId('app-delete-btn');
    fireEvent.click(deleteBtn);
    expect(mockOnDelete).toHaveBeenCalledWith('app_123');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/customWebAppModal.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement `frontend/src/components/CustomWebAppModal.tsx`**

Implement the modal with:
- Form fields: Name, URL, Theme Color Picker, Gateway Toggle.
- Input validation and error feedback on invalid URL scheme.
- Cancel, Save, and Delete buttons.
- `data-testid` attributes matching test expectations.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/customWebAppModal.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/CustomWebAppModal.tsx tests/customWebAppModal.test.ts
git commit -m "feat(ui): add CustomWebAppModal for adding and editing custom web apps"
```

---

### Task 4: Embedded Web View Component (`EmbeddedWebView`)

**Files:**
- Create: `frontend/src/components/EmbeddedWebView.tsx`
- Test: `tests/embeddedWebView.test.ts`

**Interfaces:**
- Props:
  ```typescript
  export interface EmbeddedWebViewProps {
    app: CustomWebAppItem;
    onBack: () => void;
    onEditApp?: (app: CustomWebAppItem) => void;
  }
  ```

- [x] **Step 1: Write unit tests for EmbeddedWebView**

```typescript
// tests/embeddedWebView.test.ts
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmbeddedWebView } from '../frontend/src/components/EmbeddedWebView';
import { LanguageProvider } from '../frontend/src/i18n/LanguageContext';
import { CustomWebAppItem } from '../frontend/src/types/customWebApps';

const mockApp: CustomWebAppItem = {
  id: 'app_ubuntu',
  name: 'Ubuntu Web UI',
  url: 'https://ubuntu.yatao.cc.cd/ui/',
  color: 'from-orange-500 to-amber-600',
  createdAt: Date.now(),
};

const renderWithContext = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('EmbeddedWebView', () => {
  const mockOnBack = jest.fn();
  const mockOnEdit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    window.open = jest.fn();
  });

  it('renders iframe with app target url and header controls', () => {
    renderWithContext(
      <EmbeddedWebView
        app={mockApp}
        onBack={mockOnBack}
        onEditApp={mockOnEdit}
      />
    );

    expect(screen.getByText('Ubuntu Web UI')).toBeInTheDocument();
    expect(screen.getByText('ubuntu.yatao.cc.cd')).toBeInTheDocument();

    const iframe = screen.getByTestId('embedded-iframe') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toBe('https://ubuntu.yatao.cc.cd/ui/');
  });

  it('triggers onBack when back button is clicked', () => {
    renderWithContext(
      <EmbeddedWebView
        app={mockApp}
        onBack={mockOnBack}
        onEditApp={mockOnEdit}
      />
    );

    const backBtn = screen.getByTestId('embed-back-btn');
    fireEvent.click(backBtn);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('opens external URL when open external button is clicked', () => {
    renderWithContext(
      <EmbeddedWebView
        app={mockApp}
        onBack={mockOnBack}
        onEditApp={mockOnEdit}
      />
    );

    const openExternalBtn = screen.getByTestId('embed-open-external-btn');
    fireEvent.click(openExternalBtn);
    expect(window.open).toHaveBeenCalledWith('https://ubuntu.yatao.cc.cd/ui/', '_blank');
  });

  it('triggers onEditApp when edit button is clicked', () => {
    renderWithContext(
      <EmbeddedWebView
        app={mockApp}
        onBack={mockOnBack}
        onEditApp={mockOnEdit}
      />
    );

    const editBtn = screen.getByTestId('embed-edit-btn');
    fireEvent.click(editBtn);
    expect(mockOnEdit).toHaveBeenCalledWith(mockApp);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/embeddedWebView.test.ts`
Expected: FAIL.

- [x] **Step 3: Implement `frontend/src/components/EmbeddedWebView.tsx`**

Implement `EmbeddedWebView` with:
- Top sticky toolbar with back navigation, icon & title, URL badge with hostname and padlock icon.
- Actions: Refresh (increments reload key), Open External (`window.open`), Fullscreen toggle (adds full-bleed container styling), Edit button.
- Iframe container with `allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; display-capture"` and `data-testid="embedded-iframe"`.
- Loading spinner animation that fades out once `iframe.onLoad` triggers.
- Responsive height computation (`calc(100vh - 120px)` on desktop, full mobile viewport).

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/embeddedWebView.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/EmbeddedWebView.tsx tests/embeddedWebView.test.ts
git commit -m "feat(ui): add EmbeddedWebView container with navigation toolbar and iframe sandbox"
```

---

### Task 5: Discover Hub Integration & App Routing (`DiscoverHubView.tsx` & `App.tsx`)

**Files:**
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `tests/discoverHubCustomApps.test.ts`

**Interfaces:**
- Produces:
  - `DiscoverToolId`: extended to support `'embeddedWeb'` or custom tool dispatch
  - `DiscoverHubViewProps`: supports `onSelectCustomApp: (app: CustomWebAppItem) => void`
  - `App.tsx`: routing to `EmbeddedWebView` when `discoverSubView === 'embeddedWeb'`

- [x] **Step 1: Write integration tests for DiscoverHubView custom apps**

```typescript
// tests/discoverHubCustomApps.test.ts
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DiscoverHubView } from '../frontend/src/components/DiscoverHubView';
import { LanguageProvider } from '../frontend/src/i18n/LanguageContext';
import { saveCustomWebApp } from '../frontend/src/utils/customWebAppsStorage';

const renderWithContext = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe('DiscoverHubView Custom Apps Integration', () => {
  const mockOnSelectTool = jest.fn();
  const mockOnSelectCustomApp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('renders "+ Add Web App" button and seeded/saved custom web app cards', () => {
    saveCustomWebApp({
      name: 'Ubuntu Web UI',
      url: 'https://ubuntu.yatao.cc.cd/ui/',
      color: 'from-orange-500 to-amber-600',
    });

    renderWithContext(
      <DiscoverHubView
        adminKey="test-key"
        onSelectTool={mockOnSelectTool}
        onSelectCustomApp={mockOnSelectCustomApp}
      />
    );

    // Verify custom app title is rendered
    expect(screen.getAllByText('Ubuntu Web UI').length).toBeGreaterThan(0);

    // Click custom app card
    const appCard = screen.getByTestId('custom-app-card-Ubuntu Web UI');
    fireEvent.click(appCard);
    expect(mockOnSelectCustomApp).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ubuntu Web UI',
        url: 'https://ubuntu.yatao.cc.cd/ui/',
      })
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverHubCustomApps.test.ts`
Expected: FAIL.

- [x] **Step 3: Update `DiscoverHubView.tsx` and `App.tsx`**

- In `DiscoverHubView.tsx`:
  - Read custom apps from `loadCustomWebApps()` on mount and state changes.
  - Render Custom Web Apps grid in Desktop view with card hover, domain info, and launch action.
  - Render Custom Web Apps section in Mobile WeChat-style list.
  - Provide `+ 添加 Web 页面` action which opens `CustomWebAppModal`.
  - Handle card edit/delete and launch callbacks.
- In `App.tsx`:
  - Add `activeEmbeddedApp: CustomWebAppItem | null` state.
  - Render `<EmbeddedWebView app={activeEmbeddedApp} onBack={() => setDiscoverSubView('hub')} onEditApp={...} />` when `activeTab === 'discover' && discoverSubView === 'embeddedWeb'`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/discoverHubCustomApps.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/DiscoverHubView.tsx frontend/src/App.tsx tests/discoverHubCustomApps.test.ts
git commit -m "feat(discover): integrate custom web apps grid and embedded web routing in Discover Hub"
```

---

### Task 6: Full System Build, Regression Verification & Seed Ubuntu Web UI

**Files:**
- Modify: `frontend/src/utils/customWebAppsStorage.ts` (Ensure default seed includes `Ubuntu Web UI` if storage is brand new/empty)
- Test: All suites (`npm test`)

- [x] **Step 1: Verify default seeding logic in `customWebAppsStorage.ts`**

When `localStorage.getItem(CUSTOM_WEB_APPS_STORAGE_KEY)` is null on first launch, initialize with preset item:
```typescript
{
  id: 'preset_ubuntu_ui',
  name: 'Ubuntu Web UI',
  url: 'https://ubuntu.yatao.cc.cd/ui/',
  icon: 'Layout',
  color: 'from-orange-500 to-amber-600',
  createdAt: Date.now(),
}
```

- [x] **Step 2: Run complete Jest test suite**

Run: `npm test`
Expected: All test suites (90+ suites) PASS with 0 failures.

- [x] **Step 3: Run full production build**

Run: `npm run build`
Expected: Clean build of Vite React frontend to `dist/frontend` and TypeScript backend to `dist/src`.

- [x] **Step 4: Commit**

```bash
git add frontend/src/utils/customWebAppsStorage.ts
git commit -m "feat(web-apps): add Ubuntu Web UI preset seeding and complete full build verification"
```

---

## Self-Review Checklist

1. **Spec Coverage**:
   - Custom Web App Model & Storage CRUD: Handled in Task 1.
   - i18n Translations: Handled in Task 2.
   - CustomWebAppModal: Handled in Task 3.
   - EmbeddedWebView with toolbar, iframe sandbox, loading state: Handled in Task 4.
   - DiscoverHub integration (Desktop grid + Mobile list) & App routing: Handled in Task 5.
   - Seeding `https://ubuntu.yatao.cc.cd/ui/` & full build validation: Handled in Task 6.
2. **No Placeholders**: Every step has exact file names, complete test code, and explicit commit messages.
3. **Type Consistency**: `CustomWebAppItem` and `DiscoverSubView` types match across all tasks.
