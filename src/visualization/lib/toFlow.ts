import type { Edge, Node } from '@xyflow/react';
import type { VisibleNode } from './normalize';
import { PENDING_GROUP } from './normalize';
import { NODE_HEIGHT, NODE_WIDTH, type LayoutEngine, type Rect } from './layout';
import { colorIndexForGroup } from './groupColor';
import type { BorderMode } from './roughStyle';
import type { RoleMarker } from './roleMarkers';

// 라우트 진입점 판별(ADR-0028 도형 어휘 — 6각형). RenderNode 스키마를 건드리지 않고, 이미
// 있는 그룹 경로(= 그 노드의 groupHint가 resolve된 값, groups.ts)가 Next.js App Router의
// 라우트 진입 파일(app/.../page.tsx)로 끝나는지만 본다. tsx 외에 jsx/ts/js도 관용적으로 받는다.
export function isRouteGroup(group: string): boolean {
  return /(^|[/\\])page\.(tsx|jsx|ts|js)$/.test(group);
}

// 간선 클러터 감쇠 튜닝 상수(ADR-0029 결정 #4). 연구문서 7절 b가 정한 "구조 간선 = 그룹
// 횡단 + 깊이 1~2"를 형식화한 값이다.
// - STRUCTURAL_GROUP_DEPTH: 그룹 내 이 깊이까지는 구조 간선으로 보고 중간 줌(zoom-mid)에서도
//   표시한다. 넘으면 detail로 분류돼 상세히 줌인해야 나타난다.
// - EDGE_DEPTH_MAX: 시각적 감쇠(opacity) 깊이 클래스의 상한. 이 값은 "N 이상"을 뜻하는 마지막
//   버킷이자 detail 버킷과 일치한다(STRUCTURAL_GROUP_DEPTH + 1).
export const STRUCTURAL_GROUP_DEPTH = 2;
export const EDGE_DEPTH_MAX = 3;

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
  /** 라우트 진입점(app/.../page.tsx)이라 6각형으로 그릴 노드인지 (도형 어휘, ADR-0028).
   * RenderNode 스키마와 무관하게 group 경로 + 그룹 경계 진입 여부로 파생한 순수 프레젠테이션 값. */
  isRouteEntry: boolean;
  /** 손그림 테두리(roughStyle.ts)의 라이트/다크 변형 선택용 (ADR-0030 다크 대응 4장).
   * 인라인 background-image가 CSS보다 우선하므로 CSS 다크 스코프로는 못 바꾼다 — data로 내려받는다. */
  colorMode: BorderMode;
  /** 리스트 접기(ADR-0046): 같은 종류 형제 N개를 이 노드 하나로 접었으면 그 N. undefined면 안 접음.
   * "×N" 배지로 표시한다. */
  coalescedCount?: number;
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
  /** 프레임 크기 — 펼쳐진 그룹의 손그림 테두리(roughStyle.groupFrameImage)를 실제 크기에 맞춰
   * 그리기 위해 내려준다(ADR-0030 축3). */
  width: number;
  height: number;
  /** 손그림 프레임 테두리의 라이트/다크 변형 선택 (ADR-0030). 인라인 background-image가 CSS보다
   * 우선하므로 data로 내려받는다(ComponentNodeData.colorMode와 같은 이유). */
  colorMode: BorderMode;
  /** 이 그룹 안에 있는 경계 종류들(도형 어휘 wideview 레이어, ADR-0028). 지도 모드에선 개별 경계
   * 프레임이 안 보이므로, 그룹 프레임 바깥에 경계 색 동심 링을 덧대 "이 도메인에 포탈/Suspense/
   * 에러 바운더리가 있다"를 모든 줌에서 알린다. Canvas가 fibersById 파생으로 채운다(스키마 무관). */
  boundaryKinds?: RoleMarker[];
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
  /** 손그림 테두리(roughStyle.ts)의 라이트/다크 변형 선택 (ADR-0030). 생략하면 'light'. */
  colorMode?: BorderMode;
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
    colorMode = 'light',
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
  const renderedGroups = new Set<string>();

  for (const g of groups) {
    const pending = g.group === PENDING_GROUP;
    if (filtering && !g.nodeIds.some((id) => matchedIds!.has(id))) continue; // 매치가 하나도 없는 그룹은 프레임째로 뺀다
    renderedGroups.add(g.group);
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
        width: g.frame.width,
        height: g.frame.height,
        colorMode,
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
      // 라우트 진입점 = 그룹이 page.tsx이고, 이 노드가 그 그룹으로 처음 "들어오는" 지점
      // (부모가 없거나 다른 그룹). 같은 page 그룹 안의 인라인 자식까지 전부 6각형이 되지
      // 않게 진입 경계 노드만 표식한다. host 노드는 역할이 아니므로 제외.
      const isRouteEntry =
        n.kind === 'composite' && isRouteGroup(n.group) && (parent === null || parent === undefined || crossGroup);

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
          isRouteEntry,
          colorMode,
          coalescedCount: n.coalescedCount,
        } satisfies ComponentNodeData,
      });
      expandedIds.add(id);
    }
  }

  // 간선 클러터 감쇠(ADR-0029 결정 #4, 연구문서 7절 a·b). 배선(경로 모양)이 아니라 표현
  // 레이어(스타일/LOD)로만 뺴곡함을 줄인다. 원칙: 잉크를 정보 가치에 비례시킨다 — 그룹 내
  // 간선은 정보가 이미 위치에 함축돼 있고(자식은 부모 바로 아래 행) 그룹 간 간선만 위치로
  // 예측 불가능하다. 그래서 그룹 내는 깊을수록 옅게 죽이고, 그룹 간(edge-cross-group)은 현행
  // 강도(주황 점선)를 그대로 둔다.
  const groupDepthCache = new Map<number, number>();
  // 그룹 내 깊이 = 같은 그룹 조상을 몇 번 거슬러 올라가야 그룹 경계(다른 그룹 부모/루트)에
  // 닿는가. 그룹 경계를 넘으면 0으로 리셋되므로 "이 그룹 서브트리 안에서 얼마나 깊은가"만
  // 잰다. 노드 좌표의 순수 함수라 라이브 안정성은 레이아웃에서 상속된다(ADR-0008).
  function groupDepthOf(id: number): number {
    const cached = groupDepthCache.get(id);
    if (cached !== undefined) return cached;
    const n = byId.get(id);
    if (!n || n.parentId === null) {
      groupDepthCache.set(id, 0);
      return 0;
    }
    const parent = byId.get(n.parentId);
    if (!parent || parent.group !== n.group) {
      groupDepthCache.set(id, 0);
      return 0;
    }
    const d = groupDepthOf(n.parentId) + 1;
    groupDepthCache.set(id, d);
    return d;
  }

  // 자식(n)이 펼쳐진 간선만 만든다. 부모까지 둘 다 펼쳐졌으면 노드↔노드로 정확히 잇고, 부모
  // 노드가 뷰포트 컬링(ADR-0017)으로 안 펼쳐졌으면(크로스-그룹에서만 발생 — 같은-그룹은 그룹
  // 단위로 함께 펼쳐지므로) 간선을 버리지 않고 부모의 "그룹 프레임"(항상 렌더됨)으로 잇는다.
  // → 확대해서 부모 도메인이 화면 밖으로 나가도 "저쪽 도메인에서 들어오는 연결"이 계속 보인다
  //   (예전엔 이때 크로스-그룹 간선이 DOM에서 통째로 사라져, 지도 모드에서 보이던 연결이 확대하면
  //   없어지는 버그가 있었다).
  const flowEdges: Edge[] = nodes
    .filter((n) => n.parentId !== null && expandedIds.has(n.id))
    .flatMap((n): Edge[] => {
      const parent = byId.get(n.parentId!)!;
      const crossGroup = parent.group !== n.group;
      // 간선 색 = 부모(출발) 노드의 도메인 색(선 정체성, ADR-0044/0047). 세 채널을 직교로 쓴다:
      // opacity=깊이 감쇠, 색(hue)=부모 도메인, 선 스타일=그룹 내(실선)/경계(점선, edge-cross-group).
      // pending 그룹은 색 미배정(중립 유지).
      const parentPalette = parent.group === PENDING_GROUP ? '' : ` edge-parent-palette-${colorIndexForGroup(parent.group)}`;

      if (!expandedIds.has(n.parentId!)) {
        // 부모 노드가 컬링됨 → 부모 그룹 프레임으로 잇는 폴백. 여기 도달하면 크로스-그룹뿐이고
        // (같은-그룹은 자식이 펼쳐졌다면 부모도 펼쳐졌다), 부모 그룹 프레임이 실제로 렌더된
        // 경우에만 만든다(pending·필터로 빠진 그룹 제외).
        if (!crossGroup || parent.group === PENDING_GROUP || !renderedGroups.has(parent.group)) return [];
        return [
          {
            id: `group:${parent.group}->${n.id}`,
            source: `group:${parent.group}`,
            target: String(n.id),
            // 크로스-그룹은 그룹 프레임을 피해 배선하는 커스텀 직교 간선(ADR-0029 §5). 같은-그룹
            // 버스는 smoothstep으로 충분(이미 중점 채널 공유로 버스 정렬)이라 그대로 둔다.
            type: 'ortho',
            className: `edge-cross-group edge-cross-group-frame${parentPalette}`,
            zIndex: 10,
          },
        ];
      }

      if (crossGroup) {
        // 그룹 간 간선: 프레임 회피 직교 배선(ortho) + 점선(경계) + 부모 도메인 색.
        return [
          {
            id: `${n.parentId}->${n.id}`,
            source: String(n.parentId),
            target: String(n.id),
            type: 'ortho',
            className: `edge-cross-group${parentPalette}`,
            zIndex: 10,
          },
        ];
      }
      const base = {
        id: `${n.parentId}->${n.id}`,
        source: String(n.parentId),
        target: String(n.id),
        type: 'smoothstep',
      } as const;
      // 그룹 내 간선: 깊이 버킷(1..EDGE_DEPTH_MAX)으로 감쇠. STRUCTURAL_GROUP_DEPTH를 넘는 깊은
      // 간선은 edge-detail로 표시해 단계형 LOD(중간 줌)에서 숨긴다(flow.css .zoom-mid).
      const depth = groupDepthOf(n.id); // 같은 그룹 부모가 있으므로 항상 >= 1
      const bucket = Math.min(depth, EDGE_DEPTH_MAX);
      const detail = depth > STRUCTURAL_GROUP_DEPTH;
      const className = `edge-same-group edge-depth-${bucket}${detail ? ' edge-detail' : ''}${parentPalette}`;
      return [{ ...base, className, zIndex: 1 }];
    });

  // 그룹↔그룹 집계 엣지(ADR-0034): 노드 레벨 엣지는 양쪽 노드가 둘 다 펼쳐졌을 때만 그려져
  // 지도 모드(그룹이 전부 접힘)에선 하나도 안 보인다. 그래서 "부모 그룹이 자식 그룹을
  // 렌더한다"는 관계를 그룹당 1개로 집계한 엣지로 따로 그린다. flow.css가 이 엣지를 지도
  // 모드(.zoom-far)에서만 보이게 하고 상세 모드에선 숨긴다(그땐 노드 레벨 엣지가 대신 보임).
  const groupPairs = new Set<string>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const parent = byId.get(n.parentId);
    if (!parent || parent.group === n.group) continue;
    if (parent.group === PENDING_GROUP || n.group === PENDING_GROUP) continue;
    groupPairs.add(`${parent.group}\n${n.group}`);
  }
  for (const pair of groupPairs) {
    const [parentGroup, childGroup] = pair.split('\n');
    if (!renderedGroups.has(parentGroup) || !renderedGroups.has(childGroup)) continue;
    flowEdges.push({
      id: `group:${parentGroup}->group:${childGroup}`,
      source: `group:${parentGroup}`,
      target: `group:${childGroup}`,
      type: 'smoothstep',
      className: 'edge-group-link',
      zIndex: 5,
      selectable: false,
      focusable: false,
    });
  }

  return { flowNodes, flowEdges };
}
