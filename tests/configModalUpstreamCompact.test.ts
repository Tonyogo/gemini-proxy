import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Upstream Compact High-Density Accordion Design', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(modalPath, 'utf-8');
  });

  test('defines SPLIT_BORDER_COLORS matching SPLIT_COLORS for left accent border', () => {
    expect(content).toContain('SPLIT_BORDER_COLORS');
    expect(content).toContain('border-l-blue-500');
    expect(content).toContain('border-l-emerald-500');
  });

  test('renders node index badge (#1, #2) and left colored accent border on node cards', () => {
    expect(content).toContain('#{idx + 1}');
    expect(content).toContain('border-l-4');
  });

  test('accordion toggleServerExpand collapses other nodes when expanding a node', () => {
    expect(content).toMatch(/setExpandedServers\(prev\s*=>\s*\(\{\s*\[idx\]:\s*!prev\[idx\]\s*\}\)\)/);
  });

  test('collapsed state displays compact summary pills (host/URL, egress channel, key count, model count)', () => {
    expect(content).toContain('getCompactHost');
    expect(content).toContain('!isExpanded &&');
  });

  test('adds a new node and focuses accordion exclusively on the newly added node', () => {
    expect(content).toContain('setExpandedServers({ [newIndex]: true })');
  });

  test('groups global network & timeout parameters into a compact 2-column grid section', () => {
    expect(content).toContain('grid-cols-1 sm:grid-cols-2');
    expect(content).toContain('UPSTREAM_TIMEOUT_MS');
    expect(content).toContain('COUNT_TOKENS_MODEL');
  });

  test('collapsed state renders compact mode badge and hides mobile mode switcher when collapsed', () => {
    expect(content).toContain("t('config.modeDirectShort'");
    expect(content).toContain("t('config.modeProxyShort'");
    // Mobile segmented switcher should only render inside isExpanded block
    const collapsedToExpandedSlice = content.slice(
      content.indexOf('Collapsed State Compact Summary Pills'),
      content.indexOf('{isExpanded && (')
    );
    expect(collapsedToExpandedSlice).not.toContain('grid-cols-2 p-0.5 bg-slate-900');
  });
});

