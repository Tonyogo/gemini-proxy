import { PassThrough } from 'stream';
import { terminalHostManager } from '../../terminal/services/terminalHostManager';
import { generateShortId } from '../../utils/requestHelper';
import logger from '../../utils/logger';

export interface AgentFetchResponse {
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
    raw(): Record<string, string[]>;
  };
  body: NodeJS.ReadableStream;
}

export interface AgentFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class AgentProxyService {
  public async agentFetch(
    agentId: string,
    targetUrl: string,
    options: AgentFetchOptions = {}
  ): Promise<AgentFetchResponse> {
    const ws = terminalHostManager.getAgentWs(agentId);
    if (!ws) {
      throw new Error(`Target egress agent "${agentId}" is not online or connected.`);
    }

    const requestId = 'req_' + generateShortId();
    const { method = 'GET', headers = {}, body, signal, timeoutMs = 180000 } = options;

    if (signal?.aborted) {
      throw new Error('This operation was aborted');
    }

    let bodyBase64: string | undefined = undefined;
    if (body) {
      bodyBase64 = Buffer.isBuffer(body)
        ? body.toString('base64')
        : Buffer.from(String(body), 'utf-8').toString('base64');
    }

    const passThrough = new PassThrough();

    return new Promise<AgentFetchResponse>((resolve, reject) => {
      let isResolved = false;
      let cleanup: () => void;

      const onMessage = (rawMsg: any) => {
        try {
          const str = typeof rawMsg === 'string' ? rawMsg : rawMsg.toString();
          const cleanStr = str.startsWith('JSON:') ? str.slice(5) : str;
          const msg = JSON.parse(cleanStr);

          if (!msg || msg.requestId !== requestId) return;

          if (msg.type === 'http_res_start') {
            isResolved = true;
            const resHeaders = msg.headers || {};
            const headersObj = {
              get(name: string) {
                const lower = name.toLowerCase();
                for (const [k, v] of Object.entries(resHeaders)) {
                  if (k.toLowerCase() === lower) {
                    return Array.isArray(v) ? v.join(', ') : String(v);
                  }
                }
                return null;
              },
              raw() {
                const res: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(resHeaders)) {
                  res[k] = Array.isArray(v) ? v.map(String) : [String(v)];
                }
                return res;
              }
            };

            resolve({
              status: msg.status || 200,
              statusText: msg.statusText || 'OK',
              headers: headersObj,
              body: passThrough
            });
            return;
          }

          if (msg.type === 'http_res_chunk') {
            if (msg.chunk) {
              const buf = Buffer.from(msg.chunk, 'base64');
              passThrough.write(buf);
            }
            return;
          }

          if (msg.type === 'http_res_end') {
            passThrough.end();
            cleanup();
            return;
          }

          if (msg.type === 'http_res_error') {
            const err = new Error(msg.error?.message || 'Remote agent request failed');
            (err as any).code = msg.error?.code;
            if (!isResolved) {
              reject(err);
            } else {
              passThrough.destroy(err);
            }
            cleanup();
            return;
          }
        } catch {
          // Ignore non-json or unrelated frames
        }
      };

      const onAbort = () => {
        try {
          if (ws.readyState === 1) {
            ws.send('JSON:' + JSON.stringify({ type: 'http_abort', requestId, reason: 'Client aborted' }));
          }
        } catch {}
        const err = new Error('This operation was aborted');
        if (!isResolved) {
          reject(err);
        } else {
          passThrough.destroy(err);
        }
        cleanup();
      };

      cleanup = () => {
        if (typeof ws.off === 'function') {
          ws.off('message', onMessage);
        } else if (typeof ws.removeListener === 'function') {
          ws.removeListener('message', onMessage);
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (typeof ws.on === 'function') {
        ws.on('message', onMessage);
      }
      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      // Send http_req frame
      try {
        ws.send('JSON:' + JSON.stringify({
          type: 'http_req',
          requestId,
          method,
          url: targetUrl,
          headers,
          body: bodyBase64,
          timeoutMs
        }));
      } catch (err: any) {
        cleanup();
        reject(new Error(`Failed to send request frame to agent: ${err.message}`));
      }
    });
  }
}

export const agentProxyService = new AgentProxyService();
export default agentProxyService;
