# Mihomo Web Panel Manual Configuration Design Specification

## 1. Context & Motivation

In the initial implementation, the Mihomo Web Panel connected to a fixed `MIHOMO_API_URL` and `MIHOMO_SECRET` defined globally in the backend `.env` file. However, users need the flexibility to manually configure and change the Mihomo target API endpoint (e.g. `http://127.0.0.1:9090`, a custom port, or a local LAN router IP like `http://192.168.3.1:9090`) and authorization Secret directly within the Web UI, without editing server environment files or restarting the Node.js process.

---

## 2. Design Principles & Architecture (Approach A)

```
+-----------------------------------------------------------------------------------+
|                              MihomoView (Browser UI)                              |
|                                                                                   |
|  [ Settings Modal ]                                                               |
|  - API URL input (defaults to http://127.0.0.1:9090)                              |
|  - Secret Key input (with show/hide password toggle)                              |
|  - Saved to localStorage ('mihomo_api_url', 'mihomo_api_secret')                  |
+-----------------------------------------+-----------------------------------------+
                                          |
               HTTP Request with Custom Headers via Relay:
               - x-admin-key: <ADMIN_SECRET_KEY>
               - x-mihomo-url: <Custom API URL from localStorage>
               - x-mihomo-secret: <Custom Secret from localStorage>
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                           Gemini Proxy Backend Server                             |
|  Route: /api/admin/mihomo/*                                                       |
|                                                                                   |
|  MihomoController / MihomoService:                                                |
|  - Extracts req.headers['x-mihomo-url'] || config.mihomoApiUrl                    |
|  - Extracts req.headers['x-mihomo-secret'] || config.mihomoSecret                 |
|  - Injects 'Authorization: Bearer <EffectiveSecret>'                              |
|  - Forwards requests to target Mihomo instance                                    |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                         Target Mihomo (Clash.Meta) Core                           |
+-----------------------------------------------------------------------------------+
```

---

## 3. Detailed Specifications

### 3.1 Backend Relay Enhancements

1. **Context-Aware `MihomoService` (`src/admin/services/mihomoService.ts`)**:
   - Refactor `MihomoService` methods to accept optional `targetUrl?: string` and `targetSecret?: string` overrides extracted from request headers:
     ```typescript
     export interface MihomoConnectionOptions {
       targetUrl?: string;
       targetSecret?: string;
     }
     ```
   - When forwarding requests, the effective base URL is determined by:
     `options.targetUrl || config.mihomoApiUrl || 'http://127.0.0.1:9090'`
   - The effective authorization header is determined by:
     `options.targetSecret !== undefined ? options.targetSecret : config.mihomoSecret`
     (If empty or not provided, no Authorization header is sent; otherwise `Bearer <secret>` is sent).

2. **Controller Header Extraction (`src/admin/controllers/mihomoController.ts`)**:
   - Extract connection options from incoming Express request headers:
     ```typescript
     private getConnectionOptions(req: Request): MihomoConnectionOptions {
       const targetUrl = (req.headers['x-mihomo-url'] as string)?.trim() || undefined;
       const targetSecret = (req.headers['x-mihomo-secret'] as string) || undefined;
       return { targetUrl, targetSecret };
     }
     ```
   - Pass options to all service methods (`getStatus`, `getTraffic`, `getProxies`, `selectProxy`, `getProxyDelay`, `getConfigs`, `updateConfigs`, `getConnections`, `closeConnections`).

### 3.2 Frontend UI & Settings Modal (`frontend/src/components/MihomoView.tsx`)

1. **LocalStorage Persistence**:
   - Read from `localStorage.getItem('mihomo_api_url')` (defaulting to `http://127.0.0.1:9090`).
   - Read from `localStorage.getItem('mihomo_api_secret')` (defaulting to `''`).
   - Save updates upon form submission in the settings modal.

2. **Dynamic Request Headers**:
   - In `getHeaders()`:
     ```typescript
     const headers: Record<string, string> = {
       'Content-Type': 'application/json',
     };
     if (adminKey) headers['x-admin-key'] = adminKey;
     if (apiUrl) headers['x-mihomo-url'] = apiUrl;
     if (apiSecret) headers['x-mihomo-secret'] = apiSecret;
     return headers;
     ```

3. **Settings Modal Component**:
   - Triggered by a dedicated **Settings (`SlidersHorizontal` / `Settings`)** button on the top right toolbar.
   - Also accessible from the **Offline / Unauthorized Empty State** with a prominent "配置连接参数 (Configure Connection)" action button.
   - Fields:
     - **API 基础地址 (Endpoint)**: text input with helper text (e.g. `http://127.0.0.1:9090`).
     - **API 访问密钥 (Secret)**: password input with show/hide toggle.
     - **一键测试连通性 (Test Connection)** button: tests `/status` and displays immediate success/failure feedback in the modal.
     - **保存配置 (Save)** button.

4. **I18n Localization**:
   - Add translation keys in `frontend/src/i18n/locales/zh.ts` and `en.ts` for modal title, inputs, test connection, and feedback messages.

---

## 4. Verification & Testing

1. **Backend Integration Tests (`tests/mihomoProxy.test.ts`)**:
   - Verify that requests passing `x-mihomo-url` forward to the overridden target server instead of the default config.
   - Verify that requests passing `x-mihomo-secret` inject the overridden bearer token.
   - Verify fallback to `.env` / `config` when custom headers are omitted.
2. **Frontend Structural Tests (`tests/mihomoView.test.ts`)**:
   - Verify `MihomoView.tsx` includes settings modal triggers, `x-mihomo-url` and `x-mihomo-secret` header bindings, and localStorage reads.
3. **End-to-End Build**:
   - `npm test` and `npm run build` pass cleanly.
