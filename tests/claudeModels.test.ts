import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

jest.mock('node-fetch');

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('GET /v1/models (Models API)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies access to GET /v1/models without API key', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.statusCode).toEqual(401);
    expect(res.body.error.type).toEqual('authentication_error');
  });

  it('successfully returns the supported dynamic models list', async () => {
    // Mock the upstream Google Gemini models list response
    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            version: '001',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent']
          },
          {
            name: 'models/gemini-2.5-pro',
            version: '2.5',
            displayName: 'Gemini 2.5 Pro',
            supportedGenerationMethods: ['generateContent']
          }
        ]
      })
    });

    const res = await request(app)
      .get('/v1/models')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toEqual(2);
    expect(res.body.data[0].type).toEqual('model');
    expect(res.body.data[0].id).toEqual('gemini-2.5-flash');
    expect(res.body.data[0].display_name).toEqual('Gemini 2.5 Flash');
    expect(res.body.has_more).toEqual(false);
  });

  it('denies access to GET /v1/models/:model_id without API key', async () => {
    const res = await request(app).get('/v1/models/gemini-2.5-flash');
    expect(res.statusCode).toEqual(401);
  });

  it('successfully retrieves a specific model detail by ID', async () => {
    // Mock the upstream Google Gemini model detail response
    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        name: 'models/gemini-2.5-flash',
        version: '001',
        displayName: 'Gemini 2.5 Flash',
        supportedGenerationMethods: ['generateContent']
      })
    });

    const res = await request(app)
      .get('/v1/models/gemini-2.5-flash')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual('gemini-2.5-flash');
    expect(res.body.type).toEqual('model');
    expect(res.body.display_name).toEqual('Gemini 2.5 Flash');
  });

  it('returns 404 with invalid_request_error for non-existent model ID', async () => {
    // Mock upstream 404 response
    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 404,
      ok: false,
      text: () => Promise.resolve('Model not found')
    });

    const res = await request(app)
      .get('/v1/models/claude-non-existent')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(404);
    expect(res.body.type).toEqual('error');
    expect(res.body.error.type).toEqual('invalid_request_error');
    expect(res.body.error.message).toContain("does not exist");
  });
});
