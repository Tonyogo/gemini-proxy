import * as fs from 'fs';
import * as path from 'path';

describe('AccountsView Direct Mode Model Usage Unification', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(accountsViewPath, 'utf-8');
  });

  test('top model overview banner is preserved for both direct and proxy nodes', () => {
    expect(content).not.toContain('directTotalReqs');
    expect(content).not.toContain('directTotalSuccess');
    expect(content).not.toContain('directSuccessRate');
    expect(content).not.toContain("t('accounts.directModeTitle', 'Gemini 直连密钥用量监控')");
    // Top model stats header card is rendered
    expect(content).toMatch(/\{\/\* Minimalist Top Summary Header \*\/\}/);
  });

  test('hides Action Toolbar and account table when node is in direct mode', () => {
    // Action toolbar and table must be conditioned on !isCurrentDirect
    expect(content).toContain('{!isCurrentDirect && (');

    // Legacy direct mode table and mobile card list should be removed
    expect(content).not.toContain('/* Desktop Direct Mode Table */');
    expect(content).not.toContain('/* Mobile Direct Mode Card List */');
  });
});
