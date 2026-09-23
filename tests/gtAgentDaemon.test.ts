import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawnSync } from 'child_process';

const gtPath = path.resolve(__dirname, '../scripts/gt.js');

describe('gt agent unified authentication and parameter guards', () => {
  let testConfigDir: string;

  beforeEach(() => {
    testConfigDir = path.join(os.tmpdir(), `gt-test-daemon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(testConfigDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    } catch {}
  });

  it('rejects --server and --key flags with informative error message', () => {
    const res = spawnSync('node', [gtPath, 'agent', '--server=http://localhost:3000'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Error: '--server' is removed. Please use 'gt auth login <server> <key>' to authenticate.");

    const resKey = spawnSync('node', [gtPath, 'agent', '--key=secret'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    expect(resKey.status).toBe(1);
    expect(resKey.stderr).toContain("Error: '--key' is removed. Please use 'gt auth login <server> <key>' to authenticate.");
  });

  it('rejects agent execution if not authenticated via gt auth login', () => {
    // Config directory has no config.json and no valid env vars
    const cleanEnv: Record<string, string> = { ...process.env, GT_CONFIG_DIR: testConfigDir };
    delete cleanEnv.TERMINAL_SERVER;
    delete cleanEnv.ADMIN_SECRET_KEY;
    delete cleanEnv.GEMINI_PROXY_URL;

    const res = spawnSync('node', [gtPath, 'agent'], {
      env: cleanEnv,
      encoding: 'utf-8',
      timeout: 5000,
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Error: No authenticated server found. Please run 'gt auth login <server> <key>' first.");
  });
});
