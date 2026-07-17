import { describe, it, expect, vi } from 'vitest';
import { toFlow, type ComponentNodeData, type GroupNodeData } from './toFlow';
import { createLayoutEngine } from './layout';
import { PENDING_GROUP } from './normalize';
import type { VisibleNode } from './normalize';
import { colorIndexForGroup } from './groupColor';

function vnode(
  id: number,
  group: string,
  parentId: number | null = null,
  displayName = `Node${id}`,
): VisibleNode {
  return { id, displayName, kind: 'composite', parentId, group, isAnonymous: false };
}

describe('toFlow', () => {
  it('always creates a group frame node regardless of shouldExpandGroup, with an accurate frame', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1)];

    const refEngine = createLayoutEngine();
    const { groups } = refEngine.computeLayout(nodes);
    const expectedFrame = groups.find((g) => g.group === 'A')!.frame;

    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => false });

    expect(flowNodes).toHaveLength(1); // collapsed: only the group frame, no members
    const groupNode = flowNodes[0];
    expect(groupNode.id).toBe('group:A');
    expect(groupNode.type).toBe('group');
    expect(groupNode.position).toEqual({ x: expectedFrame.x, y: expectedFrame.y });
    expect(groupNode.style).toEqual({ width: expectedFrame.width, height: expectedFrame.height });
    const data = groupNode.data as GroupNodeData;
    expect(data.label).toBe('A');
    expect(data.count).toBe(2);
    expect(data.collapsed).toBe(true);
  });

  it('sets data.collapsed per group based on what shouldExpandGroup returns for that group', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'B')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: (_frame, group) => group === 'A' });

    const groupA = flowNodes.find((n) => n.id === 'group:A')!;
    const groupB = flowNodes.find((n) => n.id === 'group:B')!;
    expect((groupA.data as GroupNodeData).collapsed).toBe(false);
    expect((groupB.data as GroupNodeData).collapsed).toBe(true);

    expect(flowNodes.some((n) => n.id === '1')).toBe(true);
    expect(flowNodes.some((n) => n.id === '2')).toBe(false);
  });

  it('creates correctly-shaped component nodes for an expanded group, including crossGroup detection', () => {
    // node 2's parent (node 1) is in group A while node 2 itself is in group B.
    const nodes = [vnode(1, 'A', null, 'Parent'), vnode(2, 'B', 1, 'Child')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    const comp1 = flowNodes.find((n) => n.id === '1')!;
    expect(comp1.type).toBe('component');
    expect(comp1.parentId).toBe('group:A');
    expect(comp1.extent).toBe('parent');
    const data1 = comp1.data as ComponentNodeData;
    expect(data1.displayName).toBe('Parent');
    expect(data1.kind).toBe('composite');
    expect(data1.isAnonymous).toBe(false);
    expect(data1.crossGroup).toBe(false); // no parent at all
    expect(data1.pending).toBe(false);

    const comp2 = flowNodes.find((n) => n.id === '2')!;
    expect(comp2.parentId).toBe('group:B');
    const data2 = comp2.data as ComponentNodeData;
    expect(data2.displayName).toBe('Child');
    expect(data2.crossGroup).toBe(true); // parent's group (A) differs from own group (B)
  });

  it('marks only the node matching highlightedNodeId as highlighted (ADR-0024/0025)', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1)];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true, highlightedNodeId: 2 });

    expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).highlighted).toBe(false);
    expect((flowNodes.find((n) => n.id === '2')!.data as ComponentNodeData).highlighted).toBe(true);
  });

  it('marks no node as highlighted when highlightedNodeId is omitted', () => {
    const nodes = [vnode(1, 'A')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).highlighted).toBe(false);
  });

  // ADR-0016/0017 viewport culling: collapsed groups must never put their members
  // into the flowNodes array at all, not just visually hide them.
  it('creates no component nodes and no edges for a collapsed group', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1)];
    const engine = createLayoutEngine();
    const { flowNodes, flowEdges } = toFlow(nodes, engine, { shouldExpandGroup: () => false });

    expect(flowNodes.some((n) => n.id === '1')).toBe(false);
    expect(flowNodes.some((n) => n.id === '2')).toBe(false);
    expect(flowEdges).toHaveLength(0);
  });

  it('only creates an edge when both the parent and the child ended up expanded', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'B', 1)];
    const engine = createLayoutEngine();

    const onlyParentExpanded = toFlow(nodes, engine, { shouldExpandGroup: (_f, group) => group === 'A' });
    expect(onlyParentExpanded.flowEdges).toHaveLength(0);

    const engine2 = createLayoutEngine();
    const onlyChildExpanded = toFlow(nodes, engine2, { shouldExpandGroup: (_f, group) => group === 'B' });
    expect(onlyChildExpanded.flowEdges).toHaveLength(0);

    const engine3 = createLayoutEngine();
    const bothExpanded = toFlow(nodes, engine3, { shouldExpandGroup: () => true });
    expect(bothExpanded.flowEdges).toHaveLength(1);
    expect(bothExpanded.flowEdges[0].id).toBe('1->2');
    expect(bothExpanded.flowEdges[0].source).toBe('1');
    expect(bothExpanded.flowEdges[0].target).toBe('2');
  });

  it('styles cross-group edges with edge-cross-group className and a higher zIndex than same-group edges', () => {
    const crossGroupNodes = [vnode(1, 'A'), vnode(2, 'B', 1)];
    const engine = createLayoutEngine();
    const { flowEdges: crossEdges } = toFlow(crossGroupNodes, engine, { shouldExpandGroup: () => true });
    expect(crossEdges[0].className).toBe('edge-cross-group');
    expect(crossEdges[0].zIndex).toBe(10);

    const sameGroupNodes = [vnode(1, 'A'), vnode(2, 'A', 1)];
    const engine2 = createLayoutEngine();
    const { flowEdges: sameEdges } = toFlow(sameGroupNodes, engine2, { shouldExpandGroup: () => true });
    expect(sameEdges[0].className).toBeUndefined();
    expect(sameEdges[0].zIndex).toBe(1);
  });

  it('marks the PENDING_GROUP frame and its expanded members as pending, with the expected label', () => {
    const nodes = [vnode(1, PENDING_GROUP)];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    const groupNode = flowNodes.find((n) => n.id === `group:${PENDING_GROUP}`)!;
    const groupData = groupNode.data as GroupNodeData;
    expect(groupData.pending).toBe(true);
    expect(groupData.label).toBe('(그룹 확인 중…)');

    const compNode = flowNodes.find((n) => n.id === '1')!;
    expect((compNode.data as ComponentNodeData).pending).toBe(true);
  });

  it('marks only nodes present in matchedIds as matched (search highlight)', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1)];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true, matchedIds: new Set([2]) });

    expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).matched).toBe(false);
    expect((flowNodes.find((n) => n.id === '2')!.data as ComponentNodeData).matched).toBe(true);
  });

  it('marks no node as matched when matchedIds is omitted', () => {
    const nodes = [vnode(1, 'A')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).matched).toBe(false);
  });

  it('assigns the same deterministic colorIndex (via groupColor.colorIndexForGroup) to a group frame and its members', () => {
    const nodes = [vnode(1, 'domains/checkout'), vnode(2, 'domains/checkout', 1)];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    const expected = colorIndexForGroup('domains/checkout');
    expect((flowNodes.find((n) => n.id === 'group:domains/checkout')!.data as GroupNodeData).colorIndex).toBe(
      expected,
    );
    expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).colorIndex).toBe(expected);
    expect((flowNodes.find((n) => n.id === '2')!.data as ComponentNodeData).colorIndex).toBe(expected);
  });

  it('leaves colorIndex undefined for the PENDING_GROUP frame and its members (stay visually neutral)', () => {
    const nodes = [vnode(1, PENDING_GROUP)];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    expect((flowNodes.find((n) => n.id === `group:${PENDING_GROUP}`)!.data as GroupNodeData).colorIndex).toBeUndefined();
    expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).colorIndex).toBeUndefined();
  });

  it('computes a collapsed group frame\'s colorIndex regardless of expand state', () => {
    const nodes = [vnode(1, 'domains/shell')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => false });

    expect((flowNodes.find((n) => n.id === 'group:domains/shell')!.data as GroupNodeData).colorIndex).toBe(
      colorIndexForGroup('domains/shell'),
    );
  });

  it('marks a group as manuallyCollapsed when its name is in manuallyCollapsedGroups (ADR-0029)', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'B')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, {
      shouldExpandGroup: () => true,
      manuallyCollapsedGroups: new Set(['A']),
    });

    expect((flowNodes.find((n) => n.id === 'group:A')!.data as GroupNodeData).manuallyCollapsed).toBe(true);
    expect((flowNodes.find((n) => n.id === 'group:B')!.data as GroupNodeData).manuallyCollapsed).toBe(false);
  });

  it('defaults manuallyCollapsed to false when manuallyCollapsedGroups is omitted', () => {
    const nodes = [vnode(1, 'A')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    expect((flowNodes.find((n) => n.id === 'group:A')!.data as GroupNodeData).manuallyCollapsed).toBe(false);
  });

  it('invokes onToggleGroupCollapse with the group name when a frame\'s onToggleCollapse is called', () => {
    const nodes = [vnode(1, 'A')];
    const engine = createLayoutEngine();
    const onToggleGroupCollapse = vi.fn();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true, onToggleGroupCollapse });

    (flowNodes.find((n) => n.id === 'group:A')!.data as GroupNodeData).onToggleCollapse();
    expect(onToggleGroupCollapse).toHaveBeenCalledWith('A');
  });

  it('does not throw when onToggleCollapse is called and onToggleGroupCollapse was omitted', () => {
    const nodes = [vnode(1, 'A')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });

    expect(() => (flowNodes.find((n) => n.id === 'group:A')!.data as GroupNodeData).onToggleCollapse()).not.toThrow();
  });

  it('gives group frames the static UX-intent fields: non-selectable, non-draggable, behind other nodes', () => {
    const nodes = [vnode(1, 'A')];
    const engine = createLayoutEngine();
    const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: vi.fn(() => true) });

    const groupNode = flowNodes.find((n) => n.id === 'group:A')!;
    expect(groupNode.selectable).toBe(false);
    expect(groupNode.draggable).toBe(false);
    expect(groupNode.zIndex).toBe(-1);
  });
});
