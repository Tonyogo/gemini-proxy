import config, { updateConfig } from '../config/default';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('Runtime Config Store', () => {
  const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.json');

  afterEach(async () => {
    try {
      await fs.unlink(runtimeJsonPath);
    } catch {
      // ignore
    }
    await updateConfig({
      runtimeContextTag: 'runtime-context',
      systemRoleToInstruction: false
    });
  });

  test('updateConfig mutates config in memory and writes to runtime.json', async () => {
    await updateConfig({
      runtimeContextTag: 'custom-tag-test',
      systemRoleToInstruction: true
    });

    expect(config.runtimeContextTag).toBe('custom-tag-test');
    expect(config.systemRoleToInstruction).toBe(true);

    const exists = await fs.access(runtimeJsonPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const data = JSON.parse(await fs.readFile(runtimeJsonPath, 'utf8'));
    expect(data.runtimeContextTag).toBe('custom-tag-test');
  });
});
