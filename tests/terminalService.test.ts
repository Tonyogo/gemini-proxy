import { spawnTerminalSession } from '../src/admin/services/terminalService';

describe('terminalService', () => {
  it('should spawn a terminal session and receive initial data or exit code', (done) => {
    const session = spawnTerminalSession({ cols: 80, rows: 24 });
    expect(session).toBeDefined();
    expect(typeof session.pid).toBe('number');

    let receivedData = false;
    session.onData((data: string) => {
      receivedData = true;
      expect(typeof data).toBe('string');
      session.kill();
      done();
    });

    session.write('echo "hello terminal"\r');
  }, 10000);
});
