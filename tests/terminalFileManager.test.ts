import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import app from '../src/app';
import config from '../config/default';

describe('Terminal File Manager API Integration Tests', () => {
  const secretKey = config.adminSecretKey || 'test-admin-key';
  const testBaseDir = path.join(os.tmpdir(), `terminal-file-test-${Date.now()}`);

  beforeAll(() => {
    config.adminSecretKey = secretKey;
    if (!fs.existsSync(testBaseDir)) {
      fs.mkdirSync(testBaseDir, { recursive: true });
    }
    // Create initial test file
    fs.writeFileSync(path.join(testBaseDir, 'hello.txt'), 'Hello Gemini Proxy File Manager', 'utf-8');
    fs.mkdirSync(path.join(testBaseDir, 'subfolder'), { recursive: true });
    fs.writeFileSync(path.join(testBaseDir, 'subfolder', 'nested.json'), JSON.stringify({ test: true }), 'utf-8');
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  });

  test('rejects request without admin key', async () => {
    const res = await request(app)
      .get('/api/admin/terminal/files/list')
      .query({ hostId: 'local', path: testBaseDir });
    expect(res.status).toBe(401);
  });

  test('lists files in target directory for local host', async () => {
    const res = await request(app)
      .get('/api/admin/terminal/files/list')
      .set('x-admin-key', secretKey)
      .query({ hostId: 'local', path: testBaseDir });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.currentPath).toBe(testBaseDir);
    expect(Array.isArray(res.body.files)).toBe(true);

    const fileNames = res.body.files.map((f: any) => f.name);
    expect(fileNames).toContain('hello.txt');
    expect(fileNames).toContain('subfolder');

    const subfolder = res.body.files.find((f: any) => f.name === 'subfolder');
    expect(subfolder.isDirectory).toBe(true);
  });

  test('reads file content for text files', async () => {
    const filePath = path.join(testBaseDir, 'hello.txt');
    const res = await request(app)
      .get('/api/admin/terminal/files/content')
      .set('x-admin-key', secretKey)
      .query({ hostId: 'local', path: filePath });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.content).toBe('Hello Gemini Proxy File Manager');
    expect(res.body.isBinary).toBe(false);
  });

  test('saves modified file content', async () => {
    const filePath = path.join(testBaseDir, 'hello.txt');
    const newContent = 'Updated content from test';
    const res = await request(app)
      .post('/api/admin/terminal/files/save')
      .set('x-admin-key', secretKey)
      .send({ hostId: 'local', path: filePath, content: newContent });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(newContent);
  });

  test('creates a new directory (mkdir)', async () => {
    const res = await request(app)
      .post('/api/admin/terminal/files/mkdir')
      .set('x-admin-key', secretKey)
      .send({ hostId: 'local', path: testBaseDir, dirName: 'new-created-dir' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(path.join(testBaseDir, 'new-created-dir'))).toBe(true);
  });

  test('renames a file or directory', async () => {
    const oldPath = path.join(testBaseDir, 'new-created-dir');
    const newPath = path.join(testBaseDir, 'renamed-dir');
    const res = await request(app)
      .post('/api/admin/terminal/files/rename')
      .set('x-admin-key', secretKey)
      .send({ hostId: 'local', oldPath, newPath });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(newPath)).toBe(true);
    expect(fs.existsSync(oldPath)).toBe(false);
  });

  test('downloads a file with correct headers', async () => {
    const filePath = path.join(testBaseDir, 'hello.txt');
    const res = await request(app)
      .get('/api/admin/terminal/files/download')
      .set('x-admin-key', secretKey)
      .query({ hostId: 'local', path: filePath });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="hello.txt"');
    expect(res.text).toBe('Updated content from test');
  });

  test('uploads a file into target directory', async () => {
    const uploadFilePath = path.join(testBaseDir, 'temp-upload-source.txt');
    fs.writeFileSync(uploadFilePath, 'Upload test payload', 'utf-8');

    const res = await request(app)
      .post('/api/admin/terminal/files/upload')
      .set('x-admin-key', secretKey)
      .query({ hostId: 'local', path: testBaseDir })
      .attach('file', uploadFilePath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(path.join(testBaseDir, 'temp-upload-source.txt'))).toBe(true);
  });

  test('deletes a file or directory', async () => {
    const toDeletePath = path.join(testBaseDir, 'renamed-dir');
    const res = await request(app)
      .delete('/api/admin/terminal/files/delete')
      .set('x-admin-key', secretKey)
      .query({ hostId: 'local', path: toDeletePath });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fs.existsSync(toDeletePath)).toBe(false);
  });
});
