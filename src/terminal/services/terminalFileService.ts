import path from 'path';
import { Readable } from 'stream';
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
   * List files in a directory via agent RPC
   */
  public async listFiles(hostId: string, inputPath?: string): Promise<ListFilesResult> {
    if (!hostId || !hostId.trim()) {
      return {
        success: false,
        currentPath: inputPath || '',
        parentPath: null,
        separator: '/',
        files: [],
        error: 'hostId is required',
      };
    }

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

  /**
   * Read file text content via agent RPC
   */
  public async readFileContent(hostId: string, filePath: string): Promise<ReadFileResult> {
    if (!hostId || !hostId.trim()) {
      return {
        success: false,
        path: filePath,
        size: 0,
        isBinary: false,
        error: 'hostId is required',
      };
    }

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

  /**
   * Save file content via agent RPC
   */
  public async saveFileContent(hostId: string, filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    return this.rpcAgent(hostId, 'write', filePath, { content });
  }

  /**
   * Create directory via agent RPC
   */
  public async createDirectory(hostId: string, targetPath: string, dirName: string): Promise<{ success: boolean; error?: string }> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    return this.rpcAgent(hostId, 'mkdir', targetPath, { dirName });
  }

  /**
   * Rename file or directory via agent RPC
   */
  public async renameFile(hostId: string, oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    return this.rpcAgent(hostId, 'rename', oldPath, { newPath });
  }

  /**
   * Delete file or directory via agent RPC
   */
  public async deleteItem(hostId: string, targetPath: string): Promise<{ success: boolean; error?: string }> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    return this.rpcAgent(hostId, 'delete', targetPath);
  }

  /**
   * Get file stream for download via agent RPC
   */
  public async getFileStream(hostId: string, filePath: string): Promise<{
    status: number;
    filename: string;
    size?: number;
    stream?: NodeJS.ReadableStream;
    error?: string;
  }> {
    if (!hostId || !hostId.trim()) {
      return { status: 400, filename: path.basename(filePath), error: 'hostId is required' };
    }

    const res = await this.rpcAgent(hostId, 'download_chunk', filePath);
    if (!res.success || !res.data) {
      const isNotFound = res.error && (res.error.toLowerCase().includes('not found') || res.error.toLowerCase().includes('no such file'));
      return { status: isNotFound ? 404 : 500, filename: path.basename(filePath), error: res.error || 'Failed to fetch file from agent' };
    }
    const buffer = Buffer.from(res.data, 'base64');
    const stream = Readable.from(buffer);
    return { status: 200, filename: path.basename(filePath), size: buffer.length, stream };
  }

  /**
   * Save uploaded file via agent RPC
   */
  public async saveUploadedFile(
    hostId: string,
    targetDir: string,
    filename: string,
    buffer: Buffer
  ): Promise<{ success: boolean; error?: string }> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    return this.rpcAgent(hostId, 'upload_chunk', targetDir, {
      filename,
      data: buffer.toString('base64'),
    });
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
