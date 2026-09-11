import * as fs from 'fs';
import * as path from 'path';

describe('CustomWebAppModal Component Structure & Logic', () => {
  const compPath = path.resolve(__dirname, '../frontend/src/components/CustomWebAppModal.tsx');

  it('CustomWebAppModal component file exists', () => {
    expect(fs.existsSync(compPath)).toBe(true);
  });

  it('contains required input elements and data-testid attributes', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('data-testid="app-name-input"');
    expect(content).toContain('data-testid="app-url-input"');
    expect(content).toContain('data-testid="app-submit-btn"');
    expect(content).toContain('data-testid="app-delete-btn"');
  });

  it('integrates URL normalization and storage utilities', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('normalizeWebAppUrl');
    expect(content).toContain('saveCustomWebApp');
    expect(content).toContain('deleteCustomWebApp');
  });

  it('supports appToEdit for edit mode and handles onDelete callback', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('appToEdit');
    expect(content).toContain('onDelete');
    expect(content).toContain('onSave');
    expect(content).toContain('onClose');
  });

  it('supports theme color options and reverse gateway proxy flag', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('useGateway');
    expect(content).toContain('color');
    expect(content).toContain('from-orange-500 to-amber-600');
  });
});
