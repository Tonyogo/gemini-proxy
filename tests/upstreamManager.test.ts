import config, { updateConfig, normalizeBaseUrls, parseBaseUrls } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import { getUpstreamUrl } from '../src/utils/requestHelper';

describe('UpstreamManager & Multi-Server GEMINI_BASE_URL', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  describe('normalizeBaseUrls & parseBaseUrls', () => {
    it('normalizes single URL and strips trailing slashes', () => {
      expect(normalizeBaseUrls('  https://api.gemini.com/// ')).toBe('https://api.gemini.com');
      expect(parseBaseUrls('  https://api.gemini.com/// ')).toEqual(['https://api.gemini.com']);
    });

    it('prepends https:// if protocol is missing', () => {
      expect(normalizeBaseUrls('gateway.internal:8080')).toBe('https://gateway.internal:8080');
      expect(parseBaseUrls('gateway.internal:8080')).toEqual(['https://gateway.internal:8080']);
    });

    it('normalizes multiple comma-separated URLs', () => {
      const raw = ' https://s1.example.com/ , http://s2.example.com:8080// , s3.example.com/api/ ';
      const normalized = normalizeBaseUrls(raw);
      expect(normalized).toBe('https://s1.example.com,http://s2.example.com:8080,https://s3.example.com/api');
      expect(parseBaseUrls(raw)).toEqual([
        'https://s1.example.com',
        'http://s2.example.com:8080',
        'https://s3.example.com/api'
      ]);
    });

    it('falls back to default Google upstream if empty', () => {
      expect(normalizeBaseUrls('')).toBe('https://generativelanguage.googleapis.com');
      expect(parseBaseUrls('')).toEqual(['https://generativelanguage.googleapis.com']);
      expect(normalizeBaseUrls(undefined)).toBe('https://generativelanguage.googleapis.com');
    });
  });

  describe('Per-Model Round-Robin Scheduling', () => {
    it('schedules requests evenly per-model across configured servers', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
      });

      const modelA = 'gemini-2.5-pro';
      const modelB = 'gemini-2.5-flash';

      // Model A calls
      const a1 = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent', { model: modelA });
      expect(a1.serverUrl).toBe('https://server1.com');
      expect(a1.serverIndex).toBe(0);
      expect(a1.targetUrl).toBe('https://server1.com/v1beta/models/gemini-2.5-pro:generateContent');

      const a2 = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent', { model: modelA });
      expect(a2.serverUrl).toBe('https://server2.com');
      expect(a2.serverIndex).toBe(1);

      // Model B call (should start from server 1 independently)
      const b1 = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-flash:generateContent', { model: modelB });
      expect(b1.serverUrl).toBe('https://server1.com');
      expect(b1.serverIndex).toBe(0);

      // Model A 3rd call
      const a3 = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent', { model: modelA });
      expect(a3.serverUrl).toBe('https://server3.com');
      expect(a3.serverIndex).toBe(2);

      // Model A 4th call wraps around to server 1
      const a4 = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent', { model: modelA });
      expect(a4.serverUrl).toBe('https://server1.com');
      expect(a4.serverIndex).toBe(0);

      // Model B 2nd call advances to server 2
      const b2 = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-flash:generateContent', { model: modelB });
      expect(b2.serverUrl).toBe('https://server2.com');
      expect(b2.serverIndex).toBe(1);
    });
  });

  describe('Global Round-Robin for non-model requests', () => {
    it('uses global round-robin when no model is provided', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://server1.com,https://server2.com'
      });

      const r1 = upstreamManager.getUpstreamUrl('v1beta/models');
      const r2 = upstreamManager.getUpstreamUrl('v1beta/models');
      const r3 = upstreamManager.getUpstreamUrl('v1beta/models');

      expect(r1.serverUrl).toBe('https://server1.com');
      expect(r1.serverIndex).toBe(0);

      expect(r2.serverUrl).toBe('https://server2.com');
      expect(r2.serverIndex).toBe(1);

      expect(r3.serverUrl).toBe('https://server1.com');
      expect(r3.serverIndex).toBe(0);
    });
  });

  describe('Explicit serverIndex selection', () => {
    it('targets explicit serverIndex regardless of counters', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
      });

      const s0 = upstreamManager.getUpstreamUrl('api/status', { serverIndex: 0 });
      const s2 = upstreamManager.getUpstreamUrl('api/status', { serverIndex: 2 });
      const s1 = upstreamManager.getUpstreamUrl('api/status', { serverIndex: 1 });

      expect(s0.serverUrl).toBe('https://server1.com');
      expect(s2.serverUrl).toBe('https://server3.com');
      expect(s1.serverUrl).toBe('https://server2.com');
    });
  });

  describe('Compatibility with getUpstreamUrl helper', () => {
    it('delegates getUpstreamUrl properly with and without model options', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://serverA.com,https://serverB.com'
      });

      // Passing model string
      const url1 = getUpstreamUrl('v1beta/models/gemini-pro:generateContent', 'gemini-pro');
      const url2 = getUpstreamUrl('v1beta/models/gemini-pro:generateContent', 'gemini-pro');
      expect(url1).toBe('https://serverA.com/v1beta/models/gemini-pro:generateContent');
      expect(url2).toBe('https://serverB.com/v1beta/models/gemini-pro:generateContent');

      // Passing options object
      const url3 = getUpstreamUrl('api/status', { serverIndex: 1 });
      expect(url3).toBe('https://serverB.com/api/status');
    });
  });
});
