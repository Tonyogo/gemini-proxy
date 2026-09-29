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

    it('should automatically backfill reqSize for historical index.jsonl records that lack reqSize', async () => {
      const testDate = '2099-01-01';
      const testHour = '10';
      const debugDir = path.join(process.cwd(), 'logs');
      const testDateDir = path.join(debugDir, testDate);
      const testHourDir = path.join(testDateDir, testHour);
      await fs.promises.mkdir(testHourDir, { recursive: true });

      const txId = `hist_${Date.now()}`;
      const filename = `1000_${txId}.json`;
      const clientReq = { model: 'claude-3-5-sonnet', prompt: 'historical payload' };
      const expectedReqSize = Buffer.byteLength(JSON.stringify(clientReq), 'utf8');

      const logPayload = {
        timestamp: '2099-01-01T10:00:00.000Z',
        duration: 100,
        path: '/v1/messages',
        status: 200,
        is_stream: false,
        client_req: clientReq,
        gem_req: null,
        gem_res: null,
        claude_res: { id: 'hist_res' }
      };

      await fs.promises.writeFile(path.join(testHourDir, filename), JSON.stringify(logPayload, null, 2), 'utf8');

      // Create index.jsonl with a legacy entry WITHOUT reqSize
      const legacyRecord = {
        id: txId,
        timestamp: '2099-01-01T10:00:00.000Z',
        date: testDate,
        hour: testHour,
        filename,
        path: path.join(testDate, testHour, filename),
        status: 200,
        duration: 100,
        reqPath: '/v1/messages',
        model: 'claude-3-5-sonnet',
        isStream: false,
        account: null
        // Note: reqSize intentionally omitted
      };

      const indexPath = path.join(testDateDir, 'index.jsonl');
      await fs.promises.writeFile(indexPath, JSON.stringify(legacyRecord) + '\n', 'utf8');

      try {
        const res = await logService.listLogs(1, 10, testDate, testHour);
        expect(res.logs.length).toBeGreaterThan(0);
        const targetLog = res.logs.find(l => l.filename === filename);
        expect(targetLog).toBeDefined();
        // reqSize must be accurately backfilled from client_req instead of returning 0
        expect(targetLog!.reqSize).toBe(expectedReqSize);

        // Verify index.jsonl was updated with the computed reqSize
        const updatedIndexContent = await fs.promises.readFile(indexPath, 'utf8');
        const parsedUpdated = JSON.parse(updatedIndexContent.trim());
        expect(parsedUpdated.reqSize).toBe(expectedReqSize);
      } finally {
        await fs.promises.rm(testDateDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('should discover and index unindexed json files on disk even when index.jsonl already exists', async () => {
      const testDate = '2099-01-02';
      const testHour = '11';
      const debugDir = path.join(process.cwd(), 'logs');
      const testDateDir = path.join(debugDir, testDate);
      const testHourDir = path.join(testDateDir, testHour);
      await fs.promises.mkdir(testHourDir, { recursive: true });

      const txId1 = `indexed_${Date.now()}`;
      const filename1 = `1100_${txId1}.json`;
      const txId2 = `unindexed_${Date.now()}`;
      const filename2 = `1101_${txId2}.json`;

      const reqBody1 = { model: 'claude-3-5-sonnet', content: 'file1' };
      const reqBody2 = { model: 'gemini-1.5-pro', content: 'file2' };

      await fs.promises.writeFile(
        path.join(testHourDir, filename1),
        JSON.stringify({ timestamp: '2099-01-02T11:00:00.000Z', client_req: reqBody1, status: 200 }),
        'utf8'
      );
      await fs.promises.writeFile(
        path.join(testHourDir, filename2),
        JSON.stringify({ timestamp: '2099-01-02T11:01:00.000Z', client_req: reqBody2, status: 200 }),
        'utf8'
      );

      // index.jsonl ONLY contains record 1
      const record1 = {
        id: txId1,
        timestamp: '2099-01-02T11:00:00.000Z',
        date: testDate,
        hour: testHour,
        filename: filename1,
        path: path.join(testDate, testHour, filename1),
        status: 200,
        duration: 50,
        reqPath: '/v1/messages',
        model: 'claude-3-5-sonnet',
        isStream: false,
        reqSize: Buffer.byteLength(JSON.stringify(reqBody1), 'utf8')
      };
      const indexPath = path.join(testDateDir, 'index.jsonl');
      await fs.promises.writeFile(indexPath, JSON.stringify(record1) + '\n', 'utf8');

      try {
        const res = await logService.listLogs(1, 10, testDate, testHour);
        // Both records should be returned
        expect(res.logs.length).toBe(2);
        const log2 = res.logs.find(l => l.filename === filename2);
        expect(log2).toBeDefined();
        expect(log2!.reqSize).toBe(Buffer.byteLength(JSON.stringify(reqBody2), 'utf8'));

        // Verify index.jsonl now has both lines
        const updatedIndexContent = await fs.promises.readFile(indexPath, 'utf8');
        const lines = updatedIndexContent.trim().split('\n');
        expect(lines.length).toBe(2);
      } finally {
        await fs.promises.rm(testDateDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('should calculate reqSize from gemReq when clientReq is null or empty', async () => {
      const txId = `test_size_gemreq_${Date.now()}`;
      const gemReq = { contents: [{ role: 'user', parts: [{ text: 'gemini only' }] }] };
      const expectedBytes = Buffer.byteLength(JSON.stringify(gemReq), 'utf8');

      await (payloadLogger.saveTransaction as any)(
        txId,
        null,
        gemReq,
        null,
        { id: 'msg_gem', model: 'gemini-1.5-pro' },
        120,
        '/v1beta/models/gemini-1.5-pro:generateContent',
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

    it('should record reqSize as 0 for GET/HEAD metadata objects and empty bodies', async () => {
      const txIdGet = `test_size_get_${Date.now()}`;
      const getReq = { method: 'GET', query: { limit: '10' } };

      await (payloadLogger.saveTransaction as any)(
        txIdGet,
        getReq,
        { endpoint: '/v1beta/models' },
        null,
        { data: [] },
        50,
        '/v1/models',
        200,
        false
      );

      const txIdEmpty = `test_size_empty_${Date.now()}`;
      await (payloadLogger.saveTransaction as any)(
        txIdEmpty,
        {},
        null,
        null,
        { error: 'Bad Request' },
        10,
        '/v1/messages',
        400,
        false
      );

      const debugDir = path.join(process.cwd(), 'logs');
      const dates = await fs.promises.readdir(debugDir);
      let foundGet: any = null;
      let foundEmpty: any = null;

      for (const d of dates) {
        const indexPath = path.join(debugDir, d, 'index.jsonl');
        const exists = await fs.promises.access(indexPath).then(() => true).catch(() => false);
        if (exists) {
          const content = await fs.promises.readFile(indexPath, 'utf8');
          const lines = content.trim().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            const rec = JSON.parse(line);
            if (rec.id === txIdGet) foundGet = rec;
            if (rec.id === txIdEmpty) foundEmpty = rec;
          }
        }
      }

      expect(foundGet).not.toBeNull();
      expect(foundGet.reqSize).toBe(0);
      expect(foundEmpty).not.toBeNull();
      expect(foundEmpty.reqSize).toBe(0);
    });

    it('should return total as full day record count while hourCount reflects filtered hour', async () => {
      const testDate = '2099-01-03';
      const debugDir = path.join(process.cwd(), 'logs');
      const testDateDir = path.join(debugDir, testDate);
      await fs.promises.mkdir(path.join(testDateDir, '08'), { recursive: true });
      await fs.promises.mkdir(path.join(testDateDir, '09'), { recursive: true });

      const record1 = {
        id: `tx_08_${Date.now()}`,
        timestamp: '2099-01-03T08:00:00.000Z',
        date: testDate,
        hour: '08',
        filename: '0800_tx1.json',
        path: path.join(testDate, '08', '0800_tx1.json'),
        status: 200,
        duration: 10,
        reqPath: '/v1/messages',
        model: 'claude-3-5-sonnet',
        isStream: false,
        reqSize: 50
      };

      const record2 = {
        id: `tx_09_${Date.now()}`,
        timestamp: '2099-01-03T09:00:00.000Z',
        date: testDate,
        hour: '09',
        filename: '0900_tx2.json',
        path: path.join(testDate, '09', '0900_tx2.json'),
        status: 200,
        duration: 20,
        reqPath: '/v1/messages',
        model: 'claude-3-5-sonnet',
        isStream: false,
        reqSize: 60
      };

      const indexPath = path.join(testDateDir, 'index.jsonl');
      await fs.promises.writeFile(indexPath, JSON.stringify(record1) + '\n' + JSON.stringify(record2) + '\n', 'utf8');

      try {
        const res = await logService.listLogs(1, 10, testDate, '08');
        expect(res.logs.length).toBe(1);
        expect(res.hourCount).toBe(1);
        // total must reflect all records in the date directory (2), not overridden to hourCount (1)
        expect(res.total).toBe(2);
      } finally {
        await fs.promises.rm(testDateDir, { recursive: true, force: true }).catch(() => {});
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
