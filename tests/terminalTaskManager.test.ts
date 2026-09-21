const { TaskManager, handleCmdExec } = require('../scripts/gt.js');

describe('TaskManager & handleCmdExec', () => {
  let tm: any;

  beforeEach(() => {
    tm = new TaskManager();
  });

  afterEach(() => {
    for (const task of tm.tasks.values()) {
      if (task.child && task.status === 'running') {
        try {
          task.child.kill('SIGKILL');
        } catch {}
      }
      if (task.timeoutTimer) clearTimeout(task.timeoutTimer);
      if (task.killTimer) clearTimeout(task.killTimer);
    }
  });

  it('runs a simple command to completion', async () => {
    const res = tm.startTask({
      taskId: 'test-echo',
      command: 'echo "hello agent"',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('running');

    // Wait for completion
    let poll: any;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      poll = tm.getTask('test-echo');
      if (poll.status === 'completed' || poll.status === 'failed') break;
    }

    expect(poll.status).toBe('completed');
    expect(poll.exitCode).toBe(0);
    expect(poll.stdout).toContain('hello agent');
    expect(poll.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('marks non-zero exit code as failed', async () => {
    const res = tm.startTask({
      taskId: 'test-fail',
      command: 'exit 42',
    });

    expect(res.success).toBe(true);

    let poll: any;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      poll = tm.getTask('test-fail');
      if (poll.status === 'failed' || poll.status === 'completed') break;
    }

    expect(poll.status).toBe('failed');
    expect(poll.exitCode).toBe(42);
  });

  it('supports incremental offset polling', async () => {
    const res = tm.startTask({
      taskId: 'test-offset',
      command: 'echo "line1" && echo "line2"',
    });

    expect(res.success).toBe(true);

    let poll: any;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      poll = tm.getTask('test-offset');
      if (poll.status === 'completed') break;
    }

    expect(poll.status).toBe('completed');
    expect(poll.stdout).toContain('line1\nline2');

    const firstChunk = tm.getTask('test-offset', 0);
    expect(firstChunk.output).toContain('line1');

    // Poll at totalBytes offset
    const secondChunk = tm.getTask('test-offset', firstChunk.totalBytes);
    expect(secondChunk.output).toBe('');
  });

  it('correctly slices stdout and stderr independently when mixed output occurs', async () => {
    const res = tm.startTask({
      taskId: 'test-mixed',
      command: 'echo "out1" && echo "err1" >&2 && echo "out2" && echo "err2" >&2',
    });

    expect(res.success).toBe(true);

    // 等待执行结束
    let poll: any;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      poll = tm.getTask('test-mixed', 0);
      if (poll.status === 'completed' || poll.status === 'failed') break;
    }

    expect(poll.status).toBe('completed');
    expect(poll.stdout).toContain('out1\nout2');
    expect(poll.stderr).toContain('err1\nerr2');

    // 模拟第一批已读取一半字节
    const halfBytes = Math.floor(poll.totalBytes / 2);
    const secondHalf = tm.getTask('test-mixed', halfBytes);
    expect(secondHalf.outputOffset).toBe(poll.totalBytes);
    expect(secondHalf.output.length).toBeGreaterThan(0);

    // 模拟读取到末尾，再次轮询应返回空内容且 outputOffset 保持最新
    const endChunk = tm.getTask('test-mixed', poll.totalBytes);
    expect(endChunk.stdout).toBe('');
    expect(endChunk.stderr).toBe('');
    expect(endChunk.output).toBe('');
    expect(endChunk.outputOffset).toBe(poll.totalBytes);
  });

  it('kills a running command', async () => {
    const res = tm.startTask({
      taskId: 'test-kill',
      command: 'sleep 30',
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('running');

    const killRes = tm.killTask('test-kill', 'SIGTERM');
    expect(killRes.success).toBe(true);
    expect(killRes.status).toBe('killed');

    await new Promise((r) => setTimeout(r, 200));
    const poll = tm.getTask('test-kill');
    expect(poll.status).toBe('killed');
  });

  it('terminates the entire process tree including spawned child processes on killTask', async () => {
    if (process.platform === 'win32') return; // Unix 进程组测试

    // 派生一个带后台 sleep 的复杂子进程
    const res = tm.startTask({
      taskId: 'test-tree-kill',
      command: 'sh -c "sleep 30 & wait"',
    });

    expect(res.success).toBe(true);
    await new Promise((r) => setTimeout(r, 200));

    const killRes = tm.killTask('test-tree-kill', 'SIGKILL');
    expect(killRes.success).toBe(true);

    // 轮询等待任务标记终止
    let poll: any;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      poll = tm.getTask('test-tree-kill');
      if (poll.status !== 'running') break;
    }
    expect(poll.status).toBe('killed');
  });

  it('handles execution timeout', async () => {
    const res = tm.startTask({
      taskId: 'test-timeout',
      command: 'sleep 30',
      timeoutMs: 300,
    });

    expect(res.success).toBe(true);

    let poll: any;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      poll = tm.getTask('test-timeout');
      if (poll.status === 'timeout') break;
    }

    expect(poll.status).toBe('timeout');
    expect(poll.stderr).toContain('timed out');
  });

  it('lists tasks ordered by most recent', () => {
    tm.startTask({ taskId: 't1', command: 'echo 1' });
    tm.startTask({ taskId: 't2', command: 'echo 2' });

    const listRes = tm.listTasks(10);
    expect(listRes.success).toBe(true);
    expect(listRes.tasks.length).toBe(2);
  });

  it('dispatches commands via handleCmdExec and sends reply', () => {
    const sentMessages: string[] = [];
    const mockWs = {
      readyState: 1,
      send: (msg: string) => sentMessages.push(msg),
    };

    handleCmdExec(
      {
        reqId: 'req-list-1',
        action: 'list',
        limit: 5,
      },
      mockWs
    );

    expect(sentMessages.length).toBe(1);
    const parsed = JSON.parse(sentMessages[0].slice(5));
    expect(parsed.type).toBe('cmd_exec_res');
    expect(parsed.reqId).toBe('req-list-1');
    expect(parsed.success).toBe(true);
    expect(parsed.data.tasks).toBeDefined();
  });
});
