import * as fs from 'fs';
import * as path from 'path';
import payloadLogger from '../src/proxy/services/payloadLogger';
import logService from '../src/admin/services/logService';

describe('Logs List Model Space and ReqSize Optimization', () => {
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  let logsViewContent: string;

  beforeAll(() => {
    logsViewContent = fs.readFileSync(logsViewPath, 'utf-8');
  });

  describe('Backend reqSize Recording & Delivery', () => {
    it('should record reqSize accurately in payloadLogger index.jsonl for ASCII payloads', async () => {
      const txId = `test_size_ascii_${Date.now()}`;
      const clientReq = { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: 'hello' }] };
      const expectedBytes = Buffer.byteLength(JSON.stringify(clientReq), 'utf8');

      await (payloadLogger.saveTransaction as any)(
        txId,
        clientReq,
        {},
        null,
        { id: 'msg_1', model: 'claude-3-5-sonnet' },
        150,
        '/v1/messages',
        200,
        false,
        'user@example.com'
      );

      const debugDir = path.join(process.cwd(), 'logs');
      const dates = await fs.promises.readdir(debugDir);
      let foundRecord: any = null;

      for (const d of dates) {
        const indexPath = path.join(debugDir, d, 'index.jsonl');
        const exists = await fs.promises.access(indexPath).then(() => true).catch(() => false);
        if (exists) {
          const content = await fs.promises.readFile(indexPath, 'utf8');
          const lines = content.trim().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const rec = JSON.parse(line);
            if (rec.id === txId) {
              foundRecord = rec;
              break;
            }
          }
        }
        if (foundRecord) break;
      }

      expect(foundRecord).not.toBeNull();
      expect(foundRecord.reqSize).toBe(expectedBytes);
    });

    it('should record reqSize accurately for multi-byte UTF-8 strings', async () => {
      const txId = `test_size_utf8_${Date.now()}`;
      const clientReq = { model: 'claude-3-5-sonnet', prompt: '你好，世界！🌍' };
      const expectedBytes = Buffer.byteLength(JSON.stringify(clientReq), 'utf8');

      await (payloadLogger.saveTransaction as any)(
        txId,
        clientReq,
        {},
        null,
        { id: 'msg_2', model: 'claude-3-5-sonnet' },
        200,
        '/v1/messages',
        200,
        false
      );

      const debugDir = path.join(process.cwd(), 'logs');
      const dates = await fs.promises.readdir(debugDir);
      let foundRecord: any = null;

      for (const d of dates) {
        const indexPath = path.join(debugDir, d, 'index.jsonl');
        const exists = await fs.promises.access(indexPath).then(() => true).catch(() => false);
        if (exists) {
          const content = await fs.promises.readFile(indexPath, 'utf8');
          const lines = content.trim().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const rec = JSON.parse(line);
            if (rec.id === txId) {
              foundRecord = rec;
              break;
            }
          }
        }
        if (foundRecord) break;
      }

      expect(foundRecord).not.toBeNull();
      expect(foundRecord.reqSize).toBe(expectedBytes);
    });

    it('should include reqSize in logService.listLogs enriched output', async () => {
      const res = await logService.listLogs(1, 10);
      expect(res).toBeDefined();
      expect(Array.isArray(res.logs)).toBe(true);
      if (res.logs.length > 0) {
        const log = res.logs[0];
        expect(log).toHaveProperty('reqSize');
        expect(typeof log.reqSize).toBe('number');
      }
    });
  });

  describe('Frontend LogsView UI Layout & Badge Placement', () => {
    it('should expand model name and remove max-w-[90px] restriction in row 1', () => {
      // Row 1 should no longer constrain model to max-w-[90px]
      expect(logsViewContent).not.toContain('truncate max-w-[90px]');
      expect(logsViewContent).toMatch(/truncate\s+(min-w-0\s+)?max-w-\[(200|220|240)px\]/);
    });

    it('should display reqSize badge in row 2 between STREAM and status code', () => {
      // Find row 2 badge container in list items
      const row2StreamIdx = logsViewContent.indexOf('log.isStream &&');
      const row2StatusIdx = logsViewContent.indexOf('log.status !== null && log.status !== undefined && (');
      
      expect(row2StreamIdx).toBeGreaterThan(-1);
      expect(row2StatusIdx).toBeGreaterThan(row2StreamIdx);

      const betweenStreamAndStatus = logsViewContent.substring(row2StreamIdx, row2StatusIdx);
      
      // ReqSize badge must be between STREAM and status
      expect(betweenStreamAndStatus).toContain('formatBytes(log.reqSize || 0)');
      expect(betweenStreamAndStatus).toContain('Request size:');
    });

    it('should import formatBytes from logPayloadHelpers in LogsView', () => {
      expect(logsViewContent).toMatch(/import\s*\{[^}]*formatBytes[^}]*\}\s*from\s*['"]\.\.\/utils\/logPayloadHelpers['"]/);
    });
  });
});
