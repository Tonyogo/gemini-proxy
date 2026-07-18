import request from 'supertest';
import app from '../src/app';
import config from '../config/default';
import claudeController from '../src/controllers/claudeController';

// Mock payloadLogger to prevent async disk writing side-effects and background log warnings
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

// Mock node-fetch globally
jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation(() => {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: { parts: [{ text: 'Mock response from Gemini!' }] }
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
      })
    });
  });
});

describe('POST /v1/messages (Authentication / Headers)', () => {
  it('authenticates successfully via standard Bearer Authorization', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer client-bearer-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });

  it('authenticates successfully via standard Anthropic x-api-key header', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-anthropic-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });

  it('authenticates successfully via x-goog-api-key header', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-goog-api-key', 'client-google-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });

  it('denies access if no API key is provided', async () => {
    const resFail = await request(app)
      .post('/v1/messages')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(resFail.statusCode).toEqual(401);
    expect(resFail.body.error.type).toEqual('authentication_error');
  });
});

describe('ClaudeController URL helper methods', () => {
  it('correctly normalizes base URLs and path slashes', () => {
    config.geminiBaseUrl = 'https://my-custom-endpoint.com/';
    // @ts-ignore
    let url = claudeController._getUpstreamUrl('/v1beta/models');
    expect(url).toEqual('https://my-custom-endpoint.com/v1beta/models');

    config.geminiBaseUrl = 'https://my-custom-endpoint.com';
    // @ts-ignore
    url = claudeController._getUpstreamUrl('v1beta/models');
    expect(url).toEqual('https://my-custom-endpoint.com/v1beta/models');
  });
});
