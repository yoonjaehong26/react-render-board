import { describe, expect, it } from 'vitest';
import type { RenderNode } from '../../data/types';
import { deriveHostDetails } from './hostDetails';

const node = (id: number, kind: RenderNode['kind'], parentId: number | null, displayName: string): RenderNode => ({
  id,
  kind,
  parentId,
  displayName,
  groupHint: null,
});

describe('deriveHostDetails', () => {
  it('groups host tags under their nearest composite owner', () => {
    const details = deriveHostDetails([
      node(1, 'composite', null, 'App'),
      node(2, 'host', 1, 'div'),
      node(3, 'host', 2, 'span'),
      node(4, 'host', 3, 'span'),
    ]);

    expect(details.get(1)).toEqual([
      { tag: 'div', count: 1 },
      { tag: 'span', count: 2 },
    ]);
  });

  it('does not duplicate a nested composite host subtree in its parent detail', () => {
    const details = deriveHostDetails([
      node(1, 'composite', null, 'Parent'),
      node(2, 'host', 1, 'div'),
      node(3, 'composite', 2, 'Child'),
      node(4, 'host', 3, 'button'),
      node(5, 'host', 4, 'span'),
    ]);

    expect(details.get(1)).toEqual([{ tag: 'div', count: 1 }]);
    expect(details.get(3)).toEqual([
      { tag: 'button', count: 1 },
      { tag: 'span', count: 1 },
    ]);
  });
});
