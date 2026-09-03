import fs from 'fs';
import path from 'path';

describe('Component Icon Import Verification', () => {
  const componentsDir = path.resolve(__dirname, '../frontend/src/components');

  test('AccountsView imports Info from lucide-react', () => {
    const content = fs.readFileSync(path.join(componentsDir, 'AccountsView.tsx'), 'utf-8');
    const lucideImportMatch = content.match(/import\s*{([^}]+)}\s*from\s*['"]lucide-react['"]/);
    expect(lucideImportMatch).not.toBeNull();
    const importedIcons = lucideImportMatch![1].split(',').map(s => s.trim()).filter(Boolean);
    expect(importedIcons).toContain('Info');
  });

  test('DashboardView has no missing function references in render paths', () => {
    const content = fs.readFileSync(path.join(componentsDir, 'DashboardView.tsx'), 'utf-8');
    expect(content).not.toContain('getOverallLatencyPath()');
    expect(content).not.toContain('getModelDistributionPath');
  });
});
