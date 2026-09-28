import { calculatePayloadSize, formatBytes } from '../frontend/src/utils/logPayloadHelpers';

describe('logPayloadHelpers', () => {
  describe('formatBytes', () => {
    it('formats bytes correctly across units', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    it('handles negative or invalid numbers safely', () => {
      expect(formatBytes(-10)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');
    });
  });

  describe('calculatePayloadSize', () => {
    it('calculates UTF-8 byte sizes accurately for request and response', () => {
      const mockLog = {
        client_req: { model: 'claude-3-5-sonnet', messages: [{ role: 'user', content: '你好世界' }] },
        claude_res: { content: [{ type: 'text', text: 'Hello World' }] }
      };

      const result = calculatePayloadSize(mockLog);
      expect(result.reqBytes).toBeGreaterThan(0);
      expect(result.resBytes).toBeGreaterThan(0);
      expect(result.totalBytes).toBe(result.reqBytes + result.resBytes);
      expect(result.formattedTotal).toMatch(/B|KB/);
    });

    it('handles null/undefined payloads gracefully without error', () => {
      const result = calculatePayloadSize(null);
      expect(result.reqBytes).toBe(0);
      expect(result.resBytes).toBe(0);
      expect(result.totalBytes).toBe(0);
      expect(result.formattedTotal).toBe('0 B');
    });

    it('falls back to gem_res if claude_res is absent', () => {
      const mockLog = {
        client_req: { message: 'test' },
        gem_res: { candidates: [{ text: 'response' }] }
      };
      const result = calculatePayloadSize(mockLog);
      expect(result.reqBytes).toBeGreaterThan(0);
      expect(result.resBytes).toBeGreaterThan(0);
      expect(result.totalBytes).toBe(result.reqBytes + result.resBytes);
    });
  });
});
