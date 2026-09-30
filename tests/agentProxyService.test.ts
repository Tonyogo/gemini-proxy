import { EventEmitter } from 'events';
import agentProxyService from '../src/proxy/services/agentProxyService';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

class MockWs extends EventEmitter {
  public readyState = 1;
  public sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }
}

describe('agentProxyService', () => {
  let mockWs: MockWs;
  const agentId = 'test-agent';

  beforeEach(() => {
    mockWs = new MockWs();
    terminalHostManager.registerHost({
      id: 'agent-uuid',
      name: agentId,
      hostname: 'test-vps',
      ip: '127.0.0.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);
  });

  afterEach(() => {
    terminalHostManager.unregisterHost('agent-uuid');
  });

  it('successfully streams response chunks from remote agent', async () => {
    const fetchPromise = agentProxyService.agentFetch(agentId, 'https://generativelanguage.googleapis.com/test', {
      method: 'POST',
      headers: { 'x-test': '123' },
      body: JSON.stringify({ hello: 'world' })
    });

    // Check sent frame
    expect(mockWs.sent).toHaveLength(1);
    const reqFrame = JSON.parse(mockWs.sent[0].replace(/^JSON:/, ''));
    expect(reqFrame.type).toBe('http_req');
    expect(reqFrame.url).toBe('https://generativelanguage.googleapis.com/test');
    const reqId = reqFrame.requestId;

    // Simulate Agent responding
    mockWs.emit('message', JSON.stringify({
      type: 'http_res_start',
      requestId: reqId,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' }
    }));

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    // Simulate Streaming Chunks
    const receivedChunks: Buffer[] = [];
    response.body.on('data', (c: Buffer) => receivedChunks.push(c));

    mockWs.emit('message', JSON.stringify({
      type: 'http_res_chunk',
      requestId: reqId,
      chunk: Buffer.from('data: {"text":"hi"}\n\n').toString('base64')
    }));

    mockWs.emit('message', JSON.stringify({
      type: 'http_res_end',
      requestId: reqId
    }));

    await new Promise((resolve) => response.body.on('end', resolve));
    expect(Buffer.concat(receivedChunks).toString('utf-8')).toBe('data: {"text":"hi"}\n\n');
  });

  it('rejects if agent is not connected', async () => {
    await expect(
      agentProxyService.agentFetch('offline-agent', 'https://example.com')
    ).rejects.toThrow(/not online/i);
  });

  it('sends http_abort when AbortController aborts', async () => {
    const abortController = new AbortController();
    const fetchPromise = agentProxyService.agentFetch(agentId, 'https://example.com', {
      signal: abortController.signal
    });

    const reqFrame = JSON.parse(mockWs.sent[0].replace(/^JSON:/, ''));
    const reqId = reqFrame.requestId;

    abortController.abort();

    const abortFrame = mockWs.sent.map(s => JSON.parse(s.replace(/^JSON:/, ''))).find(f => f.type === 'http_abort');
    expect(abortFrame).toBeDefined();
    expect(abortFrame.requestId).toBe(reqId);

    await expect(fetchPromise).rejects.toThrow(/aborted/i);
  });
});
