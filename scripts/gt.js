#!/usr/bin/env node

/**
 * gt (Gemini Terminal) - Unified Docker-Style Terminal CLI
 * Client operations (hosts, exec, ps, logs, kill) and agent runner (agent).
 */

const http = require('http');
const https = require('https');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Version metadata
const VERSION = '1.0.0';

// Auto-load .env from working directory
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
  -d, --detach            Run command in background and print task ID
  -w, --workdir <dir>     Working directory on remote host (alias: --cwd)
  -t, --timeout <ms>      Execution timeout in ms (Default: 300000 / 5 min)
  -e, --env <KEY=VAL>     Set remote environment variable (can be repeated)
  -q, --quiet             Suppress execution header and footer banners
  --poll-interval <ms>    Polling interval for log stream in ms (Default: 500)

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

async function main() {
  const rawArgs = process.argv.slice(2);

  // Global flag scan prior to command
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

  // Dispatch Commands
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

          // Format aligned table
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

    case 'ps': {
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

    case 'logs': {
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
      // Delegate execution directly to scripts/terminal-agent.js
      const agentScript = path.resolve(__dirname, 'terminal-agent.js');
      const { fork } = require('child_process');
      const child = fork(agentScript, cmdArgs, { stdio: 'inherit' });
      child.on('exit', (code) => { process.exit(code || 0); });
      break;
    }

    case 'exec': {
      // Docker-style argument parsing
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

        if (a === '-d' || a === '--detach') {
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

        // Live stream following
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

module.exports = { formatRelativeTime, makeRequest };
