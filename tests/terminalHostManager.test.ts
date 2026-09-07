import { TerminalHostManager } from '../src/admin/services/terminalHostManager';

describe('TerminalHostManager', () => {
  let manager: TerminalHostManager;

  beforeEach(() => {
    manager = new TerminalHostManager();
  });

  test('initializes with a default local host', () => {
    const hosts = manager.getHosts();
    expect(hosts.length).toBeGreaterThanOrEqual(1);
    const local = hosts.find((h) => h.id === 'local');
    expect(local).toBeDefined();
    expect(local?.type).toBe('local');
    expect(local?.status).toBe('online');
  });

  test('can register an agent host and retrieve its session', () => {
    const mockAgentWs = {
      readyState: 1,
      send: jest.fn(),
      on: jest.fn(),
    };

    const host = manager.registerAgent({
      hostId: 'agent-01',
      name: 'Test Worker Node',
      hostname: 'worker-ubuntu',
      ip: '192.168.1.100',
      platform: 'linux',
      agentWs: mockAgentWs,
    });

    expect(host.id).toBe('agent-01');
    expect(host.status).toBe('online');
    expect(host.type).toBe('agent');

    const session = manager.getSession('agent-01');
    expect(session).not.toBeNull();

    // Writing to remote session pipes to agentWs
    session?.write('ls -la\n');
    expect(mockAgentWs.send).toHaveBeenCalledWith('ls -la\n');

    // Resizing session pipes control frame to agentWs
    session?.resize(100, 30);
    expect(mockAgentWs.send).toHaveBeenCalledWith('JSON:{"type":"resize","cols":100,"rows":30}');
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

  test('marks host offline on unregister or agent disconnect', () => {
    const mockAgentWs = { readyState: 1, send: jest.fn(), on: jest.fn() };
    manager.registerAgent({ hostId: 'agent-03', agentWs: mockAgentWs });
    expect(manager.getHost('agent-03')?.status).toBe('online');

    manager.unregisterAgent('agent-03');
    expect(manager.getHost('agent-03')?.status).toBe('offline');
  });
});
