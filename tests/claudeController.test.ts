import request from 'supertest';
import app from '../src/app';
import config from '../config/default';
import claudeController from '../src/controllers/claudeController';
import { getUpstreamUrl, extractClientKey, generateTransactionId, buildUpstreamHeaders, maskApiKey, sanitizeData } from '../src/utils/requestHelper';

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
    let url = getUpstreamUrl('/v1beta/models');
    expect(url).toEqual('https://my-custom-endpoint.com/v1beta/models');

    config.geminiBaseUrl = 'https://my-custom-endpoint.com';
    url = getUpstreamUrl('v1beta/models');
    expect(url).toEqual('https://my-custom-endpoint.com/v1beta/models');
  });
});

describe('extractClientKey helper', () => {
  it('extracts key from x-api-key header', () => {
    const mockReq = {
      headers: { 'x-api-key': 'test-key-1' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-1');
  });

  it('extracts key from x-goog-api-key header', () => {
    const mockReq = {
      headers: { 'x-goog-api-key': 'test-key-2' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-2');
  });

  it('extracts key from authorization bearer header', () => {
    const mockReq = {
      headers: { authorization: 'Bearer test-key-3' },
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-3');
  });

  it('extracts key from query parameter', () => {
    const mockReq = {
      headers: {},
      query: { key: 'test-key-4' }
    } as any;
    expect(extractClientKey(mockReq)).toEqual('test-key-4');
  });

  it('returns null when no key is provided', () => {
    const mockReq = {
      headers: {},
      query: {}
    } as any;
    expect(extractClientKey(mockReq)).toBeNull();
  });
});

describe('generateTransactionId helper', () => {
  it('generates unique transaction IDs containing timestamp and random string', () => {
    const id1 = generateTransactionId();
    const id2 = generateTransactionId();
    expect(id1).not.toEqual(id2);
    expect(id1).toMatch(/^\d+_[a-z0-9]+$/);
  });
});

describe('Security and Request Helpers', () => {
  describe('buildUpstreamHeaders', () => {
    it('creates headers with application/json and x-goog-api-key', () => {
      const headers = buildUpstreamHeaders('my-secret-key');
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'x-goog-api-key': 'my-secret-key'
      });
    });

    it('merges custom headers', () => {
      const headers = buildUpstreamHeaders('my-secret-key', { 'X-Custom': 'val' });
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'x-goog-api-key': 'my-secret-key',
        'X-Custom': 'val'
      });
    });
  });

  describe('maskApiKey', () => {
    it('masks keys longer than 10 characters', () => {
      expect(maskApiKey('AIzaSy1234567890')).toEqual('AIzaSy***7890');
    });

    it('returns *** for short keys', () => {
      expect(maskApiKey('shortkey')).toEqual('***');
    });

    it('returns empty string for empty inputs', () => {
      expect(maskApiKey('')).toEqual('');
      expect(maskApiKey(null)).toEqual('');
      expect(maskApiKey(undefined)).toEqual('');
    });
  });

  describe('sanitizeData', () => {
    it('redacts query string keys and Bearer tokens in strings', () => {
      const input = 'https://api.com/v1?key=secret123 and Authorization: Bearer token456';
      const result = sanitizeData(input);
      expect(result).toEqual('https://api.com/v1?key=*** and Authorization: Bearer ***');
    });

    it('redacts sensitive keys in nested objects', () => {
      const input = {
        apiKey: 'AIzaSy1234567890',
        headers: {
          'x-goog-api-key': 'AIzaSy1234567890',
          authorization: 'Bearer token123'
        },
        other: 'safe_data'
      };
      const result = sanitizeData(input);
      expect(result.apiKey).toEqual('AIzaSy***7890');
      expect(result.headers['x-goog-api-key']).toEqual('AIzaSy***7890');
      expect(result.headers.authorization).toEqual('Bearer***');
      expect(result.other).toEqual('safe_data');
    });
  });
});
