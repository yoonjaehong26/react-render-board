import { describe, it, expect } from 'vitest';
import { createLayoutEngine, NODE_WIDTH } from './layout';
import { PENDING_GROUP } from './normalize';
import type { VisibleNode } from './normalize';

function vnode(id: number, group: string, parentId: number | null = null): VisibleNode {
  return {
    id,
    displayName: `Node${id}`,
    kind: 'composite',
    parentId,
    group,
    isAnonymous: false,
  };
}

describe('createLayoutEngine / computeLayout', () => {
  it('buckets nodes into their group and produces a position for every node', () => {
    const engine = createLayoutEngine();
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'B')];
    const { groups, nodePositions } = engine.computeLayout(nodes);

    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.group === 'A')!;
    const b = groups.find((g) => g.group === 'B')!;
    expect(a.nodeIds.sort()).toEqual([1, 2]);
    expect(b.nodeIds).toEqual([3]);
    expect(a.frame.width).toBeGreaterThan(0);
    expect(a.frame.height).toBeGreaterThan(0);
    expect(nodePositions.has(1)).toBe(true);
    expect(nodePositions.has(2)).toBe(true);
    expect(nodePositions.has(3)).toBe(true);
  });

  it('positions children lower than their parent and keeps siblings from overlapping', () => {
    const engine = createLayoutEngine();
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 1)];
    const { nodePositions } = engine.computeLayout(nodes);

    const p1 = nodePositions.get(1)!;
    const p2 = nodePositions.get(2)!;
    const p3 = nodePositions.get(3)!;
    expect(p2.y).toBeGreaterThan(p1.y);
    expect(p3.y).toBeGreaterThan(p1.y);
    expect(p2.x).not.toBe(p3.x);
  });

  it('keeps known groups in their original relative order and appends newly-seen groups after them', () => {
    const engine = createLayoutEngine();
    const call1 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B')]);
    expect(call1.groups.map((g) => g.group)).toEqual(['A', 'B']);

    const call2 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(call2.groups.map((g) => g.group)).toEqual(['A', 'B', 'C']);

    const [a, b, c] = call2.groups;
    expect(a.frame.x).toBeLessThan(b.frame.x);
    expect(b.frame.x).toBeLessThan(c.frame.x);
  });

  // ADR-0018: a group that disappears must be pruned from the remembered order, so
  // that if it reappears later it's treated as new (appended at the end) instead of
  // snapping back into its old slot — otherwise the camera keeps drifting away from
  // genuinely new groups after routing.
  it('treats a group that disappeared and reappeared as new, appending it at the end instead of its old slot', () => {
    const engine = createLayoutEngine();
    const call1 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(call1.groups.map((g) => g.group)).toEqual(['A', 'B', 'C']);

    engine.computeLayout([vnode(1, 'A'), vnode(3, 'C')]); // B disappears entirely

    const call3 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'B'), vnode(3, 'C')]);
    expect(call3.groups.map((g) => g.group)).toEqual(['A', 'C', 'B']);
  });

  it('reuses an unchanged group internal layout (value-identical positions) when only another group changes', () => {
    const engine = createLayoutEngine();
    const aNodes = [vnode(1, 'A'), vnode(2, 'A', 1)];

    const call1 = engine.computeLayout([...aNodes, vnode(10, 'B')]);
    const aPositionsBefore = { p1: call1.nodePositions.get(1)!, p2: call1.nodePositions.get(2)! };

    // B's membership changes; A's node ids and parent-of relationships stay identical.
    const call2 = engine.computeLayout([...aNodes, vnode(10, 'B'), vnode(11, 'B', 10)]);
    const aPositionsAfter = { p1: call2.nodePositions.get(1)!, p2: call2.nodePositions.get(2)! };

    expect(aPositionsAfter.p1).toEqual(aPositionsBefore.p1);
    expect(aPositionsAfter.p2).toEqual(aPositionsBefore.p2);
  });

  it('recomputes a group internal layout when its parent-of relationships change even with the same node count', () => {
    const engine = createLayoutEngine();
    const call1 = engine.computeLayout([vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 1)]);
    const rootDepthY = call1.nodePositions.get(1)!.y; // node 1 is root (depth 0)
    const childDepthY = call1.nodePositions.get(2)!.y; // node 2 is a child (depth 1)
    expect(childDepthY).toBeGreaterThan(rootDepthY);

    // Same 3 ids, but node 2 is now the root and node 1 is its child — signature
    // (id:parentId pairs) differs even though the node count is unchanged.
    const call2 = engine.computeLayout([vnode(1, 'A', 2), vnode(2, 'A'), vnode(3, 'A', 2)]);
    expect(call2.nodePositions.get(2)!.y).toBe(rootDepthY); // node 2 is now at depth 0
    expect(call2.nodePositions.get(1)!.y).toBe(childDepthY); // node 1 moved to depth 1
  });

  it('cleans up a stale group cache entry so a reappearing group with a different structure does not leak old positions', () => {
    const engine = createLayoutEngine();
    engine.computeLayout([vnode(1, 'A'), vnode(10, 'B'), vnode(11, 'B', 10)]);
    engine.computeLayout([vnode(1, 'A')]); // B disappears entirely

    // B reappears with completely different node ids and structure.
    const call3 = engine.computeLayout([vnode(1, 'A'), vnode(20, 'B'), vnode(21, 'B', 20), vnode(22, 'B', 20)]);
    const b = call3.groups.find((g) => g.group === 'B')!;
    expect(b.nodeIds.sort()).toEqual([20, 21, 22]);
    expect(call3.nodePositions.has(10)).toBe(false);
    expect(call3.nodePositions.has(11)).toBe(false);
    // 21/22 are children of root 20, freshly laid out — not stale positions from old B.
    expect(call3.nodePositions.get(21)!.y).toBeGreaterThan(call3.nodePositions.get(20)!.y);
    expect(call3.nodePositions.get(22)!.y).toBe(call3.nodePositions.get(21)!.y);
  });

  it('always orders the PENDING_GROUP bucket last, regardless of when it first appeared', () => {
    const engine = createLayoutEngine();
    engine.computeLayout([vnode(1, 'A')]);
    const call2 = engine.computeLayout([vnode(1, 'A'), vnode(2, PENDING_GROUP)]);
    expect(call2.groups.map((g) => g.group)).toEqual(['A', PENDING_GROUP]);

    // PENDING_GROUP appears first in the input array, and a new group B is introduced too.
    const call3 = engine.computeLayout([vnode(2, PENDING_GROUP), vnode(1, 'A'), vnode(3, 'B')]);
    expect(call3.groups.map((g) => g.group)).toEqual(['A', 'B', PENDING_GROUP]);
  });

  it('computes a sane positive frame width for a group with many siblings', () => {
    const engine = createLayoutEngine();
    const nodes = Array.from({ length: 5 }, (_, i) => vnode(i + 1, 'A'));
    const { groups } = engine.computeLayout(nodes);
    const a = groups[0];
    const expectedWidth = 5 * NODE_WIDTH + 4 * 24 + 24 * 2; // 5 leaves, H_GAP=24, GROUP_PADDING=24
    expect(a.frame.width).toBe(expectedWidth);
  });
});
