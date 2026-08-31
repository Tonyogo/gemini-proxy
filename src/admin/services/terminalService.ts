import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as pty from 'node-pty';
import logger from '../../utils/logger';

export interface TerminalSessionOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
}

function ensureSpawnHelperPermissions(): void {
  if (os.platform() === 'win32') return;
  try {
    // Check multiple candidate locations for node-pty prebuilds (development src/ vs production dist/src/)
    const candidateDirs = [
      path.resolve(__dirname, '../../../node_modules/node-pty/prebuilds'),
      path.resolve(__dirname, '../../../../node_modules/node-pty/prebuilds'),
      path.resolve(process.cwd(), 'node_modules/node-pty/prebuilds'),
    ];

    for (const prebuildsDir of candidateDirs) {
      if (fs.existsSync(prebuildsDir)) {
        const archDirs = fs.readdirSync(prebuildsDir);
        for (const arch of archDirs) {
          const helper = path.join(prebuildsDir, arch, 'spawn-helper');
          if (fs.existsSync(helper)) {
            const stat = fs.statSync(helper);
            if ((stat.mode & 0o111) === 0) {
              fs.chmodSync(helper, 0o755);
            }
          }
        }
      }
    }
  } catch {
    // Silently continue
  }
}

export function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}

export function spawnTerminalSession(options: TerminalSessionOptions = {}): pty.IPty {
  ensureSpawnHelperPermissions();

  const shell = getDefaultShell();
  const cols = options.cols || 80;
  const rows = options.rows || 24;
  const cwd = options.cwd || process.cwd();

  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...options.env,
  } as { [key: string]: string };

  logger.info(`Spawning PTY shell: ${shell} (${cols}x${rows}) in ${cwd}`);

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd,
    env,
  });

  return ptyProcess;
}
