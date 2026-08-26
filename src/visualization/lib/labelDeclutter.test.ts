import { describe, expect, it } from 'vitest';
import { chooseVisibleLabelIds, type LabelCandidate } from './labelDeclutter';

const candidate = (
  id: string,
  left: number,
  top: number,
  priority: number,
  pinned = false,
): LabelCandidate => ({ id, priority, pinned, rect: { left, top, right: left + 60, bottom: top + 16 } });

describe('chooseVisibleLabelIds', () => {
  it('keeps non-overlapping labels', () => {
    expect(chooseVisibleLabelIds([candidate('a', 0, 0, 1), candidate('b', 100, 0, 1)])).toEqual(new Set(['a', 'b']));
  });

  it('keeps the higher-priority label when labels overlap', () => {
    expect(chooseVisibleLabelIds([candidate('small', 0, 0, 2), candidate('large', 20, 0, 10)])).toEqual(
      new Set(['large']),
    );
  });

  it('uses a stable id tie-breaker so live commits do not make labels flicker', () => {
    expect(chooseVisibleLabelIds([candidate('zeta', 0, 0, 3), candidate('alpha', 20, 0, 3)])).toEqual(
      new Set(['alpha']),
    );
  });

  it('keeps pinned search or selection labels even when they collide', () => {
    expect(chooseVisibleLabelIds([candidate('normal', 0, 0, 10), candidate('search', 20, 0, 1, true)])).toEqual(
      new Set(['search']),
    );
  });

  it('keeps multiple pinned labels because search results must not disappear', () => {
    expect(chooseVisibleLabelIds([candidate('first', 0, 0, 1, true), candidate('second', 20, 0, 1, true)])).toEqual(
      new Set(['first', 'second']),
    );
  });
});
