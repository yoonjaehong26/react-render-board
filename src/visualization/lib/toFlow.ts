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

// 그룹 내 깊이별 시각 감쇠의 마지막 버킷. 3은 "3 이상"을 뜻한다. 확대율에 따라 관계선을
// 다른 표현으로 바꾸지 않으며, 이 값은 오직 잉크 강도에만 영향을 준다(ADR-0090).
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
  /** 공유 UI 레인(pillar ②): 이 노드가 렌더하는 공유 컨테이너 그룹 키들. 있으면 "↗X" 인라인
   * 칩으로 표시(상시 긴 선 대신 로컬 표식). 전체 연결은 노드 호버 시 점등. */
  sharedUses?: string[];
  /** 칩 클릭 시 인라인 peek이 보여줄, 각 공유 컨테이너의 멤버 컴포넌트 이름들(그룹 키 → 이름 배열). */
  sharedMembers?: Record<string, string[]>;
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  count: number;
  pending: boolean;
  /** 뷰포트 밖(또는 지도 모드)이라 자식 노드를 펼치지 않은 그룹인지 (ADR-0017 결정 1). */
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
  /** 공유 UI 레인(pillar ②): 다중 부모라 아래 공유 밴드에 놓인 그룹인지. 레인 스타일 적용. */
  shared?: boolean;
  /** 공유 그룹의 사용처(부모) 수 — "×N 사용" 배지. */
  usageCount?: number;
}

/** 폴더 프레임(폴더 단위 2단 중첩, ADR-0053) — 파일 그룹(GroupNode) 여러 개를 감싸는 바깥 프레임.
 * GroupNodeData와 별도 타입/노드('folder')로 둔다 — 파일 프레임 고유 관심사(rough 테두리/경계 링/
 * heat/팔레트)를 안 섞고, boundaryFrames.ts가 `type==='group'`으로 키잉해 폴더를 자동 무시하게. */
export interface FolderNodeData extends Record<string, unknown> {
  /** 폴더 표시명(경로 마지막 세그먼트). 전체 경로는 title로 따로 보여준다. */
  label: string;
  /** 전체 경로(툴팁/식별용). */
  path: string;
  /** 이 폴더 안 컴포넌트 노드 총수(멤버 파일 그룹들의 합). */
  count: number;
  width: number;
  height: number;
}

export interface ToFlowOptions {
  /**
   * 이 그룹의 자식 컴포넌트 노드/엣지를 실제로 만들지 결정한다. false를 반환하면 그룹
   * 프레임(라벨+개수)만 만들고 내부 자식·엣지는 만들지 않는다.
   *
   * 뷰포트 기반 부분 재계산(ADR-0017 결정 1)의 핵심 장치 — 프로파일링 결과 `onlyRenderVisibleElements`는
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
  /** 폴더 단위 2단 중첩(ADR-0053). true면 파일 그룹을 상위 폴더 프레임으로 묶는다. 기본 false. */
  nestFolders?: boolean;
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
    nestFolders = false,
  }: ToFlowOptions,
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const { groups, folders, nodePositions } = engine.computeLayout(nodes, { nestFolders });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 공유 UI 레인(pillar ②): 다중 부모라 아래 레인으로 빠진 그룹들.
  const sharedGroupSet = new Set(groups.filter((g) => g.shared).map((g) => g.group));
  // 사용처 인라인 칩(pillar ②): 상시 긴 선 대신, 공유 컨테이너를 렌더하는 부모 노드에 "→X 공유"
  // 칩을 로컬로 붙인다(사용처→아래 레인까지 선을 안 그림 — 화면 가로지르는 긴 선 회피). 전체
  // 연결은 호버 시에만 점등(후속). 부모 노드 id → 렌더하는 공유 그룹 키들.
  const sharedUsesByParent = new Map<number, Set<string>>();
  for (const n of nodes) {
    if (n.parentId === null || !sharedGroupSet.has(n.group)) continue;
    const parent = byId.get(n.parentId);
    if (!parent || parent.group === n.group) continue;
    let set = sharedUsesByParent.get(n.parentId);
    if (!set) sharedUsesByParent.set(n.parentId, (set = new Set()));
    set.add(n.group);
  }
  // 공유 컨테이너별 멤버 컴포넌트 이름(중복 제거, 상한) — 칩 클릭 시 인라인 peek이 "접힌 실제
  // 인스턴스 내용"을 로컬에서 펼쳐 보여줄 재료. 컬링과 무관하게 전체 nodes에서 모은다.
  const sharedGroupMembers = new Map<string, string[]>();
  for (const n of nodes) {
    if (!sharedGroupSet.has(n.group)) continue;
    const arr = sharedGroupMembers.get(n.group) ?? [];
    if (arr.length < 10 && !arr.includes(n.displayName)) arr.push(n.displayName);
    sharedGroupMembers.set(n.group, arr);
  }

  // 그룹+개별 동시 필터(ADR-0033) — matchedIds가 실제로 뭔가를 담고 있을 때만 켠다. 검색어가
  // 비어 있으면(matchedIds.size === 0) filterToMatches가 true여도 무시해 화면이 통째로
  // 비지 않게 한다.
  const filtering = !!filterToMatches && !!matchedIds && matchedIds.size > 0;

  const flowNodes: Node[] = [];
  const expandedIds = new Set<number>();
  const renderedGroups = new Set<string>();

  // 폴더 프레임(ADR-0053) — 파일 그룹보다 먼저 push해야 React Flow의 부모-먼저 규칙을 만족한다
  // (중첩 그룹의 parentId=folder:<path>가 이미 존재하도록). 폴더 그룹핑이 꺼져 있으면 folders는
  // 빈 배열이라 이 루프는 아무 것도 안 만든다(= 기존 평면 동작).
  const groupLayoutByKey = new Map(groups.map((g) => [g.group, g]));
  const folderByKey = new Map(folders.map((f) => [f.folder, f]));
  for (const f of folders) {
    // 필터 중이면 매치 노드를 하나라도 가진 멤버 그룹이 있을 때만 폴더 프레임을 그린다.
    if (
      filtering &&
      !f.groupKeys.some((gk) => groupLayoutByKey.get(gk)?.nodeIds.some((id) => matchedIds!.has(id)))
    ) {
      continue;
    }
    const count = f.groupKeys.reduce((sum, gk) => sum + (groupLayoutByKey.get(gk)?.nodeIds.length ?? 0), 0);
    const slash = f.folder.lastIndexOf('/');
    flowNodes.push({
      id: `folder:${f.folder}`,
      type: 'folder',
      position: { x: f.frame.x, y: f.frame.y },
      style: { width: f.frame.width, height: f.frame.height },
      data: {
        label: slash >= 0 ? f.folder.slice(slash + 1) : f.folder,
        path: f.folder,
        count,
        width: f.frame.width,
        height: f.frame.height,
      } satisfies FolderNodeData,
      selectable: false,
      draggable: false,
      zIndex: -2,
    });
  }

  for (const g of groups) {
    const pending = g.group === PENDING_GROUP;
    if (filtering && !g.nodeIds.some((id) => matchedIds!.has(id))) continue; // 매치가 하나도 없는 그룹은 프레임째로 뺀다
    renderedGroups.add(g.group);
    const expanded = shouldExpandGroup(g.frame, g.group);
    // 중첩(ADR-0053): 폴더 안 파일 그룹은 folder:<path>의 자식이라 좌표를 폴더-상대로 변환한다.
    // shouldExpandGroup에는 항상 월드 frame(g.frame)을 넘겨 컬링 계약이 안 변한다(위 expanded).
    const parentFolderFrame = g.parentFolder ? folderByKey.get(g.parentFolder) : undefined;
    const groupPosition = parentFolderFrame
      ? { x: g.frame.x - parentFolderFrame.frame.x, y: g.frame.y - parentFolderFrame.frame.y }
      : { x: g.frame.x, y: g.frame.y };
    // 도메인별 커스텀 팔레트: 그룹이 아직 해석 안 됐으면(pending) 중립 유지를 위해 색을 안
    // 매긴다 — expand 여부와 무관하게 계산해서, 접힌(뷰포트 밖/지도 모드) 그룹 프레임도
    // 지도 모드에서부터 도메인 색이 바로 보인다(ui-philosophy.md의 "지도" 은유와 직결).
    const colorIndex = pending ? undefined : colorIndexForGroup(g.group);
    flowNodes.push({
      id: `group:${g.group}`,
      type: 'group',
      ...(parentFolderFrame ? { parentId: `folder:${g.parentFolder}`, extent: 'parent' as const } : {}),
      position: groupPosition,
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
        shared: g.shared,
        usageCount: g.parentCount,
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
          sharedUses: sharedUsesByParent.has(n.id) ? [...sharedUsesByParent.get(n.id)!] : undefined,
          sharedMembers: sharedUsesByParent.has(n.id)
            ? Object.fromEntries([...sharedUsesByParent.get(n.id)!].map((g) => [g, sharedGroupMembers.get(g) ?? []]))
            : undefined,
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
      const srcColorIndex = parent.group === PENDING_GROUP ? undefined : colorIndexForGroup(parent.group);
      const tgtColorIndex = n.group === PENDING_GROUP ? undefined : colorIndexForGroup(n.group);
      const parentPalette = srcColorIndex === undefined ? '' : ` edge-parent-palette-${srcColorIndex}`;
      // 크로스-그룹 간선에 실어주는 그라데이션 색 정보(ADR-0057). OrthoEdge가 출발→타깃 도메인 색
      // 그라데이션을 그려 "이 선이 어느 도메인에서 어느 도메인으로 가는지"를 색으로 보인다 —
      // 허브(한 도메인이 여럿을 렌더)에서 출발색이 전부 같아 구별이 안 되는 문제를 타깃색이 보완.
      const crossData = { sourceColorIndex: srcColorIndex, targetColorIndex: tgtColorIndex, colorMode };

      // 공유 UI 레인(pillar ②): 타깃 그룹이 공유(다중 부모)면 상시 선을 안 그린다 — 사용처→아래
      // 레인까지의 선은 화면을 가로지르는 긴 선이 되기 쉽다(설계 트레이드오프). 대신 사용처 부모에
      // 인라인 칩(sharedUsesByParent → ComponentNode)으로 로컬 표식만 하고, 전체 연결은 호버 시에만
      // 점등한다(후속). 여기서는 간선을 만들지 않는다.
      if (crossGroup && sharedGroupSet.has(n.group)) return [];

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
            data: crossData,
            zIndex: 10,
          },
        ];
      }

      if (crossGroup) {
        // 그룹 간 간선: 프레임 회피 직교 배선(ortho) + 점선(경계) + 출발→타깃 도메인 색 그라데이션.
        return [
          {
            id: `${n.parentId}->${n.id}`,
            source: String(n.parentId),
            target: String(n.id),
            type: 'ortho',
            className: `edge-cross-group${parentPalette}`,
            data: crossData,
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
      // 그룹 내 간선: 깊이 버킷(1..EDGE_DEPTH_MAX)으로만 감쇠한다. 모든 상세 모드에서 같은
      // 실제 parent→child 간선이 유지되므로, 줌은 관계의 의미를 바꾸지 않는다.
      const depth = groupDepthOf(n.id); // 같은 그룹 부모가 있으므로 항상 >= 1
      const bucket = Math.min(depth, EDGE_DEPTH_MAX);
      const className = `edge-same-group edge-depth-${bucket}${parentPalette}`;
      return [{ ...base, className, zIndex: 1 }];
    });

  return { flowNodes, flowEdges };
}
