import { upstreamManager } from '../src/utils/upstreamManager';
import { UpstreamServerConfig } from '../src/types';

describe('UpstreamManager model matching for -high suffix', () => {
  const serverWithBase: UpstreamServerConfig = {
    url: 'https://generativelanguage.googleapis.com',
    weight: 1,
    enabled: true,
    type: 'direct',
    allowedModels: ['gemini-2.5-flash', 'gemini-2.5-pro']
  };

  it('allows model with -high suffix when server configures the base model', () => {
    expect(upstreamManager.serverSupportsModel(serverWithBase, 'gemini-2.5-flash-high')).toBe(true);
    expect(upstreamManager.serverSupportsModel(serverWithBase, undefined, 'gemini-2.5-pro-high')).toBe(true);
  });

  it('rejects unsupported models even with -high suffix', () => {
    expect(upstreamManager.serverSupportsModel(serverWithBase, 'gemini-1.5-flash-high')).toBe(false);
  });
});
