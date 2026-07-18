import { describe, it, expect } from 'vitest';
import { coalesceListSiblings, COALESCE_MIN } from './coalesce';
import type { VisibleNode } from './normalize';

function vnode(id: number, displayName: string, parentId: number | null, group = 'G'): VisibleNode {
  return { id, displayName, kind: 'composite', parentId, group, isAnonymous: false };
}

describe('coalesceListSiblings', () => {
  it('leaves a small sibling set (below COALESCE_MIN) untouched', () => {
    const nodes = [vnode(1, 'List', null), vnode(2, 'Row', 1), vnode(3, 'Row', 1)];
    expect(coalesceListSiblings(nodes)).toEqual(nodes);
  });

  it('coalesces a run of identical siblings into one representative with a count', () => {
    const list = vnode(1, 'List', null);
    const rows = Array.from({ length: COALESCE_MIN }, (_, i) => vnode(10 + i, 'Row', 1));
    const result = coalesceListSiblings([list, ...rows]);

    const kept = result.filter((n) => n.displayName === 'Row');
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(10); // smallest id is the stable representative
    expect(kept[0].coalescedCount).toBe(COALESCE_MIN);
    expect(result.find((n) => n.id === 1)).toBeDefined(); // parent untouched
  });

  it('picks the smallest id as representative regardless of input order (stable across reorders)', () => {
    const list = vnode(1, 'List', null);
    // ids out of order; smallest is 3
    const rows = [7, 3, 9, 5, 11].map((id) => vnode(id, 'Row', 1));
    const result = coalesceListSiblings([list, ...rows]);
    const kept = result.filter((n) => n.displayName === 'Row');
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(3);
  });

  it('drops the whole subtree of the non-representative siblings', () => {
    const list = vnode(1, 'List', null);
    // 5 Rows (ids 10..14); each Row has a Cell child
    const rows = Array.from({ length: 5 }, (_, i) => vnode(10 + i, 'Row', 1));
    const cells = rows.map((r, i) => vnode(100 + i, 'Cell', r.id));
    const result = coalesceListSiblings([list, ...rows, ...cells]);

    // only the representative Row (id 10) and ITS cell (id 100) survive
    const ids = new Set(result.map((n) => n.id));
    expect(ids.has(10)).toBe(true);
    expect(ids.has(100)).toBe(true);
    expect([11, 12, 13, 14].some((id) => ids.has(id))).toBe(false); // dropped rows
    expect([101, 102, 103, 104].some((id) => ids.has(id))).toBe(false); // their cells too
  });

  it('does not merge siblings with the same name but different groups', () => {
    const parent = vnode(1, 'P', null, 'A');
    const a = Array.from({ length: 3 }, (_, i) => vnode(10 + i, 'X', 1, 'A'));
    const b = Array.from({ length: 3 }, (_, i) => vnode(20 + i, 'X', 1, 'B'));
    // each group has only 3 (< COALESCE_MIN) → nothing coalesced even though total same-name is 6
    const result = coalesceListSiblings([parent, ...a, ...b]);
    expect(result.filter((n) => n.displayName === 'X')).toHaveLength(6);
  });

  it('never coalesces anonymous nodes', () => {
    const list = vnode(1, 'List', null);
    const anon = Array.from({ length: COALESCE_MIN + 2 }, (_, i) => {
      const n = vnode(10 + i, '(anonymous)', 1);
      n.isAnonymous = true;
      return n;
    });
    const result = coalesceListSiblings([list, ...anon]);
    expect(result.filter((n) => n.isAnonymous)).toHaveLength(COALESCE_MIN + 2);
  });

  it('coalesces independently under different parents', () => {
    const p1 = vnode(1, 'P1', null);
    const p2 = vnode(2, 'P2', null);
    const r1 = Array.from({ length: COALESCE_MIN }, (_, i) => vnode(100 + i, 'Row', 1));
    const r2 = Array.from({ length: COALESCE_MIN }, (_, i) => vnode(200 + i, 'Row', 2));
    const result = coalesceListSiblings([p1, p2, ...r1, ...r2]);
    const rows = result.filter((n) => n.displayName === 'Row');
    expect(rows).toHaveLength(2); // one representative per parent
    expect(rows.every((n) => n.coalescedCount === COALESCE_MIN)).toBe(true);
  });
});
