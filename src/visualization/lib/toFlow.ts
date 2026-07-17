import type { Edge, Node } from '@xyflow/react';
import type { VisibleNode } from './normalize';
import { PENDING_GROUP } from './normalize';
import { NODE_HEIGHT, NODE_WIDTH, type LayoutEngine, type Rect } from './layout';
import { colorIndexForGroup } from './groupColor';

export interface ComponentNodeData extends Record<string, unknown> {
  displayName: string;
  kind: 'host' | 'composite';
  isAnonymous: boolean;
  crossGroup: boolean;
  pending: boolean;
  /** 보드↔DOM 양방향 인터랙션의 역방향(DOM 클릭 → 보드 이동)이 착지한 노드인지 (ADR-0024/0025).
   * RenderNode 스키마와 무관한 순수 프레젠테이션 상태 — data 레이어는 이 값을 모른다. */
  highlighted: boolean;
  /** 지금 검색어에 매치되는 노드인지(검색+자동 이동 기능). 없으면(검색어 없음) 전부 false. */
  matched: boolean;
  /** 도메인별 커스텀 팔레트(groupColor.ts)에서 이 노드가 속한 그룹에 배정된 팔레트 인덱스.
   * PENDING_GROUP(그룹 미해석)이면 중립 유지를 위해 undefined. */
  colorIndex?: number;
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  count: number;
  pending: boolean;
  /** 뷰포트 밖(또는 지도 모드)이라 자식 노드를 펼치지 않은 그룹인지 (ADR-0016 ①). */
  collapsed: boolean;
  /** 도메인별 커스텀 팔레트에서 이 그룹에 배정된 팔레트 인덱스. PENDING_GROUP이면 undefined. */
  colorIndex?: number;
  /** 사용자가 헤더 셰브런으로 명시적으로 접었는지(그룹 접기/펼치기, ADR-0029). `collapsed`(뷰포트/
   * 지도 모드로 인한 자동 접힘)와는 별개 개념 — 헤더 아이콘은 이 값을 기준으로 그린다. */
  manuallyCollapsed: boolean;
  /** 헤더 셰브런 클릭 시 이 그룹의 manuallyCollapsed를 토글한다. */
  onToggleCollapse: () => void;
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
  /** 지금 강조 표시할 노드 id (ADR-0024/0025 역방향 인터랙션). 없으면 아무 노드도 강조 안 함. */
  highlightedNodeId?: number | null;
  /** 지금 검색어에 매치되는 노드 id 집합. 없으면(검색 비활성) 아무 노드도 매치 안 함. */
  matchedIds?: ReadonlySet<number>;
  /** true면 matchedIds에 없는 그룹/노드는 강조+흐림이 아니라 아예 안 만든다(그룹+개별 동시
   * 필터). matchedIds가 비어 있으면(검색어 없음) 무시된다 — 검색창이 빈 채로 필터만 켜져
   * 있다고 화면이 통째로 비면 안 되기 때문이다. */
  filterToMatches?: boolean;
  /** 사용자가 명시적으로 접은 그룹 이름 집합(그룹 접기/펼치기, ADR-0029). 없으면 아무 그룹도
   * 수동으로 접히지 않은 것으로 취급한다. */
  manuallyCollapsedGroups?: ReadonlySet<string>;
  /** 그룹 헤더의 접기/펼치기 셰브런 클릭 시 호출할 콜백. 그룹 이름을 인자로 받는다. */
  onToggleGroupCollapse?: (group: string) => void;
}

export function toFlow(
  nodes: VisibleNode[],
  engine: LayoutEngine,
  {
    shouldExpandGroup,
    highlightedNodeId = null,
    matchedIds,
    filterToMatches,
    manuallyCollapsedGroups,
    onToggleGroupCollapse,
  }: ToFlowOptions,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const { groups, nodePositions } = engine.computeLayout(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 그룹+개별 동시 필터(ADR-미정) — matchedIds가 실제로 뭔가를 담고 있을 때만 켠다. 검색어가
  // 비어 있으면(matchedIds.size === 0) filterToMatches가 true여도 무시해 화면이 통째로
  // 비지 않게 한다.
  const filtering = !!filterToMatches && !!matchedIds && matchedIds.size > 0;

  const flowNodes: Node[] = [];
  const expandedIds = new Set<number>();

  for (const g of groups) {
    const pending = g.group === PENDING_GROUP;
    if (filtering && !g.nodeIds.some((id) => matchedIds!.has(id))) continue; // 매치가 하나도 없는 그룹은 프레임째로 뺀다
    const expanded = shouldExpandGroup(g.frame, g.group);
    // 도메인별 커스텀 팔레트: 그룹이 아직 해석 안 됐으면(pending) 중립 유지를 위해 색을 안
    // 매긴다 — expand 여부와 무관하게 계산해서, 접힌(뷰포트 밖/지도 모드) 그룹 프레임도
    // 지도 모드에서부터 도메인 색이 바로 보인다(ui-philosophy.md의 "지도" 은유와 직결).
    const colorIndex = pending ? undefined : colorIndexForGroup(g.group);
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
        colorIndex,
        manuallyCollapsed: manuallyCollapsedGroups?.has(g.group) ?? false,
        onToggleCollapse: () => onToggleGroupCollapse?.(g.group),
      } satisfies GroupNodeData,
      selectable: false,
      draggable: false,
      zIndex: -1,
    });

    if (!expanded) continue;

    for (const id of g.nodeIds) {
      if (filtering && !matchedIds!.has(id)) continue; // 그룹 안에서도 매치 안 된 개별 노드는 뺀다
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
          highlighted: n.id === highlightedNodeId,
          matched: matchedIds?.has(n.id) ?? false,
          colorIndex,
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
