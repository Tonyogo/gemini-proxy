import { execFile } from 'child_process';
import path from 'path';

const cliPath = path.resolve(__dirname, '../scripts/terminal-exec.js');

function runCli(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile('node', [cliPath, ...args], {
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

describe('Terminal Exec CLI', () => {
  it('shows help information with --help', async () => {
    const res = await runCli(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Usage:');
    expect(res.stdout).toContain('--host');
  });

  it('fails with code 1 if --host is missing and TERMINAL_HOST is unset', async () => {
    const res = await runCli(['echo 1'], { TERMINAL_HOST: '' });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Missing target host');
  });
});
