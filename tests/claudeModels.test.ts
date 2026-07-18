import request from 'supertest';
import app from '../src/app';

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('GET /v1/models (Models API)', () => {
  it('denies access to GET /v1/models without API key', async () => {
    const res = await request(app).get('/v1/models');
    expect(res.statusCode).toEqual(401);
    expect(res.body.error.type).toEqual('authentication_error');
  });

  it('successfully returns the supported static models list', async () => {
    const res = await request(app)
      .get('/v1/models')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].type).toEqual('model');
    expect(res.body.data[0].id).toBeDefined();
    expect(res.body.data[0].display_name).toBeDefined();
    expect(res.body.has_more).toEqual(false);

    // Assert: Check that private gemini_mapping is completely stripped from response
    expect(res.body.data[0].gemini_mapping).toBeUndefined();
  });

  it('denies access to GET /v1/models/:model_id without API key', async () => {
    const res = await request(app).get('/v1/models/gemini-2.5-flash');
    expect(res.statusCode).toEqual(401);
  });

  it('successfully retrieves a specific model detail by ID', async () => {
    const res = await request(app)
      .get('/v1/models/gemini-2.5-flash')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(200);
    expect(res.body.id).toEqual('gemini-2.5-flash');
    expect(res.body.type).toEqual('model');
    expect(res.body.display_name).toEqual('Gemini 2.5 Flash');

    // Assert: Check that private gemini_mapping is completely stripped from detailed responses
    expect(res.body.gemini_mapping).toBeUndefined();
  });

  it('returns 404 with invalid_request_error for non-existent model ID', async () => {
    const res = await request(app)
      .get('/v1/models/claude-non-existent')
      .set('x-api-key', 'client-test-key');

    expect(res.statusCode).toEqual(404);
    expect(res.body.type).toEqual('error');
    expect(res.body.error.type).toEqual('invalid_request_error');
    expect(res.body.error.message).toContain("does not exist");
  });
});
