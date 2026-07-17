import type { Edge, Node } from '@xyflow/react';
import type { VisibleNode } from './normalize';
import { PENDING_GROUP } from './normalize';
import { NODE_HEIGHT, NODE_WIDTH, type LayoutEngine, type Rect } from './layout';

export interface ComponentNodeData extends Record<string, unknown> {
  displayName: string;
  kind: 'host' | 'composite';
  isAnonymous: boolean;
  crossGroup: boolean;
  pending: boolean;
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  count: number;
  pending: boolean;
  /** 뷰포트 밖(또는 지도 모드)이라 자식 노드를 펼치지 않은 그룹인지 (ADR-0016 ①). */
  collapsed: boolean;
}

export interface ToFlowOptions {
  /**
   * 이 그룹의 자식 컴포넌트 노드/엣지를 실제로 만들지 결정한다. false를 반환하면 그룹
   * 프레임(라벨+개수)만 만들고 내부 자식·엣지는 만들지 않는다.
   *
   * 뷰포트 기반 부분 재계산(ADR-0016 ①)의 핵심 장치 — 프로파일링 결과 `onlyRenderVisibleElements`는
   * 화면 밖 노드의 "실제 렌더"만 건너뛸 뿐, React Flow가 `nodes` 배열의 모든 원소마다 치르는
   * 내부 wrapper 처리 비용(수천 개 규모에서 지배적 비용)은 줄이지 못했다 — 배열 자체에서
   * 아예 빼야 그 비용이 사라진다.
   */
  shouldExpandGroup: (frame: Rect, group: string) => boolean;
}

export function toFlow(
  nodes: VisibleNode[],
  engine: LayoutEngine,
  { shouldExpandGroup }: ToFlowOptions,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const { groups, nodePositions } = engine.computeLayout(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const flowNodes: Node[] = [];
  const expandedIds = new Set<number>();

  for (const g of groups) {
    const pending = g.group === PENDING_GROUP;
    const expanded = shouldExpandGroup(g.frame, g.group);
    flowNodes.push({
      id: `group:${g.group}`,
      type: 'group',
      position: { x: g.frame.x, y: g.frame.y },
      style: { width: g.frame.width, height: g.frame.height },
      data: {
        label: pending ? '(그룹 확인 중…)' : g.group,
        count: g.nodeIds.length,
        pending,
        collapsed: !expanded,
      } satisfies GroupNodeData,
      selectable: false,
      draggable: false,
      zIndex: -1,
    });

    if (!expanded) continue;

    for (const id of g.nodeIds) {
      const n = byId.get(id)!;
      const pos = nodePositions.get(id)!;
      const parent = n.parentId !== null ? byId.get(n.parentId) : null;
      const crossGroup = !!parent && parent.group !== n.group;

      flowNodes.push({
        id: String(n.id),
        type: 'component',
        parentId: `group:${g.group}`,
        extent: 'parent',
        position: pos,
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
        data: {
          displayName: n.displayName,
          kind: n.kind,
          isAnonymous: n.isAnonymous,
          crossGroup,
          pending,
        } satisfies ComponentNodeData,
      });
      expandedIds.add(id);
    }
  }

  const flowEdges: Edge[] = nodes
    .filter((n) => n.parentId !== null && expandedIds.has(n.id) && expandedIds.has(n.parentId))
    .map((n) => {
      const parent = byId.get(n.parentId!)!;
      const crossGroup = parent.group !== n.group;
      return {
        id: `${n.parentId}->${n.id}`,
        source: String(n.parentId),
        target: String(n.id),
        type: 'smoothstep',
        className: crossGroup ? 'edge-cross-group' : undefined,
        zIndex: crossGroup ? 10 : 1,
      } satisfies Edge;
    });

  return { flowNodes, flowEdges };
}
