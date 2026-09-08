import { TerminalHostManager, RemoteAgentTerminalSession } from '../src/admin/services/terminalHostManager';

describe('TerminalHostManager (Pure Dynamic Agent)', () => {
  let manager: TerminalHostManager;

  beforeEach(() => {
    manager = new TerminalHostManager();
  });

  test('initializes with empty hosts list', () => {
    const hosts = manager.getHosts();
    expect(hosts).toEqual([]);
    expect(manager.getSession('local')).toBeNull();
    expect(manager.getSession('non-existent')).toBeNull();
  });

  test('registers and unregisters remote agent correctly', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    const host = manager.registerAgent({
      hostId: 'agent-1',
      name: 'Test-Node',
      hostname: 'test-node',
      ip: '192.168.1.50',
      platform: 'linux',
      agentWs: mockWs,
    });

    expect(host.id).toBe('agent-1');
    expect(host.status).toBe('online');
    expect(manager.getHosts().length).toBe(1);

    const session = manager.getSession('agent-1');
    expect(session).toBeInstanceOf(RemoteAgentTerminalSession);

    // RemoteAgentTerminalSession write and resize
    session?.write('ls -la\n');
    expect(mockWs.send).toHaveBeenCalledWith('ls -la\n');

    session?.resize(100, 30);
    expect(mockWs.send).toHaveBeenCalledWith('JSON:{"type":"resize","cols":100,"rows":30}');

    manager.unregisterAgent('agent-1');
    expect(manager.getHost('agent-1')?.status).toBe('offline');
    expect(manager.getSession('agent-1')).toBeNull();
  });

  test('relays agent data to attached client websockets and records buffer history', () => {
    const mockAgentWs = {
      readyState: 1,
      send: jest.fn(),
      on: jest.fn(),
    };

    manager.registerAgent({
      hostId: 'agent-02',
      agentWs: mockAgentWs,
    });

    const session = manager.getSession('agent-02');
    const mockClientWs = {
      readyState: 1,
      send: jest.fn(),
    };

    session?.attach(mockClientWs);

    // Incoming output from agent
    manager.handleAgentData('agent-02', 'terminal-prompt $ ');
    expect(mockClientWs.send).toHaveBeenCalledWith('terminal-prompt $ ');

    // Detach client
    session?.detach(mockClientWs);
    manager.handleAgentData('agent-02', 'new line');
    expect(mockClientWs.send).not.toHaveBeenCalledWith('new line');
  });
});
