import payloadLogger from '../src/services/payloadLogger';
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../config/default';

describe('PayloadLogger Service', () => {
  const testId = 'test_transaction_abc123';
  const logsDir = config.transactionLogsDir || 'logs';
  const resolvedLogsDir = path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);

  // Dynamically compute target directory matching Intl TIME_ZONE
  const timeZone = config.timeZone || 'Asia/Shanghai';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(new Date());
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  let hour = getPart('hour');
  if (hour === '24') hour = '00';

  const targetDir = path.join(resolvedLogsDir, `${year}-${month}-${day}`, hour);
  const filePath = path.join(targetDir, `transaction_${testId}.json`);

  afterEach(async () => {
    try {
      await fs.unlink(filePath);
      await fs.rmdir(targetDir).catch(() => {});
      await fs.rmdir(path.dirname(targetDir)).catch(() => {});
    } catch (e) {
      // ignore
    }
  });

  it('correctly creates the directory and writes json payload', async () => {
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
