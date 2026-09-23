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

  it('detects process alive correctly and manages agent state file', () => {
    process.env.GT_CONFIG_DIR = testConfigDir;
    const { AgentDaemonManager } = require('../scripts/gt.js');
    expect(AgentDaemonManager.isProcessAlive(process.pid)).toBe(true);
    expect(AgentDaemonManager.isProcessAlive(99999999)).toBe(false);

    // Save and check alive status
    AgentDaemonManager.saveStatus('test-agent', { pid: process.pid, name: 'test-agent' });
    const status = AgentDaemonManager.getAgent('test-agent');
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
    expect(status.name).toBe('test-agent');

    // Save dead PID and verify stale
    AgentDaemonManager.saveStatus('dead-agent', { pid: 99999999, name: 'dead-agent' });
    const staleStatus = AgentDaemonManager.getAgent('dead-agent');
    expect(staleStatus.running).toBe(false);
    expect(staleStatus.stale).toBe(true);
    AgentDaemonManager.remove('dead-agent');
    expect(fs.existsSync(AgentDaemonManager.getStatusFile('dead-agent'))).toBe(false);
  });

  it('supports background execution via gt agent -d and lifecycle management', async () => {
    // 1. First login / set credentials
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // 2. Start agent in daemon mode
    const startRes = spawnSync('node', [gtPath, 'agent', '-d', '--name=my-daemon'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    expect(startRes.status).toBe(0);
    expect(startRes.stdout).toContain('Agent started in background (PID:');

    // 3. Check status
    const statusRes = spawnSync('node', [gtPath, 'agent', 'status'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(statusRes.status).toBe(0);
    expect(statusRes.stdout).toContain('Running');
    expect(statusRes.stdout).toContain('my-daemon');

    // Also verify 'ps' alias
    const psRes = spawnSync('node', [gtPath, 'agent', 'ps'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(psRes.status).toBe(0);
    expect(psRes.stdout).toContain('Running');

    // 4. Prevent duplicate start
    const dupRes = spawnSync('node', [gtPath, 'agent', '-d'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(dupRes.status).toBe(1);
    expect(dupRes.stderr).toContain('already running');

    // 5. Read logs
    const logsRes = spawnSync('node', [gtPath, 'agent', 'logs', '-n', '20'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(logsRes.status).toBe(0);

    // 6. Stop agent
    const stopRes = spawnSync('node', [gtPath, 'agent', 'stop'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(stopRes.status).toBe(0);
    expect(stopRes.stdout).toContain('stopped');

    // 7. Status should show not running
    const statusAfter = spawnSync('node', [gtPath, 'agent', 'status'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(statusAfter.stdout).toContain('No background agent running');
  });

  it('supports restart and start subcommands', async () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // Start with 'start' subcommand
    const startRes = spawnSync('node', [gtPath, 'agent', 'start', '--name=start-daemon'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(startRes.status).toBe(0);
    expect(startRes.stdout).toContain('Agent started in background (PID:');

    // Restart
    const restartRes = spawnSync('node', [gtPath, 'agent', 'restart', '--name=restarted-daemon'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(restartRes.status).toBe(0);
    expect(restartRes.stdout).toContain('Agent started in background (PID:');

    const statusRes = spawnSync('node', [gtPath, 'agent', 'status'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(statusRes.status).toBe(0);
    expect(statusRes.stdout).toContain('restarted-daemon');

    // Clean up
    spawnSync('node', [gtPath, 'agent', 'stop'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
  });

  it('manages multiple named agent status files and processes independently', () => {
    process.env.GT_CONFIG_DIR = testConfigDir;
    const { AgentDaemonManager } = require('../scripts/gt.js');

    const agentsDir = AgentDaemonManager.getAgentsDir();
    expect(agentsDir).toBe(path.join(testConfigDir, 'agents'));

    // Save two different agents
    AgentDaemonManager.saveStatus('worker-a', { pid: process.pid, name: 'worker-a', server: 'http://hub1' });
    AgentDaemonManager.saveStatus('worker-b', { pid: 99999999, name: 'worker-b', server: 'http://hub2' });

    const agentA = AgentDaemonManager.getAgent('worker-a');
    expect(agentA).not.toBeNull();
    expect(agentA.running).toBe(true);
    expect(agentA.name).toBe('worker-a');

    const agentB = AgentDaemonManager.getAgent('worker-b');
    expect(agentB).not.toBeNull();
    expect(agentB.running).toBe(false); // PID 99999999 is dead
    expect(agentB.stale).toBe(true);

    const all = AgentDaemonManager.getAllAgents();
    expect(all.length).toBe(2);

    // Test target resolution
    // 1 running agent (worker-a) -> resolveTarget() without name resolves to worker-a
    const resolved = AgentDaemonManager.resolveTarget(undefined, 'stop');
    expect(resolved.error).toBeUndefined();
    expect(resolved.agent.name).toBe('worker-a');

    // Explicit name resolves
    const resolvedExplicit = AgentDaemonManager.resolveTarget('worker-b', 'stop');
    expect(resolvedExplicit.agent.name).toBe('worker-b');

    // Remove worker-b
    AgentDaemonManager.remove('worker-b');
    expect(AgentDaemonManager.getAgent('worker-b')).toBeNull();
  });
});

