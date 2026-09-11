import * as fs from 'fs';
import * as path from 'path';

describe('MihomoView Component Structure', () => {
  const compPath = path.resolve(__dirname, '../frontend/src/components/MihomoView.tsx');

  it('MihomoView exists and includes key state handlers', () => {
    expect(fs.existsSync(compPath)).toBe(true);
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('/api/admin/mihomo/status');
    expect(content).toContain('/api/admin/mihomo/traffic');
    expect(content).toContain('/api/admin/mihomo/proxies');
    expect(content).toContain('/api/admin/mihomo/configs');
  });

  it('MihomoView supports mode switching and latency testing', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toMatch(/handleSwitchMode|handleModeChange/);
    expect(content).toMatch(/handleTestDelay|testGroupDelay/);
    expect(content).toMatch(/handleSelectNode|switchProxy/);
  });
});
