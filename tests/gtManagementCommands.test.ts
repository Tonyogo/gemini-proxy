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
  it('displays two-level commands in --help', async () => {
    const res = await runGt(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('gt host ls');
    expect(res.stdout).toContain('gt task ls');
    expect(res.stdout).toContain('gt exec');
    expect(res.stdout).toContain('gt cp');
    expect(res.stdout).toContain('gt auth login');
  });

  it('rejects legacy "hosts" command with code 125 and migration guidance', async () => {
    const res = await runGt(['hosts']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt host ls'");
  });

  it('rejects legacy "ps" command with code 125 and migration guidance', async () => {
    const res = await runGt(['ps', 'my-host']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt task ls'");
  });

  it('rejects legacy "logs" command with code 125 and migration guidance', async () => {
    const res = await runGt(['logs', 'my-host', 'task-1']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt task logs'");
  });

  it('rejects legacy "kill" command with code 125 and migration guidance', async () => {
    const res = await runGt(['kill', 'my-host', 'task-1']);
    expect(res.code).toBe(125);
    expect(res.stderr).toContain("Use 'gt task kill'");
  });
});
