import request from 'supertest';
import app from '../src/app';
import config from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import accountUsageService from '../src/admin/services/accountUsageService';
import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('Direct Mode Custom Domain & Endpoint Configuration', () => {
  const originalServers = config.upstreamServers;

  beforeEach(() => {
    accountUsageService.resetForTest();
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    config.upstreamServers = originalServers;
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  describe('UI & i18n Contract Verification', () => {
    const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
    const logsPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
    const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
    const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

    const modalContent = fs.readFileSync(modalPath, 'utf-8');
    const logsContent = fs.readFileSync(logsPath, 'utf-8');
    const zhContent = fs.readFileSync(zhPath, 'utf-8');
    const enContent = fs.readFileSync(enPath, 'utf-8');

    test('i18n files should define unified gateway/endpoint url label', () => {
      expect(zhContent).toContain('nodeUrl: "网关 / 端点 URL"');
      expect(enContent).toContain('nodeUrl: "Gateway / Endpoint URL"');
    });

    test('ConfigModal should render URL input field for both proxy and direct nodes', () => {
      expect(modalContent).toContain("t('config.nodeUrl', '网关 / 端点 URL')");
      expect(modalContent).toContain(
        "placeholder={server.type === 'direct' ? 'https://generativelanguage.googleapis.com' : 'https://api.example.com'}"
      );
    });

    test('ConfigModal mode switcher preserves existing URL and only initializes when empty', () => {
      expect(modalContent).toContain("let nextUrl = (updated[idx].url || '').trim();");
      expect(modalContent).toContain("if (!nextUrl) {");
      expect(modalContent).toContain("nextUrl = 'https://generativelanguage.googleapis.com';");
    });

    test('LogsView should use activeServer.url when defined regardless of direct mode', () => {
      expect(logsContent).toContain("baseUrl = activeServer.url || 'https://generativelanguage.googleapis.com';");
      expect(logsContent).not.toContain("baseUrl = (activeServer.type === 'direct' || !activeServer.url)");
    });
  });

  describe('Proxy Routing to Custom Direct Domain', () => {
    const customDirectDomain = 'https://custom-mirror.example.com';
    const directKey = 'AIzaSyCustomDirectTestKey987654';

    beforeEach(() => {
      config.upstreamServers = [
        {
          url: customDirectDomain,
          weight: 1,
          enabled: true,
          type: 'direct',
          name: 'Custom Direct Mirror',
          apiKeys: [directKey]
        }
      ];
    });

    it('routes Claude Messages requests to custom direct domain with injected API key', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      mockedFetch.mockImplementation((url: string, opts: any) => {
        capturedUrl = url;
        capturedHeaders = opts?.headers || {};
        const payload = {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Response from custom direct domain!' }]
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }
        };
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve(payload),
          headers: {
            get: (key: string) => (key === 'content-type' ? 'application/json' : null)
          }
        });
      });

      const res = await request(app)
        .post('/v1/messages')
        .set('x-api-key', 'client-dummy-key')
        .send({
          model: 'gemini-2.5-pro',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Testing custom domain' }]
        });

      expect(res.status).toBe(200);
      expect(capturedUrl).toContain('https://custom-mirror.example.com/v1beta/models/gemini-2.5-pro:generateContent');
      expect(capturedHeaders['x-goog-api-key']).toBe(directKey);
      expect(res.body.content[0].text).toBe('Response from custom direct domain!');
    });

    it('routes Gemini Native requests to custom direct domain with injected API key', async () => {
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      mockedFetch.mockImplementation((url: string, opts: any) => {
        capturedUrl = url;
        capturedHeaders = opts?.headers || {};
        const payload = {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Gemini native from custom direct domain' }]
              },
              finishReason: 'STOP'
            }
          ]
        };
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve(payload),
          headers: {
            get: (key: string) => (key === 'content-type' ? 'application/json' : null)
          }
        });
      });

      const res = await request(app)
        .post('/v1beta/models/gemini-2.5-flash:generateContent')
        .set('x-goog-api-key', 'client-dummy-key')
        .send({
          contents: [{ role: 'user', parts: [{ text: 'Native hello' }] }]
        });

      expect(res.status).toBe(200);
      expect(capturedUrl).toContain('https://custom-mirror.example.com/v1beta/models/gemini-2.5-flash:generateContent');
      expect(capturedHeaders['x-goog-api-key']).toBe(directKey);
    });
  });
});
