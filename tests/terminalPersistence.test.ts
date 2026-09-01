import { getDefaultTerminalSession, destroyDefaultTerminalSession } from '../src/admin/services/terminalService';

describe('PersistentTerminalSession', () => {
  afterAll(() => {
    destroyDefaultTerminalSession();
  });

  it('should maintain state and buffer output across attach/detach cycles', (done) => {
    const session = getDefaultTerminalSession();
    expect(session).toBeDefined();

    const mockWs = {
      readyState: 1,
      send: (data: string) => {
        if (data.includes('PERSISTENCE_TEST_RECORD')) {
          session.detach(mockWs);

          // Test replay
          let replayedData = '';
          session.replayTo({
            send: (chunk: string) => {
              replayedData += chunk;
            },
          });

          expect(replayedData).toContain('PERSISTENCE_TEST_RECORD');
          expect(session.getHistory()).toContain('PERSISTENCE_TEST_RECORD');
          done();
        }
      },
    };

    session.attach(mockWs);
    // Send echo command to PTY
    session.write('echo "PERSISTENCE_TEST_RECORD"\r');
  }, 10000);

  it('should cleanly reset session and clear buffer on reset()', () => {
    const session = getDefaultTerminalSession();
    session.reset();
    expect(session.getHistory()).toBe('');
  });
});
