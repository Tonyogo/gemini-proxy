import { Request, Response } from 'express';
import path from 'path';
import terminalFileService from '../services/terminalFileService';
import logger from '../../utils/logger';

function parseMultipartForm(buffer: Buffer, boundary: string): { filename: string; data: Buffer }[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const results: { filename: string; data: Buffer }[] = [];

  let offset = 0;
  while (offset < buffer.length) {
    const idx = buffer.indexOf(delimiter, offset);
    if (idx === -1) break;

    const afterDelimiter = idx + delimiter.length;
    // Check if closing boundary "--boundary--"
    if (
      afterDelimiter + 1 < buffer.length &&
      buffer[afterDelimiter] === 45 &&
      buffer[afterDelimiter + 1] === 45
    ) {
      break;
    }

    // Skip delimiter line ending CRLF or LF
    let headerStart = afterDelimiter;
    if (headerStart + 1 < buffer.length && buffer[headerStart] === 13 && buffer[headerStart + 1] === 10) {
      headerStart += 2;
    } else if (headerStart < buffer.length && buffer[headerStart] === 10) {
      headerStart += 1;
    }

    // Next delimiter position
    const nextDelimiter = buffer.indexOf(delimiter, headerStart);
    if (nextDelimiter === -1) break;

    // Search for header separator \r\n\r\n or \n\n
    let bodyStart = -1;
    let headerEndLen = 0;
    const crlfIndex = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    const lfIndex = buffer.indexOf(Buffer.from('\n\n'), headerStart);

    if (crlfIndex !== -1 && crlfIndex < nextDelimiter && (lfIndex === -1 || crlfIndex <= lfIndex)) {
      bodyStart = crlfIndex + 4;
      headerEndLen = 4;
    } else if (lfIndex !== -1 && lfIndex < nextDelimiter) {
      bodyStart = lfIndex + 2;
      headerEndLen = 2;
    }

    if (bodyStart !== -1 && bodyStart <= nextDelimiter) {
      const headerText = buffer.slice(headerStart, bodyStart - headerEndLen).toString('utf-8');
      const filenameMatch = /filename="?([^"\r\n]+)"?/i.exec(headerText);
      if (filenameMatch) {
        const filename = path.basename(filenameMatch[1].trim());
        let bodyEnd = nextDelimiter;
        // Strip trailing CRLF before boundary
        if (bodyEnd >= 2 && buffer[bodyEnd - 2] === 13 && buffer[bodyEnd - 1] === 10) {
          bodyEnd -= 2;
        } else if (bodyEnd >= 1 && buffer[bodyEnd - 1] === 10) {
          bodyEnd -= 1;
        }
        const fileData = buffer.slice(bodyStart, bodyEnd);
        results.push({ filename, data: fileData });
      }
    }

    offset = nextDelimiter;
  }
  return results;
}

class TerminalFileController {
  public async listFiles(req: Request, res: Response): Promise<void> {
    try {
      const hostId = (req.query.hostId as string) || 'local';
      const targetPath = (req.query.path as string) || undefined;
      const result = await terminalFileService.listFiles(hostId, targetPath);
      if (!result.success && result.error?.includes('not found')) {
        res.status(404).json(result);
        return;
      }
      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async readFileContent(req: Request, res: Response): Promise<void> {
    try {
      const hostId = (req.query.hostId as string) || 'local';
      const targetPath = req.query.path as string;
      if (!targetPath) {
        res.status(400).json({ success: false, error: 'path query parameter is required' });
        return;
      }
      const result = await terminalFileService.readFileContent(hostId, targetPath);
      if (!result.success && (result.error === 'File not found' || result.error?.includes('not found'))) {
        res.status(404).json(result);
        return;
      }
      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async saveFileContent(req: Request, res: Response): Promise<void> {
    try {
      const { hostId = 'local', path: targetPath, content = '' } = req.body;
      if (!targetPath) {
        res.status(400).json({ success: false, error: 'path is required' });
        return;
      }
      const result = await terminalFileService.saveFileContent(hostId, targetPath, content);
      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async createDirectory(req: Request, res: Response): Promise<void> {
    try {
      const { hostId = 'local', path: targetPath, dirName } = req.body;
      if (!targetPath || !dirName) {
        res.status(400).json({ success: false, error: 'path and dirName are required' });
        return;
      }
      const result = await terminalFileService.createDirectory(hostId, targetPath, dirName);
      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async renameFile(req: Request, res: Response): Promise<void> {
    try {
      const { hostId = 'local', oldPath, newPath } = req.body;
      if (!oldPath || !newPath) {
        res.status(400).json({ success: false, error: 'oldPath and newPath are required' });
        return;
      }
      const result = await terminalFileService.renameFile(hostId, oldPath, newPath);
      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteItem(req: Request, res: Response): Promise<void> {
    try {
      const hostId = (req.query.hostId as string) || 'local';
      const targetPath = req.query.path as string;
      if (!targetPath) {
        res.status(400).json({ success: false, error: 'path query parameter is required' });
        return;
      }
      const result = await terminalFileService.deleteItem(hostId, targetPath);
      res.status(result.success ? 200 : 500).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async downloadFile(req: Request, res: Response): Promise<void> {
    try {
      const hostId = (req.query.hostId as string) || 'local';
      const targetPath = req.query.path as string;
      if (!targetPath) {
        res.status(400).json({ success: false, error: 'path query parameter is required' });
        return;
      }
      const result = await terminalFileService.getFileStream(hostId, targetPath);
      if (result.status === 200 && result.stream) {
        res.type(result.filename);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
        if (result.size) {
          res.setHeader('Content-Length', result.size);
        }
        result.stream.pipe(res);
      } else {
        res.status(result.status).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      const hostId = (req.query.hostId as string) || 'local';
      const targetDir = (req.query.path as string) || process.cwd();
      const contentType = req.headers['content-type'] || '';

      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const bodyBuffer = Buffer.concat(chunks);

          if (contentType.includes('multipart/form-data')) {
            const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
            const boundary = boundaryMatch ? boundaryMatch[1].trim().replace(/^["']|["']$/g, '') : '';
            if (!boundary) {
              res.status(400).json({ success: false, error: 'Multipart boundary not found' });
              return;
            }

            const files = parseMultipartForm(bodyBuffer, boundary);
            if (files.length === 0) {
              res.status(400).json({ success: false, error: 'No files uploaded' });
              return;
            }

            const uploaded: string[] = [];
            for (const file of files) {
              const saveRes = await terminalFileService.saveUploadedFile(hostId, targetDir, file.filename, file.data);
              if (!saveRes.success) {
                res.status(500).json({ success: false, error: saveRes.error || `Failed to save ${file.filename}` });
                return;
              }
              uploaded.push(file.filename);
            }
            res.status(200).json({ success: true, uploaded });
          } else {
            // Direct raw binary upload with filename in header
            const filename = (req.headers['x-filename'] as string) || `upload-${Date.now()}`;
            const saveRes = await terminalFileService.saveUploadedFile(hostId, targetDir, filename, bodyBuffer);
            res.status(saveRes.success ? 200 : 500).json(saveRes);
          }
        } catch (innerErr: any) {
          logger.error(`[TerminalFileController] upload processing error: ${innerErr.message}`);
          res.status(500).json({ success: false, error: innerErr.message });
        }
      });

      req.on('error', (err: any) => {
        logger.error(`[TerminalFileController] upload request error: ${err.message}`);
        res.status(500).json({ success: false, error: err.message });
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export const terminalFileController = new TerminalFileController();
export default terminalFileController;
