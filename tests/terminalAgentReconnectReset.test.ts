import { terminalHostManager, RemoteAgentTerminalSession } from '../src/admin/services/terminalHostManager';
import { isSyntheticTerminalReport } from '../frontend/src/utils/terminalFilter';

describe('Terminal Agent Reconnect and Replay Loop Prevention Tests', () => {
  const testHostId = 'agent-test-reconnect-node';

  afterEach(() => {
    terminalHostManager.unregisterAgent(testHostId);
  });

  test('registerAgent cleans up historyBuffer and resets session on agent re-registration', () => {
    const mockAgentWs1 = { readyState: 1, send: jest.fn() };
    const mockClientWs = { readyState: 1, send: jest.fn() };

    // 1. Initial registration
    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Test Node',
      agentWs: mockAgentWs1,
    });

    const session = terminalHostManager.getSession(testHostId) as RemoteAgentTerminalSession;
    expect(session).toBeDefined();

    // Attach client and simulate dirty history with ANSI query sequences
    session.attach(mockClientWs);
    session.handleData('\x1b[6n\x1b[>c\x1b]11;?\x07echo "DIRTY_OLD_SESSION"\r\n');
    expect(session.getHistory()).toContain('DIRTY_OLD_SESSION');

    // 2. Agent restarts and reconnects with a new WebSocket
    const mockAgentWs2 = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Test Node',
      agentWs: mockAgentWs2,
    });

    // Verify historyBuffer is wiped clean so new PTY won't receive echo floods
    expect(session.getHistory()).toBe('');

    // Verify client received clean reset sequence
    const sentToClient = mockClientWs.send.mock.calls.map(call => call[0]);
    const hasResetSignal = sentToClient.some(msg =>
      (typeof msg === 'string' && msg.includes('JSON:{"type":"reset"}')) ||
      (typeof msg === 'string' && msg.includes('\x1b[2J\x1b[H'))
    );
    expect(hasResetSignal).toBe(true);
  });

  test('isSyntheticTerminalReport catches various complex device reports', () => {
    // CPR (Cursor Position Report) variations
    expect(isSyntheticTerminalReport('\x1b[1;1R')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[45;120R')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[1;1;1R')).toBe(true);

    // Primary & Secondary Device Attributes
    expect(isSyntheticTerminalReport('\x1b[?1;2c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[?62;1;2;4;6;7;8;9;15;18;21;22c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[>0;276;0c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[>1;10;0c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[=0c')).toBe(true);

    // Color queries (OSC 10 / 11)
    expect(isSyntheticTerminalReport('\x1b]10;rgb:ffff/ffff/ffff\x1b\\')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b]11;rgb:0000/0000/0000\x07')).toBe(true);

    // Mode reports (DECRPM)
    expect(isSyntheticTerminalReport('\x1b[?2004;1$y')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[12;2$y')).toBe(true);

    // User keystrokes must NEVER be filtered
    expect(isSyntheticTerminalReport('ls -la\r')).toBe(false);
    expect(isSyntheticTerminalReport('\x03')).toBe(false); // Ctrl+C
    expect(isSyntheticTerminalReport('\x1b[A')).toBe(false); // Up arrow
  });
});
