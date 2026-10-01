import http from 'http';
import express from 'express';
import request from 'supertest';
import claudeRoutes from '../src/proxy/routes/claudeRoutes';
import geminiRoutes from '../src/proxy/routes/geminiRoutes';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';
import { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
const { AgentProxyDispatcher } = require('../scripts/gt.js');

describe('E2E Agent Egress Proxy Flow', () => {
  let mockGoogleServer: http.Server;
  let googlePort: number;

  beforeAll((done) => {
    // 1. Mock Google Gemini Upstream
    mockGoogleServer = http.createServer((req, res) => {
      if (req.url?.includes(':streamGenerateContent')) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        res.write('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Streamed via "}]}}]}\n\n');
        setTimeout(() => {
          res.write('data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Overseas Agent!"}]}}]}\n\n');
          res.end();
        }, 30);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Native Response via Agent' }] } }]
      }));
    });

    mockGoogleServer.listen(0, '127.0.0.1', () => {
      googlePort = (mockGoogleServer.address() as any).port;
      done();
    });
  });

  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
    upstreamManager.reset();
    await new Promise<void>((resolve) => mockGoogleServer.close(() => resolve()));
  });

  it('successfully executes end-to-end Claude SSE stream through simulated gt agent', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', claudeRoutes);
    app.use('/v1beta', geminiRoutes);

    // 2. Setup Mock WebSocket linking TerminalHostManager and AgentProxyDispatcher
    let agentDispatcher: any = null;
    const mockWsListeners: any[] = [];
    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        const str = data.replace(/^JSON:/, '');
        const json = JSON.parse(str);
        if (json.type === 'http_req' || json.type === 'http_abort') {
          agentDispatcher.handleRequest(json);
        }
      },
      on: (event: string, fn: any) => {
        mockWsListeners.push(fn);
      },
      removeListener: () => {}
    };

    agentDispatcher = new AgentProxyDispatcher((msg: any) => {
      for (const listener of mockWsListeners) {
        listener(JSON.stringify(msg));
      }
    });

    terminalHostManager.registerHost({
      id: 'hk-agent-id',
      name: 'hk-vps-agent',
      hostname: 'vps',
      ip: '127.0.0.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);

    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          agentId: 'hk-vps-agent',
          url: `http://127.0.0.1:${googlePort}`,
          weight: 1,
          enabled: true
        }
      ]
    });

    // 3. Send Claude stream request to our Express app
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'claude-3-7-sonnet-20250219',
        stream: true,
        messages: [{ role: 'user', content: 'test stream' }]
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('Overseas Agent!');

    terminalHostManager.unregisterHost('hk-agent-id');
    agentDispatcher.cleanup();
  });

  it('successfully executes end-to-end Native Gemini request through simulated gt agent', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', claudeRoutes);
    app.use('/v1beta', geminiRoutes);

    let agentDispatcher: any = null;
    const mockWsListeners: any[] = [];
    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        const str = data.replace(/^JSON:/, '');
        const json = JSON.parse(str);
        if (json.type === 'http_req' || json.type === 'http_abort') {
          agentDispatcher.handleRequest(json);
        }
      },
      on: (event: string, fn: any) => {
        mockWsListeners.push(fn);
      },
      removeListener: () => {}
    };

    agentDispatcher = new AgentProxyDispatcher((msg: any) => {
      for (const listener of mockWsListeners) {
        listener(JSON.stringify(msg));
      }
    });

    terminalHostManager.registerHost({
      id: 'hk-agent-id-2',
      name: 'hk-vps-agent-2',
      hostname: 'vps',
      ip: '127.0.0.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);

    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          agentId: 'hk-vps-agent-2',
          url: `http://127.0.0.1:${googlePort}`,
          weight: 1,
          enabled: true
        }
      ]
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-pro:generateContent')
      .set('x-goog-api-key', 'dummy-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'test native' }] }]
      });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Response via Agent');

    terminalHostManager.unregisterHost('hk-agent-id-2');
    agentDispatcher.cleanup();
  });
});
