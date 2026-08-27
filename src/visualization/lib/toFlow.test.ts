import { describe, it, expect, vi } from 'vitest';
import { toFlow, isRouteGroup, type ComponentNodeData, type GroupNodeData } from './toFlow';
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
    expect(groupNode.width).toBe(expectedFrame.width);
    expect(groupNode.height).toBe(expectedFrame.height);
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
    expect(comp1.width).toBeGreaterThan(0);
    expect(comp1.height).toBeGreaterThan(0);
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

  describe('filterToMatches (그룹+개별 동시 필터)', () => {
    it('omits an entire group (frame included) when none of its members match', () => {
      const nodes = [vnode(1, 'A'), vnode(2, 'B')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, {
        shouldExpandGroup: () => true,
        matchedIds: new Set([1]),
        filterToMatches: true,
      });

      expect(flowNodes.some((n) => n.id === 'group:A')).toBe(true);
      expect(flowNodes.some((n) => n.id === '1')).toBe(true);
      expect(flowNodes.some((n) => n.id === 'group:B')).toBe(false);
      expect(flowNodes.some((n) => n.id === '2')).toBe(false);
    });

    it('keeps a group frame but omits non-matching individual members within it', () => {
      const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 1)];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, {
        shouldExpandGroup: () => true,
        matchedIds: new Set([2]),
        filterToMatches: true,
      });

      expect(flowNodes.some((n) => n.id === 'group:A')).toBe(true);
      expect(flowNodes.some((n) => n.id === '1')).toBe(false);
      expect(flowNodes.some((n) => n.id === '2')).toBe(true);
      expect(flowNodes.some((n) => n.id === '3')).toBe(false);
    });

    it('only creates edges between two nodes that both survived filtering', () => {
      const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 1)];
      const engine = createLayoutEngine();
      const { flowEdges } = toFlow(nodes, engine, {
        shouldExpandGroup: () => true,
        matchedIds: new Set([1, 2]),
        filterToMatches: true,
      });

      expect(flowEdges).toHaveLength(1);
      expect(flowEdges[0].id).toBe('1->2');
    });

    it('is a no-op when matchedIds is empty (empty search query) even if filterToMatches is true', () => {
      const nodes = [vnode(1, 'A'), vnode(2, 'B')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, {
        shouldExpandGroup: () => true,
        matchedIds: new Set(),
        filterToMatches: true,
      });

      expect(flowNodes.some((n) => n.id === 'group:A')).toBe(true);
      expect(flowNodes.some((n) => n.id === 'group:B')).toBe(true);
      expect(flowNodes.some((n) => n.id === '1')).toBe(true);
      expect(flowNodes.some((n) => n.id === '2')).toBe(true);
    });

    it('is a no-op when filterToMatches is false, even with matchedIds set (highlight-only mode, ADR-0027)', () => {
      const nodes = [vnode(1, 'A'), vnode(2, 'B')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, {
        shouldExpandGroup: () => true,
        matchedIds: new Set([1]),
        filterToMatches: false,
      });

      expect(flowNodes.some((n) => n.id === 'group:B')).toBe(true);
      expect(flowNodes.some((n) => n.id === '2')).toBe(true);
    });
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

  it('draws node→node when both endpoints expand, and falls back to the parent GROUP FRAME when the parent node is culled (cross-group connection stays visible on zoom-in)', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'B', 1)];

    // 부모(A)만 펼침 → 자식(2)이 flowNodes에 없으니 어떤 노드 간선도 안 생긴다.
    const onlyParent = toFlow(nodes, createLayoutEngine(), { shouldExpandGroup: (_f, group) => group === 'A' });
    expect(onlyParent.flowEdges).toHaveLength(0);

    // 자식(B)만 펼침 → 부모 노드는 뷰포트 컬링됐지만, 크로스-그룹이라 연결을 버리지 않고 부모의
    // 그룹 프레임(group:A)으로 폴백 간선을 만든다. 예전엔 여기서 0개라 확대 시 연결이 사라졌다.
    const onlyChild = toFlow(nodes, createLayoutEngine(), { shouldExpandGroup: (_f, group) => group === 'B' });
    const childEdges = onlyChild.flowEdges;
    expect(childEdges).toHaveLength(1);
    expect(childEdges[0].source).toBe('group:A'); // 부모 그룹 프레임
    expect(childEdges[0].target).toBe('2');
    expect(childEdges[0].className).toContain('edge-cross-group-frame');

    // 둘 다 펼침 → 정확한 노드↔노드 간선(프레임 폴백 아님).
    const both = toFlow(nodes, createLayoutEngine(), { shouldExpandGroup: () => true }).flowEdges;
    expect(both).toHaveLength(1);
    expect(both[0].id).toBe('1->2');
    expect(both[0].source).toBe('1');
    expect(both[0].target).toBe('2');
    expect(both[0].className).not.toContain('edge-cross-group-frame');
  });

  it('styles cross-group edges with edge-cross-group className and a higher zIndex than same-group edges', () => {
    const crossGroupNodes = [vnode(1, 'A'), vnode(2, 'B', 1)];
    const engine = createLayoutEngine();
    const { flowEdges: crossEdges } = toFlow(crossGroupNodes, engine, { shouldExpandGroup: () => true });
    // 그룹 간 간선: 점선(edge-cross-group) + 부모 도메인 색(edge-parent-palette-N, ADR-0044 후속).
    expect(crossEdges[0].className).toContain('edge-cross-group');
    expect(crossEdges[0].className).toMatch(/edge-parent-palette-\d/);
    expect(crossEdges[0].zIndex).toBe(10);

    const sameGroupNodes = [vnode(1, 'A'), vnode(2, 'A', 1)];
    const engine2 = createLayoutEngine();
    const { flowEdges: sameEdges } = toFlow(sameGroupNodes, engine2, { shouldExpandGroup: () => true });
    // 그룹 내 간선: 깊이 감쇠 클래스(7절 a) + 부모 도메인 색.
    expect(sameEdges[0].className).toContain('edge-same-group');
    expect(sameEdges[0].className).toContain('edge-depth-1');
    expect(sameEdges[0].className).not.toContain('edge-detail');
    expect(sameEdges[0].className).toMatch(/edge-parent-palette-\d/);
    expect(sameEdges[0].zIndex).toBe(1);
  });

  it('keeps same-group edge identity stable while bucketing only its visual depth attenuation', () => {
    // A 그룹 안의 사슬: 1 → 2 → 3 → 4 → 5 (전부 같은 그룹). 그룹 내 깊이 1,2,3,4로 증가.
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'A', 2), vnode(4, 'A', 3), vnode(5, 'A', 4)];
    const engine = createLayoutEngine();
    const { flowEdges } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
    const byId = new Map(flowEdges.map((e) => [e.id, e.className ?? '']));

    // 깊이 3부터도 별도 LOD 의미를 붙이지 않고, opacity용 버킷만 3에서 포화한다.
    expect(byId.get('1->2')).toContain('edge-depth-1');
    expect(byId.get('2->3')).toContain('edge-depth-2');
    expect(byId.get('3->4')).toContain('edge-depth-3');
    expect(byId.get('4->5')).toContain('edge-depth-3');
    expect([...byId.values()].every((className) => !className.includes('edge-detail'))).toBe(true);
  });

  it('resets group depth at group boundaries so a child entering a new group starts shallow', () => {
    // A(1) → B(2) → B(3): 2는 B로 새로 진입(그룹 경계, 깊이 리셋), 3은 B 안에서 깊이 1.
    const nodes = [vnode(1, 'A'), vnode(2, 'B', 1), vnode(3, 'B', 2)];
    const engine = createLayoutEngine();
    const { flowEdges } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
    const byId = new Map(flowEdges.map((e) => [e.id, e.className ?? '']));
    expect(byId.get('1->2')).toContain('edge-cross-group'); // 그룹 경계
    expect(byId.get('2->3')).toContain('edge-same-group'); // 리셋 후 얕음
    expect(byId.get('2->3')).toContain('edge-depth-1');
  });

  it('does not replace collapsed parent→child relations with file-level aggregate edges', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'B', 1), vnode(3, 'C', 2)];
    const { flowEdges } = toFlow(nodes, createLayoutEngine(), { shouldExpandGroup: () => false });

    expect(flowEdges).toEqual([]);
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

  describe('isRouteGroup (도형 어휘 — 라우트 판별, ADR-0028)', () => {
    it('matches Next.js App Router route entry files', () => {
      expect(isRouteGroup('app/dashboard/page.tsx')).toBe(true);
      expect(isRouteGroup('src/app/(marketing)/page.jsx')).toBe(true);
      expect(isRouteGroup('page.ts')).toBe(true);
    });
    it('rejects ordinary component/domain groups', () => {
      expect(isRouteGroup('domains/checkout')).toBe(false);
      expect(isRouteGroup('components/PageHeader.tsx')).toBe(false); // "page" 안 붙은 파일명 오탐 방지
      expect(isRouteGroup(PENDING_GROUP)).toBe(false);
    });
  });

  describe('isRouteEntry (라우트 6각형 파생, ADR-0028)', () => {
    it('marks a route-group node that has no parent as a route entry', () => {
      const nodes = [vnode(1, 'app/dashboard/page.tsx')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
      expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).isRouteEntry).toBe(true);
    });

    it('marks the group-crossing entry node, but NOT inline children in the same route group', () => {
      // node 1: route-group root (entry). node 2: child in the SAME route group (inline child, not an entry).
      const nodes = [vnode(1, 'app/dashboard/page.tsx'), vnode(2, 'app/dashboard/page.tsx', 1)];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
      expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).isRouteEntry).toBe(true);
      expect((flowNodes.find((n) => n.id === '2')!.data as ComponentNodeData).isRouteEntry).toBe(false);
    });

    it('marks a node whose parent lives in a different group as a route entry (group boundary)', () => {
      const nodes = [vnode(1, 'domains/shell'), vnode(2, 'app/settings/page.tsx', 1)];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
      expect((flowNodes.find((n) => n.id === '2')!.data as ComponentNodeData).isRouteEntry).toBe(true);
    });

    it('never marks a node in a non-route group as a route entry', () => {
      const nodes = [vnode(1, 'domains/checkout')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
      expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).isRouteEntry).toBe(false);
    });

    it('never marks a host node as a route entry even at a route-group boundary (role, not host)', () => {
      const hostRoot: VisibleNode = {
        id: 1,
        displayName: 'div',
        kind: 'host',
        parentId: null,
        group: 'app/dashboard/page.tsx',
        isAnonymous: false,
      };
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow([hostRoot], engine, { shouldExpandGroup: () => true });
      expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).isRouteEntry).toBe(false);
    });
  });

  describe('colorMode passthrough (손그림 다크 테두리 선택, ADR-0030)', () => {
    it('defaults component nodes to light mode when colorMode is omitted', () => {
      const nodes = [vnode(1, 'A')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true });
      expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).colorMode).toBe('light');
    });

    it('passes the given colorMode onto every component node', () => {
      const nodes = [vnode(1, 'A')];
      const engine = createLayoutEngine();
      const { flowNodes } = toFlow(nodes, engine, { shouldExpandGroup: () => true, colorMode: 'dark' });
      expect((flowNodes.find((n) => n.id === '1')!.data as ComponentNodeData).colorMode).toBe('dark');
    });
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

// ── 폴더 단위 2단 중첩(ADR-0053) ──
function pvnode(id: number, group: string, groupPath: string, parentId: number | null = null): VisibleNode {
  return { id, displayName: `Node${id}`, kind: 'composite', parentId, group, groupPath, isAnonymous: false };
}

describe('toFlow with nestFolders', () => {
  const nodes = [
    pvnode(1, 'Panel.tsx', '/src/domains/dataflow/Panel.tsx'),
    pvnode(2, 'Demo.tsx', '/src/domains/dataflow/Demo.tsx'),
  ];

  it('emits a folder frame node before its member group frames (parent-before-child)', () => {
    const { flowNodes } = toFlow(nodes, createLayoutEngine(), {
      shouldExpandGroup: () => true,
      nestFolders: true,
    });
    const folder = flowNodes.find((n) => n.type === 'folder')!;
    expect(folder.id).toBe('folder:/src/domains/dataflow');
    expect((folder.data as { label: string }).label).toBe('dataflow');
    expect((folder.data as { count: number }).count).toBe(2);
    expect(folder.zIndex).toBe(-2);

    const folderIdx = flowNodes.findIndex((n) => n.id === 'folder:/src/domains/dataflow');
    const groupIdx = flowNodes.findIndex((n) => n.id === 'group:Panel.tsx');
    expect(folderIdx).toBeLessThan(groupIdx); // 부모가 먼저
  });

  it('parents member group frames to the folder with folder-relative positions', () => {
    const { flowNodes } = toFlow(nodes, createLayoutEngine(), {
      shouldExpandGroup: () => true,
      nestFolders: true,
    });
    const folder = flowNodes.find((n) => n.type === 'folder')!;
    const group = flowNodes.find((n) => n.id === 'group:Panel.tsx')!;
    expect(group.parentId).toBe('folder:/src/domains/dataflow');
    expect(group.extent).toBe('parent');
    // 폴더-상대 위치 + 폴더 월드 위치 = 그룹 월드 위치(레이아웃 frame과 일치).
    const refFrame = createLayoutEngine()
      .computeLayout(nodes, { nestFolders: true })
      .groups.find((g) => g.group === 'Panel.tsx')!.frame;
    expect(group.position.x + (folder.position.x as number)).toBeCloseTo(refFrame.x);
    expect(group.position.y + (folder.position.y as number)).toBeCloseTo(refFrame.y);
  });

  it('emits no folder frames when nestFolders is off (flat, unchanged)', () => {
    const { flowNodes } = toFlow(nodes, createLayoutEngine(), { shouldExpandGroup: () => true });
    expect(flowNodes.some((n) => n.type === 'folder')).toBe(false);
    expect(flowNodes.find((n) => n.id === 'group:Panel.tsx')!.parentId).toBeUndefined();
  });
});

describe('toFlow compact projection', () => {
  it('keeps the strict group structure and actual edges when no local summary is needed', () => {
    const nodes = [vnode(1, 'A'), vnode(2, 'A', 1), vnode(3, 'B', 2)];
    const { flowNodes, flowEdges } = toFlow(nodes, createLayoutEngine(), {
      shouldExpandGroup: () => true,
      compactMode: true,
    });

    expect(flowNodes.filter((node) => node.type === 'group')).toHaveLength(2);
    expect(flowNodes.filter((node) => node.type === 'component').map((node) => node.id).sort()).toEqual(['1', '2', '3']);
    expect(flowEdges.map((edge) => edge.id).sort()).toEqual(['1->2', '2->3']);
    expect(flowEdges.some((edge) => String(edge.className).includes('compact-summary'))).toBe(false);
  });

  it('summarizes one parent source fan-out, not an arbitrary file group', () => {
    // 가장 넓어지는 형태는 한 파일 안에서 부모가 많은 직접 자식을 렌더하는 경우다.
    const nodes = [vnode(1, 'Root'), vnode(2, 'Root', 1)];
    for (let index = 0; index < 13; index++) nodes.push(vnode(index + 3, 'Root', 2));

    const { flowNodes, flowEdges } = toFlow(nodes, createLayoutEngine(), {
      shouldExpandGroup: () => true,
      compactMode: true,
    });

    const summary = flowNodes.find((node) => node.id === 'summary:2')!;
    expect((summary.data as ComponentNodeData).compactSummary).toMatchObject({ directChildCount: 13, descendantCount: 13 });
    expect(flowNodes.some((node) => node.id === 'group:Root')).toBe(true);
    expect(flowNodes.some((node) => node.id === '3')).toBe(false);
    expect(flowEdges.some((edge) => edge.id === '2->summary:2')).toBe(true);
    expect((flowNodes.find((node) => node.id === '2')!.data as ComponentNodeData).compactControl).toBeUndefined();
  });

  it('restores only the selected summary source to strict waterfall', () => {
    const nodes = [vnode(1, 'Root'), vnode(2, 'Root', 1)];
    for (let index = 0; index < 4; index++) nodes.push(vnode(index + 3, 'Root', 2));

    const { flowNodes } = toFlow(nodes, createLayoutEngine(), {
      shouldExpandGroup: () => true,
      compactMode: true,
      compactExpandedSources: new Set([2]),
    });

    expect(flowNodes.some((node) => node.id === 'summary:2')).toBe(false);
    expect(flowNodes.filter((node) => node.type === 'component').map((node) => node.id).sort()).toEqual(['1', '2', '3', '4', '5', '6']);
    expect((flowNodes.find((node) => node.id === '2')!.data as ComponentNodeData).compactControl).toMatchObject({ directChildCount: 4 });
  });
});
