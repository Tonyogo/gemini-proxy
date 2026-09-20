import { execFile } from 'child_process';
import path from 'path';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

function runGt(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [gtPath, ...args], {
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  });
}

describe('gt (Gemini Terminal) CLI', () => {
  it('displays help information with --help', async () => {
    const res = await runGt(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('gt [GLOBAL_OPTIONS] COMMAND [ARGS...]');
    expect(res.stdout).toContain('hosts');
    expect(res.stdout).toContain('exec');
    expect(res.stdout).toContain('ps');
    expect(res.stdout).toContain('logs');
    expect(res.stdout).toContain('kill');
    expect(res.stdout).toContain('agent');
  });

  it('displays version information with --version', async () => {
    const res = await runGt(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/gt version \d+\.\d+\.\d+/);
  });

  it('rejects unknown commands with helpful error', async () => {
    const res = await runGt(['unknown-cmd']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Unknown command: unknown-cmd');
  });

  it('requires HOST argument for exec', async () => {
    const res = await runGt(['exec']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Missing target host');
  });

  it('requires COMMAND argument for exec', async () => {
    const res = await runGt(['exec', 'my-server']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Missing command to execute');
  });
});
