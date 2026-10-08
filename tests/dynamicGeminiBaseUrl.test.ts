import config, { updateConfig } from '../config/default';
import { getUpstreamUrl } from '../src/utils/requestHelper';
import * as fs from 'fs';
import * as path from 'path';

describe('Dynamic GEMINI_BASE_URL Hot-Reload & Normalization', () => {
  const originalUrl = config.geminiBaseUrl;

  afterEach(async () => {
    // Restore
    await updateConfig({ geminiBaseUrl: originalUrl });
  });

  test('should immediately update config.geminiBaseUrl and getUpstreamUrl', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://my-custom-proxy.example.com'
    });

    expect(config.geminiBaseUrl).toBe('https://my-custom-proxy.example.com');
    expect(getUpstreamUrl('/v1beta/models')).toBe('https://my-custom-proxy.example.com/v1beta/models');
  });

  test('should automatically strip trailing slashes and spaces from geminiBaseUrl', async () => {
    await updateConfig({
      geminiBaseUrl: '  https://custom-gateway.io/api///  '
    });

    expect(config.geminiBaseUrl).toBe('https://custom-gateway.io/api');
    expect(getUpstreamUrl('v1beta/models')).toBe('https://custom-gateway.io/api/v1beta/models');
  });

  test('should prepend https:// if protocol is missing', async () => {
    await updateConfig({
      geminiBaseUrl: 'gateway.openai-gemini.internal:8080'
    });

    expect(config.geminiBaseUrl).toBe('https://gateway.openai-gemini.internal:8080');
  });

  test('ConfigModal.tsx should use upstreamServers state and UI elements without geminiBaseUrl', () => {
    const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');
    expect(content).not.toContain('geminiBaseUrl');
    expect(content).toContain('upstreamServers');
    expect(content).toContain('setUpstreamServers');
    expect(content).toContain('generativelanguage.googleapis.com');
  });
});
