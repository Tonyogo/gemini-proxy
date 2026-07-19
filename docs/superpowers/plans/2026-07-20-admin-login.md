# Admin Log Viewer Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `localhostOnly` middleware on admin log routes with HTTP Basic Authentication based on environment variables to allow secure remote access.

**Architecture:** A new Express middleware `basicAuth` will be created to parse and validate the `Authorization` header against an `ADMIN_CREDENTIALS` environment variable (format `user:pass`). The existing `localhostOnly` middleware on `/logs-viewer` and `/api/logs/*` will be replaced with this new middleware.

**Tech Stack:** Express.js, TypeScript, Node.js `Buffer` (for base64 decoding).

## Global Constraints

- Authentication format: `ADMIN_CREDENTIALS=user:password`
- Security fail-safe: If `ADMIN_CREDENTIALS` is undefined, all access to protected routes MUST be denied (401 or 403) to prevent accidental open access.
- Only built-in Node modules (e.g., `Buffer`) should be used for base64 decoding; no new dependencies.

---

### Task 1: Update Configuration and Type Definitions

**Files:**
- Modify: `config/default.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `config.adminCredentials` (string | undefined)

- [ ] **Step 1: Write the failing test**
*We will not write a standalone unit test for config as it's simple passthrough, but we will test it integrated with the middleware in Task 2.*

- [ ] **Step 2: Update `.env.example`**

```env
# Add the following line to the end of the file
# Admin Viewer Credentials (format: username:password). If not set, admin routes are inaccessible.
ADMIN_CREDENTIALS=admin:supersecret
```

- [ ] **Step 3: Update `config/default.ts`**

```typescript
// Add adminCredentials property to the default export object
export default {
  // ... existing properties ...
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  logLevel: process.env.LOG_LEVEL || 'info',
  adminCredentials: process.env.ADMIN_CREDENTIALS,
};
```

- [ ] **Step 4: Commit**

```bash
git add config/default.ts .env.example
git commit -m "feat: add ADMIN_CREDENTIALS configuration"
```

---

### Task 2: Implement `basicAuth` Middleware

**Files:**
- Modify: `src/middleware/auth.ts`
- Create: `tests/middleware/auth.test.ts` (or append to existing if applicable)

**Interfaces:**
- Consumes: `config.adminCredentials`
- Produces: `export function basicAuth(req: Request, res: Response, next: NextFunction)`

- [ ] **Step 1: Write the failing tests**

```typescript
// Create tests/auth.test.ts (or append to tests/middlewareAuth.test.ts)
import { Request, Response, NextFunction } from 'express';
import { basicAuth } from '../src/middleware/auth';
import config from '../config/default';

describe('basicAuth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn()
    };
    nextFunction = jest.fn();
    config.adminCredentials = 'admin:password123';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if ADMIN_CREDENTIALS is not set', () => {
    config.adminCredentials = undefined;
    mockReq = { headers: {} };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Admin credentials not configured on server.' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if no Authorization header provided', () => {
    mockReq = { headers: {} };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(mockRes.set).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Admin Area"');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid credentials', () => {
    const wrongCreds = Buffer.from('admin:wrongpass').toString('base64');
    mockReq = { headers: { authorization: `Basic ${wrongCreds}` } };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() for valid credentials', () => {
    const rightCreds = Buffer.from('admin:password123').toString('base64');
    mockReq = { headers: { authorization: `Basic ${rightCreds}` } };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/auth.test.ts`
Expected: FAIL (basicAuth is not a function/not exported)

- [ ] **Step 3: Write minimal implementation in `src/middleware/auth.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import config from '../../config/default'; // adjust path if needed

// ... existing localhostOnly function ...

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminCredentials) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin credentials not configured on server.'
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  const b64auth = (authHeader.split(' ')[1] || '');
  const [user, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const [expectedUser, expectedPassword] = config.adminCredentials.split(':');

  if (user === expectedUser && password === expectedPassword) {
    next();
  } else {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/middleware/auth.ts tests/auth.test.ts
git commit -m "feat: implement basicAuth middleware"
```

---

### Task 3: Apply `basicAuth` to Admin Routes

**Files:**
- Modify: `src/routes/adminRoutes.ts`
- Modify: `tests/adminRoutes.test.ts` (if integration tests exist, else rely on manual tests as defined in spec)

**Interfaces:**
- Consumes: `basicAuth` middleware

- [ ] **Step 1: Write integration test (Optional but recommended if setup exists)**
*If no existing integration test handles route auth easily without full app spinup, we will focus on route replacement.*

- [ ] **Step 2: Update `src/routes/adminRoutes.ts`**

```typescript
import { Router, Request, Response } from 'express';
import * as path from 'path';
// Change import: remove localhostOnly, add basicAuth
import { basicAuth } from '../middleware/auth';
import adminController from '../controllers/adminController';

const router = Router();

// Replace localhostOnly with basicAuth
router.use(basicAuth);

// Static Viewer page delivery
router.get('/logs-viewer', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Logs APIs
router.get('/api/logs', (req: Request, res: Response) => adminController.listLogs(req, res));
router.get('/api/logs/:id', (req: Request, res: Response) => adminController.getLogDetail(req, res));

export default router;
```

- [ ] **Step 3: Run the build to verify TypeScript compilation**

Run: `npm run build`
Expected: Successful compilation without errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/adminRoutes.ts
git commit -m "feat: protect admin routes with basic auth instead of localhost filter"
```