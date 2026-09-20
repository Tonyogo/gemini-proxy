#!/usr/bin/env node

/**
 * Gemini Proxy Remote Terminal Command Execution CLI
 * Executes standalone commands on remote reverse terminal agent nodes with real-time log streaming.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Attempt loading .env if dotenv is present or via manual fallback
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
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
Gemini Proxy - Remote Terminal Command Execution CLI

Usage:
  terminal-exec [options] <command>
  terminal-exec status [options] <taskId>
  terminal-exec kill [options] <taskId>
  terminal-exec list [options]

Commands:
  <command>               Execute a command on the remote host and stream logs (default)
  status <taskId>         Inspect the status and full output of a remote task
  kill <taskId>           Terminate a running remote task
  list                    List recent execution tasks on the target host

Options:
  -H, --host <hostId>     Target host ID (Required, or set TERMINAL_HOST)
  -s, --server <url>      Proxy server base URL (Default: env TERMINAL_SERVER or http://localhost:3000)
  -k, --key <secret>      Admin secret key (Default: env ADMIN_SECRET_KEY)
  --cwd <path>            Working directory on the remote host
  --timeout <ms>          Remote process timeout in ms (Default: 300000)
  -a, --async             Submit task and exit immediately without streaming output
  --poll-interval <ms>    Polling interval in ms for live log stream (Default: 500)
  --json                  Output raw JSON responses instead of formatted text
  -h, --help              Show this help menu
`);
}

function parseArgs(rawArgs) {
  const options = {
    server: process.env.TERMINAL_SERVER || process.env.GEMINI_PROXY_URL || 'http://localhost:3000',
    key: process.env.ADMIN_SECRET_KEY || '',
    host: process.env.TERMINAL_HOST || '',
    cwd: undefined,
    timeoutMs: 300000,
    async: false,
    pollInterval: 500,
    json: false,
    help: false,
  };

  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-a' || arg === '--async') {
      options.async = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '-H' || arg === '--host') {
      options.host = rawArgs[++i];
    } else if (arg.startsWith('--host=')) {
      options.host = arg.slice(7);
    } else if (arg === '-s' || arg === '--server') {
      options.server = rawArgs[++i];
    } else if (arg.startsWith('--server=')) {
      options.server = arg.slice(9);
    } else if (arg === '-k' || arg === '--key') {
      options.key = rawArgs[++i];
    } else if (arg.startsWith('--key=')) {
      options.key = arg.slice(6);
    } else if (arg === '--cwd') {
      options.cwd = rawArgs[++i];
    } else if (arg.startsWith('--cwd=')) {
      options.cwd = arg.slice(6);
    } else if (arg === '--timeout') {
      options.timeoutMs = parseInt(rawArgs[++i], 10);
    } else if (arg.startsWith('--timeout=')) {
      options.timeoutMs = parseInt(arg.slice(10), 10);
    } else if (arg === '--poll-interval') {
      options.pollInterval = parseInt(rawArgs[++i], 10);
    } else if (arg.startsWith('--poll-interval=')) {
      options.pollInterval = parseInt(arg.slice(16), 10);
    } else {
      positional.push(arg);
    }
  }

  let subcommand = 'exec';
  let targetArg = '';

  if (positional.length > 0) {
    const first = positional[0].toLowerCase();
    if (['status', 'kill', 'list'].includes(first)) {
      subcommand = first;
      targetArg = positional.slice(1).join(' ').trim();
    } else {
      subcommand = 'exec';
      targetArg = positional.join(' ').trim();
    }
  }

  return { options, subcommand, targetArg };
}

function makeRequest({ serverUrl, endpoint, method = 'GET', body = null, apiKey = '' }) {
  return new Promise((resolve, reject) => {
    const serverParsed = new url.URL(serverUrl);
    const isHttps = serverParsed.protocol === 'https:';
    const client = isHttps ? https : http;

    const [epPath, epQuery] = endpoint.split('?');
    const basePath = serverParsed.pathname.replace(/\/+$/, '');
    const finalPathname = (basePath + '/' + epPath.replace(/^\/+/, '')).replace(/\/+/g, '/');
    const finalSearch = epQuery ? `?${epQuery}` : '';
    const fullPath = `${finalPathname}${finalSearch}`;

    const headers = {
      'Accept': 'application/json',
    };
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
      path: fullPath,
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

    req.on('error', (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const { options, subcommand, targetArg } = parseArgs(rawArgs);

  if (options.help || (rawArgs.length === 0 && !options.host)) {
    printHelp();
    process.exit(0);
  }

  if (!options.host || !options.host.trim()) {
    console.error('Error: Missing target host. Please specify --host=<hostId> or set TERMINAL_HOST environment variable.');
    process.exit(1);
  }

  const hostId = options.host.trim();
  const server = options.server.replace(/\/+$/, '');
  const key = options.key;

  try {
    if (subcommand === 'list') {
      const res = await makeRequest({
        serverUrl: server,
        endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}`,
        method: 'GET',
        apiKey: key,
      });

      if (options.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else if (res.data && res.data.success && Array.isArray(res.data.tasks)) {
        console.log(`\n=== Recent Tasks on [${hostId}] ===\n`);
        if (res.data.tasks.length === 0) {
          console.log('No recent execution tasks recorded.');
        } else {
          for (const t of res.data.tasks) {
            const time = new Date(t.startTime).toLocaleTimeString();
            console.log(`- ${t.taskId} [${t.status}] (exit: ${t.exitCode ?? '-'}) @ ${time} -> ${t.command}`);
          }
        }
        console.log();
      } else {
        console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }
      process.exit(0);
    }

    if (subcommand === 'status') {
      if (!targetArg) {
        console.error('Error: Missing <taskId> for status subcommand.');
        process.exit(1);
      }
      const taskId = targetArg.trim();
      const res = await makeRequest({
        serverUrl: server,
        endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}`,
        method: 'GET',
        apiKey: key,
      });

      if (options.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else if (res.data && res.data.success) {
        const d = res.data;
        console.log(`Task:     ${d.taskId}`);
        console.log(`Host:     ${d.hostId}`);
        console.log(`Status:   ${d.status}`);
        console.log(`ExitCode: ${d.exitCode !== null && d.exitCode !== undefined ? d.exitCode : 'N/A'}`);
        console.log(`Duration: ${d.startTime ? ((d.endTime ? d.endTime - d.startTime : Date.now() - d.startTime) / 1000).toFixed(2) + 's' : 'N/A'}`);
        if (d.output) {
          console.log('\n--- Output ---');
          console.log(d.output);
        }
      } else {
        console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }
      process.exit(0);
    }

    if (subcommand === 'kill') {
      if (!targetArg) {
        console.error('Error: Missing <taskId> for kill subcommand.');
        process.exit(1);
      }
      const taskId = targetArg.trim();
      const res = await makeRequest({
        serverUrl: server,
        endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}/kill`,
        method: 'POST',
        body: { signal: 'SIGTERM' },
        apiKey: key,
      });

      if (options.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else if (res.data && res.data.success) {
        console.log(`Kill signal sent to task [${taskId}] on host [${hostId}].`);
      } else {
        console.error(`Error: ${res.data?.error || `HTTP ${res.status}`}`);
        process.exit(1);
      }
      process.exit(0);
    }

    // Default: 'exec' subcommand
    if (!targetArg) {
      console.error('Error: No command specified to execute.');
      process.exit(1);
    }

    const command = targetArg;
    const startRes = await makeRequest({
      serverUrl: server,
      endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}`,
      method: 'POST',
      body: {
        command,
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
      },
      apiKey: key,
    });

    if (!startRes.data || !startRes.data.success) {
      console.error(`Error starting task on [${hostId}]: ${startRes.data?.error || `HTTP ${startRes.status}`}`);
      process.exit(1);
    }

    const { taskId } = startRes.data;

    // Asynchronous mode: print taskId and exit
    if (options.async) {
      if (options.json) {
        console.log(JSON.stringify(startRes.data, null, 2));
      } else {
        console.log(`Task submitted to [${hostId}]: ${taskId}`);
      }
      process.exit(0);
    }

    // Streaming follow mode
    let offset = 0;
    let isTerminated = false;

    // Hook SIGINT to kill remote process
    process.on('SIGINT', async () => {
      if (isTerminated) process.exit(130);
      isTerminated = true;
      process.stderr.write('\n[Interrupted] Sending termination signal to remote task...\n');
      try {
        await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}/kill`,
          method: 'POST',
          body: { signal: 'SIGTERM' },
          apiKey: key,
        });
      } catch {}
      process.exit(130);
    });

    const poll = async () => {
      if (isTerminated) return;
      try {
        const pollRes = await makeRequest({
          serverUrl: server,
          endpoint: `/api/terminal/exec/${encodeURIComponent(hostId)}/${encodeURIComponent(taskId)}?offset=${offset}`,
          method: 'GET',
          apiKey: key,
        });

        if (pollRes.data && pollRes.data.success) {
          const t = pollRes.data;
          if (t.stdout) {
            process.stdout.write(t.stdout);
          }
          if (t.stderr) {
            process.stderr.write(t.stderr);
          }
          if (!t.stdout && !t.stderr && t.output) {
            process.stdout.write(t.output);
          }
          offset = t.offset !== undefined
            ? t.offset
            : (t.outputOffset !== undefined
              ? t.outputOffset
              : (offset + (t.stdout ? t.stdout.length : 0) + (t.stderr ? t.stderr.length : 0)));

          if (t.status !== 'running') {
            const code = t.exitCode !== null && t.exitCode !== undefined ? t.exitCode : (t.status === 'completed' ? 0 : 1);
            process.exit(code);
          }
        }
      } catch (err) {
        // Network blip, retry next tick
      }
      setTimeout(poll, options.pollInterval);
    };

    poll();
  } catch (err) {
    console.error(`Execution failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, makeRequest, printHelp, main };
