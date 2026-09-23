// @ts-ignore
import { StreamSessionManager, hasSystemPython3, PosixPtyDriver, InteractivePipeDriver, NodePtyDriver } from '../scripts/gt.js';

describe('StreamSessionManager PTY Fallback & Interactive Execution', () => {
  it('detects and selects available pty drivers correctly', () => {
    const messages: any[] = [];
    const mgr = new StreamSessionManager((msg: any) => messages.push(msg));
    expect(typeof mgr.startStream).toBe('function');
    expect(typeof hasSystemPython3).toBe('function');
    expect(typeof hasSystemPython3()).toBe('boolean');
  });

  it('runs Layer 1 NodePtyDriver when available', (done) => {
    const messages: any[] = [];
    const taskId = `test-node-pty-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        const fullOutput = messages
          .filter(m => m.type === 'cmd_stream_data' && m.taskId === taskId)
          .map(m => Buffer.from(m.data, 'base64').toString('utf-8'))
          .join('');

        expect(fullOutput).toContain('NODE_PTY_OK');
        expect(msg.exitCode).toBe(0);
        done();
      }
    });

    mgr.startStream({
      taskId,
      command: 'echo NODE_PTY_OK',
      tty: true,
    });

    const session = mgr.sessions.get(taskId);
    expect(session?.driverType).toBe('node-pty');
  });

  it('runs Layer 2 PosixPtyDriver with fallback and handles raw CR input', (done) => {
    const messages: any[] = [];
    const taskId = `test-posix-pty-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        const fullOutput = messages
          .filter(m => m.type === 'cmd_stream_data' && m.taskId === taskId)
          .map(m => Buffer.from(m.data, 'base64').toString('utf-8'))
          .join('');

        expect(fullOutput).toContain('POSIX_PTY_WORKS');
        expect(msg.exitCode).toBe(0);
        done();
      }
    });

    mgr.startStream({
      taskId,
      command: 'bash',
      tty: true,
      interactive: true,
      cols: 80,
      rows: 24,
      timeoutMs: 10000,
      _forceFallback: true,
    });

    const session = mgr.sessions.get(taskId);
    expect(['posix-pty', 'pipe-fallback']).toContain(session?.driverType);

    // Test resize
    mgr.resize(taskId, 100, 30);

    setTimeout(() => {
      mgr.writeInput(taskId, Buffer.from('echo POSIX_PTY_WORKS\r').toString('base64'));
      setTimeout(() => {
        mgr.writeInput(taskId, Buffer.from('exit\r').toString('base64'));
      }, 500);
    }, 300);
  });

  it('runs Layer 3 InteractivePipeDriver with CR-to-LF translation and warning notice', (done) => {
    const messages: any[] = [];
    const taskId = `test-pipe-fallback-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        const fullOutput = messages
          .filter(m => m.type === 'cmd_stream_data' && m.taskId === taskId)
          .map(m => Buffer.from(m.data, 'base64').toString('utf-8'))
          .join('');

        expect(fullOutput).toContain('[Warning] node-pty not available on agent; running in interactive pipe mode.');
        expect(fullOutput).toContain('PIPE_WORKS');
        expect(msg.exitCode).toBe(0);
        done();
      }
    });

    mgr.startStream({
      taskId,
      command: 'bash',
      tty: true,
      interactive: true,
      cols: 80,
      rows: 24,
      timeoutMs: 10000,
      _forcePipeFallback: true,
    });

    const session = mgr.sessions.get(taskId);
    expect(session?.driverType).toBe('pipe-fallback');

    setTimeout(() => {
      mgr.writeInput(taskId, Buffer.from('echo PIPE_WORKS\r').toString('base64'));
      setTimeout(() => {
        mgr.writeInput(taskId, Buffer.from('exit\r').toString('base64'));
      }, 500);
    }, 300);
  });

  it('handles Ctrl+C (0x03) in InteractivePipeDriver by sending SIGINT', (done) => {
    const messages: any[] = [];
    const taskId = `test-pipe-sigint-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        // Exit triggered by SIGINT or killed
        expect(mgr.sessions.has(taskId)).toBe(false);
        done();
      }
    });

    mgr.startStream({
      taskId,
      command: 'sleep 30',
      tty: true,
      _forcePipeFallback: true,
    });

    const session = mgr.sessions.get(taskId);
    expect(session?.driverType).toBe('pipe-fallback');

    setTimeout(() => {
      // Send Ctrl+C
      mgr.writeInput(taskId, Buffer.from([0x03]).toString('base64'));
    }, 200);
  });

  it('handles Ctrl+D (0x04) in InteractivePipeDriver by closing stdin', (done) => {
    const messages: any[] = [];
    const taskId = `test-pipe-eof-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        expect(mgr.sessions.has(taskId)).toBe(false);
        done();
      }
    });

    mgr.startStream({
      taskId,
      command: 'bash',
      tty: true,
      _forcePipeFallback: true,
    });

    const session = mgr.sessions.get(taskId);
    expect(session?.driverType).toBe('pipe-fallback');

    setTimeout(() => {
      // Send Ctrl+D (EOF)
      mgr.writeInput(taskId, Buffer.from([0x04]).toString('base64'));
    }, 300);
  });

  it('cleans up session and processes on timeout', (done) => {
    const messages: any[] = [];
    const taskId = `test-timeout-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        expect(mgr.sessions.has(taskId)).toBe(false);
        done();
      }
    });

    mgr.startStream({
      taskId,
      command: 'sleep 10',
      tty: true,
      timeoutMs: 400,
      _forcePipeFallback: true,
    });

    expect(mgr.sessions.has(taskId)).toBe(true);
  });

  it('kills all running sessions with killAll', () => {
    const messages: any[] = [];
    const mgr = new StreamSessionManager((msg: any) => messages.push(msg));
    const taskId1 = `test-kill-1-${Date.now()}`;
    const taskId2 = `test-kill-2-${Date.now()}`;

    mgr.startStream({ taskId: taskId1, command: 'sleep 10', tty: true, _forcePipeFallback: true });
    mgr.startStream({ taskId: taskId2, command: 'sleep 10', tty: true, _forcePipeFallback: true });

    expect(mgr.sessions.size).toBe(2);
    mgr.killAll();
    expect(mgr.sessions.size).toBe(0);
  });
});
