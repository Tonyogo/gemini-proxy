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
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
    TERM_PROGRAM: 'gemini-proxy-terminal',
    COLUMNS: String(cols),
    LINES: String(rows),
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

export class PersistentTerminalSession {
  private ptyProcess: pty.IPty | null = null;
  private historyBuffer: string[] = [];
  private totalBufferSize: number = 0;
  private maxBufferSize: number = 1024 * 1024; // 1MB
  private activeSockets: Set<any> = new Set();
  private cols: number = 80;
  private rows: number = 24;

  constructor() {
    this.ensureProcess();
  }

  private ensureProcess(): void {
    if (this.ptyProcess) return;

    try {
      this.ptyProcess = spawnTerminalSession({ cols: this.cols, rows: this.rows });

      this.ptyProcess.onData((data: string) => {
        this.appendHistory(data);
        for (const ws of this.activeSockets) {
          try {
            if (ws.readyState === 1) { // WebSocket.OPEN
              ws.send(data);
            }
          } catch {
            // Ignore socket write errors
          }
        }
      });

      this.ptyProcess.onExit((exitCode: { exitCode: number; signal?: number }) => {
        logger.info(`[PersistentTerminal] Shell process exited with code ${exitCode.exitCode}`);
        for (const ws of this.activeSockets) {
          try {
            if (ws.readyState === 1) {
              ws.send(`JSON:${JSON.stringify({ type: 'status', event: 'exit', code: exitCode.exitCode })}`);
            }
          } catch {
            // Ignore
          }
        }
        this.ptyProcess = null;
        this.historyBuffer = [];
        this.totalBufferSize = 0;
      });
    } catch (err: any) {
      logger.error(`[PersistentTerminal] Failed to spawn PTY: ${err.message}`);
    }
  }

  private appendHistory(data: string): void {
    this.historyBuffer.push(data);
    this.totalBufferSize += data.length;

    while (this.totalBufferSize > this.maxBufferSize && this.historyBuffer.length > 0) {
      const removed = this.historyBuffer.shift();
      if (removed) {
        this.totalBufferSize -= removed.length;
      }
    }
  }

  public attach(ws: any): void {
    this.ensureProcess();
    this.activeSockets.add(ws);

    // Replay buffer to newly attached socket
    if (this.historyBuffer.length > 0 && ws.readyState === 1) {
      const combinedHistory = this.historyBuffer.join('');
      ws.send(combinedHistory);
    }
  }

  public detach(ws: any): void {
    this.activeSockets.delete(ws);
  }

  public write(data: string): void {
    this.ensureProcess();
    if (this.ptyProcess) {
      const hex = Buffer.from(data).toString('hex');
      const preview = JSON.stringify(data.length > 30 ? data.slice(0, 30) + '...' : data);
      logger.info(`[PersistentTerminal] PTY Write (len=${data.length}, hex=${hex}, preview=${preview})`);
      this.ptyProcess.write(data);
    } else {
      logger.warn(`[PersistentTerminal] Write dropped - no active PTY process`);
    }
  }

  public resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.ptyProcess) {
      try {
        logger.info(`[PersistentTerminal] Resizing PTY to ${cols}x${rows}`);
        this.ptyProcess.resize(cols, rows);
      } catch (err: any) {
        logger.warn(`[PersistentTerminal] Resize failed: ${err.message}`);
      }
    }
  }

  public reset(): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch {
        // Ignore kill error
      }
      this.ptyProcess = null;
    }
    this.historyBuffer = [];
    this.totalBufferSize = 0;
    this.ensureProcess();
  }

  public destroy(): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch {
        // Ignore kill error
      }
      this.ptyProcess = null;
    }
    this.activeSockets.clear();
    this.historyBuffer = [];
    this.totalBufferSize = 0;
  }

  public getHistory(): string {
    return this.historyBuffer.join('');
  }

  public replayTo(target: { send: (data: string) => void }): void {
    if (this.historyBuffer.length > 0) {
      target.send(this.historyBuffer.join(''));
    }
  }
}

let defaultSessionInstance: PersistentTerminalSession | null = null;

export function getDefaultTerminalSession(): PersistentTerminalSession {
  if (!defaultSessionInstance) {
    defaultSessionInstance = new PersistentTerminalSession();
  }
  return defaultSessionInstance;
}

export function destroyDefaultTerminalSession(): void {
  if (defaultSessionInstance) {
    defaultSessionInstance.destroy();
    defaultSessionInstance = null;
  }
}
