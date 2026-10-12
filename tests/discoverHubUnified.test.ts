import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverHubView Unified Architecture', () => {
  const filePath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');

  it('uses loadDiscoverApps and imports DiscoverConfigModal', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('loadDiscoverApps');
    expect(content).toContain('DiscoverConfigModal');
    expect(content).toContain('isConfigModalOpen');
  });

  it('renders unified card grid on desktop with manage button and dashed card', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('managePage');
    expect(content).toContain('discover-app-card-');
    expect(content).toContain('dashed');
  });

  it('keeps mobile list clean without edit or config triggers', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Mobile section
    const mobileSection = content.split('md:hidden')[1].split('hidden md:block')[0];
    expect(mobileSection).not.toContain('handleOpenEditModal');
    expect(mobileSection).not.toContain('DiscoverConfigModal');
    expect(mobileSection).not.toContain('Edit3');
  });

  it('handles empty state when all apps are hidden', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('allHiddenPrompt');
  });
});
