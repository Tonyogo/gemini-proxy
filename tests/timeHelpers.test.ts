import * as timeHelpers from '../frontend/src/utils/timeHelpers';

describe('timeHelpers', () => {
  test('formatRelativeTime is pruned and no longer exported', () => {
    expect((timeHelpers as any).formatRelativeTime).toBeUndefined();
  });
});
