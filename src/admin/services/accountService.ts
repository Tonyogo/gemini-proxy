import fetch, { Response } from 'node-fetch';
import config from '../../../config/default';

export class AccountService {
  private getBaseUrl(): string {
    return (config.geminiBaseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
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
    params?: Record<string, string>
  ) {
    let url = `${this.getBaseUrl()}${path.startsWith('/') ? path : '/' + path}`;
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
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }

  public async getStatus() {
    return this.request('get', '/api/status');
  }

  public async uploadFile(content: any) {
    return this.request('post', '/api/files', { content });
  }

  public async uploadBatchFiles(files: any[]) {
    return this.request('post', '/api/files/batch', { files });
  }

  public async toggleDisabled(index: number, disabled: boolean) {
    return this.request('post', '/api/auth/toggle-disabled', { index, disabled });
  }

  public async deleteAccount(index: number, force?: boolean) {
    return this.request('delete', `/api/accounts/${index}`, undefined, { force: force ? 'true' : 'false' });
  }

  public async batchDeleteAccounts(indices: number[], force: boolean = true) {
    return this.request('delete', '/api/accounts/batch', { indices, force });
  }

  public async deduplicateAccounts() {
    return this.request('post', '/api/accounts/deduplicate', {});
  }

  public async switchCurrentAccount(targetIndex?: number) {
    const payload = typeof targetIndex === 'number' ? { targetIndex } : {};
    return this.request('put', '/api/accounts/current', payload);
  }

  public async getFileStream(filename: string): Promise<{ status: number; body?: NodeJS.ReadableStream; headers: Record<string, string>; data?: any }> {
    const url = `${this.getBaseUrl()}/api/files/${encodeURIComponent(filename)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        timeout: config.upstreamTimeoutMs || 30000
      });

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
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }

  public async batchDownload(indices: number[]): Promise<{ status: number; body?: NodeJS.ReadableStream; headers: Record<string, string>; data?: any }> {
    const url = `${this.getBaseUrl()}/api/accounts/batch/download`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ indices }),
        timeout: config.upstreamTimeoutMs || 30000
      });

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
      return {
        status: 502,
        data: { error: `Upstream error: ${err.message}` },
        headers: {}
      };
    }
  }
}

export default new AccountService();
