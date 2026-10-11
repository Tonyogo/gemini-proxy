import http from 'http';
import { ProxyAgent } from 'proxy-agent';
import config from '../../config/default';
import logger from './logger';

export class ProxyAgentManager {
  private agentCache: Map<string, http.Agent> = new Map();

  public resolveProxyUrl(nodeProxyUrl?: string): string | undefined {
    if (nodeProxyUrl && typeof nodeProxyUrl === 'string' && nodeProxyUrl.trim()) {
      return nodeProxyUrl.trim();
    }
    if ((config as any).proxyUrl && typeof (config as any).proxyUrl === 'string' && (config as any).proxyUrl.trim()) {
      return (config as any).proxyUrl.trim();
    }
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    if (envProxy && typeof envProxy === 'string' && envProxy.trim()) {
      return envProxy.trim();
    }
    return undefined;
  }

  public getAgent(nodeProxyUrl?: string): http.Agent | undefined {
    const proxyUrl = this.resolveProxyUrl(nodeProxyUrl);
    if (!proxyUrl) {
      return undefined;
    }

    if (this.agentCache.has(proxyUrl)) {
      return this.agentCache.get(proxyUrl);
    }

    try {
      const agent = new ProxyAgent({ getProxyForUrl: () => proxyUrl }) as unknown as http.Agent;
      this.agentCache.set(proxyUrl, agent);
      return agent;
    } catch (err: any) {
      logger.warn(`Failed to initialize ProxyAgent for "${proxyUrl}": ${err?.message || err}`);
      return undefined;
    }
  }

  public clearCache(): void {
    this.agentCache.clear();
  }
}

const proxyAgentManager = new ProxyAgentManager();
export default proxyAgentManager;
