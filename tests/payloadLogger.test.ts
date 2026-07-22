import payloadLogger from '../src/services/payloadLogger';
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../config/default';

describe('PayloadLogger Service', () => {
  const testId = 'test_transaction_abc123';
  const logsDir = config.transactionLogsDir || 'logs';
  const resolvedLogsDir = path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);

  // Dynamically compute the date/hour subfolder path matching PayloadLogger's formatting
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');

  const targetDir = path.join(resolvedLogsDir, `${year}-${month}-${day}`, hour);
  const filePath = path.join(targetDir, `transaction_${testId}.json`);

  afterEach(async () => {
    try {
      await fs.unlink(filePath);
      // Clean up empty directories created during test run
      await fs.rmdir(targetDir).catch(() => {});
      await fs.rmdir(path.dirname(targetDir)).catch(() => {});
    } catch (e) {
      // ignore
    }
  });

  it('correctly creates the directory and writes pretty-printed json payload with 4 keys', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }] };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
    const claudeRes = { content: [{ type: 'text', text: 'Hello' }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.duration).toBeNull();
    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });

  it('correctly saves duration in the payload when provided', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }] };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
    const claudeRes = { content: [{ type: 'text', text: 'Hello' }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes, 350);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.duration).toBe(350);
    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });
});

describe('PayloadLogger Sanitization', () => {
  it('sanitizes sensitive client keys in transaction log files', async () => {
    const spyWriteFile = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);

    await payloadLogger.saveTransaction(
      'tx123',
      { headers: { 'x-api-key': 'AIzaSy1234567890' } },
      { url: 'https://api.com?key=AIzaSy1234567890' },
      { status: 'ok' },
      { type: 'message' },
      100
    );

    expect(spyWriteFile).toHaveBeenCalled();
    const savedContent = JSON.parse(spyWriteFile.mock.calls[0][1] as string);
    expect(savedContent.client_req.headers['x-api-key']).toEqual('AIzaSy***7890');
    expect(savedContent.gem_req.url).toEqual('https://api.com?key=***');

    spyWriteFile.mockRestore();
  });
});
