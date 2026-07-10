const request = require('supertest');
const app = require('../src/app');
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('ClaudeController Transaction Logging', () => {
  const debugDir = path.join(process.cwd(), 'data', 'debug');

  beforeEach(async () => {
    try {
      await fs.mkdir(debugDir, { recursive: true });
    } catch (e) {}
  });

  afterEach(async () => {
    try {
      const files = await fs.readdir(debugDir);
      for (const f of files) {
        if (f.startsWith('transaction_')) {
          await fs.unlink(path.join(debugDir, f));
        }
      }
    } catch (e) {}
  });

  it('correctly logs non-streaming requests and responses', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Non-streaming response' }] } }]
      })
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is 1+1?' }]
      });

    expect(res.statusCode).toEqual(200);

    // Wait a brief moment for async file-write to complete
    await new Promise(r => setTimeout(r, 100));

    const files = await fs.readdir(debugDir);
    const transFile = files.find(f => f.startsWith('transaction_') && f.endsWith('.json'));
    expect(transFile).toBeDefined();

    const data = JSON.parse(await fs.readFile(path.join(debugDir, transFile), 'utf8'));
    expect(data.client_req.model).toEqual('claude-3-5-sonnet');
    expect(data.gem_res.candidates[0].content.parts[0].text).toEqual('Non-streaming response');
  });

  it('correctly aggregates and logs streaming chunks', async () => {
    const { Readable } = require('stream');
    const mockStream = new Readable();
    mockStream._read = () => {};

    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      body: mockStream
    });

    const promise = request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'Tell a story' }],
        stream: true
      });

    const chunk = {
      candidates: [{ content: { parts: [{ text: 'Streaming chunk content' }] } }]
    };

    mockStream.push(`data: ${JSON.stringify(chunk)}\n\n`);
    mockStream.push(null); // end

    await promise;

    // Wait a brief moment for async file-write to complete
    await new Promise(r => setTimeout(r, 100));

    const files = await fs.readdir(debugDir);
    const transFile = files.find(f => f.startsWith('transaction_') && f.endsWith('.json'));
    expect(transFile).toBeDefined();

    const data = JSON.parse(await fs.readFile(path.join(debugDir, transFile), 'utf8'));
    expect(data.client_req.model).toEqual('claude-3-5-sonnet');
    expect(data.gem_res[0].candidates[0].content.parts[0].text).toEqual('Streaming chunk content');
  });
});
