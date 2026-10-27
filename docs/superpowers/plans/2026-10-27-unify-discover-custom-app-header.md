# Unify Discover Custom App Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the header title and navigation bar of third-party embedded web applications in the Discover tab to match the standard built-in page breadcrumbs layout (`Gemini Proxy > 发现 > [App Name]`).

**Architecture:** Remove the dedicated embedded web title override from the left side of `<header>` in `frontend/src/App.tsx`. Third-party applications (`discoverSubView === 'embeddedWeb'`) will now route through the standard breadcrumbs layout alongside built-in tools (`systemLogs`, `playground`, `translate`, `tasks`), restoring the desktop sidebar toggle, "Gemini Proxy > 发现 > [App Name]" breadcrumbs, and EffortSelector, while preserving the embedded web action toolbar (`refresh`, `open external`, `fullscreen`, `edit`) on the right.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest

**Spec:** In-conversation design approved for bounded task (unifying third-party app header title with built-in discover apps).

## Global Constraints

- Do not alter the right-side embedded action buttons (`data-testid="embed-refresh-btn"`, `embed-open-external-btn`, `embed-fullscreen-btn`, `embed-edit-btn`).
- Ensure mobile back navigation (`data-testid="embed-back-btn"` / `handleMobileBack`) remains seamless when returning from embedded web views to the Discover hub.
- Ensure clicking the "发现" (`t('nav.discover')`) segment in desktop breadcrumbs returns to `discoverSubView = 'hub'` and exits fullscreen mode if active.
- Remove obsolete unused helper functions (`getEmbeddedHostname`) and icon imports (`Lock`, `AlertTriangle`) from `App.tsx`.

## Review Focus

- Desktop breadcrumb rendering: when viewing an embedded web app, desktop header displays `Gemini Proxy > 发现 > [activeEmbeddedApp.name]`, plus the `<EffortSelector />`.
- Desktop return to hub: clicking the "发现" link in the breadcrumb resets `discoverSubView` to `'hub'` and resets `isEmbeddedFullscreen` to `false`.
- Mobile return to hub: the mobile back button (`‹ 发现`) calls `handleMobileBack` which sets `discoverSubView` to `'hub'`.
- Right-side actions: embedded web toolbar (`refresh`, `openExternal`, `fullscreen`, `edit`) continues to display on the right side of the header when in `discoverSubView === 'embeddedWeb'`.
- Regression check: all 124 Jest test suites and frontend build (`npm run build:frontend`) pass with zero errors.

---

### Task 1: Unify Header Title & Breadcrumb in `App.tsx` and Update Integration Tests

**Files:**
- Modify: `frontend/src/App.tsx:1-35,130-170,630-745`
- Test: `tests/embeddedHeaderIntegration.test.ts:1-58`

**Interfaces:**
- In `frontend/src/App.tsx`:
  - When `activeTab === 'discover' && discoverSubView === 'embeddedWeb'`:
    - Header left renders the unified breadcrumb:
      `Gemini Proxy >` `<button onClick={() => { setDiscoverSubView('hub'); setIsEmbeddedFullscreen(false); }}>{t('nav.discover')}</button> >` `<span>{activeEmbeddedApp?.name || t('discover.customAppsTitle')}</span>`
    - EffortSelector is preserved in the breadcrumbs bar.
    - Header right preserves `<div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">` with `embed-refresh-btn`, `embed-open-external-btn`, `embed-fullscreen-btn`, and `embed-edit-btn`.

- [x] **Step 1: Write the updated test assertions in `tests/embeddedHeaderIntegration.test.ts`**

Update `tests/embeddedHeaderIntegration.test.ts` to assert:
1. `embed-refresh-btn`, `embed-open-external-btn`, `embed-fullscreen-btn`, and `embed-edit-btn` remain in `App.tsx`.
2. Unified breadcrumb navigation: `App.tsx` renders `discoverSubView === 'embeddedWeb' && (activeEmbeddedApp?.name || t('discover.customAppsTitle'))` inside the standard breadcrumb container.
3. Left side of header uses standard breadcrumb without separate custom title container (no duplicate `getEmbeddedHostname` or `Lock` in header).
4. `EmbeddedWebView` still does not contain internal duplicate toolbar.

```ts
import * as fs from 'fs';
import * as path from 'path';

describe('Unified Discover Header Integration for Embedded Web Apps', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const webViewPath = path.resolve(__dirname, '../frontend/src/components/EmbeddedWebView.tsx');

  let appContent: string;
  let webViewContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    webViewContent = fs.readFileSync(webViewPath, 'utf-8');
  });

  describe('App.tsx Unified Embedded Header', () => {
    it('integrates embedded web controls into global header right section', () => {
      expect(appContent).toContain('data-testid="embed-refresh-btn"');
      expect(appContent).toContain('data-testid="embed-open-external-btn"');
      expect(appContent).toContain('data-testid="embed-fullscreen-btn"');
      expect(appContent).toContain('data-testid="embed-edit-btn"');
    });

    it('unifies embedded web app title into standard breadcrumbs layout', () => {
      expect(appContent).toContain(
        "discoverSubView === 'embeddedWeb' && (activeEmbeddedApp?.name || t('discover.customAppsTitle'))"
      );
      // Header left should use standard breadcrumb flow instead of custom Lock/hostname box
      expect(appContent).not.toContain('getEmbeddedHostname');
    });

    it('syncs remote customWebApps from status response on console load', () => {
      expect(appContent).toContain('syncCustomWebAppsFromRemote');
    });

    it('passes reload trigger and fullscreen state to EmbeddedWebView', () => {
      expect(appContent).toContain('embeddedReloadKey');
      expect(appContent).toContain('isEmbeddedFullscreen');
    });
  });

  describe('EmbeddedWebView Elimination of Duplicate Toolbar', () => {
    it('does not render duplicate internal navigation toolbar in EmbeddedWebView', () => {
      expect(webViewContent).not.toContain('data-testid="embed-back-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-refresh-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-open-external-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-fullscreen-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-edit-btn"');
    });

    it('EmbeddedWebView directly renders iframe with full height', () => {
      expect(webViewContent).toContain('data-testid="embedded-iframe"');
      expect(webViewContent).toContain('reloadKey');
      expect(webViewContent).toContain('isFullscreen');
      expect(webViewContent).toContain('100%');
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/embeddedHeaderIntegration.test.ts --runInBand`
Expected: FAIL on `not.toContain('getEmbeddedHostname')`.

- [x] **Step 3: Refactor header left section in `frontend/src/App.tsx`**

1. Remove unused imports `Lock` and `AlertTriangle` from line 13 and line 26 of `frontend/src/App.tsx`.
2. Remove unused helper `getEmbeddedHostname` (around lines 154-160).
3. In `handleMobileBack`:
   ```tsx
   const handleMobileBack = () => {
     if (activeTab === 'logs') {
       setMobileLogDetailOpen(false);
     } else if (activeTab === 'discover') {
       setDiscoverSubView('hub');
       setIsEmbeddedFullscreen(false);
     }
   };
   ```
4. In `<header>`: remove the ternary branch `{activeTab === 'discover' && discoverSubView === 'embeddedWeb' && activeEmbeddedApp ? ( ... ) : ( ... )}` on the left side of `<header>`.
5. In the desktop breadcrumbs "发现" button:
   ```tsx
   <button
     type="button"
     onClick={() => {
       setDiscoverSubView('hub');
       setIsEmbeddedFullscreen(false);
     }}
     className="text-slate-400 hover:text-indigo-400 transition-colors hidden sm:inline"
   >
     {t('nav.discover')}
   </button>
   ```
6. Ensure the mobile back button has `data-testid="embed-back-btn"` attribute when `isMobileDetailActive` is true so backward test references remain satisfied if queried.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/embeddedHeaderIntegration.test.ts --runInBand`
Expected: PASS

- [x] **Step 5: Run full test suite and frontend build to verify zero regressions**

Run: `npm run build && npx jest --runInBand`
Expected: Frontend build and all Jest test suites pass.

- [x] **Step 6: Commit**

```bash
git add frontend/src/App.tsx tests/embeddedHeaderIntegration.test.ts
git commit -m "fix(ui): unify discover custom app header title with built-in app breadcrumbs"
```
