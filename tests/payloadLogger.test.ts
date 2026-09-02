import payloadLogger from '../src/services/payloadLogger';
import { promises as fs, existsSync, readFileSync } from 'fs';
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
    minute: '2-digit',
    second: '2-digit',
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

  afterEach(async () => {
    try {
      if (existsSync(targetDir)) {
        const files = await fs.readdir(targetDir);
        for (const file of files) {
          if (file.includes(testId)) {
            await fs.unlink(path.join(targetDir, file)).catch(() => {});
          }
        }
      }
      await fs.unlink(path.join(path.dirname(targetDir), 'index.jsonl')).catch(() => {});
      await fs.rmdir(targetDir).catch(() => {});
      await fs.rmdir(path.dirname(targetDir)).catch(() => {});
    } catch (e) {
      // ignore
    }
  });

  const findTestFile = async (id: string = testId): Promise<string> => {
    const files = await fs.readdir(targetDir);
    const match = files.find(f => f.endsWith(`_${id}.json`));
    return match ? path.join(targetDir, match) : '';
  };

  it('correctly creates the directory and writes json payload', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }], stream: true };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
    const claudeRes = { content: [{ type: 'text', text: 'Hello' }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes, undefined, '/v1/messages', 200, true);

    const filePath = await findTestFile(testId);
    expect(filePath).toBeTruthy();
    const exists = existsSync(filePath);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.duration).toBeNull();
    expect(data.path).toBe('/v1/messages');
    expect(data.status).toBe(200);
    expect(data.is_stream).toBe(true);
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

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes, 350, '/v1/messages', 200, false);

    const filePath = await findTestFile(testId);
    expect(filePath).toBeTruthy();
    const exists = existsSync(filePath);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.duration).toBe(350);
    expect(data.status).toBe(200);
    expect(data.is_stream).toBe(false);
    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });

  it('appends a LogIndexRecord entry to logs/<date>/index.jsonl when saving a transaction', async () => {
    const transactionId = `test_idx_${Date.now()}`;
    await payloadLogger.saveTransaction(
      transactionId,
      { model: 'gemini-3.1-flash', stream: false },
      { contents: [] },
      { candidates: [] },
      { type: 'message' },
      150,
      '/v1/messages',
      200,
      false
    );

    const debugDir = (payloadLogger as any)._getTargetDir();
    const indexPath = path.join(debugDir, '..', 'index.jsonl');
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    const record = JSON.parse(lines[lines.length - 1]);
    expect(record.id).toBe(transactionId);
    expect(record.status).toBe(200);
    expect(record.duration).toBe(150);
    expect(record.reqPath).toBe('/v1/messages');
    expect(record.model).toBe('gemini-3.1-flash');
    expect(record.filename).toMatch(new RegExp(`^\\d{4}_${transactionId}\\.json$`));

    // Clean up files written by this test
    const customFilePath = await findTestFile(transactionId);
    if (customFilePath) {
      await fs.unlink(customFilePath).catch(() => {});
    }
    await fs.unlink(indexPath).catch(() => {});
  });

  it('records cleanModelName when MODEL_MAPPINGS is configured', async () => {
    config.modelMappings = {
      'claude-3-5-sonnet-20241022': 'gemini-2.5-flash'
    };

    const transactionId = `test_mapped_${Date.now()}`;
    await payloadLogger.saveTransaction(
      transactionId,
      { model: 'claude-3-5-sonnet-20241022', stream: false },
      { contents: [] },
      { candidates: [] },
      { type: 'message', model: 'gemini-2.5-flash' },
      150,
      '/v1/messages',
      200,
      false
    );

    const debugDir = (payloadLogger as any)._getTargetDir();
    const indexPath = path.join(debugDir, '..', 'index.jsonl');
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, 'utf8');
    const lines = content.trim().split('\n');
    const record = JSON.parse(lines[lines.length - 1]);
    expect(record.model).toBe('gemini-2.5-flash');

    // Clean up
    const customFilePath = await findTestFile(transactionId);
    if (customFilePath) {
      await fs.unlink(customFilePath).catch(() => {});
    }
    await fs.unlink(indexPath).catch(() => {});
    config.modelMappings = {};
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
