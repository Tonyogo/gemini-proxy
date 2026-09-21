#!/usr/bin/env node

/**
 * gt (Gemini Terminal) - Unified Docker-Style Terminal CLI & Agent
 * Client operations (hosts, exec, ps, logs, kill) and reverse agent daemon (agent).
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const url = require('url');
const { spawn } = require('child_process');
const WebSocket = require('ws');
let pty = null;
try {
  pty = require('node-pty');
} catch {}

let dotenv;
try {
  dotenv = require('dotenv');
} catch {}

// Version metadata
const VERSION = '1.0.0';

// Auto-load .env from working directory
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    if (dotenv && typeof dotenv.config === 'function') {
      dotenv.config({ path: envPath });
    } else {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*)?\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = (match[2] || '').replace(/^["']|["']$/g, '').trim();
        }
      }
    }
  } catch {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = (match[2] || '').replace(/^["']|["']$/g, '').trim();
      }
    }
  }
}

function printHelp() {
  console.log(`
gt (Gemini Terminal) - Unified Docker-Style Terminal CLI

Usage:
  gt [GLOBAL_OPTIONS] COMMAND [ARGS...]

Commands:
  hosts                   List connected terminal agent hosts (like 'docker node ls')
  exec [OPTIONS] HOST CMD Execute a command on a remote host (like 'docker exec')
  ps HOST                 List active and recent tasks on a host (like 'docker ps')
  logs HOST TASK_ID       View execution logs for a task (like 'docker logs')
  kill HOST TASK_ID       Terminate a running task on a host (like 'docker kill')
  agent [OPTIONS]         Run reverse terminal agent daemon on this machine

Global Options:
  -s, --server <url>      Proxy server URL (Default: env TERMINAL_SERVER or http://localhost:3000)
  -k, --key <secret>      Admin secret key (Default: env ADMIN_SECRET_KEY)
  --json                  Output in JSON format
  -v, --version           Print version information
  -h, --help              Show this help menu

Exec Options:
  -d, --detach            Run command in background and print task ID (alias: -a, --async)
  -w, --workdir <dir>     Working directory on remote host (alias: --cwd)
  -t, --timeout <ms>      Execution timeout in ms (Default: 300000 / 5 min)
  -e, --env <KEY=VAL>     Set remote environment variable (can be repeated)
  -q, --quiet             Suppress execution header and footer banners
  --poll-interval <ms>    Polling interval for log stream in ms (Default: 500)

Agent Options:
  --server=<url>          Target proxy server URL
  --key=<secret>          Admin secret key
  --name=<name>           Friendly node identifier (default: <hostname>-<4hex>)
  --id=<hostId>           Explicit unique host ID (default: 12-char random hex)
  --shell=<path>          Shell executable to spawn (default: /bin/bash or $SHELL)

Examples:
  gt hosts
  gt exec my-server uptime
  gt exec -w /var/www my-server ls -la
  gt exec my-server -- curl -s https://example.com
  gt exec -d my-server "sleep 60 && echo done"
  gt ps my-server
  gt logs my-server task-1726830000-abc123
  gt kill my-server task-1726830000-abc123
  gt agent --server=http://proxy:3000 --key=admin --name=my-server
`);
}

function makeRequest({ serverUrl, endpoint, method = 'GET', body = null, apiKey = '' }) {
  return new Promise((resolve, reject) => {
    const normalizedUrl = serverUrl.startsWith('http://') || serverUrl.startsWith('https://')
      ? serverUrl
      : `http://${serverUrl}`;
    const serverParsed = new url.URL(normalizedUrl);
    const isHttps = serverParsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const [epPath, epQuery] = endpoint.split('?');
    const basePath = serverParsed.pathname.replace(/\/+$/, '');
    const finalPathname = (basePath + '/' + epPath.replace(/^\/+/, '')).replace(/\/+/g, '/');
    const finalSearch = epQuery ? `?${epQuery}` : '';

    const headers = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['x-admin-key'] = apiKey;
    }

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const reqOptions = {
      protocol: serverParsed.protocol,
      hostname: serverParsed.hostname,
      port: serverParsed.port || (isHttps ? 443 : 80),
      path: `${finalPathname}${finalSearch}`,
      method: method.toUpperCase(),
      headers,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = { raw: data };
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', (err) => { reject(err); });
    if (payload) req.write(payload);
    req.end();
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  if (diff < 10000) return 'Just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// --------------------------------------------------------------------------
// Agent Daemon Subsystem (Embedded)
// --------------------------------------------------------------------------

const HANDSHAKE_TIMEOUT_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 3000;

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

function getDefaultShell(options = {}) {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return options.shell || process.env.SHELL || '/bin/bash';
}

function resolveWebSocketUrl(serverUrl, metadata = {}) {
  let wsUrl = serverUrl.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
  if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
    wsUrl = `ws://${wsUrl}`;
  }
  wsUrl = wsUrl.replace(/\/+$/, '');
  const query = new URLSearchParams(metadata);
  const qs = query.toString();
  return qs ? `${wsUrl}/api/terminal/agent-ws?${qs}` : `${wsUrl}/api/terminal/agent-ws`;
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

class TaskManager {
  constructor() {
    this.tasks = new Map();
    this.MAX_TASKS = 100;
    this.MAX_BUFFER_SIZE = 5 * 1024 * 1024;
    this.TASK_TTL_MS = 24 * 60 * 60 * 1000;
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
    const isWindows = os.platform() === 'win32';
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
      outputOffset: totalBytes,
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

function handleFileRpc(control, targetWs) {
  const { reqId, action, path: targetPath, params = {} } = control;
  const reply = (success, data = null, error = null) => {
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(`JSON:${JSON.stringify({
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
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return reply(false, null, 'Target is not a directory');
      }
      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const full = path.join(resolvedPath, entry.name);
        try {
          const entryStat = fs.statSync(full);
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
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) return reply(false, null, 'Target is a directory');
      if (stat.size > 5 * 1024 * 1024) return reply(false, null, 'File exceeds 5MB preview limit');
      const buf = fs.readFileSync(resolvedPath);
      const isBinary = buf.slice(0, 1024).includes(0);
      return reply(true, {
        path: resolvedPath,
        size: stat.size,
        isBinary,
        content: isBinary ? '' : buf.toString('utf-8')
      });
    }

    if (action === 'write') {
      fs.writeFileSync(resolvedPath, params.content || '', 'utf-8');
      return reply(true, { success: true });
    }

    if (action === 'mkdir') {
      const full = path.join(resolvedPath, params.dirName || 'new-folder');
      fs.mkdirSync(full, { recursive: true });
      return reply(true, { success: true });
    }

    if (action === 'rename') {
      const newPath = path.resolve(params.newPath);
      fs.renameSync(resolvedPath, newPath);
      return reply(true, { success: true });
    }

    if (action === 'delete') {
      const stat = fs.statSync(resolvedPath);
      if (stat.isDirectory()) {
        fs.rmSync(resolvedPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolvedPath);
      }
      return reply(true, { success: true });
    }

    if (action === 'upload_chunk') {
      const full = path.join(resolvedPath, params.filename);
      const buf = Buffer.from(params.data || '', 'base64');
      fs.writeFileSync(full, buf);
      return reply(true, { success: true });
    }

    if (action === 'download_chunk') {
      if (!fs.existsSync(resolvedPath)) return reply(false, null, 'File not found');
      const buf = fs.readFileSync(resolvedPath);
      return reply(true, buf.toString('base64'));
    }

    reply(false, null, `Unknown action: ${action}`);
  } catch (err) {
    reply(false, null, err.message);
  }
}

function handleCmdExec(control, targetWs) {
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

    if (action === 'poll' || action === 'status' || action === 'stream') {
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

function runAgent(agentArgs = [], globalOpts = {}) {
  const options = {};
  for (const arg of agentArgs) {
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

  const serverArg = options.server || globalOpts.server || process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL || 'http://localhost:3000';
  const adminKey = options.key || globalOpts.key || process.env.ADMIN_SECRET_KEY || '';
  const hostname = os.hostname();
  const platform = os.platform();
  const localIp = getLocalIp();

  const sanitizedHostname = hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'host';
  const random4Hex = crypto.randomBytes(2).toString('hex');
  const defaultName = `${sanitizedHostname}-${random4Hex}`;

  const sanitizedName = options.name
    ? options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
    : '';
  const hostName = sanitizedName || defaultName;
  const hostId = options.id || options.hostId || crypto.randomBytes(6).toString('hex');

  if (fs.existsSync(envPath)) {
    console.log('[Agent] Loaded .env configuration');
  }

  console.log('---------------------------------------------------------');
  console.log(' Gemini Proxy Terminal Reverse Agent (gt agent)');
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
            try { ws.terminate(); } catch {}
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
    if (!pty) {
      console.warn('[PTY] node-pty not available in this environment. PTY terminal disabled.');
      return;
    }
    if (ptyProcess) {
      try { ptyProcess.kill(); } catch {}
      ptyProcess = null;
    }

    const shell = getDefaultShell(options);
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
          try { ws.send(data); } catch {}
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

  function connect() {
    if (isExiting) return;

    const targetWsUrl = resolveWebSocketUrl(serverArg, {
      hostId,
      name: hostName,
      hostname,
      ip: localIp,
      platform,
      key: adminKey,
    });
    console.log(`[Agent] Connecting to ${targetWsUrl.split('?')[0]}...`);

    if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
    connectTimeoutTimer = setTimeout(() => {
      console.warn(`[Agent] Connection to ${serverArg} timed out (${HANDSHAKE_TIMEOUT_MS / 1000}s)`);
      if (ws) {
        try { ws.terminate(); } catch {}
      }
    }, HANDSHAKE_TIMEOUT_MS);

    ws = new WebSocket(targetWsUrl, {
      headers: { 'x-admin-key': adminKey },
    });

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
      if (!ptyProcess && pty) {
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
            handleFileRpc(control, ws);
            return;
          }
          if (control.type === 'cmd_exec') {
            handleCmdExec(control, ws);
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
            if (pty) spawnPty();
            return;
          }
          if (control.type === 'ping') {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(`JSON:${JSON.stringify({ type: 'pong' })}`);
            }
            return;
          }
          if (control.type === 'pong') {
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

  function cleanup() {
    isExiting = true;
    stopHeartbeat();
    console.log('\n[Agent] Shutting down agent...');
    if (ws) {
      try { ws.close(); } catch {}
    }
    if (ptyProcess) {
      try { ptyProcess.kill(); } catch {}
    }
    for (const task of taskManager.tasks.values()) {
      if (task.status === 'running' && task.child) {
        try { task.child.kill('SIGTERM'); } catch {}
      }
    }
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  if (pty) {
    spawnPty();
  }
  connect();
}

// --------------------------------------------------------------------------
// Main CLI Dispatcher
// --------------------------------------------------------------------------

async function main() {
  const rawArgs = process.argv.slice(2);

  let server = process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL || 'http://localhost:3000';
  let key = process.env.ADMIN_SECRET_KEY || '';
  let jsonOutput = false;

  const filteredArgs = [];
  let foundDoubleDash = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (foundDoubleDash) {
      filteredArgs.push(a);
      continue;
    }
    if (a === '--') {
      foundDoubleDash = true;
      filteredArgs.push(a);
      continue;
    }
    if (a === '-v' || a === '--version') {
      console.log(`gt version ${VERSION}`);
      process.exit(0);
    } else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (a === '--json') {
      jsonOutput = true;
    } else if (a === '-s' || a === '--server') {
      server = rawArgs[++i];
    } else if (a.startsWith('--server=')) {
      server = a.slice(9);
    } else if (a === '-k' || a === '--key') {
      key = rawArgs[++i];
    } else if (a.startsWith('--key=')) {
      key = a.slice(6);
    } else {
      filteredArgs.push(a);
    }
  }

  if (filteredArgs.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = filteredArgs[0].toLowerCase();
  const cmdArgs = filteredArgs.slice(1);

  switch (command) {
    case 'hosts':
    case 'nodes': {
      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: '/api/terminal/hosts',
          method: 'GET',
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && Array.isArray(res.data.hosts)) {
          const hosts = res.data.hosts;
          if (hosts.length === 0) {
            console.log('No connected terminal agent hosts found.');
            process.exit(0);
          }

          console.log(
            'HOST ID'.padEnd(20) +
            'NAME'.padEnd(20) +
            'STATUS'.padEnd(12) +
            'PLATFORM'.padEnd(12) +
            'IP'.padEnd(18) +
            'LAST SEEN'
          );
          console.log('-'.repeat(90));

          for (const h of hosts) {
            const statusStr = h.status === 'online' ? 'online' : 'offline';
            console.log(
              (h.id || '').padEnd(20) +
              (h.name || h.hostname || '').padEnd(20) +
              statusStr.padEnd(12) +
              (h.platform || '').padEnd(12) +
              (h.ip || '').padEnd(18) +
              formatRelativeTime(h.lastSeen)
            );
          }
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to query hosts: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'ps':
    case 'list': {
      if (cmdArgs.length === 0) {
        console.error('Error: Missing target host. Usage: gt ps HOST');
        process.exit(1);
      }
      const hostId = cmdArgs[0];
      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}`,
          method: 'GET',
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && res.data.success && Array.isArray(res.data.tasks)) {
          const tasks = res.data.tasks;
          if (tasks.length === 0) {
            console.log(`No recent tasks recorded on [${hostId}].`);
            process.exit(0);
          }

          console.log(
            'TASK ID'.padEnd(26) +
            'STATUS'.padEnd(12) +
            'EXIT'.padEnd(8) +
            'START TIME'.padEnd(14) +
            'COMMAND'
          );
          console.log('-'.repeat(80));

          for (const t of tasks) {
            const timeStr = new Date(t.startTime).toLocaleTimeString();
            const exitStr = t.exitCode !== null && t.exitCode !== undefined ? String(t.exitCode) : '-';
            console.log(
              t.taskId.padEnd(26) +
              t.status.padEnd(12) +
              exitStr.padEnd(8) +
              timeStr.padEnd(14) +
              t.command
            );
          }
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to list tasks on [${hostId}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'logs':
    case 'status': {
      if (cmdArgs.length < 2) {
        console.error('Error: Missing arguments. Usage: gt logs HOST TASK_ID');
        process.exit(1);
      }
      const hostId = cmdArgs[0];
      const taskId = cmdArgs[1];

      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}`,
          method: 'GET',
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && res.data.success) {
          const d = res.data;
          console.log(`Task:     ${d.taskId}`);
          console.log(`Host:     ${d.hostId}`);
          console.log(`Status:   ${d.status}`);
          console.log(`ExitCode: ${d.exitCode !== null && d.exitCode !== undefined ? d.exitCode : 'N/A'}`);
          const outputText = d.output !== undefined ? d.output : (d.stdout || '');
          if (outputText) {
            console.log('\n--- Output ---');
            process.stdout.write(outputText);
            if (!outputText.endsWith('\n')) console.log();
          }
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to get logs for [${taskId}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'kill': {
      if (cmdArgs.length < 2) {
        console.error('Error: Missing arguments. Usage: gt kill HOST TASK_ID');
        process.exit(1);
      }
      const hostId = cmdArgs[0];
      const taskId = cmdArgs[1];

      try {
        const res = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}/kill`,
          method: 'POST',
          body: { signal: 'SIGTERM' },
          apiKey: key,
        });

        if (jsonOutput) {
          console.log(JSON.stringify(res.data, null, 2));
          process.exit(0);
        }

        if (res.data && res.data.success) {
          console.log(`Kill signal sent to task [${taskId}] on host [${hostId}].`);
        } else {
          console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Failed to kill task [${taskId}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'agent': {
      runAgent(cmdArgs, { server, key });
      break;
    }

    case 'exec': {
      let detach = false;
      let workdir = undefined;
      let timeoutMs = 300000;
      let quiet = false;
      let pollInterval = 500;
      const envVars = {};

      let host = '';
      const commandParts = [];
      let isPassthrough = false;

      for (let i = 0; i < cmdArgs.length; i++) {
        const a = cmdArgs[i];
        if (isPassthrough) {
          commandParts.push(a);
          continue;
        }

        if (a === '--') {
          isPassthrough = true;
          continue;
        }

        if (a === '-d' || a === '--detach' || a === '-a' || a === '--async') {
          detach = true;
        } else if (a === '-q' || a === '--quiet') {
          quiet = true;
        } else if (a === '-w' || a === '--workdir' || a === '--cwd') {
          workdir = cmdArgs[++i];
        } else if (a.startsWith('-w=')) {
          workdir = a.slice(3);
        } else if (a.startsWith('--workdir=')) {
          workdir = a.slice(10);
        } else if (a.startsWith('--cwd=')) {
          workdir = a.slice(6);
        } else if (a === '-t' || a === '--timeout') {
          timeoutMs = parseInt(cmdArgs[++i], 10);
        } else if (a.startsWith('--timeout=')) {
          timeoutMs = parseInt(a.slice(10), 10);
        } else if (a === '--poll-interval') {
          pollInterval = parseInt(cmdArgs[++i], 10);
        } else if (a === '-e' || a === '--env') {
          const pair = cmdArgs[++i] || '';
          const eq = pair.indexOf('=');
          if (eq !== -1) {
            envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
          }
        } else if (a.startsWith('-e=')) {
          const pair = a.slice(3);
          const eq = pair.indexOf('=');
          if (eq !== -1) envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        } else if (!host) {
          host = a;
        } else {
          commandParts.push(a);
        }
      }

      if (!host) {
        console.error('Error: Missing target host. Usage: gt exec [OPTIONS] HOST COMMAND [ARGS...]');
        process.exit(1);
      }

      const fullCommand = commandParts.join(' ').trim();
      if (!fullCommand) {
        console.error('Error: Missing command to execute.');
        process.exit(1);
      }

      const startTime = Date.now();

      if (!quiet) {
        process.stderr.write(`>>> [${host}] $ ${fullCommand}\n`);
      }

      try {
        const startRes = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(host)}`,
          method: 'POST',
          body: {
            command: fullCommand,
            cwd: workdir,
            timeoutMs,
            env: envVars,
          },
          apiKey: key,
        });

        if (!startRes.data || !startRes.data.success) {
          console.error(`Error starting task on [${host}]: ${startRes.data?.error || `HTTP ${startRes.status}`}`);
          process.exit(1);
        }

        const { taskId } = startRes.data;

        if (detach) {
          if (jsonOutput) {
            console.log(JSON.stringify(startRes.data, null, 2));
          } else {
            console.log(taskId);
          }
          process.exit(0);
        }

        let offset = 0;
        let isTerminated = false;
        let consecutiveErrors = 0;

        process.on('SIGINT', async () => {
          if (isTerminated) process.exit(130);
          isTerminated = true;
          process.stderr.write(`\n[Interrupted] Terminating remote task [${taskId}]...\n`);
          try {
            await makeRequest({
              serverUrl: server,
              endpoint: `/api/terminal/exec/${encodeURIComponent(host)}/${encodeURIComponent(taskId)}/kill`,
              method: 'POST',
              body: { signal: 'SIGTERM' },
              apiKey: key,
            });
          } catch {}
          process.exit(130);
        });

        const poll = async () => {
          try {
            const pollRes = await makeRequest({
              serverUrl: server,
              endpoint: `/api/terminal/exec/${encodeURIComponent(host)}/${encodeURIComponent(taskId)}?offset=${offset}`,
              method: 'GET',
              apiKey: key,
            });

            if (pollRes.data && pollRes.data.success) {
              consecutiveErrors = 0;
              const t = pollRes.data;
              if (t.stdout) process.stdout.write(t.stdout);
              if (t.stderr) process.stderr.write(t.stderr);

              offset = t.outputOffset !== undefined ? t.outputOffset : (offset + (t.stdout ? t.stdout.length : 0) + (t.stderr ? t.stderr.length : 0));

              if (t.status !== 'running') {
                const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
                const exitCode = t.exitCode !== null && t.exitCode !== undefined ? t.exitCode : (t.status === 'completed' ? 0 : 1);

                if (!quiet) {
                  if (exitCode === 0) {
                    process.stderr.write(`<<< [${host}] Command completed with code 0 (took ${durationSec}s)\n`);
                  } else {
                    process.stderr.write(`<<< [${host}] Command failed with code ${exitCode} (${t.status}, took ${durationSec}s)\n`);
                  }
                }
                process.exit(exitCode);
              }
            } else {
              consecutiveErrors++;
            }
          } catch (err) {
            consecutiveErrors++;
          }

          if (consecutiveErrors >= 5) {
            console.error(`\n<<< [${host}] Connection lost while streaming task [${taskId}]. Aborting.`);
            process.exit(1);
          }

          setTimeout(poll, pollInterval);
        };

        poll();
      } catch (err) {
        console.error(`Failed to execute on [${host}]: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Error: Unknown command: ${command}`);
      console.error("Run 'gt --help' for usage.");
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  formatRelativeTime,
  makeRequest,
  parseControlMessage,
  resolveWebSocketUrl,
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  TaskManager,
  taskManager,
  handleFileRpc,
  handleCmdExec,
  runAgent,
};
