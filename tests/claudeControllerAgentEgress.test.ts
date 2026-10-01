import request from 'supertest';
import express from 'express';
import claudeRoutes from '../src/proxy/routes/claudeRoutes';
import agentProxyService from '../src/proxy/services/agentProxyService';
import upstreamManager from '../src/utils/upstreamManager';
import { updateConfig } from '../config/default';

jest.mock('../src/proxy/services/agentProxyService');

const app = express();
app.use(express.json());
app.use('/v1', claudeRoutes);

describe('ClaudeController Agent Egress Routing', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.reset();
  });

  it('routes request through agentFetch when selected upstream is an agent', async () => {
    const mockAgentFetch = jest.spyOn(agentProxyService, 'agentFetch').mockResolvedValue({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
        raw: () => ({ 'content-type': ['application/json'] })
      },
      text: async () => JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: 'response from agent' }] } }]
      }),
      json: async () => ({
        candidates: [{ content: { role: 'model', parts: [{ text: 'response from agent' }] } }]
      }),
      body: (function* () {
        yield Buffer.from(JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: 'response from agent' }] } }]
        }));
      })() as any
    } as any);

    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      serverUrl: 'https://generativelanguage.googleapis.com',
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      agentId: 'mock-agent'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'valid-key')
      .send({
        model: 'claude-3-7-sonnet-20250219',
        messages: [{ role: 'user', content: 'hello' }]
      });

    expect(mockAgentFetch).toHaveBeenCalledWith(
      'mock-agent',
      expect.stringContaining('generateContent'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(res.status).toBe(200);
    expect(res.body.content[0].text).toBe('response from agent');
  });
});
