import * as fs from 'fs';
import * as path from 'path';

describe('LogsView Account Visibility & Payload Size Integration', () => {
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(logsViewPath, 'utf-8');
  });

  test('list item cards should NOT render account badge in row 1', () => {
    // Should NOT have user/account badge in the list item rendering loop
    const listItemStart = content.indexOf('filteredLogs.map((log, idx)');
    const listItemEnd = content.indexOf('/* Bottom Pagination Bar */');
    expect(listItemStart).toBeGreaterThan(-1);
    expect(listItemEnd).toBeGreaterThan(listItemStart);
    const listItemCode = content.substring(listItemStart, listItemEnd);
    expect(listItemCode).not.toContain('log.account &&');
  });

  test('list search filter should still retain account querying', () => {
    expect(content).toContain('account.includes(query)');
  });

  test('detail header should render account badge without max-w-180px truncation', () => {
    expect(content).toContain('selectedLog.account &&');
    expect(content).not.toContain('max-w-[180px] truncate inline-flex items-center gap-1"\n                  title={selectedLog.account}');
  });

  test('detail header should import and render payload size with HardDrive icon', () => {
    expect(content).toContain('calculatePayloadSize');
    expect(content).toContain('HardDrive');
  });
});
