import fetch, { Response } from 'node-fetch';
import config from '../../../config/default';

export class MihomoService {
  private getBaseUrl(): string {
    return (config.mihomoApiUrl || 'http://127.0.0.1:9090').replace(/\/+$/, '');
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (config.mihomoSecret) {
      headers['Authorization'] = `Bearer ${config.mihomoSecret}`;
    }
    return headers;
  }

  public async request(
    method: string,
    endpoint: string,
    body?: any,
    queryParams?: Record<string, any>,
    timeoutMs: number = 10000
  ): Promise<{ status: number; data: any }> {
    let url = `${this.getBaseUrl()}${endpoint}`;
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

    const options: any = {
      method: method.toUpperCase(),
      headers: this.getHeaders(),
      timeout: timeoutMs
    };

    if (body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
      options.body = JSON.stringify(body);
    }

    const res: Response = await fetch(url, options);
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

  public async getStatus(): Promise<{ ok: boolean; version?: string; message?: string; statusCode?: number }> {
    try {
      const res = await this.request('GET', '/version', undefined, undefined, 5000);
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

  public async getTraffic(): Promise<{ status: number; data: any }> {
    return this.request('GET', '/traffic', undefined, undefined, 5000);
  }

  public async getProxies(): Promise<{ status: number; data: any }> {
    return this.request('GET', '/proxies', undefined, undefined, 10000);
  }

  public async selectProxy(group: string, name: string): Promise<{ status: number; data: any }> {
    return this.request('PUT', `/proxies/${encodeURIComponent(group)}`, { name });
  }

  public async getProxyDelay(
    name: string,
    testUrl: string = 'http://www.gstatic.com/generate_204',
    timeout: number = 3000
  ): Promise<{ status: number; data: any }> {
    return this.request(
      'GET',
      `/proxies/${encodeURIComponent(name)}/delay`,
      undefined,
      { url: testUrl, timeout },
      timeout + 2000
    );
  }

  public async getConfigs(): Promise<{ status: number; data: any }> {
    return this.request('GET', '/configs', undefined, undefined, 5000);
  }

  public async updateConfigs(payload: any): Promise<{ status: number; data: any }> {
    return this.request('PATCH', '/configs', payload);
  }

  public async getConnections(): Promise<{ status: number; data: any }> {
    return this.request('GET', '/connections', undefined, undefined, 5000);
  }

  public async closeConnections(id?: string): Promise<{ status: number; data: any }> {
    const endpoint = id ? `/connections/${encodeURIComponent(id)}` : '/connections';
    return this.request('DELETE', endpoint);
  }
}

export const mihomoService = new MihomoService();
export default mihomoService;
