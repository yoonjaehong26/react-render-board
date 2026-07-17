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
}

export interface LayoutResult {
  groups: GroupLayout[];
  nodePositions: Map<number, { x: number; y: number }>;
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

  function computeLayout(nodes: VisibleNode[]): LayoutResult {
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

    let cursorX = 0;
    let cursorY = 0;
    let rowHeight = 0;

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

      const frameWidth = internal.width + GROUP_PADDING * 2;
      const frameHeight = internal.height + GROUP_PADDING_TOP + GROUP_PADDING;

      if (cursorX + frameWidth > MAX_ROW_WIDTH && cursorX > 0) {
        cursorX = 0;
        cursorY += rowHeight + GROUP_V_GAP;
        rowHeight = 0;
      }

      groups.push({
        group,
        frame: { x: cursorX, y: cursorY, width: frameWidth, height: frameHeight },
        nodeIds: ids,
      });

      cursorX += frameWidth + GROUP_H_GAP;
      rowHeight = Math.max(rowHeight, frameHeight);
    }

    // 이번 커밋에 없는 그룹(도메인이 통째로 언마운트된 경우)의 캐시는 정리한다.
    for (const key of [...internalCache.keys()]) {
      if (!byGroup.has(key)) internalCache.delete(key);
    }

    return { groups, nodePositions };
  }

  return { computeLayout };
}

export type LayoutEngine = ReturnType<typeof createLayoutEngine>;
export { NODE_WIDTH, NODE_HEIGHT };
