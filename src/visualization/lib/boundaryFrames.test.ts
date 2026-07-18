import { describe, it, expect } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  buildBoundaryFrames,
  insertBoundaryFrames,
  computeGroupBoundaryKinds,
  withGroupBoundaryKinds,
  type BoundaryFrameData,
} from './boundaryFrames';
import type { BoundaryMembership } from './roleMarkers';

function comp(id: number, parent: string, x: number, y: number): Node {
  return {
    id: String(id),
    type: 'component',
    parentId: parent,
    position: { x, y },
    style: { width: 160, height: 48 },
    data: {},
  };
}
function group(name: string): Node {
  return { id: `group:${name}`, type: 'group', position: { x: 0, y: 0 }, style: {}, data: {} };
}

describe('buildBoundaryFrames', () => {
  it('returns nothing when there are no memberships', () => {
    expect(buildBoundaryFrames([comp(1, 'group:A', 0, 0)], new Map())).toEqual([]);
  });

  it('makes one frame per (group, boundary instance), bounding its member nodes with padding + label space', () => {
    const flowNodes = [group('A'), comp(1, 'group:A', 0, 0), comp(2, 'group:A', 200, 0)];
    const memberships = new Map<number, BoundaryMembership>([
      [1, { kind: 'suspense', boundaryId: 100 }],
      [2, { kind: 'suspense', boundaryId: 100 }],
    ]);
    const frames = buildBoundaryFrames(flowNodes, memberships);
    expect(frames).toHaveLength(1);
    const f = frames[0];
    expect(f.type).toBe('boundary');
    expect(f.parentId).toBe('group:A');
    expect((f.data as BoundaryFrameData).kind).toBe('suspense');
    // members span x:[0,360], y:[0,48]. PAD=12(좌우하), TOP_INSET=24(상단 이름표 자리).
    expect(f.position).toEqual({ x: -12, y: -24 });
    expect(f.style).toEqual({ width: 360 + 24, height: 48 + 24 + 12 });
    expect(f.selectable).toBe(false);
    expect(f.draggable).toBe(false);
  });

  it('separates two different boundary instances into two frames', () => {
    const flowNodes = [group('A'), comp(1, 'group:A', 0, 0), comp(2, 'group:A', 0, 300)];
    const memberships = new Map<number, BoundaryMembership>([
      [1, { kind: 'suspense', boundaryId: 100 }],
      [2, { kind: 'portal', boundaryId: 200 }],
    ]);
    const frames = buildBoundaryFrames(flowNodes, memberships);
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => (f.data as BoundaryFrameData).kind).sort()).toEqual(['portal', 'suspense']);
  });

  it('ignores non-member and non-component nodes', () => {
    const flowNodes = [group('A'), comp(1, 'group:A', 0, 0), comp(2, 'group:A', 200, 0)];
    const memberships = new Map<number, BoundaryMembership>([[1, { kind: 'portal', boundaryId: 100 }]]);
    const frames = buildBoundaryFrames(flowNodes, memberships);
    expect(frames).toHaveLength(1);
    // only comp1 counted → width bounds just that node
    expect(frames[0].style).toEqual({ width: 160 + 24, height: 48 + 24 + 12 });
  });
});

describe('insertBoundaryFrames', () => {
  it('inserts each frame right after its group frame (before that group\'s components) for correct z-order', () => {
    const flowNodes = [group('A'), comp(1, 'group:A', 0, 0), group('B'), comp(2, 'group:B', 0, 0)];
    const frameA: Node = { id: 'boundary:group:A|100', type: 'boundary', parentId: 'group:A', position: { x: 0, y: 0 }, style: {}, data: { kind: 'suspense' } };
    const out = insertBoundaryFrames(flowNodes, [frameA]);
    const ids = out.map((n) => n.id);
    expect(ids).toEqual(['group:A', 'boundary:group:A|100', '1', 'group:B', '2']);
  });

  it('returns the original array untouched when there are no frames', () => {
    const flowNodes = [group('A'), comp(1, 'group:A', 0, 0)];
    expect(insertBoundaryFrames(flowNodes, [])).toBe(flowNodes);
  });
});

describe('computeGroupBoundaryKinds', () => {
  it('collects each group\'s distinct boundary kinds in canonical order (portal, suspense, errorBoundary)', () => {
    const memberships = new Map<number, BoundaryMembership>([
      [1, { kind: 'suspense', boundaryId: 10 }],
      [2, { kind: 'portal', boundaryId: 11 }],
      [3, { kind: 'suspense', boundaryId: 12 }],
      [4, { kind: 'errorBoundary', boundaryId: 13 }],
    ]);
    const nodeGroup = new Map([
      [1, 'A'],
      [2, 'A'],
      [3, 'B'],
      [4, 'B'],
    ]);
    const kinds = computeGroupBoundaryKinds(memberships, nodeGroup);
    expect(kinds.get('A')).toEqual(['portal', 'suspense']); // canonical order, not insertion order
    expect(kinds.get('B')).toEqual(['suspense', 'errorBoundary']);
  });

  it('ignores members whose group is unknown', () => {
    const memberships = new Map<number, BoundaryMembership>([[1, { kind: 'portal', boundaryId: 10 }]]);
    expect(computeGroupBoundaryKinds(memberships, new Map()).size).toBe(0);
  });
});

describe('withGroupBoundaryKinds', () => {
  it('sets boundaryKinds on matching group nodes and leaves others untouched (immutably)', () => {
    const groupA = group('A');
    const nodes = [groupA, comp(1, 'group:A', 0, 0), group('B')];
    const out = withGroupBoundaryKinds(nodes, new Map([['A', ['suspense']]]));
    expect((out[0].data as { boundaryKinds?: string[] }).boundaryKinds).toEqual(['suspense']);
    expect(out[0]).not.toBe(groupA); // new object (immutable)
    expect((out[2].data as { boundaryKinds?: string[] }).boundaryKinds).toBeUndefined();
    expect(out[1]).toBe(nodes[1]); // component untouched by reference
  });

  it('returns the original array when there are no group kinds', () => {
    const nodes = [group('A')];
    expect(withGroupBoundaryKinds(nodes, new Map())).toBe(nodes);
  });
});
