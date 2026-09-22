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
const { spawn, execSync } = require('child_process');
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
  logs [OPTIONS] HOST TASK_ID  View execution logs for a task (like 'docker logs')
  kill HOST TASK_ID       Terminate a running task on a host (like 'docker kill')
  login [SERVER] [KEY]    Verify credentials and save to ~/.gt/config.json
  logout                  Remove credentials from ~/.gt/config.json
  config <list|get|set>   View or modify ~/.gt/config.json settings
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

Logs Options:
  -f, --follow            Follow log output (stream updates until task finishes)
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

function formatTemplate(template, items = []) {
  if (typeof template !== 'string' || !template.trim()) return '';
  const isTable = /^table\s+/i.test(template.trim());
  const rawPattern = isTable ? template.trim().slice(5).trim() : template.trim();

  // Extract placeholder keys: {{.Field}}
  const keyMatches = [];
  const regex = /\{\{\s*\.([a-zA-Z0-9_]+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(rawPattern)) !== null) {
    keyMatches.push({ raw: match[0], key: match[1] });
  }

  const resolveVal = (item, key) => {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(item)) {
      if (k.toLowerCase() === lowerKey) {
        return v !== null && v !== undefined ? String(v) : '';
      }
    }
    // Fallback aliases
    if (lowerKey === 'taskid' && item.id) return String(item.id);
    if (lowerKey === 'id' && item.taskId) return String(item.taskId);
    if (lowerKey === 'exitcode' && item.exitCode !== undefined) return String(item.exitCode);
    return '';
  };

  if (!isTable) {
    return items.map((item) => {
      let line = rawPattern;
      for (const { raw, key } of keyMatches) {
        line = line.split(raw).join(resolveVal(item, key));
      }
      return line.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    }).join('\n');
  }

  // Table formatting
  const headerKeys = keyMatches.map(m => m.key);
  const headers = headerKeys.map(k => k.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase());

  const rows = items.map(item => headerKeys.map(k => resolveVal(item, k)));
  const allRows = [headers, ...rows];

  const colWidths = headers.map((_, colIdx) => {
    let max = 0;
    for (const row of allRows) {
      const len = (row[colIdx] || '').length;
      if (len > max) max = len;
    }
    return max;
  });

  return allRows.map((row) => {
    return row.map((cell, colIdx) => {
      if (colIdx === row.length - 1) return cell;
      return (cell || '').padEnd(colWidths[colIdx] + 3);
    }).join('').trimEnd();
  }).join('\n');
}

function resolveTaskId(tasks, input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Task identifier is required');
  }
  const cleanInput = input.trim();
  // 1. Exact match
  const exact = tasks.find(t => t.taskId === cleanInput);
  if (exact) return exact.taskId;

  // 2. Prefix match
  const matches = tasks.filter(t => t.taskId.startsWith(cleanInput) || t.taskId.includes(cleanInput));
  if (matches.length === 1) return matches[0].taskId;
  if (matches.length > 1) {
    const candidates = matches.map(m => `  - ${m.taskId}`).join('\n');
    throw new Error(`Ambiguous task identifier '${cleanInput}': matches multiple tasks:\n${candidates}`);
  }
  throw new Error(`No such task: '${cleanInput}'`);
}

async function resolveHost(serverUrl, apiKey, input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Host identifier is required');
  }
  const cleanInput = input.trim();
  const res = await makeRequest({
    serverUrl,
    endpoint: '/api/terminal/hosts',
    method: 'GET',
    apiKey,
  });

  if (!res.data || !Array.isArray(res.data.hosts)) {
    throw new Error(`Failed to query hosts from server: ${res.data?.error || `HTTP ${res.status}`}`);
  }

  const hosts = res.data.hosts;
  // 1. Exact match on id or name
  const exact = hosts.find(h => h.id === cleanInput || (h.name && h.name.toLowerCase() === cleanInput.toLowerCase()));
  if (exact) return { id: exact.id, name: exact.name || exact.id };

  // 2. Prefix match on id or name
  const matches = hosts.filter(h => {
    const idHit = h.id && h.id.toLowerCase().startsWith(cleanInput.toLowerCase());
    const nameHit = h.name && h.name.toLowerCase().startsWith(cleanInput.toLowerCase());
    return idHit || nameHit;
  });

  if (matches.length === 1) {
    return { id: matches[0].id, name: matches[0].name || matches[0].id };
  }
  if (matches.length > 1) {
    const candidates = matches.map(m => `  - ${m.id} (${m.name || 'unnamed'})`).join('\n');
    throw new Error(`Ambiguous host identifier '${cleanInput}': matches multiple hosts:\n${candidates}`);
  }
  throw new Error(`No such host: '${cleanInput}'`);
}

function isRemoteSpec(str) {
  if (typeof str !== 'string') return false;
  // Exclude Windows drive letters: C:\ or D:/
  if (/^[a-zA-Z]:[\\/]/.test(str)) return false;
  const colonIdx = str.indexOf(':');
  return colonIdx > 0;
}

function parseRemoteSpec(str) {
  const colonIdx = str.indexOf(':');
  return {
    host: str.slice(0, colonIdx).trim(),
    path: str.slice(colonIdx + 1).trim() || '.',
  };
}

function parseCpArgs(args) {
  if (!args || args.length < 2) {
    throw new Error('Usage: gt cp <src> <dest>');
  }
  const [srcArg, destArg] = args;
  const srcIsRemote = isRemoteSpec(srcArg);
  const destIsRemote = isRemoteSpec(destArg);

  if (!srcIsRemote && !destIsRemote) {
    throw new Error('Invalid arguments: at least one argument must be remote (<host>:<path>)');
  }
  if (srcIsRemote && destIsRemote) {
    throw new Error('Invalid arguments: cannot copy between two remote hosts directly');
  }

  const src = srcIsRemote
    ? { isRemote: true, ...parseRemoteSpec(srcArg) }
    : { isRemote: false, path: srcArg };

  const dest = destIsRemote
    ? { isRemote: true, ...parseRemoteSpec(destArg) }
    : { isRemote: false, path: destArg };

  return { src, dest };
}

async function uploadLocalFile({ serverUrl, apiKey, hostId, localPath, remotePath }) {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }
  const stat = fs.statSync(localPath);
  if (stat.isDirectory()) {
    throw new Error(`Directory upload is not supported in single-file cp: ${localPath}`);
  }

  const filename = path.basename(localPath);
  const fileContent = fs.readFileSync(localPath);
  const boundary = `----GtFormBoundary${crypto.randomBytes(8).toString('hex')}`;

  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([head, fileContent, tail]);

  const endpoint = `/api/terminal/files/upload?hostId=${encodeURIComponent(hostId)}&path=${encodeURIComponent(remotePath || '.')}`;

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

  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': payload.length,
  };
  if (apiKey) {
    headers['x-admin-key'] = apiKey;
  }

  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: serverParsed.protocol,
      hostname: serverParsed.hostname,
      port: serverParsed.port || (isHttps ? 443 : 80),
      path: `${finalPathname}${finalSearch}`,
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = { raw: data }; }
        if (res.statusCode >= 400 || (json && json.success === false)) {
          return reject(new Error(`Upload failed: ${json?.error || `HTTP ${res.statusCode}`}`));
        }
        console.log(`Successfully copied ${localPath} -> [${hostId}]:${remotePath} (${(stat.size / 1024).toFixed(1)} KB)`);
        resolve(0);
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function downloadRemoteFile({ serverUrl, apiKey, hostId, remotePath, localPath }) {
  const endpoint = `/api/terminal/files/download?hostId=${encodeURIComponent(hostId)}&path=${encodeURIComponent(remotePath)}`;

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

  const headers = {};
  if (apiKey) {
    headers['x-admin-key'] = apiKey;
  }

  let destFile = localPath;
  if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
    destFile = path.join(localPath, path.basename(remotePath));
  } else if (localPath.endsWith('/') || localPath.endsWith('\\')) {
    fs.mkdirSync(localPath, { recursive: true });
    destFile = path.join(localPath, path.basename(remotePath));
  }

  const parentDir = path.dirname(destFile);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: serverParsed.protocol,
      hostname: serverParsed.hostname,
      port: serverParsed.port || (isHttps ? 443 : 80),
      path: `${finalPathname}${finalSearch}`,
      method: 'GET',
      headers,
    }, (res) => {
      if (res.statusCode >= 400) {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch { json = { raw: data }; }
          reject(new Error(`Download failed: ${json?.error || `HTTP ${res.statusCode}`}`));
        });
        return;
      }

      const writeStream = fs.createWriteStream(destFile);
      let totalBytes = 0;
      res.on('data', (chunk) => {
        totalBytes += chunk.length;
      });
      res.pipe(writeStream);
      writeStream.on('finish', () => {
        console.log(`Successfully copied [${hostId}]:${remotePath} -> ${destFile} (${(totalBytes / 1024).toFixed(1)} KB)`);
        resolve(0);
      });
      writeStream.on('error', (err) => {
        reject(new Error(`Failed to write local file: ${err.message}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runCp(serverUrl, apiKey, args) {
  const { src, dest } = parseCpArgs(args);

  if (src.isRemote) {
    const resolved = await resolveHost(serverUrl, apiKey, src.host);
    return await downloadRemoteFile({
      serverUrl,
      apiKey,
      hostId: resolved.id,
      remotePath: src.path,
      localPath: dest.path,
    });
  } else {
    const resolved = await resolveHost(serverUrl, apiKey, dest.host);
    return await uploadLocalFile({
      serverUrl,
      apiKey,
      hostId: resolved.id,
      localPath: src.path,
      remotePath: dest.path,
    });
  }
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
  const cleanMeta = { ...metadata };
  delete cleanMeta.key;
  delete cleanMeta['x-admin-key'];
  const query = new URLSearchParams(cleanMeta);
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
  return null;
}

class ConfigStore {
  static getConfigDir() {
    return path.join(os.homedir(), '.gt');
  }

  static getConfigFile() {
    return path.join(this.getConfigDir(), 'config.json');
  }

  static load() {
    try {
      const p = this.getConfigFile();
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch {}
    return {};
  }

  static save(data) {
    const dir = this.getConfigDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const file = this.getConfigFile();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    if (os.platform() !== 'win32') {
      try { fs.chmodSync(file, 0o600); } catch {}
      try { fs.chmodSync(dir, 0o700); } catch {}
    }
  }

  static clear() {
    try {
      const file = this.getConfigFile();
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch {}
  }

  static get(key) {
    const data = this.load();
    return data[key];
  }

  static set(key, val) {
    const data = this.load();
    if (val === undefined || val === null || val === '') {
      delete data[key];
    } else {
      data[key] = val;
    }
    this.save(data);
  }

  static getEffectiveConfig(cliOpts = {}) {
    const stored = this.load();
    const server = (cliOpts && cliOpts.server) ||
      process.env.TERMINAL_SERVER ||
      process.env.GEMINI_PROXY_URL ||
      stored.server ||
      'http://localhost:3000';
    const key = (cliOpts && cliOpts.key) ||
      process.env.ADMIN_SECRET_KEY ||
      stored.key ||
      '';
    return { server, key };
  }
}

function killProcessTree(child, signal = 'SIGTERM') {
  if (!child) return;
  const pid = typeof child === 'number' ? child : child.pid;
  if (!pid) return;
  const isWindows = os.platform() === 'win32';
  try {
    if (isWindows) {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, signal);
    }
  } catch (e) {
    if (child && typeof child.kill === 'function') {
      try { child.kill(signal); } catch {}
    } else {
      try { process.kill(pid, signal); } catch {}
    }
  }
}

function killProcessTreeSync(pid, signal = 'SIGTERM') {
  if (!pid) return;
  const isWindows = os.platform() === 'win32';
  try {
    if (isWindows) {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, signal);
    }
  } catch (e) {
    try { process.kill(pid, signal); } catch {}
  }
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

  startTask({ taskId, command, cwd, timeoutMs = 300000, env = {}, stdin = null }) {
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
        stdio: [stdin !== null && stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        detached: !isWindows,
      });
      if (child.stdin && stdin !== null && stdin !== undefined) {
        child.stdin.write(stdin);
        child.stdin.end();
      }
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
      totalBytes: 0,
      chunks: [],
      child,
      timeoutTimer: null,
      killTimer: null,
    };

    const appendChunk = (type, chunk) => {
      const text = chunk.toString('utf-8');
      const bytes = Buffer.byteLength(text, 'utf-8');
      const startOffset = taskRecord.totalBytes;
      const endOffset = startOffset + bytes;
      taskRecord.totalBytes = endOffset;
      taskRecord.chunks.push({ type, text, startOffset, endOffset });

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

      while (taskRecord.chunks.length > 1 && taskRecord.totalBytes - taskRecord.chunks[0].startOffset > this.MAX_BUFFER_SIZE) {
        taskRecord.chunks.shift();
      }
    };

    child.stdout.on('data', (chunk) => appendChunk('stdout', chunk));
    child.stderr.on('data', (chunk) => appendChunk('stderr', chunk));

    child.on('error', (err) => {
      appendChunk('stderr', Buffer.from(`\nProcess execution error: ${err.message}\n`));
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
          appendChunk('stderr', Buffer.from(timeoutMsg));
          killProcessTree(taskRecord.child, 'SIGTERM');
          if (taskRecord.killTimer) clearTimeout(taskRecord.killTimer);
          taskRecord.killTimer = setTimeout(() => {
            if (taskRecord.child) {
              killProcessTree(taskRecord.child, 'SIGKILL');
            }
          }, 1000);
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

    const numOffset = Math.max(0, parseInt(offset, 10) || 0);
    const totalBytes = task.totalBytes !== undefined ? task.totalBytes : Buffer.byteLength(task.output, 'utf-8');

    let incStdout = '';
    let incStderr = '';
    let incOutput = '';

    if (numOffset === 0 && (!task.chunks || task.chunks.length === 0)) {
      incStdout = task.stdout;
      incStderr = task.stderr;
      incOutput = task.output;
    } else if (task.chunks && task.chunks.length > 0) {
      for (const chunk of task.chunks) {
        if (chunk.endOffset <= numOffset) {
          continue;
        }
        let chunkText = chunk.text;
        if (chunk.startOffset < numOffset) {
          const byteSliceStart = numOffset - chunk.startOffset;
          const buf = Buffer.from(chunk.text, 'utf-8');
          chunkText = buf.slice(byteSliceStart).toString('utf-8');
        }
        if (chunk.type === 'stdout') {
          incStdout += chunkText;
        } else if (chunk.type === 'stderr') {
          incStderr += chunkText;
        }
        incOutput += chunkText;
      }
    }

    return {
      success: true,
      taskId: task.taskId,
      status: task.status,
      exitCode: task.exitCode,
      stdout: incStdout,
      stderr: incStderr,
      output: incOutput,
      offset: totalBytes,
      outputOffset: totalBytes,
      totalBytes,
      durationMs: (task.endTime || Date.now()) - task.startTime,
      startTime: task.startTime,
      endTime: task.endTime,
    };
  }

  _killChild(child, signal = 'SIGTERM') {
    return killProcessTree(child, signal);
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
    killProcessTree(task.child, signal || 'SIGTERM');

    if (task.killTimer) clearTimeout(task.killTimer);
    task.killTimer = setTimeout(() => {
      if (task.child) {
        killProcessTree(task.child, 'SIGKILL');
      }
    }, 1000);
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
  const { reqId, action, taskId, command, cwd, timeoutMs, env, stdin, offset, signal, limit } = control;

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
      const res = taskManager.startTask({ taskId, command, cwd, timeoutMs, env, stdin });
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
          try {
            const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
            ws.send(buf);
          } catch {}
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
    if (isExiting) return;
    isExiting = true;
    stopHeartbeat();
    console.log('\n[Agent] Shutting down agent...');
    if (ws) {
      try { ws.close(); } catch {}
    }
    if (ptyProcess) {
      try { ptyProcess.kill('SIGTERM'); } catch {}
    }
    for (const task of taskManager.tasks.values()) {
      if (task.status === 'running' && task.child) {
        killProcessTree(task.child, 'SIGTERM');
        setTimeout(() => {
          if (task.child) killProcessTree(task.child, 'SIGKILL');
        }, 500);
      }
    }
    setTimeout(() => process.exit(0), 600);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
  process.on('uncaughtException', (err) => {
    console.error('\n[Agent] Uncaught exception:', err);
    cleanup();
  });
  process.on('exit', () => {
    for (const task of taskManager.tasks.values()) {
      if (task.status === 'running' && task.child && task.child.pid) {
        try {
          killProcessTreeSync(task.child.pid, 'SIGKILL');
        } catch {}
      }
    }
  });

  if (pty) {
    spawnPty();
  }
  connect();
}

// --------------------------------------------------------------------------
// Shell quoting and CLI Parsing Helpers
// --------------------------------------------------------------------------

function quoteShellArg(arg) {
  if (typeof arg !== 'string') return '';
  if (/^[a-zA-Z0-9_.\-\/=:@]+$/.test(arg)) {
    return arg;
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function parseExecArgs(args) {
  let detach = false;
  let workdir = undefined;
  let timeoutMs = 300000;
  let quiet = false;
  let pollInterval = 500;
  const envVars = {};
  let host = '';
  const commandParts = [];

  let i = 0;
  // Phase 1: parse gt exec options until host is found or -- is encountered
  while (i < args.length) {
    const a = args[i];
    if (a === '--') {
      i++;
      if (!host && i < args.length) {
        host = args[i++];
      }
      break;
    }
    if (a === '-d' || a === '--detach' || a === '-a' || a === '--async') {
      detach = true;
    } else if (a === '-q' || a === '--quiet') {
      quiet = true;
    } else if (a === '-w' || a === '--workdir' || a === '--cwd') {
      workdir = args[++i];
    } else if (a.startsWith('-w=')) {
      workdir = a.slice(3);
    } else if (a.startsWith('--workdir=')) {
      workdir = a.slice(10);
    } else if (a.startsWith('--cwd=')) {
      workdir = a.slice(6);
    } else if (a === '-t' || a === '--timeout') {
      timeoutMs = parseInt(args[++i], 10);
    } else if (a.startsWith('--timeout=')) {
      timeoutMs = parseInt(a.slice(10), 10);
    } else if (a === '--poll-interval') {
      pollInterval = parseInt(args[++i], 10);
    } else if (a === '-e' || a === '--env') {
      const pair = args[++i] || '';
      const eq = pair.indexOf('=');
      if (eq !== -1) {
        envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    } else if (a.startsWith('-e=')) {
      const pair = a.slice(3);
      const eq = pair.indexOf('=');
      if (eq !== -1) envVars[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    } else if (a.startsWith('-')) {
      // Unknown option before host
      throw new Error(`Unknown option before host: ${a}`);
    } else {
      host = a;
      i++;
      break;
    }
    i++;
  }

  // If a double dash directly follows host (e.g. gt exec node-1 -- cmd), skip it
  if (i < args.length && args[i] === '--') {
    i++;
  }

  // Phase 2: everything after host is remote command arguments
  while (i < args.length) {
    commandParts.push(args[i++]);
  }

  const fullCommand = commandParts.length === 1
    ? commandParts[0].trim()
    : commandParts.map(quoteShellArg).join(' ').trim();
  return {
    host,
    fullCommand,
    commandParts,
    options: { detach, workdir, timeoutMs, quiet, pollInterval, env: envVars }
  };
}

// --------------------------------------------------------------------------
// Main CLI Dispatcher
// --------------------------------------------------------------------------

async function main() {
  const rawArgs = process.argv.slice(2);

  let cliServer = null;
  let cliKey = null;
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
      cliServer = rawArgs[++i];
    } else if (a.startsWith('--server=')) {
      cliServer = a.slice(9);
    } else if (a === '-k' || a === '--key') {
      cliKey = rawArgs[++i];
    } else if (a.startsWith('--key=')) {
      cliKey = a.slice(6);
    } else {
      filteredArgs.push(a);
    }
  }

  const effectiveConfig = ConfigStore.getEffectiveConfig({ server: cliServer, key: cliKey });
  const server = effectiveConfig.server;
  const key = effectiveConfig.key;

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
      let follow = false;
      let pollInterval = 500;
      const positional = [];

      for (let i = 0; i < cmdArgs.length; i++) {
        const a = cmdArgs[i];
        if (a === '-f' || a === '--follow') {
          follow = true;
        } else if (a === '--poll-interval') {
          pollInterval = parseInt(cmdArgs[++i], 10) || 500;
        } else if (a.startsWith('--poll-interval=')) {
          pollInterval = parseInt(a.slice(16), 10) || 500;
        } else {
          positional.push(a);
        }
      }

      if (positional.length < 2) {
        console.error('Error: Missing arguments. Usage: gt logs [OPTIONS] HOST TASK_ID');
        process.exit(1);
      }
      const hostId = positional[0];
      const taskId = positional[1];

      if (!follow) {
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
            process.exit(0);
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

      process.on('SIGINT', () => {
        process.exit(130);
      });

      let offset = 0;
      let consecutiveErrors = 0;

      const poll = async () => {
        try {
          const pollRes = await makeRequest({
            serverUrl: server,
            endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}?offset=${offset}`,
            method: 'GET',
            apiKey: key,
          });

          if (pollRes.data && pollRes.data.success) {
            consecutiveErrors = 0;
            const t = pollRes.data;
            if (t.stdout) process.stdout.write(t.stdout);
            if (t.stderr) process.stderr.write(t.stderr);
            if (!t.stdout && !t.stderr && t.output) process.stdout.write(t.output);

            offset = t.outputOffset !== undefined ? t.outputOffset : (t.offset !== undefined ? t.offset : offset);

            if (t.status !== 'running') {
              const exitCode = t.exitCode !== null && t.exitCode !== undefined ? t.exitCode : (t.status === 'completed' ? 0 : 1);
              process.exit(exitCode);
            }
          } else {
            consecutiveErrors++;
          }
        } catch (err) {
          consecutiveErrors++;
        }

        if (consecutiveErrors >= 5) {
          console.error(`\n<<< [${hostId}] Connection lost while streaming task [${taskId}]. Aborting.`);
          process.exit(1);
        }

        setTimeout(poll, pollInterval);
      };

      poll();
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

    case 'login': {
      let targetServer = cmdArgs[0] || server;
      let targetKey = cmdArgs[1] || key;

      if (cmdArgs.length === 1) {
        if (cmdArgs[0].startsWith('http://') || cmdArgs[0].startsWith('https://')) {
          targetServer = cmdArgs[0];
          targetKey = key;
        } else {
          targetKey = cmdArgs[0];
          targetServer = server;
        }
      }

      if (!targetKey) {
        console.error('Error: Missing secret key. Usage: gt login [server] [key]');
        process.exit(1);
      }

      targetServer = targetServer.replace(/\/+$/, '');

      try {
        const res = await makeRequest({
          serverUrl: targetServer,
          endpoint: '/api/terminal/hosts',
          method: 'GET',
          apiKey: targetKey,
        });

        if (res.status === 200) {
          const config = ConfigStore.load();
          config.server = targetServer;
          config.key = targetKey;
          ConfigStore.save(config);
          console.log(`Successfully verified and logged in to ${targetServer}`);
          process.exit(0);
        } else {
          console.error(`Authentication failed: HTTP ${res.status} ${res.data?.error || 'Unauthorized'}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`Authentication failed: ${err.message}`);
        process.exit(1);
      }
      break;
    }

    case 'logout': {
      const config = ConfigStore.load();
      delete config.key;
      ConfigStore.save(config);
      console.log('Successfully logged out.');
      process.exit(0);
    }

    case 'config': {
      const subCmd = (cmdArgs[0] || 'list').toLowerCase();
      if (subCmd === 'list') {
        const stored = ConfigStore.load();
        const mask = (str) => {
          if (!str) return '';
          if (str.length <= 3) return '***';
          return str.slice(0, 3) + '***';
        };
        const serverVal = stored.server !== undefined ? stored.server : server;
        const keyVal = stored.key !== undefined ? mask(stored.key) : '';
        console.log(`server = "${serverVal}"`);
        console.log(`key    = "${keyVal}"`);
        for (const [k, v] of Object.entries(stored)) {
          if (k !== 'server' && k !== 'key') {
            console.log(`${k.padEnd(6)} = "${v}"`);
          }
        }
        process.exit(0);
      } else if (subCmd === 'get') {
        const k = cmdArgs[1];
        if (!k) {
          console.error('Error: Missing key. Usage: gt config get <key>');
          process.exit(1);
        }
        const val = ConfigStore.get(k);
        if (val !== undefined && val !== null) {
          console.log(val);
        } else {
          console.log('');
        }
        process.exit(0);
      } else if (subCmd === 'set') {
        const k = cmdArgs[1];
        const v = cmdArgs[2];
        if (!k || v === undefined) {
          console.error('Error: Missing arguments. Usage: gt config set <key> <value>');
          process.exit(1);
        }
        ConfigStore.set(k, v);
        console.log(`Set ${k} = "${v}"`);
        process.exit(0);
      } else {
        console.error(`Error: Unknown config command: ${subCmd}`);
        console.error('Usage: gt config <list|get|set> [key] [val]');
        process.exit(1);
      }
      break;
    }

    case 'agent': {
      runAgent(cmdArgs, { server, key });
      break;
    }

    case 'exec': {
      let parsed;
      try {
        parsed = parseExecArgs(cmdArgs);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      const { host, fullCommand, options } = parsed;
      const { detach, workdir, timeoutMs, quiet, pollInterval, env: envVars } = options;

      if (!host) {
        console.error('Error: Missing target host. Usage: gt exec [OPTIONS] HOST COMMAND [ARGS...]');
        process.exit(1);
      }

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

              offset = t.outputOffset !== undefined ? t.outputOffset : (t.offset !== undefined ? t.offset : offset);

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
  formatTemplate,
  resolveTaskId,
  resolveHost,
  isRemoteSpec,
  parseRemoteSpec,
  parseCpArgs,
  uploadLocalFile,
  downloadRemoteFile,
  runCp,
  makeRequest,
  parseControlMessage,
  resolveWebSocketUrl,
  quoteShellArg,
  parseExecArgs,
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  ConfigStore,
  TaskManager,
  taskManager,
  killProcessTree,
  killProcessTreeSync,
  handleFileRpc,
  handleCmdExec,
  runAgent,
};
