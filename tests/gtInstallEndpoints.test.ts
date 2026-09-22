import request from 'supertest';
import app from '../src/app';

describe('Public gt CLI and installer download endpoints', () => {
  it('serves install.sh on GET /install.sh', async () => {
    const res = await request(app).get('/install.sh');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gemini Terminal (gt) CLI One-Line Installer');
  });

  it('serves gt.js on GET /gt', async () => {
    const res = await request(app).get('/gt');
    expect(res.status).toBe(200);
    expect(res.text).toContain('gt (Gemini Terminal)');
  });
});
