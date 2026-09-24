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

  it('supports positional [NAME] argument and prevents duplicate running instances', () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // Start agent with positional name 'worker-pos'
    const res1 = spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-pos'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(res1.status).toBe(0);
    expect(res1.stdout).toContain('Agent started in background');
    expect(res1.stdout).toContain('worker-pos');

    // Verify state file created in agents/worker-pos.json
    const statePath = path.join(testConfigDir, 'agents', 'worker-pos.json');
    expect(fs.existsSync(statePath)).toBe(true);

    // Attempt duplicate start with same name 'worker-pos'
    const dupRes = spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-pos'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(dupRes.status).toBe(1);
    expect(dupRes.stderr).toContain('already running');
    expect(dupRes.stderr).toContain('worker-pos');

    // Start another agent with different name 'worker-pos-2'
    const res2 = spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-pos-2'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(res2.status).toBe(0);
    expect(res2.stdout).toContain('worker-pos-2');

    // Stop both
    const { AgentDaemonManager } = require('../scripts/gt.js');
    process.env.GT_CONFIG_DIR = testConfigDir;
    const agent1 = AgentDaemonManager.getAgent('worker-pos');
    const agent2 = AgentDaemonManager.getAgent('worker-pos-2');
    if (agent1 && agent1.pid) process.kill(agent1.pid, 'SIGKILL');
    if (agent2 && agent2.pid) process.kill(agent2.pid, 'SIGKILL');
  });

  it('provides full Docker-style agent command workflow: agent run, ps, logs, stop, rm', async () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // 1. gt agent run -d app-node
    const runRes = spawnSync('node', [gtPath, 'agent', 'run', '-d', 'app-node'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(runRes.status).toBe(0);
    expect(runRes.stdout).toContain('Agent started in background');

    // 2. gt agent ps
    const psRes = spawnSync('node', [gtPath, 'agent', 'ps'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(psRes.status).toBe(0);
    expect(psRes.stdout).toContain('app-node');
    expect(psRes.stdout).toContain('Running');

    // 3. gt agent logs app-node
    const logsRes = spawnSync('node', [gtPath, 'agent', 'logs', 'app-node', '-n', '10'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(logsRes.status).toBe(0);

    // 4. gt agent stop app-node (or auto-target since only 1 running)
    const stopRes = spawnSync('node', [gtPath, 'agent', 'stop'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(stopRes.status).toBe(0);
    expect(stopRes.stdout).toContain('stopped');

    // 5. gt agent ps should show Stopped / Stale or empty running
    const psStopped = spawnSync('node', [gtPath, 'agent', 'ps'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(psStopped.status).toBe(0);
    expect(psStopped.stdout).toContain('Stopped');

    // 6. gt agent rm app-node
    const rmRes = spawnSync('node', [gtPath, 'agent', 'rm', 'app-node'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(rmRes.status).toBe(0);
    expect(rmRes.stdout).toContain('removed');

    // Now agent ps shows nothing
    const psEmpty = spawnSync('node', [gtPath, 'agent', 'ps'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(psEmpty.stdout).toContain('No agent daemons found');
  });

  it('enforces explicit NAME when multiple agents are running for stop and logs', () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // Start two agents
    spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-multi-1'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-multi-2'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    // Call gt agent stop without name -> should fail with ambiguity error
    const ambiguousStop = spawnSync('node', [gtPath, 'agent', 'stop'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(ambiguousStop.status).toBe(1);
    expect(ambiguousStop.stderr).toContain('Multiple running agents');

    // Stop with --all
    const stopAll = spawnSync('node', [gtPath, 'agent', 'stop', '--all'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(stopAll.status).toBe(0);
    expect(stopAll.stdout).toContain('stopped');
  });

  it('enforces conflict check for foreground agents and tracks them in gt agent ps', () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    // Start background agent worker-fg
    const runRes = spawnSync('node', [gtPath, 'agent', 'run', '-d', 'worker-fg'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(runRes.status).toBe(0);

    // Attempt to start foreground agent with same name
    const fgRes = spawnSync('node', [gtPath, 'agent', 'run', 'worker-fg'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(fgRes.status).toBe(1);
    expect(fgRes.stderr).toContain('already running');
    expect(fgRes.stderr).toContain('worker-fg');

    // Clean up
    const { AgentDaemonManager } = require('../scripts/gt.js');
    process.env.GT_CONFIG_DIR = testConfigDir;
    const a = AgentDaemonManager.getAgent('worker-fg');
    if (a && a.pid) process.kill(a.pid, 'SIGKILL');
  });

  it('ensures gt agent ps outputs format including stopped agents', () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    const { AgentDaemonManager } = require('../scripts/gt.js');
    process.env.GT_CONFIG_DIR = testConfigDir;
    AgentDaemonManager.saveStatus('test-stopped', { pid: 99999999, name: 'test-stopped', server: 'http://hub1' });

    const agentPsRes = spawnSync('node', [gtPath, 'agent', 'ps'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });

    expect(agentPsRes.status).toBe(0);
    expect(agentPsRes.stdout).toContain('Stopped');
    expect(agentPsRes.stdout).toContain('test-stopped');

    AgentDaemonManager.remove('test-stopped');
  });

  it('outputs Docker-style command guidelines in gt --help', () => {
    const helpRes = spawnSync('node', [gtPath, '--help'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(helpRes.status).toBe(0);
    expect(helpRes.stdout).toContain('agent run [-d] [NAME]');
    expect(helpRes.stdout).toContain('agent ps');
    expect(helpRes.stdout).toContain('agent logs [-f] [-n 50] [NAME]');
    expect(helpRes.stdout).toContain('agent stop [NAME] [--all]');
  });

  it('supports gt agent rm to remove stopped agents and gt agent rm --all to clean up all stopped agents', () => {
    fs.writeFileSync(path.join(testConfigDir, 'config.json'), JSON.stringify({
      server: 'http://127.0.0.1:3000',
      key: 'mock-key',
    }));

    const { AgentDaemonManager } = require('../scripts/gt.js');
    process.env.GT_CONFIG_DIR = testConfigDir;

    AgentDaemonManager.saveStatus('stopped-1', { pid: 99999991, name: 'stopped-1', server: 'http://hub1' });
    AgentDaemonManager.saveStatus('stopped-2', { pid: 99999992, name: 'stopped-2', server: 'http://hub1' });
    AgentDaemonManager.saveStatus('running-1', { pid: process.pid, name: 'running-1', server: 'http://hub1' });

    // Removing running agent should fail
    const rmRunningRes = spawnSync('node', [gtPath, 'agent', 'rm', 'running-1'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(rmRunningRes.status).toBe(1);
    expect(rmRunningRes.stderr).toContain('Cannot remove running agent');

    // Remove single stopped agent
    const rmOneRes = spawnSync('node', [gtPath, 'agent', 'rm', 'stopped-1'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(rmOneRes.status).toBe(0);
    expect(rmOneRes.stdout).toContain('Agent "stopped-1" removed');
    expect(AgentDaemonManager.getAgent('stopped-1')).toBeNull();

    // Remove all remaining stopped agents
    const rmAllRes = spawnSync('node', [gtPath, 'agent', 'rm', '--all'], {
      env: { ...process.env, GT_CONFIG_DIR: testConfigDir },
      encoding: 'utf-8',
      timeout: 5000,
    });
    expect(rmAllRes.status).toBe(0);
    expect(rmAllRes.stdout).toContain('stopped-2');
    expect(AgentDaemonManager.getAgent('stopped-2')).toBeNull();
    expect(AgentDaemonManager.getAgent('running-1')).not.toBeNull();

    AgentDaemonManager.clearStatus('running-1');
  });
});





