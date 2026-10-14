import fs from 'fs';
import path from 'path';

describe('Tasks View Discover Hub Integration', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');

  test('App.tsx registers tasks in DiscoverSubView and imports TasksView lazy', () => {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    expect(appContent).toContain("'tasks'");
    expect(appContent).toContain('TasksView');
    expect(appContent).toContain("discoverSubView === 'tasks'");
  });

  test('DiscoverHubView supports tasks tool launching', () => {
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    expect(hubContent).toContain('tasks');
  });
});
