import * as fs from 'fs';
import * as path from 'path';
import {
  resolveNodeDisplayInfo,
  aggregateModelStats,
  ModelStatItem,
  ModelNodeStatItem
} from '../frontend/src/utils/modelHelpers';

describe('ModelPerformanceMatrix Upstream Nodes Comparison Feature', () => {
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');
  const adminControllerPath = path.resolve(__dirname, '../src/admin/controllers/adminController.ts');

  let matrixContent: string;
  let dashboardContent: string;
  let zhContent: string;
  let enContent: string;
  let adminControllerContent: string;

  beforeAll(() => {
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    zhContent = fs.readFileSync(zhPath, 'utf-8');
    enContent = fs.readFileSync(enPath, 'utf-8');
    adminControllerContent = fs.readFileSync(adminControllerPath, 'utf-8');
  });

  describe('resolveNodeDisplayInfo', () => {
    const mockServers = [
      {
        serverIndex: 0,
        name: 'HK-Cluster-01',
        url: 'https://hk.gateway.example.com/v1',
        type: 'proxy',
        weight: 3,
        isIsolated: false
      },
      {
        serverIndex: 1,
        url: 'https://us.direct.api.com/v1beta',
        type: 'direct',
        weight: 1,
        isIsolated: true
      }
    ];

    test('should resolve legacy node key correctly', () => {
      const info = resolveNodeDisplayInfo('legacy', mockServers);
      expect(info.nodeName).toBe('未分配 / Legacy');
      expect(info.isLegacy).toBe(true);
      expect(info.isIsolated).toBe(false);
      expect(info.url).toBeUndefined();
    });

    test('should resolve custom name if configured on the upstream server', () => {
      const info = resolveNodeDisplayInfo('0', mockServers);
      expect(info.nodeName).toBe('HK-Cluster-01');
      expect(info.url).toBe('https://hk.gateway.example.com/v1');
      expect(info.type).toBe('proxy');
      expect(info.weight).toBe(3);
      expect(info.isIsolated).toBe(false);
      expect(info.isLegacy).toBe(false);
    });

    test('should fallback to Node N (hostname) when custom name is missing', () => {
      const info = resolveNodeDisplayInfo('1', mockServers);
      expect(info.nodeName).toBe('Node 2 (us.direct.api.com)');
      expect(info.url).toBe('https://us.direct.api.com/v1beta');
      expect(info.type).toBe('direct');
      expect(info.weight).toBe(1);
      expect(info.isIsolated).toBe(true);
      expect(info.isLegacy).toBe(false);
    });

    test('should handle unknown index gracefully', () => {
      const info = resolveNodeDisplayInfo('99', mockServers);
      expect(info.nodeName).toBe('Node 100');
      expect(info.isLegacy).toBe(false);
      expect(info.isIsolated).toBe(false);
    });
  });

  describe('aggregateModelStats with Upstream Nodes', () => {
    const mockServers = [
      { serverIndex: 0, name: 'Node-A', url: 'https://a.test.com' },
      { serverIndex: 1, name: 'Node-B', url: 'https://b.test.com' }
    ];

    const timeSeries = [
      {
        timestamp: '2026-10-28T10:00:00Z',
        models: {
          'gemini-2.5-pro': 60,
          'gemini-2.5-pro-high': 40,
          'claude-3-5-sonnet': 50
        },
        modelDurations: {
          'gemini-2.5-pro': 60000,
          'gemini-2.5-pro-high': 40000,
          'claude-3-5-sonnet': 25000
        },
        modelNodes: {
          'gemini-2.5-pro': {
            '0': { requests: 50, success: 48, error: 2, totalDuration: 45000, durationCount: 50 },
            '1': { requests: 10, success: 10, error: 0, totalDuration: 15000, durationCount: 10 }
          },
          'gemini-2.5-pro-high': {
            '0': { requests: 30, success: 30, error: 0, totalDuration: 27000, durationCount: 30 },
            'legacy': { requests: 10, success: 8, error: 2, totalDuration: 13000, durationCount: 10 }
          },
          'claude-3-5-sonnet': {
            '1': { requests: 50, success: 49, error: 1, totalDuration: 25000, durationCount: 50 }
          }
        }
      }
    ];

    test('should aggregate node metrics under normalized base model', () => {
      const result = aggregateModelStats(timeSeries, mockServers);
      expect(result.totalRequests).toBe(150);

      const gemini = result.list.find(item => item.model === 'gemini-2.5-pro');
      expect(gemini).toBeDefined();
      expect(gemini?.requests).toBe(100);
      expect(gemini?.nodes).toBeDefined();
      expect(gemini?.nodes?.length).toBe(3);

      // Node '0' combined from gemini-2.5-pro (50) and gemini-2.5-pro-high (30) = 80
      const nodeA = gemini?.nodes?.find(n => n.nodeKey === '0');
      expect(nodeA).toBeDefined();
      expect(nodeA?.nodeName).toBe('Node-A');
      expect(nodeA?.requests).toBe(80);
      expect(nodeA?.success).toBe(78);
      expect(nodeA?.error).toBe(2);
      expect(nodeA?.successRate).toBe(97.5);
      expect(nodeA?.percentage).toBe(80); // 80 / 100 = 80%

      // Legacy node (10)
      const legacyNode = gemini?.nodes?.find(n => n.nodeKey === 'legacy');
      expect(legacyNode).toBeDefined();
      expect(legacyNode?.nodeName).toBe('未分配 / Legacy');
      expect(legacyNode?.isLegacy).toBe(true);
      expect(legacyNode?.requests).toBe(10);
      expect(legacyNode?.percentage).toBe(10);

      // Claude node
      const claude = result.list.find(item => item.model === 'claude-3-5-sonnet');
      expect(claude).toBeDefined();
      expect(claude?.nodes?.length).toBe(1);
      expect(claude?.nodes?.[0].nodeName).toBe('Node-B');
      expect(claude?.nodes?.[0].percentage).toBe(100);
    });

    test('should handle timeSeries without modelNodes gracefully', () => {
      const legacyTimeSeries = [
        {
          timestamp: '2026-10-28T09:00:00Z',
          models: { 'gemini-flash': 20 }
        }
      ];
      const result = aggregateModelStats(legacyTimeSeries, mockServers);
      expect(result.totalRequests).toBe(20);
      expect(result.list[0].nodes).toEqual([]);
    });
  });

  describe('ModelPerformanceMatrix UI Components & Localization', () => {
    test('should contain localization keys in zh and en for upstream nodes', () => {
      expect(zhContent).toContain('upstreamNodes: "上游节点对比"');
      expect(enContent).toContain('upstreamNodes: "Upstream Nodes"');
      expect(zhContent).toContain('upstreamNodeShare');
      expect(zhContent).toContain('upstreamNodeLatency');
      expect(zhContent).toContain('upstreamNodeSuccessRate');
      expect(zhContent).toContain('upstreamNodeWeight');
      expect(zhContent).toContain('upstreamNodeUrl');
    });

    test('ModelPerformanceMatrix should render upstream nodes column in desktop table', () => {
      expect(matrixContent).toContain('dashboard.upstreamNodes');
      expect(matrixContent).toContain('min-w-[200px]');
      expect(matrixContent).toContain('UpstreamNodeCapsule');
    });

    test('ModelPerformanceMatrix should render upstream node capsules in mobile card', () => {
      expect(matrixContent).toContain('item.nodes && item.nodes.length > 0');
    });

    test('ModelPerformanceMatrix should render interactive glassmorphic hover tooltip', () => {
      expect(matrixContent).toContain('activeTooltip');
      expect(matrixContent).toContain('handleNodeHover');
      expect(matrixContent).toContain('handleNodeLeave');
      expect(matrixContent).toContain('dashboard.upstreamNodeSuccessRate');
      expect(matrixContent).toContain('dashboard.upstreamNodeShare');
      expect(matrixContent).toContain('dashboard.upstreamNodeLatency');
    });

    test('DashboardView should pass upstream servers to aggregateModelStats', () => {
      expect(dashboardContent).toMatch(/aggregateModelStats\(\s*timeSeries,\s*upstreamServers\s*\)/);
    });

    test('adminController.getStats should attach upstreamServers to response', () => {
      expect(adminControllerContent).toMatch(/upstreamServers:\s*(?:await\s+)?upstreamManager\.getUpstreamServerStatusList(?:WithHealth)?\(\)/);
    });
  });
});
