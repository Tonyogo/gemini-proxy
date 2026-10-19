import * as fs from 'fs';
import * as path from 'path';

describe('AccountsView Direct Mode Model Usage Unification', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(accountsViewPath, 'utf-8');
  });

  test('top model overview banner is unified and legacy direct mode 4-card grid is removed', () => {
    expect(content).not.toContain('directTotalReqs');
    expect(content).not.toContain('directTotalSuccess');
    expect(content).not.toContain('directSuccessRate');
    expect(content).not.toContain("t('accounts.directModeTitle', 'Gemini 直连密钥用量监控')");
    // Top model stats cards should render without isCurrentDirect ternary branch
    expect(content).toMatch(/\{\/\* Minimalist Top Summary Header \*\/\}/);
  });

  test('desktop direct mode table uses unified tableQuota column with popover triggers and inline badges', () => {
    // Should not contain the old headers in direct mode
    expect(content).not.toContain("t('accounts.keyTotalRequests', '调用统计')");
    expect(content).not.toContain("t('accounts.activeModels', '活跃模型明细')");

    // In direct mode desktop table, find the table section
    const directTableSection = content.split('/* Desktop Direct Mode Table */')[1]?.split('/* Mobile Direct Mode Card List */')[0];
    expect(directTableSection).toBeDefined();

    // Verify 4-column header with tableQuota
    expect(directTableSection).toContain("t('accounts.tableQuota', '配额与今日用量')");

    // Verify popover triggers are wired
    expect(directTableSection).toContain('handleTogglePopover(e, acc.index)');
    expect(directTableSection).toContain('handleMouseEnterPopover(e, acc.index)');

    // Verify topModels inline badges and successRate calculation
    expect(directTableSection).toContain('getAccountTopModels(acc.usage, 2)');
    expect(directTableSection).toContain('topModels.map');
    expect(directTableSection).toContain('{successRate}%');
  });

  test('mobile direct mode card list uses unified usage button and expandable breakdown card', () => {
    const mobileDirectSection = content.split('/* Mobile Direct Mode Card List */')[1]?.split('/* Desktop Table View */')[0];
    expect(mobileDirectSection).toBeDefined();

    // Verify toggleMobileUsage is wired to the usage button
    expect(mobileDirectSection).toContain('toggleMobileUsage(acc.index)');
    expect(mobileDirectSection).toContain('isUsageExpanded');

    // Verify inline top models are rendered
    expect(mobileDirectSection).toContain('getAccountTopModels(acc.usage, 2)');
    expect(mobileDirectSection).toContain('topModels.map');

    // Verify expandable breakdown drawer when expanded
    expect(mobileDirectSection).toContain('{isUsageExpanded && (');
    expect(mobileDirectSection).toContain('breakdowns.map');

    // Verify legacy progress bar in mobile direct mode is removed
    expect(mobileDirectSection).not.toContain("style={{ width: `${rate}%` }}");
  });
});
