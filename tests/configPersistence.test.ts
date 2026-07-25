import config, { updateConfig } from '../config/default';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('Explicit Overrides Runtime Config', () => {
  const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.json');

  afterEach(async () => {
    await updateConfig({}, { resetToEnv: true });
    try {
      await fs.unlink(runtimeJsonPath);
    } catch {
      // ignore
    }
  });

  test('updateConfig only writes explicit keys and resets cleanly', async () => {
    // 1. Update only runtimeContextTag
    await updateConfig({ runtimeContextTag: 'explicit-tag-override' });

    expect(config.runtimeContextTag).toBe('explicit-tag-override');

    const rawData = JSON.parse(await fs.readFile(runtimeJsonPath, 'utf8'));
    // Should contain runtimeContextTag and only explicit keys
    expect(rawData).toHaveProperty('runtimeContextTag');
    expect(Object.keys(rawData)).toEqual(['runtimeContextTag']);

    // 2. Reset to env
    await updateConfig({}, { resetToEnv: true });
    const exists = await fs.access(runtimeJsonPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
