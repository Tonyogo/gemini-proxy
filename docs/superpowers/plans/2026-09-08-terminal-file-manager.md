# Web 终端多主机文件管理功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Gemini Proxy 的 Web 终端增加完整的多主机文件管理系统，支持 Localhost 本地与远程 Agent 节点的文件/目录浏览、文本代码预览与编辑保存、图片自适应查看、文件上传下载、新建目录、重命名和删除功能。

**Architecture:** 
1. **后端路由与服务层 (`terminalFileService.ts`, `terminalFileController.ts`, `adminRoutes.ts`)**: 提供统一 REST API (`/api/admin/terminal/files/*`)，自动根据 `hostId` 进行本地 IO (`fs/promises`, 流式管道) 或远程 Agent RPC 分发；
2. **远程 Agent 隧道扩展 (`terminalHostManager.ts`, `scripts/terminal-agent.js`)**: 在现有 `agentWs` 上增加 `JSON:{"type":"file_rpc", ...}` 请求/响应流与分块文件传输处理；
3. **前端交互与控制层 (`TerminalFileManagerView.tsx`, `UnifiedTerminalView.tsx`, i18n)**: 在终端内集成 `[命令行终端] | [文件管理]` 子标签，提供面包屑路径跳转、文件列表、Monaco 代码编辑器/文本编辑弹窗、图片预览、拖拽上传及原生下载。

**Tech Stack:** TypeScript, Node.js (Express, fs/promises, streams), React 18, Tailwind CSS, Lucide React, Jest, Supertest.

## Global Constraints

- **多主机无缝联动**: 文件管理器必须与终端共用 `activeHostId`，切换节点时自动刷新当前节点的文件列表。
- **严格鉴权**: 所有文件接口必须受 `adminAuthMiddleware` 保护 (`x-admin-key`)。
- **安全与错误防护**: 在线文本编辑限制最大 5MB，防止浏览器或内存崩溃；远程 Agent RPC 设置 30s 超时保护。
- **原生文件传输体验**: 下载必须使用 `Content-Disposition` 触发浏览器原生保存；上传支持标准进度指示。
- **全量测试与构建通过**: 新增完整的 Jest 测试套件 `tests/terminalFileManager.test.ts`，并通过 `npm run build` 生产编译。

---

### Task 1: 编写后端文件管理服务与 API 集成测试 (`tests/terminalFileManager.test.ts`)

**Files:**
- Create: `tests/terminalFileManager.test.ts`

**Interfaces:**
- Validates:
  - `GET /api/admin/terminal/files/list?hostId=local&path=...`: 获取当前目录及文件列表
  - `GET /api/admin/terminal/files/content?hostId=local&path=...`: 读取文件文本内容
  - `POST /api/admin/terminal/files/save`: 保存文件内容
  - `POST /api/admin/terminal/files/mkdir`: 创建新文件夹
  - `POST /api/admin/terminal/files/rename`: 重命名文件/文件夹
  - `DELETE /api/admin/terminal/files/delete`: 删除文件/文件夹
  - `POST /api/admin/terminal/files/upload`: 上传文件
  - `GET /api/admin/terminal/files/download`: 下载文件流
  - 验证未携带有效 `x-admin-key` 时返回 401 拦截

- [x] **Step 1: 编写自动化测试文件**

Create `tests/terminalFileManager.test.ts`:

- [x] **Step 2: 运行测试并验证初始失败**

Run: `npx jest tests/terminalFileManager.test.ts`
Expected: FAIL with 404 / route not defined.

- [x] **Step 3: 提交测试套件**

```bash
git add tests/terminalFileManager.test.ts
git commit -m "test: add integration test suite for terminal file manager"
```

---

### Task 2: 实现后端文件服务 `TerminalFileService` 与本地文件系统驱动

**Files:**
- Create: `src/admin/services/terminalFileService.ts`
- Modify: `src/admin/services/terminalHostManager.ts`

**Interfaces:**
- Produces:
  - `terminalFileService.listFiles(hostId, dirPath)`
  - `terminalFileService.readFileContent(hostId, filePath)`
  - `terminalFileService.saveFileContent(hostId, filePath, content)`
  - `terminalFileService.createDirectory(hostId, targetPath, dirName)`
  - `terminalFileService.renameFile(hostId, oldPath, newPath)`
  - `terminalFileService.deleteItem(hostId, targetPath)`
  - `terminalFileService.getFileStream(hostId, filePath)`
  - `terminalFileService.saveUploadedFile(hostId, targetDir, filename, buffer)`

- [x] **Step 1: 编写 `src/admin/services/terminalFileService.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import logger from '../../utils/logger';
import { terminalHostManager } from './terminalHostManager';

export interface TerminalFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  updatedAt: number;
  extension: string;
}

export interface ListFilesResult {
  success: boolean;
  currentPath: string;
  parentPath: string | null;
  separator: string;
  files: TerminalFileItem[];
  error?: string;
}

export interface ReadFileResult {
  success: boolean;
  path: string;
  content?: string;
  size: number;
  isBinary: boolean;
  error?: string;
}

export class TerminalFileService {
  /**
   * Resolve and normalize path for local host
   */
  private resolveLocalPath(inputPath?: string): string {
    if (!inputPath || !inputPath.trim()) {
      return process.cwd();
    }
    let resolved = path.resolve(inputPath.trim());
    if (resolved.startsWith('~')) {
      resolved = path.join(os.homedir(), resolved.slice(1));
    }
    return resolved;
  }

  /**
   * List files in a directory
   */
  public async listFiles(hostId: string, inputPath?: string): Promise<ListFilesResult> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'list', inputPath || '');
    }

    try {
      const targetDir = this.resolveLocalPath(inputPath);
      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          currentPath: targetDir,
          parentPath: path.dirname(targetDir),
          separator: path.sep,
          files: [],
          error: `Directory not found: ${targetDir}`,
        };
      }

      const stat = await fs.promises.stat(targetDir);
      if (!stat.isDirectory()) {
        return {
          success: false,
          currentPath: targetDir,
          parentPath: path.dirname(targetDir),
          separator: path.sep,
          files: [],
          error: `Target path is not a directory: ${targetDir}`,
        };
      }

      const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
      const files: TerminalFileItem[] = [];

      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);
        try {
          const entryStat = await fs.promises.stat(fullPath);
          const isDir = entry.isDirectory();
          files.push({
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? 0 : entryStat.size,
            updatedAt: entryStat.mtimeMs,
            extension: isDir ? '' : path.extname(entry.name).replace(/^\./, '').toLowerCase(),
          });
        } catch {
          // Skip broken symlinks or inaccessible files
        }
      }

      // Sort directories first, then alphabetical
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      const parsed = path.parse(targetDir);
      const isRoot = parsed.root === targetDir;

      return {
        success: true,
        currentPath: targetDir,
        parentPath: isRoot ? null : path.dirname(targetDir),
        separator: path.sep,
        files,
      };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] listFiles error: ${err.message}`);
      return {
        success: false,
        currentPath: inputPath || process.cwd(),
        parentPath: null,
        separator: path.sep,
        files: [],
        error: err.message,
      };
    }
  }

  /**
   * Read file text content
   */
  public async readFileContent(hostId: string, filePath: string): Promise<ReadFileResult> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'read', filePath);
    }

    try {
      const targetPath = this.resolveLocalPath(filePath);
      if (!fs.existsSync(targetPath)) {
        return { success: false, path: targetPath, size: 0, isBinary: false, error: 'File not found' };
      }

      const stat = await fs.promises.stat(targetPath);
      if (stat.isDirectory()) {
        return { success: false, path: targetPath, size: 0, isBinary: false, error: 'Target is a directory' };
      }

      // 5MB text reading cap
      if (stat.size > 5 * 1024 * 1024) {
        return {
          success: false,
          path: targetPath,
          size: stat.size,
          isBinary: true,
          error: 'File exceeds 5MB preview limit. Please download to view.',
        };
      }

      const buffer = await fs.promises.readFile(targetPath);
      // Binary check
      const isBinary = buffer.slice(0, 1024).includes(0);
      if (isBinary) {
        return {
          success: true,
          path: targetPath,
          size: stat.size,
          isBinary: true,
          content: '',
        };
      }

      return {
        success: true,
        path: targetPath,
        size: stat.size,
        isBinary: false,
        content: buffer.toString('utf-8'),
      };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] readFile error: ${err.message}`);
      return { success: false, path: filePath, size: 0, isBinary: false, error: err.message };
    }
  }

  /**
   * Save file content
   */
  public async saveFileContent(hostId: string, filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'write', filePath, { content });
    }

    try {
      const targetPath = this.resolveLocalPath(filePath);
      await fs.promises.writeFile(targetPath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] saveFile error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Create directory
   */
  public async createDirectory(hostId: string, targetPath: string, dirName: string): Promise<{ success: boolean; error?: string }> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'mkdir', targetPath, { dirName });
    }

    try {
      const fullPath = path.join(this.resolveLocalPath(targetPath), dirName);
      await fs.promises.mkdir(fullPath, { recursive: true });
      return { success: true };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] mkdir error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Rename file or directory
   */
  public async renameFile(hostId: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'rename', oldPath, { newPath });
    }

    try {
      const resolvedOld = this.resolveLocalPath(oldPath);
      const resolvedNew = this.resolveLocalPath(newPath);
      await fs.promises.rename(resolvedOld, resolvedNew);
      return { success: true };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] rename error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Delete file or directory
   */
  public async deleteItem(hostId: string, targetPath: string): Promise<{ success: boolean; error?: string }> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'delete', targetPath);
    }

    try {
      const resolved = this.resolveLocalPath(targetPath);
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) {
        await fs.promises.rm(resolved, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(resolved);
      }
      return { success: true };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] delete error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get file stream for download
   */
  public async getFileStream(hostId: string, filePath: string): Promise<{
    status: number;
    filename: string;
    size?: number;
    stream?: NodeJS.ReadableStream;
    error?: string;
  }> {
    if (hostId !== 'local') {
      const res = await this.rpcAgent(hostId, 'download_chunk', filePath);
      if (!res.success || !res.data) {
        return { status: 404, filename: path.basename(filePath), error: res.error || 'Failed to fetch file from agent' };
      }
      const buffer = Buffer.from(res.data, 'base64');
      const { Readable } = require('stream');
      const stream = Readable.from(buffer);
      return { status: 200, filename: path.basename(filePath), size: buffer.length, stream };
    }

    try {
      const resolved = this.resolveLocalPath(filePath);
      if (!fs.existsSync(resolved)) {
        return { status: 404, filename: path.basename(filePath), error: 'File not found' };
      }
      const stat = await fs.promises.stat(resolved);
      if (stat.isDirectory()) {
        return { status: 400, filename: path.basename(filePath), error: 'Cannot download a directory directly' };
      }

      const stream = fs.createReadStream(resolved);
      return {
        status: 200,
        filename: path.basename(resolved),
        size: stat.size,
        stream,
      };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] getFileStream error: ${err.message}`);
      return { status: 500, filename: path.basename(filePath), error: err.message };
    }
  }

  /**
   * Save uploaded file
   */
  public async saveUploadedFile(
    hostId: string,
    targetDir: string,
    filename: string,
    buffer: Buffer
  ): Promise<{ success: boolean; error?: string }> {
    if (hostId !== 'local') {
      return this.rpcAgent(hostId, 'upload_chunk', targetDir, {
        filename,
        data: buffer.toString('base64'),
      });
    }

    try {
      const resolvedDir = this.resolveLocalPath(targetDir);
      const destination = path.join(resolvedDir, filename);
      await fs.promises.writeFile(destination, buffer);
      return { success: true };
    } catch (err: any) {
      logger.error(`[TerminalFileService:local] saveUploadedFile error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * RPC bridge for Remote Agent
   */
  private async rpcAgent(hostId: string, action: string, targetPath: string, params?: any): Promise<any> {
    return terminalHostManager.executeFileRpc(hostId, {
      action,
      path: targetPath,
      params,
    });
  }
}

export const terminalFileService = new TerminalFileService();
export default terminalFileService;
```

- [x] **Step 2: 扩展 `TerminalHostManager` 支持 Agent RPC 调度与 Promise 等待**

In `src/admin/services/terminalHostManager.ts`:
增加 `executeFileRpc` 方法以及对应 RPC 回调注册字典：
```typescript
  private rpcResolvers: Map<string, (response: any) => void> = new Map();

  public handleAgentRpcResponse(response: any): void {
    const { reqId } = response;
    if (reqId && this.rpcResolvers.has(reqId)) {
      const resolver = this.rpcResolvers.get(reqId);
      this.rpcResolvers.delete(reqId);
      if (resolver) {
        resolver(response);
      }
    }
  }

  public async executeFileRpc(hostId: string, payload: { action: string; path: string; params?: any }): Promise<any> {
    const session = this.getSession(hostId);
    if (!session || !(session instanceof RemoteAgentTerminalSession)) {
      return { success: false, error: `Agent "${hostId}" is offline or unavailable` };
    }

    const reqId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rpcMsg = `JSON:${JSON.stringify({
      type: 'file_rpc',
      reqId,
      ...payload,
    })}`;

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        if (this.rpcResolvers.has(reqId)) {
          this.rpcResolvers.delete(reqId);
          resolve({ success: false, error: 'Agent file request timed out (30s)' });
        }
      }, 30000);

      this.rpcResolvers.set(reqId, (res) => {
        clearTimeout(timeoutTimer);
        resolve(res);
      });

      session.write(rpcMsg);
    });
  }
```

- [x] **Step 3: 提交代码**

```bash
git add src/admin/services/terminalFileService.ts src/admin/services/terminalHostManager.ts
git commit -m "feat(terminal): implement terminal file service with local FS driver and agent RPC bridge"
```

---

### Task 3: 实现控制器 `terminalFileController.ts` 与 Express 路由挂载

**Files:**
- Create: `src/admin/controllers/terminalFileController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Modify: `src/admin/routes/terminalWs.ts`
- Test: `tests/terminalFileManager.test.ts`

**Interfaces:**
- Produces:
  - 路由挂载于 `/api/admin/terminal/files/*`
  - 处理 `multipart/form-data` 单文件/多文件解析

- [x] **Step 1: 编写 `src/admin/controllers/terminalFileController.ts`**

```typescript
import { Request, Response } from 'express';
import terminalFileService from '../services/terminalFileService';
import logger from '../../utils/logger';

class TerminalFileController {
  public async listFiles(req: Request, res: Response): Promise<void> {
    const hostId = (req.query.hostId as string) || 'local';
    const targetPath = (req.query.path as string) || undefined;
    const result = await terminalFileService.listFiles(hostId, targetPath);
    if (!result.success && result.error?.includes('not found')) {
      res.status(404).json(result);
      return;
    }
    res.status(result.success ? 200 : 500).json(result);
  }

  public async readFileContent(req: Request, res: Response): Promise<void> {
    const hostId = (req.query.hostId as string) || 'local';
    const targetPath = req.query.path as string;
    if (!targetPath) {
      res.status(400).json({ success: false, error: 'path query parameter is required' });
      return;
    }
    const result = await terminalFileService.readFileContent(hostId, targetPath);
    if (!result.success && result.error === 'File not found') {
      res.status(404).json(result);
      return;
    }
    res.status(result.success ? 200 : 500).json(result);
  }

  public async saveFileContent(req: Request, res: Response): Promise<void> {
    const { hostId = 'local', path: targetPath, content = '' } = req.body;
    if (!targetPath) {
      res.status(400).json({ success: false, error: 'path is required' });
      return;
    }
    const result = await terminalFileService.saveFileContent(hostId, targetPath, content);
    res.status(result.success ? 200 : 500).json(result);
  }

  public async createDirectory(req: Request, res: Response): Promise<void> {
    const { hostId = 'local', path: targetPath, dirName } = req.body;
    if (!targetPath || !dirName) {
      res.status(400).json({ success: false, error: 'path and dirName are required' });
      return;
    }
    const result = await terminalFileService.createDirectory(hostId, targetPath, dirName);
    res.status(result.success ? 200 : 500).json(result);
  }

  public async renameFile(req: Request, res: Response): Promise<void> {
    const { hostId = 'local', oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      res.status(400).json({ success: false, error: 'oldPath and newPath are required' });
      return;
    }
    const result = await terminalFileService.renameFile(hostId, oldPath, newPath);
    res.status(result.success ? 200 : 500).json(result);
  }

  public async deleteItem(req: Request, res: Response): Promise<void> {
    const hostId = (req.query.hostId as string) || 'local';
    const targetPath = req.query.path as string;
    if (!targetPath) {
      res.status(400).json({ success: false, error: 'path query parameter is required' });
      return;
    }
    const result = await terminalFileService.deleteItem(hostId, targetPath);
    res.status(result.success ? 200 : 500).json(result);
  }

  public async downloadFile(req: Request, res: Response): Promise<void> {
    const hostId = (req.query.hostId as string) || 'local';
    const targetPath = req.query.path as string;
    if (!targetPath) {
      res.status(400).json({ success: false, error: 'path query parameter is required' });
      return;
    }
    const result = await terminalFileService.getFileStream(hostId, targetPath);
    if (result.status === 200 && result.stream) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
      if (result.size) {
        res.setHeader('Content-Length', result.size);
      }
      result.stream.pipe(res);
    } else {
      res.status(result.status).json({ success: false, error: result.error });
    }
  }

  public async uploadFile(req: Request, res: Response): Promise<void> {
    const hostId = (req.query.hostId as string) || 'local';
    const targetDir = (req.query.path as string) || process.cwd();

    // Stream / Multipart chunk parser
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      const busboy = require('busboy');
      const bb = busboy({ headers: req.headers });
      const uploadedFiles: string[] = [];
      let uploadError: string | null = null;

      bb.on('file', (name: string, fileStream: NodeJS.ReadableStream, info: any) => {
        const { filename } = info;
        const chunks: Buffer[] = [];
        fileStream.on('data', (data) => chunks.push(data));
        fileStream.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          const saveRes = await terminalFileService.saveUploadedFile(hostId, targetDir, filename, buffer);
          if (saveRes.success) {
            uploadedFiles.push(filename);
          } else {
            uploadError = saveRes.error || 'Failed to save file';
          }
        });
      });

      bb.on('finish', () => {
        if (uploadError) {
          res.status(500).json({ success: false, error: uploadError });
        } else {
          res.status(200).json({ success: true, uploaded: uploadedFiles });
        }
      });

      bb.on('error', (err: any) => {
        res.status(500).json({ success: false, error: err.message });
      });

      req.pipe(bb);
    } else {
      // Direct raw binary upload with filename in header
      const filename = (req.headers['x-filename'] as string) || `upload-${Date.now()}`;
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const saveRes = await terminalFileService.saveUploadedFile(hostId, targetDir, filename, buffer);
        res.status(saveRes.success ? 200 : 500).json(saveRes);
      });
    }
  }
}

export const terminalFileController = new TerminalFileController();
export default terminalFileController;
```

- [x] **Step 2: 在 `src/admin/routes/adminRoutes.ts` 注册文件路由**

```typescript
// Terminal File Management Routes
router.get('/terminal/files/list', (req, res) => terminalFileController.listFiles(req, res));
router.get('/terminal/files/content', (req, res) => terminalFileController.readFileContent(req, res));
router.post('/terminal/files/save', (req, res) => terminalFileController.saveFileContent(req, res));
router.post('/terminal/files/mkdir', (req, res) => terminalFileController.createDirectory(req, res));
router.post('/terminal/files/rename', (req, res) => terminalFileController.renameFile(req, res));
router.delete('/terminal/files/delete', (req, res) => terminalFileController.deleteItem(req, res));
router.get('/terminal/files/download', (req, res) => terminalFileController.downloadFile(req, res));
router.post('/terminal/files/upload', (req, res) => terminalFileController.uploadFile(req, res));
```

- [x] **Step 3: 在 `src/admin/routes/terminalWs.ts` 接收 Agent RPC 回包**

In `src/admin/routes/terminalWs.ts`:
在 Agent 收到以 `JSON:` 开头的消息时，判断是否为 `file_rpc_res`：
```typescript
if (control.type === 'file_rpc_res') {
  terminalHostManager.handleAgentRpcResponse(control);
  return;
}
```

- [x] **Step 4: 运行测试并验证通过**

Run: `npx jest tests/terminalFileManager.test.ts`
Expected: PASS (all tests passing).

- [x] **Step 5: 提交更改**

```bash
git add src/admin/controllers/terminalFileController.ts src/admin/routes/adminRoutes.ts src/admin/routes/terminalWs.ts
git commit -m "feat(admin): expose terminal file manager REST routes and agent RPC receiver"
```

---

### Task 4: 升级 `scripts/terminal-agent.js` 支持远程文件操作 RPC

**Files:**
- Modify: `scripts/terminal-agent.js:100-220`

**Interfaces:**
- Handles RPC actions in agent script:
  - `list`: 列出 Agent 所在主机的本地目录
  - `read`: 读取指定路径文件
  - `write`: 写入/保存指定文件
  - `mkdir`: 创建文件夹
  - `rename`: 重命名
  - `delete`: 删除
  - `upload_chunk`: 写入上传数据
  - `download_chunk`: 读取并回传 Base64 数据

- [x] **Step 1: 修改 `scripts/terminal-agent.js` 增加 `handleFileRpc`**

```javascript
const fs = require('fs');

async function handleFileRpc(control) {
  const { reqId, action, path: targetPath, params = {} } = control;
  const reply = (success, data = null, error = null) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`JSON:${JSON.stringify({
        type: 'file_rpc_res',
        reqId,
        success,
        data,
        error
      })}`);
    }
  };

  try {
    const resolvedPath = path.resolve(targetPath || os.homedir() || process.cwd());

    if (action === 'list') {
      if (!fs.existsSync(resolvedPath)) {
        return reply(false, null, `Path not found: ${resolvedPath}`);
      }
      const stat = await fs.promises.stat(resolvedPath);
      if (!stat.isDirectory()) {
        return reply(false, null, `Target is not a directory`);
      }
      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(resolvedPath, entry.name);
        try {
          const entryStat = await fs.promises.stat(full);
          const isDir = entry.isDirectory();
          files.push({
            name: entry.name,
            path: full,
            isDirectory: isDir,
            size: isDir ? 0 : entryStat.size,
            updatedAt: entryStat.mtimeMs,
            extension: isDir ? '' : path.extname(entry.name).replace(/^\./, '').toLowerCase(),
          });
        } catch {}
      }
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      const parsed = path.parse(resolvedPath);
      return reply(true, {
        currentPath: resolvedPath,
        parentPath: parsed.root === resolvedPath ? null : path.dirname(resolvedPath),
        separator: path.sep,
        files
      });
    }

    if (action === 'read') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) return reply(false, null, 'Target is a directory');
      if (stat.size > 5 * 1024 * 1024) return reply(false, null, 'File exceeds 5MB preview limit');
      const buf = await fs.promises.readFile(resolvedPath);
      const isBinary = buf.slice(0, 1024).includes(0);
      return reply(true, {
        path: resolvedPath,
        size: stat.size,
        isBinary,
        content: isBinary ? '' : buf.toString('utf-8')
      });
    }

    if (action === 'write') {
      await fs.promises.writeFile(resolvedPath, params.content || '', 'utf-8');
      return reply(true, { success: true });
    }

    if (action === 'mkdir') {
      const full = path.join(resolvedPath, params.dirName || 'new-folder');
      await fs.promises.mkdir(full, { recursive: true });
      return reply(true, { success: true });
    }

    if (action === 'rename') {
      const newPath = path.resolve(params.newPath);
      await fs.promises.rename(resolvedPath, newPath);
      return reply(true, { success: true });
    }

    if (action === 'delete') {
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) {
        await fs.promises.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(resolvedPath);
      }
      return reply(true, { success: true });
    }

    if (action === 'upload_chunk') {
      const full = path.join(resolvedPath, params.filename);
      const buf = Buffer.from(params.data || '', 'base64');
      await fs.promises.writeFile(full, buf);
      return reply(true, { success: true });
    }

    if (action === 'download_chunk') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const buf = await fs.promises.readFile(resolvedPath);
      return reply(true, buf.toString('base64'));
    }

    reply(false, null, `Unknown action: ${action}`);
  } catch (err) {
    reply(false, null, err.message);
  }
}
```

- [x] **Step 2: 在 WS 接收处挂载 `handleFileRpc` 消息分支**

```javascript
if (msgStr.startsWith('JSON:')) {
  try {
    const control = JSON.parse(msgStr.slice(5));
    if (control.type === 'file_rpc') {
      handleFileRpc(control);
      return;
    }
  } catch {}
}
```

- [x] **Step 3: 提交更改**

```bash
git add scripts/terminal-agent.js
git commit -m "feat(agent): support remote file rpc actions in terminal agent"
```

---

### Task 5: 开发前端文件管理器组件 `TerminalFileManagerView.tsx`

**Files:**
- Create: `frontend/src/components/terminal/TerminalFileManagerView.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Produces:
  - `TerminalFileManagerView({ adminKey, activeHostId })`
  - 面包屑导航与路径输入直达
  - 表格与卡片列表双模呈现
  - 文件上传（点击/拖拽）、下载、新建目录、重命名、删除
  - 文本/代码在线预览与编辑保存弹窗 (`Monaco Editor` 或轻量代码高亮编辑器)
  - 图片高清查看弹窗

- [x] **Step 1: 增补国际化文案 (`zh.ts` 与 `en.ts`)**

In `frontend/src/i18n/locales/zh.ts`:
```typescript
    files: {
      title: "文件管理",
      upload: "上传文件",
      newFolder: "新建文件夹",
      refresh: "刷新",
      path: "路径",
      copyPath: "复制路径",
      pathCopied: "路径已复制！",
      name: "名称",
      size: "大小",
      updatedAt: "修改时间",
      actions: "操作",
      parentDir: "返回上级",
      preview: "查看 / 编辑",
      download: "下载",
      rename: "重命名",
      delete: "删除",
      deleteConfirm: "确定要删除 \"{name}\" 吗？此操作不可逆！",
      emptyDir: "当前目录下没有文件。",
      uploading: "正在上传...",
      saving: "正在保存...",
      saved: "文件保存成功！",
      save: "保存 (Ctrl+S)",
      createFolderTitle: "新建文件夹",
      folderNamePlaceholder: "输入文件夹名称",
      renameTitle: "重命名",
      newNamePlaceholder: "输入新名称",
      cancel: "取消",
      confirm: "确定",
      dropToUpload: "释放鼠标以上传文件到此目录",
      unsupportedPreview: "此文件为二进制格式，暂不支持在线预览。您可以直接下载查看。"
    }
```

In `frontend/src/i18n/locales/en.ts`:
```typescript
    files: {
      title: "File Manager",
      upload: "Upload",
      newFolder: "New Folder",
      refresh: "Refresh",
      path: "Path",
      copyPath: "Copy Path",
      pathCopied: "Path copied!",
      name: "Name",
      size: "Size",
      updatedAt: "Modified",
      actions: "Actions",
      parentDir: "Parent Directory",
      preview: "View / Edit",
      download: "Download",
      rename: "Rename",
      delete: "Delete",
      deleteConfirm: "Are you sure you want to delete \"{name}\"? This action cannot be undone.",
      emptyDir: "No files found in this directory.",
      uploading: "Uploading...",
      saving: "Saving...",
      saved: "File saved successfully!",
      save: "Save (Ctrl+S)",
      createFolderTitle: "New Folder",
      folderNamePlaceholder: "Enter folder name",
      renameTitle: "Rename",
      newNamePlaceholder: "Enter new name",
      cancel: "Cancel",
      confirm: "Confirm",
      dropToUpload: "Drop files here to upload to this directory",
      unsupportedPreview: "This file is binary and cannot be previewed online. You can download it directly."
    }
```

- [x] **Step 2: 编写 `frontend/src/components/terminal/TerminalFileManagerView.tsx`**

实现完整的文件管理组件，包含：
- `useEffect` 监听 `activeHostId` 与 `currentPath` 自动拉取 `/api/admin/terminal/files/list`；
- 面包屑解析与可点击层级渲染；
- 文件图标映射（Folder、Code、FileText、Image、Archive 等）；
- Monaco/文本编辑模态框与保存；
- 图片预览模态框；
- 新建/重命名/删除弹窗对话框；
- 文件拖拽放置区 (`onDragOver`, `onDrop`) 触发上传。

- [x] **Step 3: 提交前端组件**

```bash
git add frontend/src/components/terminal/TerminalFileManagerView.tsx frontend/src/i18n/locales/
git commit -m "feat(frontend): create TerminalFileManagerView component with full file operations"
```

---

### Task 6: 在 `UnifiedTerminalView.tsx` 中集成双子标签与状态联动

**Files:**
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces:
  - 顶栏无缝集成 `[ >_ 命令行终端 ]` 与 `[ 📁 文件管理 ]` 胶囊切换
  - 共用 `activeHostId` 状态
  - 保持全屏和独立模式的顺畅切换

- [x] **Step 1: 修改 `UnifiedTerminalView.tsx` 增加 SubTab 状态与视图分发**

```tsx
import React, { useState } from 'react';
import WebTerminalView from './WebTerminalView';
import TerminalFileManagerView from './terminal/TerminalFileManagerView';
import { TerminalHostSelector } from './terminal/TerminalHostSelector';
import { TerminalSquare, FolderOpen } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export interface UnifiedTerminalViewProps {
  adminKey: string;
  isStandalone?: boolean;
  onEnterStandalone?: () => void;
  onExitStandalone?: () => void;
}

export type TerminalSubTab = 'interactive' | 'files';

export default function UnifiedTerminalView({
  adminKey,
  isStandalone,
  onEnterStandalone,
  onExitStandalone,
}: UnifiedTerminalViewProps) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<TerminalSubTab>('interactive');
  const [activeHostId, setActiveHostId] = useState<string>(() => {
    return localStorage.getItem('terminal_active_host') || 'local';
  });

  const handleHostChange = (newHostId: string) => {
    setActiveHostId(newHostId);
    localStorage.setItem('terminal_active_host', newHostId);
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 relative">
      {/* Unified Top Control Bar */}
      <div className="ui-card p-2 sm:p-2.5 flex items-center justify-between gap-2 relative z-30 shrink-0 mb-2">
        <div className="flex items-center space-x-2">
          {/* Host Node Selector */}
          <TerminalHostSelector
            adminKey={adminKey}
            activeHostId={activeHostId}
            onSelectHost={handleHostChange}
          />

          <div className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />

          {/* SubTab Toggle Pills */}
          <div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setSubTab('interactive')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                subTab === 'interactive'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TerminalSquare className="w-3.5 h-3.5" />
              <span>{t('terminal.interactiveTab', '命令行终端')}</span>
            </button>
            <button
              onClick={() => setSubTab('files')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                subTab === 'files'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t('files.title', '文件管理')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 min-h-0 flex flex-col">
        {subTab === 'interactive' ? (
          <WebTerminalView
            adminKey={adminKey}
            standalone={Boolean(isStandalone)}
            onExitStandalone={onExitStandalone}
            onToggleStandalone={(val) => {
              if (val && onEnterStandalone) {
                onEnterStandalone();
              } else if (!val && onExitStandalone) {
                onExitStandalone();
              }
            }}
            controlledHostId={activeHostId}
            onControlledHostChange={handleHostChange}
            hideInnerHostSelector={true}
          />
        ) : (
          <TerminalFileManagerView
            adminKey={adminKey}
            activeHostId={activeHostId}
          />
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 2: 运行所有 Jest 测试套件**

Run: `npx jest tests/terminalFileManager.test.ts`
Expected: PASS.

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/components/UnifiedTerminalView.tsx frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): integrate interactive terminal and file manager sub-tabs"
```

---

### Task 7: 全量测试与前后端生产构建验证

**Files:**
- All touched files
- Test: Complete Jest test suite

- [x] **Step 1: 运行所有单元与集成测试**

Run: `npm test`
Expected: 68 passed, 0 failures.

- [x] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: Vite build completes cleanly with 0 errors.

- [x] **Step 3: 运行后端 TypeScript 编译**

Run: `npm run build:backend`
Expected: `tsc` compiles cleanly with 0 errors.

- [x] **Step 4: 提交最终工程代码**

```bash
git status
git commit -m "chore: verify and finalize terminal multi-host file manager implementation"
```
