import { describe, it, expect } from 'vitest';
import { normalizeForCanvas, PENDING_GROUP } from './normalize';
import type { RenderNode } from '../../data/types';

function node(
  id: number,
  kind: RenderNode['kind'],
  parentId: number | null,
  groupHint: string | null = null,
  displayName = `Node${id}`,
): RenderNode {
  return { id, displayName, kind, parentId, groupHint };
}

describe('normalizeForCanvas', () => {
  it('excludes host nodes and reconnects composite descendants to the nearest visible ancestor', () => {
    // composite(A=1) -> host(B=2) -> host(C=3) -> composite(D=4)
    const nodes = [
      node(1, 'composite', null, 'App.tsx'),
      node(2, 'host', 1),
      node(3, 'host', 2),
      node(4, 'composite', 3, 'App.tsx'),
    ];
    const result = normalizeForCanvas(nodes, { includeHostNodes: false });

    expect(result.map((n) => n.id).sort()).toEqual([1, 4]);
    const d = result.find((n) => n.id === 4)!;
    expect(d.parentId).toBe(1);
  });

  it('includes host nodes and leaves parentId unchanged when includeHostNodes is true', () => {
    const nodes = [
      node(1, 'composite', null, 'App.tsx'),
      node(2, 'host', 1),
      node(3, 'host', 2),
      node(4, 'composite', 3, 'App.tsx'),
    ];
    const result = normalizeForCanvas(nodes, { includeHostNodes: true });

    expect(result.map((n) => n.id).sort()).toEqual([1, 2, 3, 4]);
    const d = result.find((n) => n.id === 4)!;
    expect(d.parentId).toBe(3);
  });

  it('returns null instead of throwing when a parentId reference is missing from the input', () => {
    const nodes = [
      node(1, 'composite', null, 'App.tsx'),
      node(2, 'composite', 999),
    ];
    expect(() => normalizeForCanvas(nodes, { includeHostNodes: false })).not.toThrow();
    const result = normalizeForCanvas(nodes, { includeHostNodes: false });
    const orphan = result.find((n) => n.id === 2)!;
    expect(orphan.parentId).toBeNull();
  });

  it('assigns PENDING_GROUP when resolveEffectiveGroups cannot find any groupHint', () => {
    const nodes = [node(1, 'composite', null, null)];
    const result = normalizeForCanvas(nodes, { includeHostNodes: false });
    expect(result[0].group).toBe(PENDING_GROUP);
  });

  it('sets isAnonymous only for the "(anonymous)" display name', () => {
    const nodes = [
      node(1, 'composite', null, 'App.tsx', '(anonymous)'),
      node(2, 'composite', null, 'App.tsx', 'Foo'),
    ];
    const result = normalizeForCanvas(nodes, { includeHostNodes: false });
    expect(result.find((n) => n.id === 1)!.isAnonymous).toBe(true);
    expect(result.find((n) => n.id === 2)!.isAnonymous).toBe(false);
  });

  it('passes kind through unchanged', () => {
    const nodes = [
      node(1, 'composite', null, 'App.tsx'),
      node(2, 'host', 1),
    ];
    const result = normalizeForCanvas(nodes, { includeHostNodes: true });
    expect(result.find((n) => n.id === 1)!.kind).toBe('composite');
    expect(result.find((n) => n.id === 2)!.kind).toBe('host');
  });
});
