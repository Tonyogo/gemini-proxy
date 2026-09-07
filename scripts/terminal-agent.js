#!/usr/bin/env node

/**
 * Gemini Proxy Terminal Agent
 * Lightweight reverse agent bridging local PTY shell to the remote Gemini Proxy WebTerminal.
 */

const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const pty = require('node-pty');

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
const hostId = options.id || options.hostId || `${hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}-${localIp.replace(/\./g, '-')}`;
const hostName = options.name || hostname;

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
  return `${wsUrl}/api/admin/terminal/agent-ws?${query.toString()}`;
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
  };

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
        // Respawn shell if exited unexpectedly
        setTimeout(spawnPty, 500);
      }
    });
  } catch (err) {
    console.error(`[PTY] Failed to spawn PTY: ${err.message}`);
  }
}

function connect() {
  if (isExiting) return;

  const targetWsUrl = resolveWebSocketUrl(serverArg);
  console.log(`[Agent] Connecting to ${targetWsUrl.split('?')[0]}...`);

  ws = new WebSocket(targetWsUrl, {
    headers: {
      'x-admin-key': adminKey,
    },
  });

  ws.on('open', () => {
    reconnectAttempts = 0;
    console.log(`[Agent] Connected and registered successfully! Reverse tunnel is active.`);

    if (!ptyProcess) {
      spawnPty();
    }
  });

  ws.on('message', (data) => {
    try {
      const msgStr = data.toString();
      if (msgStr.startsWith('JSON:')) {
        const control = JSON.parse(msgStr.slice(5));
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
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }
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
    console.warn(`[Agent] Connection closed (code: ${code}, reason: ${reason || 'none'})`);
    ws = null;
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error(`[Agent] Connection error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (isExiting) return;
  reconnectAttempts++;
  const delay = Math.min(30000, 1000 * Math.pow(1.5, Math.min(reconnectAttempts, 8)));
  console.log(`[Agent] Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt #${reconnectAttempts})...`);
  setTimeout(connect, delay);
}

// Initial run
spawnPty();
connect();

function cleanup() {
  isExiting = true;
  console.log('\n[Agent] Shutting down agent...');
  if (ws) {
    try {
      ws.close();
    } catch {
      // Ignore
    }
  }
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch {
      // Ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
