// 레이아웃 재계산 전략 (ADR-0008에서 새로 설계한 부분).
//
// exp2의 computeLayout()은 정적 데이터 1회 배치를 가정한 스파이크였다: 매 호출마다
// 그룹 이름을 알파벳 순 정렬해서 처음부터 다시 행-패킹하고, 그룹 내부도 항상 전체를
// 다시 타이디 트리로 배치했다. 라이브 MVP처럼 매 커밋마다 호출하면 두 가지 문제가 생긴다:
//   1. 새 그룹이 하나 나타나기만 해도 정렬 순서가 바뀌어 기존 그룹 전체가 재배치된다.
//   2. 그룹 안에서 형제 하나가 추가/삭제돼도 leaf-cursor가 순차 배정이라 그 형제 뒤의
//      모든 노드가 옆으로 밀린다 — 정작 안 바뀐 서브트리까지 매번 움직인다.
//
// 결정한 전략 (완전한 위치 고정이 아니라 "순서 고정 + 그룹 단위 메모이제이션"):
//   - 그룹이 처음 등장한 순서를 엔진 안에 영구히 기억한다. 이후 커밋에서 새 그룹이 생겨도
//     append만 하고, 이미 알려진 그룹들의 상대 순서는 절대 바뀌지 않는다. (단, 한 그룹의
//     "폭"이 커지면 그 뒤에 오는 그룹들의 x좌표는 여전히 밀릴 수 있다 — 완전한 좌표 고정은
//     스코프 밖으로 남겨둔다. 판단 지점 QA 수준에서는 순서 안정성으로 충분하다고 판단.)
//   - 그룹 내부 타이디 트리 배치는 그룹별로 캐시한다. 캐시 키는 "이 그룹에 속한 (id, parentId)
//     쌍의 집합"이다 — 이 집합이 커밋 전후로 동일하면(그 도메인에 아무 변화가 없으면) 이전
//     레이아웃 결과를 그대로 재사용한다. 실제 앱에서 버튼 클릭 한 번은 보통 트리의 한
//     서브트리(한두 개 그룹)만 바꾸므로, 나머지 그룹은 매 커밋마다 재계산을 건너뛴다.
//   - 그룹 자체가 바뀐 경우(멤버 추가/삭제)는 그 그룹 내부만 처음부터 다시 배치한다.
//     증분 배치(바뀐 서브트리만 옮기기)는 이번 스코프에서는 하지 않는다 — 도메인 하나의
//     크기가 QA 수준에서는 수십 개 이하로 작아서, 그 그룹 하나를 통째로 다시 배치해도
//     시각적으로는 "그 그룹만 흔들리고 나머지는 그대로"로 보이면 충분하다고 판단했다.
//
// 그룹 간 배치: 층(band) 기반 waterfall (ADR-0034에서 ADR-0008의 단일 행-패킹을 수정).
//   그룹은 서로 무관한 게 아니라 실제 부모-자식 관계를 갖는다 — 그룹 A의 노드가 그룹 B의
//   노드를 렌더하면 "A가 B를 렌더한다"는 cross-group 부모 관계가 이미 엣지로 계산돼 있다
//   (toFlow.ts). 이 관계에서 그룹별 깊이(루트 그룹으로부터의 최장 경로)를 구해, 같은 깊이의
//   그룹을 한 가로 층에 놓고 층을 세로로 쌓는다 — 부모 그룹이 위, 자식 그룹이 아래로 흐르는
//   React 트리 그대로의 waterfall. 공유 컴포넌트로 그룹 그래프에 사이클/다중 부모(DAG)가
//   생길 수 있어, DFS로 back-edge를 끊어 DAG로 만든 뒤 최장 경로를 잰다(옵션 A: 공유 그룹은
//   가장 깊은 층에 한 번만). ADR-0008의 순서 안정성은 유지된다 — 세로 위치(층)는 부모가
//   정하므로 새 그룹이 떠도 올바른 층에 꽂히고, 한 층 안 좌우 순서는 여전히 "처음 등장한
//   순서"를 tiebreaker로 쓴다. 흔들리는 유일한 경우는 그룹의 깊이 자체가 바뀔 때(라우트
//   전환 등)인데, 그건 트리가 실제로 바뀐 것이라 움직이는 게 옳다.
import type { VisibleNode } from './normalize';
import { PENDING_GROUP } from './normalize';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupLayout {
  group: string;
  frame: Rect;
  nodeIds: number[];
  /** 폴더 단위 중첩(ADR-0053)에서 이 파일 그룹이 담긴 폴더 키. 없으면 최상위. frame은 항상 월드 좌표. */
  parentFolder?: string;
  /** 공유 UI 레인(pillar ②): 다중 부모(groupParents≥2) 그룹이라 트리에서 빼 아래 공유 밴드에
   * 배치했는지. true면 프레임이 레인에 있고, 사용처→이 그룹 간선은 곡선으로 그린다(toFlow). */
  shared?: boolean;
  /** 공유 그룹일 때 부모(사용처) 그룹 수 = "×N 사용" 배지용. */
  parentCount?: number;
}

/** 폴더 프레임(ADR-0053) — 파일 그룹 ≥2개를 감싸는 바깥 프레임. 파일 그룹이 1개인 폴더는 만들지 않는다. */
export interface FolderLayout {
  folder: string;
  frame: Rect;
  groupKeys: string[];
}

export interface LayoutResult {
  groups: GroupLayout[];
  /** 폴더 그룹핑이 켜졌을 때만 채워진다. 꺼지면 항상 빈 배열(= 기존 평면 동작). */
  folders: FolderLayout[];
  nodePositions: Map<number, { x: number; y: number }>;
}

export interface ComputeLayoutOptions {
  /** 폴더 단위 2단 중첩(ADR-0053). false(기본)면 기존 파일 단위 평면 배치와 바이트 단위 동일. */
  nestFolders?: boolean;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;
const H_GAP = 24;
const V_GAP = 56;
const GROUP_PADDING_TOP = 56;
const GROUP_PADDING = 24;
const GROUP_H_GAP = 80;
const GROUP_V_GAP = 80;
const MAX_ROW_WIDTH = 3400;

function layoutForest(nodeIds: number[], parentOf: Map<number, number | null>) {
  const children = new Map<number, number[]>();
  const nodeSet = new Set(nodeIds);
  const roots: number[] = [];

  for (const id of nodeIds) {
    const parentId = parentOf.get(id) ?? null;
    if (parentId !== null && nodeSet.has(parentId)) {
      const list = children.get(parentId) ?? [];
      list.push(id);
      children.set(parentId, list);
    } else {
      roots.push(id);
    }
  }

  const positions = new Map<number, { x: number; y: number }>();
  let leafCursor = 0;

  function assign(id: number, depth: number): number {
    const kids = children.get(id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = leafCursor * (NODE_WIDTH + H_GAP);
      leafCursor++;
    } else {
      const childXs = kids.map((c) => assign(c, depth + 1));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    positions.set(id, { x, y: depth * (NODE_HEIGHT + V_GAP) });
    return x;
  }

  for (const r of roots) assign(r, 0);

  let maxX = 0;
  let maxY = 0;
  for (const { x, y } of positions.values()) {
    maxX = Math.max(maxX, x + NODE_WIDTH);
    maxY = Math.max(maxY, y + NODE_HEIGHT);
  }

  return { positions, width: maxX, height: maxY };
}

interface GroupInternalLayout {
  signature: string;
  positions: Map<number, { x: number; y: number }>;
  width: number;
  height: number;
}

// 그룹별 waterfall 깊이. cross-group 부모 관계(A의 노드가 B의 노드를 렌더)에서 그룹 그래프를
// 만들고, 루트 그룹으로부터의 최장 경로를 그룹의 세로 층으로 삼는다. 공유 컴포넌트로 사이클/
// 다중 부모가 생길 수 있어(DAG), DFS로 back-edge를 끊어 DAG로 만든 뒤 최장 경로를 잰다.
// groupList는 PENDING_GROUP을 제외한, 이번 커밋에 실제로 존재하는 그룹들이다(순서는 안정성용
// tiebreaker이자 사이클 판정의 결정성 확보에 쓰인다).
function computeGroupDepths(
  nodes: VisibleNode[],
  groupList: string[],
): { depths: Map<string, number>; parents: Map<string, Set<string>> } {
  const inList = new Set(groupList);
  const idToGroup = new Map<number, string>();
  for (const n of nodes) idToGroup.set(n.id, n.group);

  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  for (const g of groupList) {
    parents.set(g, new Set());
    children.set(g, new Set());
  }
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const parentGroup = idToGroup.get(n.parentId);
    if (parentGroup === undefined || parentGroup === n.group) continue;
    if (!inList.has(parentGroup) || !inList.has(n.group)) continue; // PENDING 등 제외
    parents.get(n.group)!.add(parentGroup);
    children.get(parentGroup)!.add(n.group);
  }

  // DFS(자식 방향)로 back-edge(현재 스택에 있는 노드로 가는 간선)를 찾아 끊는다 → DAG.
  const SEP = '\n';
  const color = new Map<string, 0 | 1 | 2>(); // 0 미방문, 1 스택, 2 완료
  const backEdges = new Set<string>();
  function dfs(g: string) {
    color.set(g, 1);
    for (const c of children.get(g)!) {
      const cc = color.get(c) ?? 0;
      if (cc === 1) backEdges.add(g + SEP + c);
      else if (cc === 0) dfs(c);
    }
    color.set(g, 2);
  }
  for (const g of groupList) if ((color.get(g) ?? 0) === 0) dfs(g);

  // DAG 위 최장 경로(부모에서 back-edge 제외). visiting 가드는 back-edge 제거 후에는 걸릴 일이
  // 없지만, 방어적으로 남은 사이클도 0으로 끊어 항상 종료하게 한다.
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  function compute(g: string): number {
    const cached = depth.get(g);
    if (cached !== undefined) return cached;
    if (visiting.has(g)) return 0;
    visiting.add(g);
    let best = 0;
    for (const p of parents.get(g)!) {
      if (p === g || backEdges.has(p + SEP + g)) continue;
      best = Math.max(best, compute(p) + 1);
    }
    visiting.delete(g);
    depth.set(g, best);
    return best;
  }
  for (const g of groupList) compute(g);
  return { depths: depth, parents };
}

// 공유 밴드 패커(ADR-0053) — 단위(unit)들을 깊이(band)별 가로줄로 쌓아 상대 좌표를 매긴다.
// 기존 computeLayout의 그룹 배치(2·3단계)와 같은 규칙: 같은 깊이는 한 층에 좌→우, 층이 너무
// 넓으면(MAX_ROW_WIDTH) 그 층 안에서만 줄바꿈, 층을 위→아래로 쌓는다. 폴더 그룹핑에서 두 번
// 쓴다 — 폴더 안 파일 프레임 배치(안쪽)와 최상위 단위(폴더+단독 그룹) 배치(바깥). units는 이미
// 원하는 좌우 순서(= 처음 등장 순서)로 정렬돼 들어온다. 반환 pos는 (0,0) 기준 상대 좌표.
function packUnits(
  units: string[],
  dimOf: (u: string) => { width: number; height: number },
  depthOf: (u: string) => number,
): { pos: Map<string, { x: number; y: number }>; width: number; height: number } {
  const bandMap = new Map<number, string[]>();
  for (const u of units) {
    const b = depthOf(u);
    const arr = bandMap.get(b);
    if (arr) arr.push(u);
    else bandMap.set(b, [u]);
  }
  const bandKeys = [...bandMap.keys()].sort((a, b) => a - b);

  const pos = new Map<string, { x: number; y: number }>();
  let runningY = 0;
  let maxRight = 0;
  for (const b of bandKeys) {
    let cursorX = 0;
    let cursorY = runningY;
    let rowHeight = 0;
    let bandBottom = runningY;

    for (const u of bandMap.get(b)!) {
      const dim = dimOf(u);
      if (cursorX + dim.width > MAX_ROW_WIDTH && cursorX > 0) {
        cursorX = 0;
        cursorY += rowHeight + GROUP_V_GAP;
        rowHeight = 0;
      }
      pos.set(u, { x: cursorX, y: cursorY });
      maxRight = Math.max(maxRight, cursorX + dim.width);
      cursorX += dim.width + GROUP_H_GAP;
      rowHeight = Math.max(rowHeight, dim.height);
      bandBottom = Math.max(bandBottom, cursorY + dim.height);
    }

    runningY = bandBottom + GROUP_V_GAP;
  }

  return { pos, width: maxRight, height: Math.max(0, runningY - GROUP_V_GAP) };
}

export function createLayoutEngine() {
  const groupOrder: string[] = [];
  const groupOrderSet = new Set<string>();
  const internalCache = new Map<string, GroupInternalLayout>();

  function ensureOrder(groupNames: Iterable<string>) {
    for (const name of groupNames) {
      if (name === PENDING_GROUP) continue;
      if (!groupOrderSet.has(name)) {
        groupOrderSet.add(name);
        groupOrder.push(name);
      }
    }
  }

  // 이번 커밋에 없는 그룹은 순서에서도 지운다. internalCache(그룹 내부 배치)는 이미 커밋마다
  // 정리되지만(아래) groupOrder/groupOrderSet은 그렇지 않았다 — 라우팅처럼 그룹 집합이 자주
  // 바뀌는 앱에서 세션이 길어질수록 순서 배열이 무한히 누적되고, 이미 사라진 그룹들 뒤에
  // 항상 붙어 새 그룹의 x좌표가 점점 카메라에서 멀어지는 원인이 됐다(ADR-0015 카메라 정체
  // 백로그 ②). 사라진 그룹을 지워두면 나중에 다시 나타날 때 ensureOrder가 "지금 시점의
  // 맨 끝"에 새로 붙여줘, 몇 라우트나 지난 오래된 자리에 묶여 있지 않는다.
  function pruneOrder(presentGroups: ReadonlyMap<string, unknown>) {
    for (let i = groupOrder.length - 1; i >= 0; i--) {
      const name = groupOrder[i];
      if (!presentGroups.has(name)) {
        groupOrder.splice(i, 1);
        groupOrderSet.delete(name);
      }
    }
  }

  function computeLayout(nodes: VisibleNode[], opts?: ComputeLayoutOptions): LayoutResult {
    const parentOf = new Map<number, number | null>(nodes.map((n) => [n.id, n.parentId]));

    const byGroup = new Map<string, number[]>();
    for (const n of nodes) {
      const list = byGroup.get(n.group) ?? [];
      list.push(n.id);
      byGroup.set(n.group, list);
    }

    pruneOrder(byGroup);
    ensureOrder(byGroup.keys());
    const orderedGroups = groupOrder.filter((g) => byGroup.has(g));
    if (byGroup.has(PENDING_GROUP)) orderedGroups.push(PENDING_GROUP); // pending 버킷은 항상 맨 끝.

    const nodePositions = new Map<number, { x: number; y: number }>();
    const groups: GroupLayout[] = [];

    // 1단계: 그룹별 내부 배치(캐시) + 노드 상대좌표 + 프레임 크기. 노드 위치는 그룹 프레임
    // 상대좌표이므로(toFlow가 parentId+extent로 렌더) 층 배치와 무관하게 여기서 확정한다.
    const frameDims = new Map<string, { width: number; height: number; ids: number[] }>();
    for (const group of orderedGroups) {
      const ids = byGroup.get(group)!;
      const signature = ids
        .map((id) => `${id}:${parentOf.get(id) ?? ''}`)
        .sort()
        .join(',');

      let internal = internalCache.get(group);
      if (!internal || internal.signature !== signature) {
        const { positions, width, height } = layoutForest(ids, parentOf);
        internal = { signature, positions, width, height };
        internalCache.set(group, internal);
      }

      for (const [id, pos] of internal.positions) {
        nodePositions.set(id, { x: pos.x + GROUP_PADDING, y: pos.y + GROUP_PADDING_TOP });
      }

      frameDims.set(group, {
        width: internal.width + GROUP_PADDING * 2,
        height: internal.height + GROUP_PADDING_TOP + GROUP_PADDING,
        ids,
      });
    }

    // 그룹 waterfall 깊이 — 평면/중첩 양쪽이 쓴다. cross-group 부모 관계에서 루트 그룹으로부터의
    // 최장 경로를 층으로 삼는다. PENDING 버킷은 그래프에서 빼고 항상 맨 아래 층에 둔다.
    const nonPending = orderedGroups.filter((g) => g !== PENDING_GROUP);
    const { depths, parents: groupParents } = computeGroupDepths(nodes, nonPending);
    let maxDepth = 0;
    for (const d of depths.values()) maxDepth = Math.max(maxDepth, d);
    const pendingBand = maxDepth + 1;
    const groupDepthOf = (g: string) => (g === PENDING_GROUP ? pendingBand : depths.get(g) ?? 0);

    const folders: FolderLayout[] = [];

    if (!opts?.nestFolders) {
      // ── 평면 배치(ADR-0034) + downfall tidy-tree 중앙 정렬(ADR-0058) — y는 깊이(밴드), x는
      //    "부모를 자식 스팬 중앙 위에" 놓는 tidy-tree(Reingold–Tilford/Walker의 단순형). 자식을
      //    부모 왼쪽 끝이 아니라 가운데에 두어 우측 치우침을 없애고 트리를 대칭으로 만든다.
      //    좌→우는 렌더 순서(groupOrder) 유지. 공유 컴포넌트(다중 부모)는 대표 부모(깊이-1 중
      //    groupOrder 최소) 하나로 스패닝 트리를 만들어 배치하고, 나머지 부모 연결은 간선으로만
      //    그린다(전부 중앙에 못 놓으므로 — 공유 레인은 후속). 캔버스는 pan/zoom이라 줄바꿈은 없음. ──
      const orderIndex = new Map(orderedGroups.map((g, i) => [g, i]));
      const nonPending = orderedGroups.filter((g) => g !== PENDING_GROUP);
      const widthOf = (g: string) => frameDims.get(g)!.width;

      // 공유 UI 레인(pillar ②, stable-skeleton 설계): 다중 부모(groupParents≥2) 그룹은 트리를
      // DAG로 만드는 유일한 원인이다. 트리에서 빼 아래 별도 "공유 레인" 밴드에 두면 남은 트리는
      // 순수 트리(모든 노드 단일 부모)가 돼 교차 0·자발적 요동 0이 된다. 공유 그룹은 스패닝 트리의
      // 부모 후보에서도 빠져(그 밑에 트리 자식을 안 놓음) 트리 순수성을 보장한다.
      const SHARED_LANE_MIN_PARENTS = 2;
      const sharedGroups = new Set<string>(
        nonPending.filter((g) => (groupParents.get(g)?.size ?? 0) >= SHARED_LANE_MIN_PARENTS),
      );

      // 대표 부모 스패닝 트리(전체): 각 그룹의 depth-1 부모 중 groupOrder 최소를 primary로. 공유
      // 그룹도 자기 primary 부모(사용처)와 자식을 유지한다 — 공유 컨테이너의 서브트리를 통째로
      // 레인으로 옮기기 위함(증분2). 자식은 렌더 순서로 정렬.
      const primaryOf = new Map<string, string | null>();
      const primaryChildren = new Map<string, string[]>();
      for (const g of nonPending) primaryChildren.set(g, []);
      const roots: string[] = [];
      for (const g of nonPending) {
        const d = groupDepthOf(g);
        if (d === 0) {
          roots.push(g);
          primaryOf.set(g, null);
          continue;
        }
        let primary: string | null = null;
        for (const p of groupParents.get(g) ?? []) {
          if (groupDepthOf(p) !== d - 1) continue;
          if (primary === null || (orderIndex.get(p) ?? 0) < (orderIndex.get(primary) ?? 0)) primary = p;
        }
        primaryOf.set(g, primary);
        if (primary === null) roots.push(g);
        else primaryChildren.get(primary)!.push(g);
      }
      for (const kids of primaryChildren.values()) {
        kids.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
      }
      roots.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));

      // 레인 소속(증분2): 공유 그룹이거나 primary 부모가 레인이면 레인 = 공유 컨테이너의 서브트리 전체.
      const lanedCache = new Map<string, boolean>();
      const isLaned = (g: string): boolean => {
        const cached = lanedCache.get(g);
        if (cached !== undefined) return cached;
        const p = primaryOf.get(g);
        const res = sharedGroups.has(g) || (p != null && isLaned(p));
        lanedCache.set(g, res);
        return res;
      };

      // tidy-tree x 배정(재사용 함수): post-order로 자식 먼저 놓고 부모를 자식 스팬 중앙에. 겹치면
      // 서브트리째 오른쪽으로 민다(Walker subtree shift). depth별 cur로 왼→오 패킹. 메인 트리와
      // 레인 포레스트 양쪽에 쓴다.
      const layoutForest = (rootList: string[], childrenFor: (g: string) => string[]): Map<string, number> => {
        const x = new Map<string, number>();
        const cur = new Map<number, number>();
        const shift = (node: string, delta: number, depth: number): void => {
          for (const k of childrenFor(node)) {
            x.set(k, x.get(k)! + delta);
            const kd = depth + 1;
            cur.set(kd, Math.max(cur.get(kd) ?? 0, x.get(k)! + widthOf(k) + GROUP_H_GAP));
            shift(k, delta, kd);
          }
        };
        const place = (node: string, depth: number): void => {
          const kids = childrenFor(node);
          const w = widthOf(node);
          if (kids.length === 0) {
            x.set(node, cur.get(depth) ?? 0);
          } else {
            for (const k of kids) place(k, depth + 1);
            const first = kids[0];
            const last = kids[kids.length - 1];
            const spanCenter = (x.get(first)! + widthOf(first) / 2 + x.get(last)! + widthOf(last) / 2) / 2;
            const desiredLeft = spanCenter - w / 2;
            const minLeft = cur.get(depth);
            const left = minLeft === undefined ? desiredLeft : Math.max(minLeft, desiredLeft);
            x.set(node, left);
            const delta = left - desiredLeft;
            if (delta > 0) shift(node, delta, depth);
          }
          cur.set(depth, x.get(node)! + w + GROUP_H_GAP);
        };
        for (const r of rootList) place(r, 0);
        return x;
      };

      // 메인 트리 = 레인 아닌 그룹. 레인 자식은 배치에서 건너뛴다(레인으로 감).
      const xOf = layoutForest(
        roots.filter((g) => !isLaned(g)),
        (g) => (primaryChildren.get(g) ?? []).filter((c) => !isLaned(c)),
      );

      // 밴드별 y(메인) = 깊이별 최대 높이 누적. 레인 그룹은 제외(아래 레인 밴드). PENDING은 pendingBand.
      const bandGroups = new Map<number, string[]>();
      for (const g of orderedGroups) {
        if (isLaned(g)) continue;
        const d = groupDepthOf(g);
        const arr = bandGroups.get(d);
        if (arr) arr.push(g);
        else bandGroups.set(d, [g]);
      }
      const bandY = new Map<number, number>();
      let runningY = 0;
      for (const d of [...bandGroups.keys()].sort((a, b) => a - b)) {
        bandY.set(d, runningY);
        let maxH = 0;
        for (const g of bandGroups.get(d)!) maxH = Math.max(maxH, frameDims.get(g)!.height);
        runningY += maxH + GROUP_V_GAP;
      }

      // PENDING 버킷 — 맨 아래(pendingBand) 밴드에 좌→우 순차.
      let pendingCursor = 0;
      for (const g of orderedGroups) {
        if (g !== PENDING_GROUP) continue;
        xOf.set(g, pendingCursor);
        pendingCursor += widthOf(g) + GROUP_H_GAP;
      }

      // ── 공유 레인(증분2): 공유 컨테이너 + 서브트리를 통째로 아래 레인에 미니 tidy-tree로. 레인
      //    루트 = primary 부모가 레인 아닌 공유 그룹(레인 서브트리의 최상단). 각 루트 서브트리를
      //    tidy-tree로 배치한 뒤, 루트를 부모 centroid 아래로 옮기고(서브트리째 shift) 좌→우 겹침 해소. ──
      const laneChildrenFor = (g: string) => (primaryChildren.get(g) ?? []).filter((c) => isLaned(c));
      const laneRoots = [...sharedGroups]
        .filter((s) => {
          const p = primaryOf.get(s);
          return p == null || !isLaned(p);
        })
        .sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
      const laneLocalX = layoutForest(laneRoots, laneChildrenFor);
      // 레인 로컬 깊이(y 밴드용): 레인 루트=0.
      const laneDepth = new Map<string, number>();
      const walkDepth = (g: string, d: number): void => {
        laneDepth.set(g, d);
        for (const c of laneChildrenFor(g)) walkDepth(c, d + 1);
      };
      for (const r of laneRoots) walkDepth(r, 0);
      // 레인 y 밴드 = laneY부터 로컬 깊이별 최대 높이 누적.
      const laneY = runningY + GROUP_V_GAP;
      const laneBandY = new Map<number, number>();
      {
        const byDepth = new Map<number, string[]>();
        for (const [g, d] of laneDepth) {
          const arr = byDepth.get(d);
          if (arr) arr.push(g);
          else byDepth.set(d, [g]);
        }
        let y = laneY;
        for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
          laneBandY.set(d, y);
          let maxH = 0;
          for (const g of byDepth.get(d)!) maxH = Math.max(maxH, frameDims.get(g)!.height);
          y += maxH + GROUP_V_GAP;
        }
      }
      // 각 레인 루트 서브트리를 부모 centroid 아래로 shift + 좌→우 겹침 해소.
      const rootTargets = laneRoots.map((r) => {
        const ps = [...(groupParents.get(r) ?? [])].filter((p) => !isLaned(p) && xOf.has(p));
        const centroid = ps.length
          ? ps.reduce((s, p) => s + (xOf.get(p)! + widthOf(p) / 2), 0) / ps.length
          : laneLocalX.get(r)! + widthOf(r) / 2;
        return { r, centroid };
      });
      rootTargets.sort((a, b) => a.centroid - b.centroid || (orderIndex.get(a.r) ?? 0) - (orderIndex.get(b.r) ?? 0));
      let laneRight = Number.NEGATIVE_INFINITY;
      for (const { r, centroid } of rootTargets) {
        const sub: string[] = [];
        const collect = (g: string): void => {
          sub.push(g);
          for (const c of laneChildrenFor(g)) collect(c);
        };
        collect(r);
        const newRootLeft = Math.max(laneRight, centroid - widthOf(r) / 2);
        const delta = newRootLeft - laneLocalX.get(r)!;
        let subRight = Number.NEGATIVE_INFINITY;
        for (const g of sub) {
          const nx = laneLocalX.get(g)! + delta;
          xOf.set(g, nx);
          subRight = Math.max(subRight, nx + widthOf(g));
        }
        laneRight = subRight + GROUP_H_GAP;
      }

      for (const g of orderedGroups) {
        const dim = frameDims.get(g)!;
        const laned = isLaned(g);
        groups.push({
          group: g,
          frame: {
            x: xOf.get(g) ?? 0,
            y: laned ? laneBandY.get(laneDepth.get(g) ?? 0) ?? laneY : bandY.get(groupDepthOf(g)) ?? 0,
            width: dim.width,
            height: dim.height,
          },
          nodeIds: dim.ids,
          // shared 플래그(레인 배지·해치)는 실제 공유 컨테이너(다중부모)에만. 레인 자식은 컨테이너의
          // 내용물이라 일반 프레임으로 레인에 놓인다.
          ...(sharedGroups.has(g) ? { shared: true, parentCount: groupParents.get(g)?.size } : {}),
        });
      }

      // tidy-tree는 x가 음수로 흐를 수 있어 전체를 x≥0로 정규화(노드는 그룹-상대라 영향 없음).
      let minX = Number.POSITIVE_INFINITY;
      for (const g of groups) minX = Math.min(minX, g.frame.x);
      if (Number.isFinite(minX) && minX !== 0) {
        for (const g of groups) g.frame.x -= minX;
      }
    } else {
      // ── 폴더 단위 2단 중첩(ADR-0053) — 파일 그룹을 상위 폴더로 묶는다. 폴더 프레임(바깥)이
      //    파일 프레임(기존 그룹)을 감싸고, 파일 프레임이 컴포넌트를 감싼다. 모든 frame은 월드 좌표. ──
      const groupPathOf = new Map<string, string>();
      for (const n of nodes) {
        if (n.groupPath && !groupPathOf.has(n.group)) groupPathOf.set(n.group, n.groupPath);
      }
      const folderKeyOf = (group: string): string | null => {
        if (group === PENDING_GROUP) return null;
        const p = groupPathOf.get(group);
        if (!p) return null;
        const slash = p.lastIndexOf('/');
        const dir = slash > 0 ? p.slice(0, slash) : '';
        return dir || null;
      };

      // 폴더별 멤버 그룹(orderedGroups 순서 유지). 파일 그룹 ≥2개인 폴더만 실제 폴더 프레임을 만든다
      // — 1개면 폴더 박스가 파일 프레임과 겹쳐 중복이라, 파일 프레임을 그냥 최상위 밴드에 둔다.
      const folderGroups = new Map<string, string[]>();
      for (const g of orderedGroups) {
        const f = folderKeyOf(g);
        if (f === null) continue;
        const arr = folderGroups.get(f);
        if (arr) arr.push(g);
        else folderGroups.set(f, [g]);
      }
      const realFolders = new Set(
        [...folderGroups].filter(([, gs]) => gs.length >= 2).map(([f]) => f),
      );

      // 폴더 안 파일 프레임 배치(폴더-로컬). 파일 깊이는 폴더 내 최소 깊이를 0으로 정규화한 미니
      // waterfall(전역 흐름 방향과 일치; 형제뿐이면 한 줄로 수렴). packUnits 재사용.
      const folderInternal = new Map<
        string,
        { filePos: Map<string, { x: number; y: number }>; width: number; height: number }
      >();
      for (const f of realFolders) {
        const files = folderGroups.get(f)!;
        const minDepth = Math.min(...files.map(groupDepthOf));
        const packed = packUnits(
          files,
          (g) => frameDims.get(g)!,
          (g) => groupDepthOf(g) - minDepth,
        );
        const filePos = new Map<string, { x: number; y: number }>();
        for (const [g, p] of packed.pos) {
          filePos.set(g, { x: p.x + GROUP_PADDING, y: p.y + GROUP_PADDING_TOP });
        }
        folderInternal.set(f, {
          filePos,
          width: packed.width + GROUP_PADDING * 2,
          height: packed.height + GROUP_PADDING_TOP + GROUP_PADDING,
        });
      }

      // 최상위 단위: 실제 폴더 + 나머지(단독 그룹, PENDING 포함). 순서는 orderedGroups 첫 등장 기준
      // — 폴더는 가장 먼저 나온 멤버의 자리를 물려받아, 파일이 늘어도 폴더 자리가 안 흔들린다.
      const unitKeys: string[] = [];
      const unitFolder = new Map<string, string>();
      const unitGroup = new Map<string, string>();
      const seenFolder = new Set<string>();
      for (const g of orderedGroups) {
        const f = folderKeyOf(g);
        if (f !== null && realFolders.has(f)) {
          if (!seenFolder.has(f)) {
            seenFolder.add(f);
            const uk = `F:${f}`;
            unitKeys.push(uk);
            unitFolder.set(uk, f);
          }
        } else {
          const uk = `G:${g}`;
          unitKeys.push(uk);
          unitGroup.set(uk, g);
        }
      }

      const unitDimOf = (u: string) => {
        const f = unitFolder.get(u);
        if (f !== undefined) {
          const fi = folderInternal.get(f)!;
          return { width: fi.width, height: fi.height };
        }
        return frameDims.get(unitGroup.get(u)!)!;
      };
      const unitDepthOf = (u: string) => {
        const f = unitFolder.get(u);
        if (f !== undefined) return Math.min(...folderGroups.get(f)!.map(groupDepthOf));
        return groupDepthOf(unitGroup.get(u)!);
      };

      const unitPacked = packUnits(unitKeys, unitDimOf, unitDepthOf);
      for (const u of unitKeys) {
        const up = unitPacked.pos.get(u)!;
        const f = unitFolder.get(u);
        if (f !== undefined) {
          const fi = folderInternal.get(f)!;
          folders.push({
            folder: f,
            frame: { x: up.x, y: up.y, width: fi.width, height: fi.height },
            groupKeys: folderGroups.get(f)!,
          });
          for (const g of folderGroups.get(f)!) {
            const fp = fi.filePos.get(g)!;
            const dim = frameDims.get(g)!;
            groups.push({
              group: g,
              frame: { x: up.x + fp.x, y: up.y + fp.y, width: dim.width, height: dim.height },
              nodeIds: dim.ids,
              parentFolder: f,
            });
          }
        } else {
          const g = unitGroup.get(u)!;
          const dim = frameDims.get(g)!;
          groups.push({
            group: g,
            frame: { x: up.x, y: up.y, width: dim.width, height: dim.height },
            nodeIds: dim.ids,
          });
        }
      }
    }

    // 이번 커밋에 없는 그룹(도메인이 통째로 언마운트된 경우)의 캐시는 정리한다.
    for (const key of [...internalCache.keys()]) {
      if (!byGroup.has(key)) internalCache.delete(key);
    }

    return { groups, folders, nodePositions };
  }

  return { computeLayout };
}

export type LayoutEngine = ReturnType<typeof createLayoutEngine>;
export { NODE_WIDTH, NODE_HEIGHT };
