import fetch, { Response } from 'node-fetch';
import config from '../../../config/default';

export interface MihomoConnectionOptions {
  targetUrl?: string;
  targetSecret?: string;
}

export class MihomoService {
  private getBaseUrl(options?: MihomoConnectionOptions): string {
    return (options?.targetUrl || config.mihomoApiUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
  }

  private getHeaders(extraHeaders: Record<string, string> = {}, options?: MihomoConnectionOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    const effectiveSecret = options?.targetSecret !== undefined ? options.targetSecret : config.mihomoSecret;
    if (effectiveSecret) {
      headers['Authorization'] = `Bearer ${effectiveSecret}`;
    }
    return headers;
  }

  public async request(
    method: string,
    endpoint: string,
    body?: any,
    queryParams?: Record<string, any>,
    timeoutMs: number = 10000,
    options?: MihomoConnectionOptions
  ): Promise<{ status: number; data: any }> {
    let url = `${this.getBaseUrl(options)}${endpoint}`;
    if (queryParams && Object.keys(queryParams).length > 0) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(queryParams)) {
        if (v !== undefined && v !== null) {
          searchParams.append(k, String(v));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const fetchOptions: any = {
      method: method.toUpperCase(),
      headers: this.getHeaders({}, options),
      timeout: timeoutMs
    };

    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method)) {
      fetchOptions.body = JSON.stringify(body);
    }

    const res: Response = await fetch(url, fetchOptions);
    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text || null;
      }
    }
    return { status: res.status, data };
  }

  public async getStatus(options?: MihomoConnectionOptions): Promise<{ ok: boolean; version?: string; message?: string; statusCode?: number }> {
    try {
      const res = await this.request('GET', '/version', undefined, undefined, 5000, options);
      if (res.status === 200 && res.data) {
        return { ok: true, version: res.data.version || 'Mihomo Core' };
      }
      if (res.status === 401) {
        return { ok: false, message: 'Unauthorized: Invalid Mihomo Secret', statusCode: 401 };
      }
      return { ok: false, message: `Mihomo responded with HTTP ${res.status}`, statusCode: res.status };
    } catch (err: any) {
      return { ok: false, message: err.message || 'Failed to connect to Mihomo API', statusCode: 502 };
    }
  }

  public async getTraffic(options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    return this.request('GET', '/traffic', undefined, undefined, 5000, options);
  }

  public async getProxies(options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    return this.request('GET', '/proxies', undefined, undefined, 10000, options);
  }

  public async selectProxy(group: string, name: string, options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    return this.request('PUT', `/proxies/${encodeURIComponent(group)}`, { name }, undefined, 10000, options);
  }

  public async getProxyDelay(
    name: string,
    testUrl: string = 'http://www.gstatic.com/generate_204',
    timeout: number = 3000,
    options?: MihomoConnectionOptions
  ): Promise<{ status: number; data: any }> {
    return this.request(
      'GET',
      `/proxies/${encodeURIComponent(name)}/delay`,
      undefined,
      { url: testUrl, timeout },
      timeout + 2000,
      options
    );
  }

  public async getConfigs(options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    return this.request('GET', '/configs', undefined, undefined, 5000, options);
  }

  public async updateConfigs(payload: any, options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    return this.request('PATCH', '/configs', payload, undefined, 10000, options);
  }

  public async getConnections(options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    return this.request('GET', '/connections', undefined, undefined, 5000, options);
  }

  public async closeConnections(id?: string, options?: MihomoConnectionOptions): Promise<{ status: number; data: any }> {
    const endpoint = id ? `/connections/${encodeURIComponent(id)}` : '/connections';
    return this.request('DELETE', endpoint, undefined, undefined, 10000, options);
  }
}

export const mihomoService = new MihomoService();
export default mihomoService;
