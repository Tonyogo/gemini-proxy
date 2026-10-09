import { EventEmitter } from 'events';

export interface SystemLogEntry {
  id: number;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
}

class SystemLogService extends EventEmitter {
  private logsBuffer: SystemLogEntry[] = [];
  private nextId = 1;
  private readonly maxCapacity = 200;

  public addLog(level: string, message: string): SystemLogEntry {
    const validLevel = ['error', 'warn', 'info', 'debug'].includes(level)
      ? (level as 'error' | 'warn' | 'info' | 'debug')
      : 'info';

    const entry: SystemLogEntry = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      level: validLevel,
      message
    };

    this.logsBuffer.push(entry);
    if (this.logsBuffer.length > this.maxCapacity) {
      this.logsBuffer.shift();
    }

    this.emit('log', entry);
    return entry;
  }

  public getHistory(): SystemLogEntry[] {
    return [...this.logsBuffer];
  }

  public clearHistory(): void {
    this.logsBuffer = [];
  }
}

const systemLogService = new SystemLogService();
export default systemLogService;
