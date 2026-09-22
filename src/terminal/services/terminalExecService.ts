import { terminalHostManager } from './terminalHostManager';

export interface StartExecutionOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  stdin?: string;
}

export class TerminalExecService {
  public async startExecution(hostId: string, options: StartExecutionOptions): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!options || !options.command || !options.command.trim()) {
      return { success: false, error: 'command is required' };
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = Math.min(Math.max(options.timeoutMs || 300000, 1000), 3600000); // 1s to 1 hour

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'start',
      taskId,
      command: options.command.trim(),
      cwd: options.cwd ? options.cwd.trim() : undefined,
      timeoutMs,
      env: options.env || {},
      stdin: typeof options.stdin === 'string' ? options.stdin : undefined,
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        taskId,
        hostId: hostId.trim(),
        ...res.data,
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to start command on agent',
    };
  }

  public async getExecutionStatus(hostId: string, taskId: string, offset: number = 0): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!taskId || !taskId.trim()) {
      return { success: false, error: 'taskId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'poll',
      taskId: taskId.trim(),
      offset: Math.max(0, offset || 0),
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        hostId: hostId.trim(),
        ...res.data,
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to poll command status from agent',
    };
  }

  public async killExecution(hostId: string, taskId: string, signal: string = 'SIGTERM'): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }
    if (!taskId || !taskId.trim()) {
      return { success: false, error: 'taskId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'kill',
      taskId: taskId.trim(),
      signal: signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM',
    });

    if (res && res.success) {
      return {
        success: true,
        taskId: taskId.trim(),
        status: 'killed',
        message: res.data?.message || 'Kill signal sent to task',
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to kill command on agent',
    };
  }

  public async listExecutions(hostId: string, limit: number = 20): Promise<any> {
    if (!hostId || !hostId.trim()) {
      return { success: false, error: 'hostId is required' };
    }

    const res = await terminalHostManager.executeCmdRpc(hostId.trim(), {
      action: 'list',
      limit: Math.min(Math.max(limit || 20, 1), 100),
    });

    if (res && res.success && res.data) {
      return {
        success: true,
        hostId: hostId.trim(),
        tasks: res.data.tasks || [],
      };
    }

    return {
      success: false,
      error: res?.error || 'Failed to list tasks from agent',
    };
  }
}

export const terminalExecService = new TerminalExecService();
export default terminalExecService;
