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
});
