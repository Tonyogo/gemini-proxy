import payloadLogger from '../src/proxy/services/payloadLogger';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('PayloadLogger Account Recording', () => {
  it('should save account name in transaction payload and index.jsonl', async () => {
    const txId = `test_tx_acc_${Date.now()}`;
    const clientReq = { model: 'claude-3-5-sonnet' };
    const gemReq = {};
    const claudeRes = { id: 'msg_1', model: 'claude-3-5-sonnet' };
    const accountName = 'audit-user@example.com';

    await (payloadLogger.saveTransaction as any)(
      txId,
      clientReq,
      gemReq,
      null,
      claudeRes,
      120,
      '/v1/messages',
      200,
      false,
      accountName
    );

    // Verify index.jsonl contains account
    const debugDir = path.join(process.cwd(), 'logs');
    const dates = await fs.readdir(debugDir);
    let foundIndex = false;
    for (const d of dates) {
      const indexPath = path.join(debugDir, d, 'index.jsonl');
      const exists = await fs.access(indexPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await fs.readFile(indexPath, 'utf8');
        const lines = content.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const rec = JSON.parse(line);
          if (rec.id === txId) {
            expect(rec.account).toBe(accountName);
            foundIndex = true;
            break;
          }
        }
      }
      if (foundIndex) break;
    }
    expect(foundIndex).toBe(true);
  });
});
