import config, { updateConfig } from '../config/default';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('Explicit Overrides Runtime Config', () => {
  const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.test.json');

  beforeEach(async () => {
    await updateConfig({}, { resetToEnv: true });
  });

  afterEach(async () => {
    await updateConfig({}, { resetToEnv: true });
    try {
      await fs.unlink(runtimeJsonPath);
    } catch {
      // ignore
    }
  });

  test('updateConfig only writes explicit keys and resets cleanly', async () => {
    // 1. Update only customSystemInstruction
    await updateConfig({ customSystemInstruction: 'explicit-instruction-override' });

    expect(config.customSystemInstruction).toBe('explicit-instruction-override');

    const rawData = JSON.parse(await fs.readFile(runtimeJsonPath, 'utf8'));
    // Should contain customSystemInstruction and only explicit keys
    expect(rawData).toHaveProperty('customSystemInstruction');
    expect(Object.keys(rawData)).toEqual(['customSystemInstruction']);

    // 2. Reset to env
    await updateConfig({}, { resetToEnv: true });
    const exists = await fs.access(runtimeJsonPath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
