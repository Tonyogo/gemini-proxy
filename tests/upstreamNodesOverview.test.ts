import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('UpstreamNodesOverview Component & Integration', () => {
  const componentPath = path.resolve(__dirname, '../frontend/src/components/dashboard/UpstreamNodesOverview.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');

  it('component file exists and follows Linear-style design classes', () => {
    expect(fs.existsSync(componentPath)).toBe(true);
    const code = fs.readFileSync(componentPath, 'utf-8');
    expect(code).toContain('calculateUpstreamNodeSummary');
    expect(code).toContain('ui-card');
    expect(code).toContain('tabular-nums');
    expect(code).not.toContain('text-slate-100');
  });

  it('DashboardView imports and renders UpstreamNodesOverview', () => {
    const dashCode = fs.readFileSync(dashboardPath, 'utf-8');
    expect(dashCode).toContain('UpstreamNodesOverview');
    expect(dashCode).toContain('<UpstreamNodesOverview');
  });

  it('i18n dictionaries include dashboard upstreamNodes entries in zh and en', () => {
    expect((zh as any).dashboard.upstreamNodesTitle).toBe('上游节点概览');
    expect((zh as any).dashboard.nodesConfigured).toBeDefined();
    expect((zh as any).dashboard.nodeReqsAndRate).toBeDefined();

    expect((en as any).dashboard.upstreamNodesTitle).toBe('Upstream Nodes Overview');
    expect((en as any).dashboard.nodesConfigured).toBeDefined();
    expect((en as any).dashboard.nodeReqsAndRate).toBeDefined();
  });
});
