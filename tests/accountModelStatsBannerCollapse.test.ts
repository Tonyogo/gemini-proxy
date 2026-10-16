import * as fs from 'fs';
import * as path from 'path';

describe('AccountsView Node Model Usage Overview Banner Tiled Layout', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(accountsViewPath, 'utf-8');
  });

  test('model breakdown content should be directly tiled out without collapsible wrapper or state', () => {
    expect(content).not.toMatch(/const\s*\[isStatsCollapsed,\s*setIsStatsCollapsed\]/);
    expect(content).not.toContain('{!isStatsCollapsed && (');
  });

  test('header row displays title and node request metrics cleanly', () => {
    expect(content).toContain("t('accounts.serverModelStatsTitle', '节点模型调用概览')");
    expect(content).toContain('serverModelStats.totalRequests.toLocaleString()');
    expect(content).toContain('serverModelStats.successRate');
  });

  test('model breakdown grid should support up to 5 models per row on xl screens', () => {
    expect(content).toContain('grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2');
  });

  test('model card should display model name, count, share percent, success/error metrics and success rate', () => {
    expect(content).toContain('{item.requests.toLocaleString()} <span className="text-[10px] text-slate-400">({item.sharePercent}%)</span>');
    expect(content).toContain("{t('accounts.modelSuccessFailed', { success: item.success.toLocaleString(), error: item.error.toLocaleString() })} ({item.successRate}%)");
  });
});

