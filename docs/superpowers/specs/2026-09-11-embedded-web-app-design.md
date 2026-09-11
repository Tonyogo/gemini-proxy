# Embedded Web Apps & Discover Custom Site Integration Design Specification

## 1. Overview & Problem Statement

Users need to access arbitrary internal or external web applications directly within the Gemini Proxy Admin Console's **"Discover (发现)"** section—specifically web dashboards such as the **Ubuntu Web UI (`https://ubuntu.yatao.cc.cd/ui/`)**, router dashboards, NAS interfaces, or AI tools.

Currently, the Discover section only presents fixed built-in tools (Web Terminal, System Logs, API Playground, Translate Studio, Mihomo Dashboard). To make the platform truly extensible, we need a universal **Embedded Web App Container** and a **Custom Web App Manager** within the Discover Hub.

---

## 2. Architecture & Component Design

```
+-----------------------------------------------------------------------------------------+
|                                    Client Browser                                       |
|                                                                                         |
|  [ Discover Hub View (DiscoverHubView.tsx) ]                                            |
|  ├─ Built-in Tools Grid: Terminal, Logs, Mihomo, Playground, Translate                  |
|  ├─ Custom Web Apps Section: Rendered from localStorage 'custom_discover_apps'          |
|  │   ├─ Saved Web App Card (e.g., "Ubuntu Web UI" -> https://ubuntu.yatao.cc.cd/ui/)    |
|  │   └─ [+ Add Web App / 添加应用] Action Button & Modal                                |
|                                                                                         |
|  [ Embedded Web View (EmbeddedWebView.tsx) ]                                            |
|  ├─ Top Navigation Toolbar:                                                             |
|  │   ├─ [ < Back to Discover ]                                                          |
|  │   ├─ [ App Title & URL Security Capsule Badge ]                                      |
|  │   ├─ [ 🔄 Refresh ] [ ↗️ Open External ] [ ⛶ Fullscreen / Immersive ] [ ⚙️ Edit App ] |
|  └─ Responsive <iframe> loading the direct URL or proxied endpoint                      |
|      ├─ Loading skeleton & smooth transition                                            |
|      └─ Error & fallback guidance banner if blocked                                      |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Data Structures & State Management

### 3.1 Custom Web App Data Model (`frontend/src/types/customWebApps.ts`)

```typescript
export interface CustomWebAppItem {
  id: string;              // Unique identifier (e.g., 'app_1726045123456')
  name: string;            // User-friendly display name (e.g., 'Ubuntu Web UI')
  url: string;             // Full target URL (e.g., 'https://ubuntu.yatao.cc.cd/ui/')
  icon?: string;           // Optional Lucide icon name or emoji identifier
  color?: string;          // Gradient theme (e.g., 'from-orange-500 to-amber-600')
  useGateway?: boolean;    // Flag for routing through backend reverse gateway (default: false)
  createdAt: number;       // Timestamp in milliseconds
}
```

### 3.2 Storage & Persistence
- **Storage Key**: `localStorage.getItem('custom_discover_apps')`
- **Default Seeding**: If empty on first visit, seed with an initial example or empty state with prominent `+ 添加应用` card.
- **Helper Functions (`frontend/src/utils/customWebAppsStorage.ts`)**:
  - `loadCustomWebApps(): CustomWebAppItem[]`
  - `saveCustomWebApp(app: CustomWebAppItem): void`
  - `deleteCustomWebApp(id: string): void`
  - `updateCustomWebApp(app: CustomWebAppItem): void`

### 3.3 Navigation & Routing (`frontend/src/App.tsx`)
- Extended `DiscoverSubView` type:
  ```typescript
  export type DiscoverSubView =
    | 'hub'
    | 'terminal'
    | 'systemLogs'
    | 'playground'
    | 'translate'
    | 'mihomo'
    | 'embeddedWeb';
  ```
- Active embedded app state:
  ```typescript
  const [activeEmbeddedApp, setActiveEmbeddedApp] = useState<CustomWebAppItem | null>(null);
  ```

---

## 4. UI Components & Interaction Specifications

### 4.1 Custom Web App Modal (`frontend/src/components/CustomWebAppModal.tsx`)
- Fields:
  - **Name** (Required, e.g., "Ubuntu Web UI")
  - **URL** (Required, auto-normalizes protocol e.g. `ubuntu.yatao.cc.cd/ui/` -> `https://ubuntu.yatao.cc.cd/ui/`)
  - **Color / Icon Accent Picker** (Preset gradients: Orange/Amber, Blue/Cyan, Purple/Indigo, Emerald/Teal)
  - **Advanced**: "Use Reverse Gateway Proxy" checkbox (for cross-origin/HTTP-only targets)
- Actions: Save, Cancel, Delete (in edit mode).

### 4.2 Embedded Web View (`frontend/src/components/EmbeddedWebView.tsx`)
- **Navigation Toolbar**:
  - Breadcrumb / Back button to return to Discover Hub.
  - Active site indicator: App icon, title, and hostname badge.
  - Quick action buttons:
    - **Refresh**: Key-based or iframe reload trigger.
    - **External Open**: Opens target URL in new browser tab (`window.open(url, '_blank')`).
    - **Fullscreen Mode**: Toggles CSS fullscreen/immersive layout.
    - **Edit**: Opens `CustomWebAppModal` pre-populated with current app details.
- **Iframe Integration**:
  - Sandboxing and permission attributes: `allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; display-capture"`.
  - Responsive layout occupying remaining viewport height (`calc(100vh - toolbar_height)`).
  - Smooth loading state with spinner overlay until `onLoad` fires.

### 4.3 Discover Hub View Enhancements (`frontend/src/components/DiscoverHubView.tsx`)
- **Desktop Grid**:
  - New section: "自定义 Web 应用 (Custom Web Apps)" with dynamic cards.
  - Each card features: Icon with gradient background, app name, target domain, quick action buttons (open embed, open external, edit, delete).
  - `+ 添加新应用` card with dashed border and hover animation.
- **Mobile List**:
  - New group in WeChat-style list view.
  - Tap to launch embedded view, swipe/long-press actions for edit/delete.

---

## 5. Security & Error Handling

1. **Protocol Validation**:
   - Only `http://` and `https://` schemes are permitted.
   - Reject `javascript:`, `data:`, `file:`, and other dangerous URI schemes.
2. **Iframe Fallback & Mixed Content Prevention**:
   - If user is on an HTTPS console and attempts to embed an unproxied `http://` site, display a warning card suggesting enabling the Gateway Proxy or opening externally.
3. **i18n Multi-Language Support**:
   - Comprehensive Chinese/English translation keys under `discover.customApp*` namespace.

---

## 6. Verification & Testing Plan

1. **Unit & Component Tests (`tests/embeddedWebView.test.ts` & `tests/customWebApps.test.ts`)**:
   - Verify `CustomWebAppModal` form validation and URL normalization.
   - Verify `localStorage` CRUD operations for custom web apps.
   - Verify `EmbeddedWebView` toolbar triggers (back, refresh, external link).
   - Verify `DiscoverHubView` renders custom apps and handles launch events.
2. **Regression & Build Verification**:
   - Run `npm test` across the full test suite.
   - Run `npm run build` to verify clean frontend and backend compilation.
