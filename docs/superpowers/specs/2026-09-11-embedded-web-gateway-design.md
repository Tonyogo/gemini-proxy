# Embedded Web Gateway & Custom Web Apps Integration Design Specification

## 1. Overview & Problem Statement

Users need to access web-based management dashboards hosted on the backend server, specifically the local **Mihomo (Clash.Meta) Web UI (`http://127.0.0.1:9090/ui/`)**, as well as other arbitrary intranet or internet web services (such as router dashboards, Portainer, NAS, or monitoring tools) directly inside the Gemini Proxy Admin Console's **"Discover"** section.

### Core Technical Challenges:
1. **Mixed Content Blocking**: If the Gemini Proxy Web Console is accessed over HTTPS or via Cloudflare Tunnel, modern browsers strictly prohibit loading unencrypted `http://127.0.0.1:9090` in an iframe.
2. **Local Loopback Disconnect**: When accessing the console from mobile devices or external networks, `127.0.0.1` refers to the mobile phone itself, not the remote host running Mihomo.
3. **Anti-Embedding Headers (`X-Frame-Options` & CSP `frame-ancestors`)**: Many web services enforce headers preventing `iframe` rendering.
4. **Arbitrary URL Scalability**: The system should not only support `http://127.0.0.1:9090/ui/`, but provide an extensible framework allowing users to bookmark and embed any custom web tools in the Discover section.

---

## 2. Architecture & Design Principles

```
+-----------------------------------------------------------------------------------------+
|                                    Client Browser                                       |
|                                                                                         |
|  [ Discover Hub View ]                                                                  |
|  ├─ Preset App Card: "Mihomo 仪表盘" (Pointing to <EffectiveMihomoUrl>/ui/)              |
|  ├─ Custom Web Apps List (Stored in localStorage 'custom_web_apps')                     |
|  └─ Button: [ + 添加 Web 页面 ] (Modal to add Name, URL, Icon, Proxy mode)              |
|                                                                                         |
|  [ EmbeddedWebView Component ]                                                          |
|  ├─ Browser Navigation Toolbar: [Back] [Forward] [Refresh] [Open External] [Fullscreen] |
|  ├─ URL Address Capsule & Security Badge                                                |
|  └─ Responsive <iframe> loading the proxied or direct web application                   |
+--------------------------------------------+--------------------------------------------+
                                             |
                         (Authenticated via Admin Key / Cookie / Header)
                                             v
+-----------------------------------------------------------------------------------------+
|                              Gemini Proxy Backend Server                                |
|                                                                                         |
|  Route: /api/admin/web-gateway/*                                                        |
|  Service: webGatewayService.ts                                                          |
|                                                                                         |
|  1. Parses target URL and target path                                                   |
|  2. Fetches upstream HTTP/HTTPS resources (HTML, JavaScript, CSS, SVGs, Fonts)           |
|  3. Strips restrictive headers (X-Frame-Options, frame-ancestors, CSP)                   |
|  4. Streams sanitized response back to client iframe with proper MIME types             |
+--------------------------------------------+--------------------------------------------+
                                             |
                                             v
+-----------------------------------------------------------------------------------------+
|                           Target Local / Intranet Web Server                            |
|                            (http://127.0.0.1:9090/ui/ etc.)                             |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Detailed Specifications

### 3.1 Backend Reverse Web Gateway (`src/admin/services/webGatewayService.ts` & `adminRoutes.ts`)

1. **Gateway Route Specification**:
   - `GET /api/admin/web-gateway`:
     - Query Parameters:
       - `url`: The base target URL (e.g. `http://127.0.0.1:9090/ui/` or `http://127.0.0.1:9090`).
       - `path`: Sub-resource relative path.
   - `GET /api/admin/web-gateway/proxy/*`:
     - Catch-all wildcard proxy route supporting relative assets like `./assets/index-xxx.js`, images, and stylesheets.
2. **Security & Header Sanitization**:
   - Protect all gateway routes using `adminAuthMiddleware`.
   - Strip headers that block iframe integration:
     - `x-frame-options`
     - `content-security-policy` (specifically `frame-ancestors`)
     - `cross-origin-opener-policy`
     - `cross-origin-embedder-policy`
   - Preserve content encoding, MIME type (`content-type`), and streaming chunks.
3. **Safety & Private Network Validation**:
   - Validate target URL protocol (`http:` or `https:` only).
   - Prevent command injection and file scheme access (`file://`).

### 3.2 Universal Embedded Web View (`frontend/src/components/EmbeddedWebView.tsx`)

1. **Toolbar Controls**:
   - **Back / Forward**: Trigger history navigation inside iframe where permitted.
   - **Refresh**: Reload iframe `src` synchronously.
   - **Open in New Window**: External launch button for full-window browsing.
   - **Fullscreen Toggle**: Expand to full viewport (`100dvh`).
   - **Current URL Address Display**: Pill badge showing target host and protocol.
2. **Loading & Error Handling**:
   - Loading skeleton spinner during asset fetching.
   - Elegant error card if the target server is unreachable (e.g., Mihomo service is stopped), offering retry and manual settings check.

### 3.3 Discover Hub Custom Web Apps Integration (`frontend/src/components/DiscoverHubView.tsx`)

1. **Preset Card: Mihomo Dashboard (`/ui/`)**:
   - Dynamic target URL: Reads `localStorage.getItem('mihomo_api_url')` (default `http://127.0.0.1:9090`), normalizes trailing slash, and appends `ui/`.
   - Distinctive gradient icon and "DASHBOARD" badge.
2. **Custom Web App Management**:
   - Store custom items in `localStorage.getItem('custom_discover_apps')`.
   - Data structure:
     ```typescript
     export interface CustomWebAppItem {
       id: string;
       name: string;
       url: string;
       useGateway: boolean; // true = through backend reverse gateway; false = direct iframe
       icon?: string;
       category?: 'system' | 'dev' | 'custom';
       createdAt: number;
     }
     ```
   - Modal for adding/editing/deleting custom web apps.
   - Responsive cards rendered in Discover Hub for both Desktop grid and Mobile categories.

### 3.4 Routing & Navigation (`frontend/src/App.tsx`)

- Support generic web view routing: `discoverSubView === 'embeddedWeb'`.
- Manage active embedded URL and title in state.
- Preserve mobile immersive navigation and back button support.

---

## 4. Verification & Testing Plan

1. **Backend Gateway Unit & Integration Tests (`tests/webGateway.test.ts`)**:
   - Start a mock target HTTP server serving an HTML page with `X-Frame-Options: DENY` and relative assets.
   - Verify `/api/admin/web-gateway` strips `X-Frame-Options` and streams the HTML content.
   - Verify relative assets (`.js`, `.css`) load correctly through the proxy.
   - Verify rejection without `x-admin-key`.
2. **Frontend UI Structural Tests (`tests/embeddedWebView.test.ts`)**:
   - Verify `EmbeddedWebView.tsx` contains iframe, navigation actions, and fallback states.
   - Verify `DiscoverHubView.tsx` supports custom apps state and Mihomo UI entry.
3. **End-to-End Build**:
   - `npm test` across all test suites passes with 0 failures.
   - `npm run build` succeeds cleanly.
