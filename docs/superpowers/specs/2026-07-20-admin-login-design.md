# Admin Log Viewer Login Design Spec

## Overview
The Gemini-Proxy currently exposes an admin log viewer at `/logs-viewer` and related API endpoints at `/api/logs/*`. Currently, these routes are protected by a `localhostOnly` middleware, completely blocking remote access.

The goal is to remove the local-only restriction and replace it with HTTP Basic Authentication, allowing secure remote access controlled by credentials configured via environment variables.

## Architecture & Security
*   **Authentication Type:** HTTP Basic Authentication. This is lightweight, requires no frontend UI changes (uses browser's native login modal), and provides sufficient security over HTTPS.
*   **Credentials Configuration:** A new environment variable `ADMIN_CREDENTIALS` will be introduced. 
    *   Format: `username:password` (e.g., `admin:supersecret123`).
    *   If `ADMIN_CREDENTIALS` is not set, the admin routes should ideally deny all access by default (fail-safe) or fallback to `localhostOnly` for backward compatibility. We will go with **denying all access** if credentials aren't set to avoid unintentional public exposure.
*   **Middleware (`src/middleware/auth.ts`):** 
    *   Create a `basicAuth` middleware.
    *   It will parse the `Authorization` header (`Basic <base64>`).
    *   It will compare the decoded credentials against the configured `ADMIN_CREDENTIALS`.
    *   If auth fails, return HTTP 401 Unauthorized with `WWW-Authenticate: Basic realm="Admin Area"`.

## Component Updates

1.  **Environment / Config (`config/default.ts` & `.env.example`)**
    *   Add `adminCredentials: process.env.ADMIN_CREDENTIALS` to the config object.
    *   Update `.env.example` to document `ADMIN_CREDENTIALS=admin:password`.

2.  **Middleware (`src/middleware/auth.ts`)**
    *   Implement the `basicAuth` function.
    *   Handle missing `ADMIN_CREDENTIALS` config securely (return 403 Forbidden or 401).

3.  **Routes (`src/routes/adminRoutes.ts`)**
    *   Remove the `router.use(localhostOnly);` line.
    *   Apply `router.use(basicAuth);` to protect all admin endpoints (`/logs-viewer` and `/api/logs/*`).

## Error Handling & Edge Cases
*   **No credentials set in ENV:** The middleware will reject all requests to the admin area to prevent accidental open access.
*   **Invalid Base64 in Header:** Middleware must safely handle malformed `Authorization` headers.

## Testing Strategy
*   Manual test: Attempt access without credentials -> 401.
*   Manual test: Attempt access with wrong credentials -> 401.
*   Manual test: Attempt access with correct credentials -> 200/HTML.
*   Manual test: Ensure it works from non-localhost (if applicable/testable locally).