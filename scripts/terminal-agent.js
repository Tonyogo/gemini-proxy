#!/usr/bin/env node

/**
 * Gemini Proxy Terminal Agent
 * Lightweight reverse agent bridging local PTY shell to the remote Gemini Proxy WebTerminal.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const pty = require('node-pty');
const dotenv = require('dotenv');

// Load configuration from .env in current working directory if present
const envPath = path.join(process.cwd(), '.env');
let envLoaded = false;
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  envLoaded = true;
}

// Parse CLI flags (--key=..., --server=..., --name=..., --id=..., --shell=...)
const args = process.argv.slice(2);
const options = {};

for (const arg of args) {
  if (arg.startsWith('--')) {
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const k = arg.slice(2, eqIdx).trim();
      const v = arg.slice(eqIdx + 1).trim();
      options[k] = v;
    } else {
      options[arg.slice(2).trim()] = true;
    }
  }
}

// Tunable keepalive constants
const HANDSHAKE_TIMEOUT_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 3000;

const serverArg = options.server || process.env.TERMINAL_SERVER || 'http://localhost:3000';
const adminKey = options.key || process.env.ADMIN_SECRET_KEY || '';
const hostname = os.hostname();
const platform = os.platform();

// Pick local LAN IPv4 address
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIp();
const sanitizedHostname = hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'host';
const random4Hex = crypto.randomBytes(2).toString('hex');
const defaultName = `${sanitizedHostname}-${random4Hex}`;

const sanitizedName = options.name
  ? options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
  : '';
const hostName = sanitizedName || defaultName;
const hostId = options.id || options.hostId || crypto.randomBytes(6).toString('hex');

function getDefaultShell() {
  if (platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return options.shell || process.env.SHELL || '/bin/bash';
}

function resolveWebSocketUrl(serverUrl) {
  let wsUrl = serverUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    wsUrl = `ws://${wsUrl}`;
  }
  // Trim trailing slash
  wsUrl = wsUrl.replace(/\/+$/, '');
  const query = new URLSearchParams({
    hostId,
    name: hostName,
    hostname,
    ip: localIp,
    platform,
    key: adminKey,
  });
  return `${wsUrl}/api/terminal/agent-ws?${query.toString()}`;
}

function parseControlMessage(msgStr) {
  if (typeof msgStr !== 'string') return null;
  const trimmed = msgStr.trim();
  if (trimmed.startsWith('JSON:')) {
    try {
      return JSON.parse(trimmed.slice(5));
    } catch {
      return null;
    }
  }
  // Tolerate bare JSON control frames to prevent leaking into shell stdin
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.type === 'string') {
        return parsed;
      }
    } catch {}
  }
  return null;
}

if (envLoaded) {
  console.log('[Agent] Loaded .env configuration');
}
console.log('---------------------------------------------------------');
console.log(' Gemini Proxy Terminal Reverse Agent');
console.log(` Host ID   : ${hostId}`);
console.log(` Host Name : ${hostName} (${hostname})`);
console.log(` IP / OS   : ${localIp} / ${platform}`);
console.log(` Target Hub: ${serverArg}`);
console.log('---------------------------------------------------------');

let ptyProcess = null;
let ws = null;
let reconnectAttempts = 0;
let isExiting = false;
let connectTimeoutTimer = null;
let heartbeatTimer = null;
let heartbeatTimeoutTimer = null;

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(`JSON:${JSON.stringify({ type: 'ping' })}`);
      } catch {}

      if (heartbeatTimeoutTimer) clearTimeout(heartbeatTimeoutTimer);
      heartbeatTimeoutTimer = setTimeout(() => {
        console.warn(
          `[Agent] Heartbeat timeout (${HEARTBEAT_TIMEOUT_MS / 1000}s) on ${serverArg}. Terminating dead connection...`
        );
        if (ws) {
          try {
            ws.terminate();
          } catch {}
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function onHeartbeatActivity() {
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
}

function spawnPty() {
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {
      // Ignore
    }
    ptyProcess = null;
  }

  const shell = getDefaultShell();
  const cwd = process.env.HOME || process.cwd();
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    TERM_PROGRAM: 'gemini-proxy-agent',
    CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN: process.env.CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN || '1',
  };
  delete env.TMUX;
  delete env.TMUX_PANE;
  delete env.STY;
  delete env.WINDOW;
  delete env.TERM_SESSION_ID;

  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env,
    });

    console.log(`[PTY] Shell spawned: ${shell} (pid=${ptyProcess.pid})`);

    ptyProcess.onData((data) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch {
          // Socket write failed
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      console.log(`[PTY] Shell exited with code: ${exitCode}`);
      ptyProcess = null;
      if (!isExiting) {
        setTimeout(spawnPty, 500);
      }
    });
  } catch (err) {
    console.error(`[PTY] Failed to spawn PTY: ${err.message}`);
  }
}

async function handleFileRpc(control) {
  const { reqId, action, path: targetPath, params = {} } = control;
  const reply = (success, data = null, error = null) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(`JSON:${JSON.stringify({
        type: 'file_rpc_res',
        reqId,
        success,
        data,
        error
      })}`);
    }
  };

  try {
    const resolvedPath = path.resolve(targetPath || os.homedir() || process.cwd());

    if (action === 'list') {
      if (!fs.existsSync(resolvedPath)) {
        return reply(false, null, `Path not found: ${resolvedPath}`);
      }
      const stat = await fs.promises.stat(resolvedPath);
      if (!stat.isDirectory()) {
        return reply(false, null, 'Target is not a directory');
      }
      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(resolvedPath, entry.name);
        try {
          const entryStat = await fs.promises.stat(full);
          const isDir = entry.isDirectory();
          files.push({
            name: entry.name,
            path: full,
            isDirectory: isDir,
            size: isDir ? 0 : entryStat.size,
            updatedAt: entryStat.mtimeMs,
            extension: isDir ? '' : path.extname(entry.name).replace(/^\./, '').toLowerCase(),
          });
        } catch {}
      }
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      const parsed = path.parse(resolvedPath);
      return reply(true, {
        currentPath: resolvedPath,
        parentPath: parsed.root === resolvedPath ? null : path.dirname(resolvedPath),
        separator: path.sep,
        files
      });
    }

    if (action === 'read') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) return reply(false, null, 'Target is a directory');
      if (stat.size > 5 * 1024 * 1024) return reply(false, null, 'File exceeds 5MB preview limit');
      const buf = await fs.promises.readFile(resolvedPath);
      const isBinary = buf.slice(0, 1024).includes(0);
      return reply(true, {
        path: resolvedPath,
        size: stat.size,
        isBinary,
        content: isBinary ? '' : buf.toString('utf-8')
      });
    }

    if (action === 'write') {
      await fs.promises.writeFile(resolvedPath, params.content || '', 'utf-8');
      return reply(true, { success: true });
    }

    if (action === 'mkdir') {
      const full = path.join(resolvedPath, params.dirName || 'new-folder');
      await fs.promises.mkdir(full, { recursive: true });
      return reply(true, { success: true });
    }

    if (action === 'rename') {
      const newPath = path.resolve(params.newPath);
      await fs.promises.rename(resolvedPath, newPath);
      return reply(true, { success: true });
    }

    if (action === 'delete') {
      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) {
        await fs.promises.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(resolvedPath);
      }
      return reply(true, { success: true });
    }

    if (action === 'upload_chunk') {
      const full = path.join(resolvedPath, params.filename);
      const buf = Buffer.from(params.data || '', 'base64');
      await fs.promises.writeFile(full, buf);
      return reply(true, { success: true });
    }

    if (action === 'download_chunk') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const buf = await fs.promises.readFile(resolvedPath);
      return reply(true, buf.toString('base64'));
    }

    reply(false, null, `Unknown action: ${action}`);
  } catch (err) {
    reply(false, null, err.message);
  }
}

class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.MAX_TASKS = 100;
    this.MAX_BUFFER_SIZE = 5 * 1024 * 1024; // 5 MB per stream
    this.TASK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  }

  pruneOldTasks() {
    const now = Date.now();
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status !== 'running' && (now - task.startTime > this.TASK_TTL_MS)) {
        this.tasks.delete(taskId);
      }
    }
    if (this.tasks.size > this.MAX_TASKS) {
      const sorted = Array.from(this.tasks.entries())
        .filter(([, t]) => t.status !== 'running')
        .sort((a, b) => a[1].startTime - b[1].startTime);
      while (this.tasks.size > this.MAX_TASKS && sorted.length > 0) {
        const [oldId] = sorted.shift();
        this.tasks.delete(oldId);
      }
    }
  }

  startTask({ taskId, command, cwd, timeoutMs = 300000, env = {} }) {
    this.pruneOldTasks();

    if (this.tasks.has(taskId)) {
      const existing = this.tasks.get(taskId);
      return { success: true, taskId, status: existing.status, startTime: existing.startTime };
    }

    const shell = getDefaultShell();
    const isWindows = platform === 'win32';
    const shellArgs = isWindows
      ? (shell.toLowerCase().includes('powershell') ? ['-Command', command] : ['/c', command])
      : ['-c', command];
    const workingDir = cwd ? path.resolve(cwd) : (process.env.HOME || process.cwd());

    const taskEnv = {
      ...process.env,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };
    delete taskEnv.TMUX;
    delete taskEnv.TMUX_PANE;
    delete taskEnv.STY;
    delete taskEnv.WINDOW;
    delete taskEnv.TERM_SESSION_ID;

    let child = null;
    try {
      child = spawn(shell, shellArgs, {
        cwd: workingDir,
        env: taskEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });
    } catch (err) {
      return { success: false, error: `Failed to spawn process: ${err.message}` };
    }

    const taskRecord = {
      taskId,
      command,
      cwd: workingDir,
      status: 'running',
      exitCode: null,
      startTime: Date.now(),
      endTime: null,
      stdout: '',
      stderr: '',
      output: '',
      child,
      timeoutTimer: null,
      killTimer: null,
    };

    const appendChunk = (type, chunk) => {
      const text = chunk.toString('utf-8');
      if (type === 'stdout') {
        taskRecord.stdout += text;
        if (taskRecord.stdout.length > this.MAX_BUFFER_SIZE) {
          taskRecord.stdout = taskRecord.stdout.slice(-this.MAX_BUFFER_SIZE);
        }
      } else {
        taskRecord.stderr += text;
        if (taskRecord.stderr.length > this.MAX_BUFFER_SIZE) {
          taskRecord.stderr = taskRecord.stderr.slice(-this.MAX_BUFFER_SIZE);
        }
      }
      taskRecord.output += text;
      if (taskRecord.output.length > this.MAX_BUFFER_SIZE) {
        taskRecord.output = taskRecord.output.slice(-this.MAX_BUFFER_SIZE);
      }
    };

    child.stdout.on('data', (chunk) => appendChunk('stdout', chunk));
    child.stderr.on('data', (chunk) => appendChunk('stderr', chunk));

    child.on('error', (err) => {
      taskRecord.stderr += `\nProcess execution error: ${err.message}\n`;
      taskRecord.output += `\nProcess execution error: ${err.message}\n`;
      taskRecord.status = 'failed';
      taskRecord.endTime = Date.now();
      if (taskRecord.timeoutTimer) clearTimeout(taskRecord.timeoutTimer);
    });

    child.on('close', (code, signal) => {
      if (taskRecord.timeoutTimer) clearTimeout(taskRecord.timeoutTimer);
      if (taskRecord.killTimer) clearTimeout(taskRecord.killTimer);
      taskRecord.endTime = Date.now();
      taskRecord.child = null;

      if (taskRecord.status === 'running') {
        if (signal) {
          taskRecord.status = 'killed';
        } else {
          taskRecord.exitCode = code;
          taskRecord.status = code === 0 ? 'completed' : 'failed';
        }
      }
    });

    if (timeoutMs > 0) {
      taskRecord.timeoutTimer = setTimeout(() => {
        if (taskRecord.status === 'running' && taskRecord.child) {
          taskRecord.status = 'timeout';
          const timeoutMsg = `\n[Agent] Process timed out after ${timeoutMs}ms. Terminating...\n`;
          taskRecord.stderr += timeoutMsg;
          taskRecord.output += timeoutMsg;
          try {
            taskRecord.child.kill('SIGTERM');
          } catch {}
          taskRecord.killTimer = setTimeout(() => {
            if (taskRecord.child) {
              try {
                taskRecord.child.kill('SIGKILL');
              } catch {}
            }
          }, 3000);
          if (taskRecord.killTimer.unref) taskRecord.killTimer.unref();
        }
      }, timeoutMs);
      if (taskRecord.timeoutTimer.unref) taskRecord.timeoutTimer.unref();
    }

    this.tasks.set(taskId, taskRecord);
    return {
      success: true,
      taskId,
      status: 'running',
      command,
      cwd: workingDir,
      startTime: taskRecord.startTime,
    };
  }

  getTask(taskId, offset = 0) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: `No such task: ${taskId}` };
    }

    const totalBytes = Buffer.byteLength(task.output, 'utf-8');
    const safeOffset = Math.max(0, Math.min(offset, totalBytes));

    const sliceOutput = (str) => {
      if (safeOffset === 0) return str;
      const buf = Buffer.from(str, 'utf-8');
      if (safeOffset >= buf.length) return '';
      return buf.slice(safeOffset).toString('utf-8');
    };

    return {
      success: true,
      taskId: task.taskId,
      status: task.status,
      exitCode: task.exitCode,
      stdout: sliceOutput(task.stdout),
      stderr: sliceOutput(task.stderr),
      output: sliceOutput(task.output),
      offset: totalBytes,
      totalBytes,
      durationMs: (task.endTime || Date.now()) - task.startTime,
      startTime: task.startTime,
      endTime: task.endTime,
    };
  }

  killTask(taskId, signal = 'SIGTERM') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: `No such task: ${taskId}` };
    }
    if (task.status !== 'running' || !task.child) {
      return { success: true, taskId, status: task.status, message: 'Task is not running' };
    }

    task.status = 'killed';
    try {
      task.child.kill(signal || 'SIGTERM');
    } catch {}

    task.killTimer = setTimeout(() => {
      if (task.child) {
        try {
          task.child.kill('SIGKILL');
        } catch {}
      }
    }, 3000);
    if (task.killTimer.unref) task.killTimer.unref();

    return { success: true, taskId, status: 'killed', message: `Signal ${signal} sent` };
  }

  listTasks(limit = 20) {
    const list = Array.from(this.tasks.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit)
      .map((t) => ({
        taskId: t.taskId,
        command: t.command,
        cwd: t.cwd,
        status: t.status,
        exitCode: t.exitCode,
        durationMs: (t.endTime || Date.now()) - t.startTime,
        startTime: t.startTime,
        endTime: t.endTime,
      }));
    return { success: true, tasks: list };
  }
}

const taskManager = new TaskManager();

function handleCmdExec(control, targetWs = ws) {
  const { reqId, action, taskId, command, cwd, timeoutMs, env, offset, signal, limit } = control;

  const reply = (success, data = null, error = null) => {
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(
        `JSON:${JSON.stringify({
          type: 'cmd_exec_res',
          reqId,
          taskId,
          success,
          data,
          error,
        })}`
      );
    }
  };

  try {
    if (action === 'start') {
      const res = taskManager.startTask({ taskId, command, cwd, timeoutMs, env });
      if (res.success) {
        return reply(true, res);
      }
      return reply(false, null, res.error);
    }

    if (action === 'poll') {
      const res = taskManager.getTask(taskId, offset || 0);
      if (res.success) {
        return reply(true, res);
      }
      return reply(false, null, res.error);
    }

    if (action === 'kill') {
      const res = taskManager.killTask(taskId, signal);
      if (res.success) {
        return reply(true, res);
      }
      return reply(false, null, res.error);
    }

    if (action === 'list') {
      const res = taskManager.listTasks(limit);
      return reply(true, res);
    }

    reply(false, null, `Unknown cmd_exec action: ${action}`);
  } catch (err) {
    reply(false, null, err.message);
  }
}

function connect() {
  if (isExiting) return;

  const targetWsUrl = resolveWebSocketUrl(serverArg);
  console.log(`[Agent] Connecting to ${targetWsUrl.split('?')[0]}...`);

  if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
  connectTimeoutTimer = setTimeout(() => {
    console.warn(`[Agent] Connection to ${serverArg} timed out (${HANDSHAKE_TIMEOUT_MS / 1000}s)`);
    if (ws) {
      try {
        ws.terminate();
      } catch {}
    }
  }, HANDSHAKE_TIMEOUT_MS);

  ws = new WebSocket(targetWsUrl, {
    headers: {
      'x-admin-key': adminKey,
    },
  });

  // Enable TCP KeepAlive on socket once connected
  ws.on('upgrade', (response) => {
    if (ws._socket && typeof ws._socket.setKeepAlive === 'function') {
      ws._socket.setKeepAlive(true, 10000);
    }
  });

  ws.on('open', () => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    reconnectAttempts = 0;
    console.log(`[Agent] Connected and registered successfully! Reverse tunnel is active.`);

    startHeartbeat();

    const isFirstSpawn = !ptyProcess;
    if (!ptyProcess) {
      spawnPty();
    }

    try {
      if (isFirstSpawn) {
        ws.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      }
      if (ptyProcess) {
        ws.send(`JSON:${JSON.stringify({ type: 'resize', cols: ptyProcess.cols, rows: ptyProcess.rows })}`);
      }
    } catch {}
  });

  ws.on('message', (data) => {
    onHeartbeatActivity();
    try {
      const msgStr = data.toString();
      const control = parseControlMessage(msgStr);
      if (control) {
        if (control.type === 'file_rpc') {
          handleFileRpc(control);
          return;
        }
        if (control.type === 'cmd_exec') {
          handleCmdExec(control);
          return;
        }
        if (control.type === 'resize') {
          const cols = Math.max(10, Math.min(500, Math.floor(control.cols)));
          const rows = Math.max(5, Math.min(200, Math.floor(control.rows)));
          if (ptyProcess) {
            ptyProcess.resize(cols, rows);
          }
          return;
        }
        if (control.type === 'reset') {
          console.log('[Agent] Reset PTY requested by server');
          spawnPty();
          return;
        }
        if (control.type === 'ping') {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(`JSON:${JSON.stringify({ type: 'pong' })}`);
          }
          return;
        }
        if (control.type === 'pong') {
          // Heartbeat pong received and consumed
          return;
        }
        if (control.type === 'registered') {
          console.log(`[Agent] Registered confirmed: hostId=${control.hostId}, status=${control.status}`);
          return;
        }
        if (control.type === 'rejected') {
          isExiting = true;
          console.error(`\x1b[31m[Error] Registration rejected by server: ${control.reason || 'Name conflict'}\x1b[0m`);
          console.error('Please choose a different name using --name=<unique-name>.');
          if (ws) {
            try { ws.close(); } catch {}
          }
          process.exit(1);
        }
        return;
      }

      if (ptyProcess) {
        ptyProcess.write(msgStr);
      }
    } catch (err) {
      if (ptyProcess) {
        ptyProcess.write(data.toString());
      }
    }
  });

  ws.on('close', (code, reason) => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    stopHeartbeat();
    if (code === 4009) {
      isExiting = true;
      console.error(`\x1b[31m[Error] Registration rejected by server: ${reason?.toString() || 'Host name conflict'}\x1b[0m`);
      console.error('Please choose a different name using --name=<unique-name>.');
      process.exit(1);
    }
    console.warn(`[Agent] Connection closed (code: ${code}, reason: ${reason || 'none'})`);
    ws = null;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    stopHeartbeat();
    console.error(`[Agent] Connection error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (isExiting) return;
  stopHeartbeat();
  reconnectAttempts++;
  const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(reconnectAttempts, 8)));
  console.log(`[Agent] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt #${reconnectAttempts})...`);
  setTimeout(connect, delay);
}

// Initial run (only when executed directly as CLI)
if (require.main === module) {
  spawnPty();
  connect();
}

function cleanup() {
  isExiting = true;
  stopHeartbeat();
  console.log('\n[Agent] Shutting down agent...');
  if (ws) {
    try {
      ws.close();
    } catch {}
  }
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {}
  }
  for (const task of taskManager.tasks.values()) {
    if (task.status === 'running' && task.child) {
      try {
        task.child.kill('SIGTERM');
      } catch {}
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

if (typeof module !== 'undefined') {
  module.exports = {
    parseControlMessage,
    resolveWebSocketUrl,
    HANDSHAKE_TIMEOUT_MS,
    HEARTBEAT_INTERVAL_MS,
    HEARTBEAT_TIMEOUT_MS,
    TaskManager,
    taskManager,
    handleCmdExec,
  };
}
