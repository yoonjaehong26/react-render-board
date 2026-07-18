import { describe, it, expect } from 'vitest';
import type { Fiber } from 'bippy';
import type { RenderNode } from '../../data/types';
import {
  describeValue,
  isTrackable,
  fiberPropsChanged,
  readFiberProps,
  trackReferenceInDescendants,
} from './propsFlow';

// 테스트용 최소 Fiber — propsFlow는 memoizedProps/alternate만 만진다.
function fakeFiber(memoizedProps: unknown, alternateProps?: unknown): Fiber {
  const fiber = { memoizedProps } as unknown as Fiber;
  if (alternateProps !== undefined) {
    (fiber as { alternate?: unknown }).alternate = { memoizedProps: alternateProps };
  }
  return fiber;
}

function node(id: number, parentId: number | null): RenderNode {
  return { id, displayName: `N${id}`, kind: 'composite', parentId, groupHint: null };
}

describe('describeValue', () => {
  it('classifies primitives as non-trackable with a shallow preview', () => {
    expect(describeValue(42)).toEqual({ kind: 'primitive', preview: '42', trackable: false });
    expect(describeValue(true)).toEqual({ kind: 'primitive', preview: 'true', trackable: false });
    expect(describeValue('hi')).toEqual({ kind: 'primitive', preview: '"hi"', trackable: false });
    expect(describeValue(null)).toEqual({ kind: 'nullish', preview: 'null', trackable: false });
    expect(describeValue(undefined)).toEqual({ kind: 'nullish', preview: 'undefined', trackable: false });
  });

  it('classifies functions/objects/arrays as trackable', () => {
    expect(describeValue(() => {}).trackable).toBe(true);
    expect(describeValue({ a: 1 }).trackable).toBe(true);
    expect(describeValue([1, 2, 3])).toMatchObject({ kind: 'array', preview: 'Array(3)', trackable: true });
  });

  it('names a function by displayName/name', () => {
    function onClick() {}
    expect(describeValue(onClick).preview).toBe('ƒ onClick()');
    expect(describeValue(() => {}).preview).toBe('ƒ anonymous()');
  });

  it('previews a plain object by its first keys', () => {
    expect(describeValue({ a: 1, b: 2 }).preview).toBe('{ a, b }');
    expect(describeValue({ a: 1, b: 2, c: 3, d: 4 }).preview).toBe('{ a, b, c, … }');
    expect(describeValue({}).preview).toBe('{}');
  });

  it('treats React elements as non-trackable elements (children noise guard)', () => {
    const element = { $$typeof: Symbol.for('react.element'), type: 'div' };
    expect(describeValue(element)).toEqual({ kind: 'element', preview: '<div />', trackable: false });
  });

  it('truncates long previews', () => {
    const long = 'x'.repeat(100);
    expect(describeValue(long).preview.length).toBeLessThanOrEqual(42);
    expect(describeValue(long).preview.endsWith('…')).toBe(true);
  });
});

describe('isTrackable', () => {
  it('mirrors describeValue.trackable', () => {
    expect(isTrackable({})).toBe(true);
    expect(isTrackable(() => {})).toBe(true);
    expect(isTrackable(0)).toBe(false);
    expect(isTrackable(null)).toBe(false);
  });
});

describe('fiberPropsChanged', () => {
  it('is false on first mount (no alternate)', () => {
    expect(fiberPropsChanged(fakeFiber({ a: 1 }))).toBe(false);
  });

  it('detects a changed reference against alternate', () => {
    const same = { x: 1 };
    expect(fiberPropsChanged(fakeFiber({ obj: same, n: 1 }, { obj: same, n: 1 }))).toBe(false);
    expect(fiberPropsChanged(fakeFiber({ obj: {}, n: 1 }, { obj: {}, n: 1 }))).toBe(true); // new object ref
    expect(fiberPropsChanged(fakeFiber({ n: 2 }, { n: 1 }))).toBe(true);
  });

  it('detects added/removed keys', () => {
    expect(fiberPropsChanged(fakeFiber({ a: 1, b: 2 }, { a: 1 }))).toBe(true);
  });
});

describe('readFiberProps', () => {
  it('sorts changed → trackable → primitive, alphabetical within a rank', () => {
    const cb = () => {};
    const prev = { zPrim: 1, aObj: { k: 1 }, mCb: cb, changedPrim: 'old' };
    const curr = { zPrim: 1, aObj: { k: 2 } /* new ref = changed */, mCb: cb, changedPrim: 'new' };
    const rows = readFiberProps(fakeFiber(curr, prev));
    const keys = rows.map((r) => r.key);
    // changed first (aObj, changedPrim), then unchanged trackable (mCb), then unchanged primitive (zPrim)
    expect(keys).toEqual(['aObj', 'changedPrim', 'mCb', 'zPrim']);
    expect(rows[0]).toMatchObject({ key: 'aObj', changed: true, trackable: true });
    expect(rows.find((r) => r.key === 'zPrim')).toMatchObject({ changed: false, trackable: false });
  });

  it('returns [] when there are no props', () => {
    expect(readFiberProps(fakeFiber(null))).toEqual([]);
  });
});

describe('trackReferenceInDescendants', () => {
  //      1
  //    /   \
  //   2     3
  //   |     |
  //   4     5
  const nodes: RenderNode[] = [node(1, null), node(2, 1), node(3, 1), node(4, 2), node(5, 3)];
  const shared = { payload: true };

  it('finds descendants holding the same reference (top-level prop), excluding the root', () => {
    const fibers = new Map<number, Fiber>([
      [1, fakeFiber({ data: shared })],
      [2, fakeFiber({ data: shared })], // matches
      [3, fakeFiber({ other: 9 })],
      [4, fakeFiber({ nested: shared })], // matches (different key)
      [5, fakeFiber({ data: { payload: true } })], // different ref → no match
    ]);
    const matched = trackReferenceInDescendants(nodes, 1, shared, (id) => fibers.get(id));
    expect([...matched].sort()).toEqual([2, 4]);
    expect(matched.has(1)).toBe(false); // root excluded
  });

  it('returns empty when no descendant holds the reference', () => {
    const fibers = new Map<number, Fiber>([[2, fakeFiber({ x: 1 })]]);
    expect(trackReferenceInDescendants(nodes, 1, shared, (id) => fibers.get(id)).size).toBe(0);
  });

  it('only walks the clicked node subtree, not sibling subtrees', () => {
    const fibers = new Map<number, Fiber>([
      [3, fakeFiber({ data: shared })], // node 3 holds the ref but is a sibling of node 2
      [4, fakeFiber({ data: shared })], // node 4 is a descendant of node 2 → should match
    ]);
    const matched = trackReferenceInDescendants(nodes, 2, shared, (id) => fibers.get(id));
    expect([...matched]).toEqual([4]);
    expect(matched.has(3)).toBe(false);
  });
});
