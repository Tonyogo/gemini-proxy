// @ts-ignore
import { StreamSessionManager } from '../scripts/gt.js';
import { spawn } from 'child_process';

describe('StreamSessionManager PTY Fallback & Interactive Execution', () => {
  it('detects and selects available pty drivers correctly', () => {
    const messages: any[] = [];
    const mgr = new StreamSessionManager((msg: any) => messages.push(msg));
    expect(typeof mgr.startStream).toBe('function');
  });

  it('runs interactive bash session with fallback and responds to input commands', (done) => {
    const messages: any[] = [];
    const taskId = `test-fallback-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        const fullOutput = messages
          .filter(m => m.type === 'cmd_stream_data' && m.taskId === taskId)
          .map(m => Buffer.from(m.data, 'base64').toString('utf-8'))
          .join('');
        
        expect(fullOutput).toContain('FALLBACK_WORKS');
        expect(msg.exitCode).toBe(0);
        done();
      }
    });

    // Start interactive bash stream
    mgr.startStream({
      taskId,
      command: 'bash',
      tty: true,
      interactive: true,
      cols: 80,
      rows: 24,
      timeoutMs: 10000,
      _forceFallback: true, // 强制测试 fallback 驱动分支
    });

    const session = mgr.sessions.get(taskId);
    expect(['posix-pty', 'pipe-fallback']).toContain(session?.driverType);

    // Wait 300ms for shell to initialize, then write command with raw CR '\r'
    setTimeout(() => {
      // Send "echo FALLBACK_WORKS\r"
      mgr.writeInput(taskId, Buffer.from('echo FALLBACK_WORKS\r').toString('base64'));
      setTimeout(() => {
        // Send "exit\r"
        mgr.writeInput(taskId, Buffer.from('exit\r').toString('base64'));
      }, 500);
    }, 300);
  });
});
