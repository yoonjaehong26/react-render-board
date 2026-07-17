// 커밋 시점 Fiber 트리 → RenderNode[] 직렬화.
// exp1(fiber-inspector.ts)의 순회 로직 + exp1 source-spike/ADR-0007이 발견한 bippy의
// tag 기반 분류(isHostFiber/isCompositeFiber)를 하나로 합친다.
//
// 설계 원칙 (docs/architecture.md, exp1이 이미 지킨 것 그대로 유지):
// 1. devtools-only 실행은 이 모듈을 호출하는 훅킹 레이어 책임 (여기서는 가정하지 않는다).
// 2. 재귀 순회 가드 — 깊이 제한 + 방문 노드 캐시.
// 3. 커밋 시점 데이터만 다룬다 (root.current를 그대로 받는다).
//
// 익명 Fiber 필터링 통일 (ADR-0007 미해결 사항 반영):
// exp2는 displayName === '(anonymous)' 로 필터링했고, exp1 source-spike는
// bippy `isCompositeFiber`(tag 기반)로 getSource 후보를 골랐다 — 두 기준이 따로 있었다.
// 여기서는 tag 기반 분류를 유일한 판단 기준으로 삼는다: isHostFiber/isCompositeFiber
// 어느 쪽도 아닌 Fiber(Provider/Consumer wrapper, Fragment, Root 등 React 내부 배관)는
// 애초에 노드로 만들지 않고 자식을 가장 가까운 "실제" 조상에 재연결한다.
// 이름이 없는(진짜 익명 함수로 정의된) composite는 다르게 취급한다 — tag 기준으로는
// 여전히 진짜 컴포넌트이므로 노드로 남기고 displayName만 "(anonymous)" 로 표시한다.
// (exp2의 displayName 기준 필터는 이 둘을 구분하지 못하고 함께 걸러냈다 — ADR-0008 참고)
import { getDisplayName, getFiberId, isCompositeFiber, isHostFiber, type Fiber } from 'bippy';
import type { FiberKind, RenderNode } from './types';

// depth: "자식 방향"으로 내려간 트리 깊이만 센다 (컴포넌트 트리가 비정상적으로 깊게 중첩되는 경우의
// 스택/성능 안전망). 형제 개수는 이 값을 전혀 소모하지 않는다 — 행 많은 테이블/긴 리스트처럼
// 한 부모 아래 형제가 수천 개인 흔한 패턴이 여기 걸려 잘려나가면 안 된다 (ADR-0014/0016).
const MAX_DEPTH = 200;
// 형제 순회 전용 가드. 정상적인 UI라면 사실상 도달하지 않을 만큼 크게 잡되(합성 fixture 5,000개,
// 실제 앱 shadcn-admin 9,240개 규모를 넉넉히 웃돈다), 완전히 무제한으로 두지는 않는다 — fiber.sibling
// 연결 리스트가 어떤 이유로든 순환하면(예: bippy/React 내부 버그로 인한 손상) 아래 while 루프는
// "이미 방문한 id를 다시 만나면 그 자리에서 중단"하는 것만으로는 무한 루프를 못 끊을 수 있어
// (A→B→C→A→B→C… 순환에서 매번 "다음 형제로" 건너뛰면 영원히 끝나지 않는다), 이 카운터가 진짜
// 순환 참조 방어(architecture.md 설계 원칙 2번)로 동작한다.
const MAX_SIBLINGS = 50_000;

export interface SerializeResult {
  nodes: RenderNode[];
  /** groupHint를 비동기로 채워야 할 composite fiber 원본 (id -> Fiber). */
  compositeFibers: Map<number, Fiber>;
}

function classify(fiber: Fiber): FiberKind | null {
  if (isHostFiber(fiber)) return 'host';
  if (isCompositeFiber(fiber)) return 'composite';
  return null;
}

export function serializeFiberTree(root: Fiber): SerializeResult {
  const nodes: RenderNode[] = [];
  const compositeFibers = new Map<number, Fiber>();
  const visited = new Set<number>();

  // 형제 목록은 반복문으로 순회한다(재귀 tail call이 아님) — 그렇지 않으면 형제 수만큼 JS 콜
  // 스택을 소모해, depth 가드를 분리해도 여전히 "형제가 아주 많으면" 스택이 넘칠 수 있다.
  // 자식 방향으로 내려갈 때만 재귀(walk)를 다시 호출해 depth를 늘린다.
  function walk(firstSibling: Fiber | null, visibleParentId: number | null, depth: number) {
    if (depth > MAX_DEPTH) {
      console.warn('[data-layer] MAX_DEPTH 초과(트리 깊이), 순회 중단', { depth, visibleParentId });
      return;
    }

    let siblingCount = 0;
    let fiber: Fiber | null = firstSibling;
    while (fiber) {
      if (siblingCount >= MAX_SIBLINGS) {
        console.warn('[data-layer] MAX_SIBLINGS 초과(형제 수 또는 순환 참조 의심), 순회 중단', {
          siblingCount,
          visibleParentId,
        });
        return;
      }

      const id = getFiberId(fiber);
      if (visited.has(id)) {
        // 순환 참조 방어: 이미 방문한 fiber를 형제 체인에서 다시 만나면 이 체인의 나머지는
        // 신뢰할 수 없으므로(정상 트리라면 절대 일어나지 않는다) 순회를 여기서 중단한다.
        return;
      }
      visited.add(id);
      siblingCount++;

      const kind = classify(fiber);
      let nextParentId = visibleParentId;

      if (kind !== null) {
        const displayName =
          getDisplayName(fiber.type) ?? (typeof fiber.type === 'string' ? fiber.type : '(anonymous)');
        nodes.push({ id, displayName, kind, parentId: visibleParentId, groupHint: null });
        if (kind === 'composite') compositeFibers.set(id, fiber);
        nextParentId = id;
      }
      // kind === null: React 내부 배관 fiber. 노드를 만들지 않고, 자식은 visibleParentId에 그대로 재연결한다.

      walk(fiber.child, nextParentId, depth + 1);
      fiber = fiber.sibling;
    }
  }

  walk(root, null, 0);
  return { nodes, compositeFibers };
}
