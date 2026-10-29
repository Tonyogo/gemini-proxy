import { DEFAULT_BUILTIN_APPS, DEFAULT_DISCOVER_APPS, mergeBuiltinDiscoverApps } from '../frontend/src/utils/discoverAppsStorage';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover Upstream Nodes Builtin Tool', () => {
  it('registers upstreamNodes in DEFAULT_BUILTIN_APPS and DEFAULT_DISCOVER_APPS', () => {
    const builtin = DEFAULT_BUILTIN_APPS.find(a => a.id === 'upstreamNodes');
    expect(builtin).toBeDefined();
    expect(builtin?.type).toBe('builtin');
    expect(builtin?.icon).toBe('Server');
    expect(builtin?.badge).toBe('MULTI-NODE');
    expect(builtin?.enabled).toBe(true);

    const inDefault = DEFAULT_DISCOVER_APPS.find(a => a.id === 'upstreamNodes');
    expect(inDefault).toBeDefined();
  });

  it('merges upstreamNodes when remote config misses it', () => {
    const legacyApps = [
      { id: 'systemLogs', type: 'builtin', name: '系统日志', order: 0, enabled: true, icon: 'FileText', color: 'blue' },
      { id: 'custom_1', type: 'custom', name: 'Custom 1', order: 1, enabled: true, icon: 'Globe', color: 'orange' }
    ];
    const merged = mergeBuiltinDiscoverApps(legacyApps as any);
    expect(merged.some(a => a.id === 'upstreamNodes')).toBe(true);
    expect(merged.some(a => a.id === 'custom_1')).toBe(true);
  });

  it('includes i18n translations for upstreamNodes in zh and en', () => {
    expect((zh as any).discover.upstreamNodesTitle).toBe('上游节点信息');
    expect((zh as any).discover.upstreamNodesDesc).toBeDefined();
    expect((en as any).discover.upstreamNodesTitle).toBe('Upstream Nodes');
    expect((en as any).discover.upstreamNodesDesc).toBeDefined();
  });
});
