import request from 'supertest';
import app from '../src/app';
import proxyAgentManager from '../src/utils/proxyAgentManager';
import config, { updateConfig } from '../config/default';

describe('Proxy Egress Execution', () => {
  afterEach(async () => {
    await updateConfig({ proxyUrl: '', upstreamServers: undefined });
  });

  test('injects proxy agent into upstream fetch call when proxyUrl is configured', async () => {
    const getAgentSpy = jest.spyOn(proxyAgentManager, 'getAgent');
    await updateConfig({ proxyUrl: 'http://127.0.0.1:9999' });

    // Send a request to trigger upstream fetch
    await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'hello' }]
      });

    expect(getAgentSpy).toHaveBeenCalledWith(expect.objectContaining({ serverUrl: 'https://generativelanguage.googleapis.com' }));
    getAgentSpy.mockRestore();
  });

  test('injects node-level proxy agent when upstream server has custom proxyUrl', async () => {
    const getAgentSpy = jest.spyOn(proxyAgentManager, 'getAgent');
    await updateConfig({
      upstreamServers: [
        {
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true,
          type: 'proxy',
          proxyUrl: 'socks5://127.0.0.1:10808'
        }
      ]
    });

    await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'hello' }]
      });

    expect(getAgentSpy).toHaveBeenCalledWith(expect.objectContaining({ proxyUrl: 'socks5://127.0.0.1:10808' }));
    getAgentSpy.mockRestore();
  });

  test('injects proxy agent into gemini native route when proxyUrl is configured', async () => {
    const getAgentSpy = jest.spyOn(proxyAgentManager, 'getAgent');
    await updateConfig({ proxyUrl: 'http://127.0.0.1:9999' });

    await request(app)
      .post('/v1beta/models/gemini-2.5-flash:generateContent')
      .set('x-goog-api-key', 'dummy-key')
      .send({
        contents: [{ parts: [{ text: 'hello' }] }]
      });

    expect(getAgentSpy).toHaveBeenCalled();
    getAgentSpy.mockRestore();
  });

  test('does not use proxy agent when selected node has useProxy: false even with global proxy set', async () => {
    const getAgentSpy = jest.spyOn(proxyAgentManager, 'getAgent');
    await updateConfig({
      proxyUrl: 'http://127.0.0.1:9999',
      upstreamServers: [{ url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, useProxy: false }]
    });

    await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'test' }] });

    expect(getAgentSpy).toHaveBeenCalledWith(expect.objectContaining({ useProxy: false }));
    getAgentSpy.mockRestore();
    await updateConfig({ proxyUrl: '' });
  });
});
