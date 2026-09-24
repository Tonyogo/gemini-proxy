import { execFile } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

function runGt(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [gtPath, ...args], (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

describe('gt management commands & legacy deprecation', () => {
  it('displays Docker-style commands in --help', async () => {
    const res = await runGt(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('gt ps [-a|--all]');
    expect(res.stdout).toContain('gt exec');
    expect(res.stdout).toContain('gt logs');
    expect(res.stdout).toContain('gt kill');
    expect(res.stdout).toContain('gt prune');
    expect(res.stdout).toContain('gt login');
    expect(res.stdout).toContain('gt logout');
    expect(res.stdout).toContain('gt agent run');
  });

  it('rejects top-level agent commands with code 125 and migration guidance', async () => {
    const commands = ['run', 'stop', 'restart', 'rm'];
    for (const cmd of commands) {
      const res = await runGt([cmd, 'test-node']);
      expect(res.code).toBe(125);
      expect(res.stderr).toContain(`Error: 'gt ${cmd}' has been moved to 'gt agent ${cmd}'.`);
      expect(res.stderr).toContain(`Run 'gt agent ${cmd}' instead.`);
    }
  });

  it('rejects legacy "hosts" and "nodes" with code 125 pointing to "gt ps"', async () => {
    const resHosts = await runGt(['hosts']);
    expect(resHosts.code).toBe(125);
    expect(resHosts.stderr).toContain("Use 'gt ps' instead");

    const resNodes = await runGt(['nodes']);
    expect(resNodes.code).toBe(125);
    expect(resNodes.stderr).toContain("Use 'gt ps' instead");
  });
});
