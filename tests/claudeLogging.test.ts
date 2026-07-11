import request from 'supertest';
import app from '../src/app';
import payloadLogger from '../src/services/payloadLogger';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('ClaudeController Transaction Logging (via Spy)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(payloadLogger, 'saveTransaction').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('correctly logs non-streaming requests and responses', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({
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
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'What is 1+1?' }]
      });

    expect(res.statusCode).toEqual(200);

    // Verify spy call parameters
    expect(logSpy).toHaveBeenCalled();
    const [transactionId, clientReq, gemReq, gemRes] = logSpy.mock.calls[0];

    expect(transactionId).toBeDefined();
    expect(clientReq.model).toEqual('claude-sonnet-4.6');
    expect(gemReq.contents[0].parts[0].text).toEqual('What is 1+1?');
    expect(gemRes.candidates[0].content.parts[0].text).toEqual('Non-streaming response');
  });

  it('correctly aggregates and logs streaming chunks', async () => {
    const { Readable } = require('stream');
    const mockStream = new Readable();
    mockStream._read = () => {};

    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      body: mockStream
    });

    const promise = request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'Tell a story' }],
        stream: true
      });

    const chunk1 = {
      candidates: [{ content: { parts: [{ text: 'Streaming chunk content 1' }] } }]
    };
    const chunk2 = {
      candidates: [{ content: { parts: [{ text: 'Streaming chunk content 2' }] } }]
    };

    mockStream.push(`data: ${JSON.stringify(chunk1)}\n\n`);
    mockStream.push(`data: ${JSON.stringify(chunk2)}\n\n`);
    mockStream.push(null); // end

    await promise;

    // Verify spy call parameters
    expect(logSpy).toHaveBeenCalled();
    const [transactionId, clientReq, gemReq, gemRes] = logSpy.mock.calls[0];

    expect(transactionId).toBeDefined();
    expect(clientReq.model).toEqual('claude-sonnet-4.6');
    expect(gemReq.contents[0].parts[0].text).toEqual('Tell a story');

    // Verified chunk aggregation
    expect(gemRes).toBeInstanceOf(Array);
    expect(gemRes.length).toEqual(2);
    expect(gemRes[0].candidates[0].content.parts[0].text).toEqual('Streaming chunk content 1');
    expect(gemRes[1].candidates[0].content.parts[0].text).toEqual('Streaming chunk content 2');
  });
});
