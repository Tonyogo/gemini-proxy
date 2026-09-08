import fs from 'fs';
import path from 'path';

describe('Terminal Agent Script', () => {
  const agentPath = path.resolve(__dirname, '../scripts/terminal-agent.js');

  test('terminal-agent script exists and is executable', () => {
    expect(fs.existsSync(agentPath)).toBe(true);
    const content = fs.readFileSync(agentPath, 'utf-8');
    expect(content).toContain('node-pty');
    expect(content).toContain('WebSocket');
    expect(content).toContain('--server');
    expect(content).toContain('--key');
    expect(content).toContain("require('dotenv')");
    expect(content).toContain('[Agent] Loaded .env configuration');
    expect(content).toContain('isFirstSpawn');
  });

  test('package.json includes terminal-agent script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    expect(pkg.scripts['terminal-agent']).toBeDefined();
    expect(pkg.scripts['terminal-agent']).toContain('scripts/terminal-agent.js');
  });
});
