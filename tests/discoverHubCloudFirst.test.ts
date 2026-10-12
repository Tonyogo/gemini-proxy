import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverHubView Cloud-First Architecture', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const modalPath = path.resolve(__dirname, '../frontend/src/components/DiscoverConfigModal.tsx');
  const storagePath = path.resolve(__dirname, '../frontend/src/utils/discoverAppsStorage.ts');

  it('does not contain any localStorage calls in DiscoverHubView or storage utility', () => {
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    const storageContent = fs.readFileSync(storagePath, 'utf-8');
    expect(hubContent).not.toContain('localStorage');
    expect(storageContent).not.toContain('localStorage');
  });

  it('uses remote fetch and save functions in DiscoverHubView', () => {
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    expect(hubContent).toContain('fetchRemoteDiscoverApps');
    expect(hubContent).toContain('saveRemoteDiscoverApps');
  });

  it('modal updates trigger remote save with adminKey', () => {
    const modalContent = fs.readFileSync(modalPath, 'utf-8');
    expect(modalContent).toContain('saveRemoteDiscoverApps');
  });
});
