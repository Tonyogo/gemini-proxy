import fetch, { Response } from 'node-fetch';
import config from '../../../config/default';
import upstreamManager from '../../utils/upstreamManager';

export class AccountService {
  private getBaseUrl(serverIndex?: number): string {
    return upstreamManager.getUpstreamServer({ serverIndex }).serverUrl;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (config.adminSecretKey) {
      headers['Authorization'] = `Bearer ${config.adminSecretKey}`;
    }
    return headers;
  }

  private async request(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: any,
    params?: Record<string, string>,
    serverIndex?: number
  ) {
    const serverSelection = upstreamManager.getUpstreamServer({ serverIndex });
    const actualIndex = serverSelection.serverIndex;
    let url = `${serverSelection.serverUrl}${path.startsWith('/') ? path : '/' + path}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      const queryStr = searchParams.toString();
      if (queryStr) {
        url += (url.includes('?') ? '&' : '?') + queryStr;
      }
    }

    try {
      const options: any = {
        method: method.toUpperCase(),
        headers: this.getHeaders(),
        timeout: config.upstreamTimeoutMs || 30000
      };

      if (data !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
        options.body = JSON.stringify(data);
      }

      const res = await fetch(url, options);

      // Check upstream gateway failure vs success
      if (res.status >= 502 && res.status <= 504) {
        upstreamManager.recordRequestResult(actualIndex, false, `HTTP ${res.status}`);
      } else {
        // Any other valid HTTP response (200, 400, 401, 403, 404, etc.) proves host is alive -> immediately recover!
        upstreamManager.recordRequestResult(actualIndex, true);
      }

      const contentType = res.headers.get('content-type') || '';

      let resData: any;
      if (contentType.includes('application/json')) {
        try {
          resData = await res.json();
        } catch {
          resData = await res.text();
        }
      } else {
        resData = await res.text();
      }

      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      return {
        status: res.status,
        data: resData,
        headers: headersObj
      };
    } catch (err: any) {
      upstreamManager.recordRequestResult(actualIndex, false, err.message);
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }

  public async getStatus(serverIndex?: number) {
    return this.request('get', '/api/status', undefined, undefined, serverIndex);
  }

  public async uploadFile(content: any, serverIndex?: number) {
    return this.request('post', '/api/files', { content }, undefined, serverIndex);
  }

  public async uploadBatchFiles(files: any[], serverIndex?: number) {
    return this.request('post', '/api/files/batch', { files }, undefined, serverIndex);
  }

  public async toggleDisabled(index: number, disabled: boolean, serverIndex?: number) {
    return this.request('post', '/api/auth/toggle-disabled', { index, disabled }, undefined, serverIndex);
  }

  public async deleteAccount(index: number, force?: boolean, serverIndex?: number) {
    return this.request('delete', `/api/accounts/${index}`, undefined, { force: force ? 'true' : 'false' }, serverIndex);
  }

  public async batchDeleteAccounts(indices: number[], force: boolean = true, serverIndex?: number) {
    return this.request('delete', '/api/accounts/batch', { indices, force }, undefined, serverIndex);
  }

  public async deduplicateAccounts(serverIndex?: number) {
    return this.request('post', '/api/accounts/deduplicate', {}, undefined, serverIndex);
  }

  public async switchCurrentAccount(targetIndex?: number, serverIndex?: number) {
    const payload = typeof targetIndex === 'number' ? { targetIndex } : {};
    return this.request('put', '/api/accounts/current', payload, undefined, serverIndex);
  }

  public async closeContext(index: number, serverIndex?: number) {
    return this.request('post', `/api/accounts/${index}/close-context`, undefined, undefined, serverIndex);
  }

  public async getFileStream(filename: string, serverIndex?: number): Promise<{ status: number; body?: NodeJS.ReadableStream; headers: Record<string, string>; data?: any }> {
    const serverSelection = upstreamManager.getUpstreamServer({ serverIndex });
    const actualIndex = serverSelection.serverIndex;
    const url = `${serverSelection.serverUrl}/api/files/${encodeURIComponent(filename)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        timeout: config.upstreamTimeoutMs || 30000
      });

      if (res.status >= 502 && res.status <= 504) {
        upstreamManager.recordRequestResult(actualIndex, false, `HTTP ${res.status}`);
      } else {
        upstreamManager.recordRequestResult(actualIndex, true);
      }

      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      if (res.status === 200) {
        return {
          status: 200,
          body: res.body as unknown as NodeJS.ReadableStream,
          headers: headersObj
        };
      } else {
        const errorData = await res.text();
        return {
          status: res.status,
          data: errorData,
          headers: headersObj
        };
      }
    } catch (err: any) {
      upstreamManager.recordRequestResult(actualIndex, false, err.message);
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }

  public async batchDownload(indices: number[], serverIndex?: number): Promise<{ status: number; body?: NodeJS.ReadableStream; headers: Record<string, string>; data?: any }> {
    const serverSelection = upstreamManager.getUpstreamServer({ serverIndex });
    const actualIndex = serverSelection.serverIndex;
    const url = `${serverSelection.serverUrl}/api/accounts/batch/download`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ indices }),
        timeout: config.upstreamTimeoutMs || 30000
      });

      if (res.status >= 502 && res.status <= 504) {
        upstreamManager.recordRequestResult(actualIndex, false, `HTTP ${res.status}`);
      } else {
        upstreamManager.recordRequestResult(actualIndex, true);
      }

      const headersObj: Record<string, string> = {};
      res.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      if (res.status === 200) {
        return {
          status: 200,
          body: res.body as unknown as NodeJS.ReadableStream,
          headers: headersObj
        };
      } else {
        const errorData = await res.text();
        return {
          status: res.status,
          data: errorData,
          headers: headersObj
        };
      }
    } catch (err: any) {
      upstreamManager.recordRequestResult(actualIndex, false, err.message);
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }
}

export default new AccountService();
