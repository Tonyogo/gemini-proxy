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
      const res = await this.rpcAgent(hostId, 'list', inputPath || '');
      if (res && res.success && res.data) {
        return {
          success: true,
          ...res.data,
        };
      }
      return {
        success: false,
        currentPath: inputPath || '',
        parentPath: null,
        separator: '/',
        files: [],
        error: res?.error || 'Failed to list files from agent',
      };
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
      const res = await this.rpcAgent(hostId, 'read', filePath);
      if (res && res.success && res.data) {
        return {
          success: true,
          ...res.data,
        };
      }
      return {
        success: false,
        path: filePath,
        size: 0,
        isBinary: false,
        error: res?.error || 'Failed to read file from agent',
      };
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
