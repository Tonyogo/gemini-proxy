import payloadLogger from '../src/services/payloadLogger';
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../config/default';

describe('PayloadLogger Service', () => {
  const testId = 'test_transaction_abc123';
  const logsDir = config.transactionLogsDir || 'logs';
  const resolvedLogsDir = path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  const filePath = path.join(resolvedLogsDir, `transaction_${testId}.json`);

  afterEach(async () => {
    try {
      await fs.unlink(filePath);
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

    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });
});
