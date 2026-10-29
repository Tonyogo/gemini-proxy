import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('UpstreamNodesOverview Flat Cluster Card Design', () => {
  const componentPath = path.resolve(__dirname, '../frontend/src/components/dashboard/UpstreamNodesOverview.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  it('renders flat 2-column cluster cards with ShieldCheck, KeyRound, DIRECT/PROXY badge, and bottom status row', () => {
    const code = fs.readFileSync(componentPath, 'utf-8');
    expect(code).toContain('calculateUpstreamNodeSummary');
    expect(code).toContain('grid-cols-1 md:grid-cols-2');
    expect(code).toContain('ShieldCheck');
    expect(code).toContain('KeyRound');
    expect(code).toContain('DIRECT');
    expect(code).toContain('PROXY');
    expect(code).toContain('nodeKeyPoolPolling');
    expect(code).toContain('nodeAvgLatencyItem');
    expect(code).toContain('editClusterNodes');
  });

  it('wires onEditNodes from App.tsx through DashboardView to UpstreamNodesOverview', () => {
    const dashCode = fs.readFileSync(dashboardPath, 'utf-8');
    const appCode = fs.readFileSync(appPath, 'utf-8');
    expect(dashCode).toContain('onEditNodes');
    expect(appCode).toContain("setConfigModalInitialTab('upstream')");
  });

  it('i18n dictionaries include updated cluster node labels in zh and en', () => {
    expect((zh as any).dashboard.upstreamNodesTitle).toBe('上游集群节点列表');
    expect((zh as any).dashboard.editClusterNodes).toBe('编辑集群节点');
    expect((zh as any).dashboard.nodeHealthyOnline).toBe('健康在线');
    expect((en as any).dashboard.upstreamNodesTitle).toBe('Upstream Cluster Nodes');
    expect((en as any).dashboard.editClusterNodes).toBe('Edit Cluster Nodes');
  });
});
