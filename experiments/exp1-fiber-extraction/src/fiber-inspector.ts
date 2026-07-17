// 실험 1: bippy로 커밋 시점 Fiber 트리를 JSON으로 추출해 콘솔에 찍는다.
//
// 설계 원칙 (docs/architecture.md 선행 프로젝트 실패에서 얻은 설계 원칙 참고):
// 1. devtools-only 실행 — import.meta.env.DEV(dev 서버)에서만 훅을 건다. 프로덕션 빌드에서는 이 모듈 전체가 no-op.
// 2. 재귀 순회 가드 — 깊이 제한 + 방문 노드(id) 캐시로 순환 참조를 방지한다.
// 3. 커밋 시점 훅 — instrument()의 onCommitFiberRoot 콜백에서만 데이터를 캡처한다(마운트 시점 아님).
import { instrument, getDisplayName, getFiberId, isHostFiber, type Fiber, type FiberRoot } from 'bippy';

const MAX_DEPTH = 200;

interface FiberNodeJSON {
  id: number;
  displayName: string;
  kind: 'host' | 'composite';
  parentId: number | null;
}

function serializeTree(root: Fiber): FiberNodeJSON[] {
  const nodes: FiberNodeJSON[] = [];
  const visited = new Set<number>();

  function walk(fiber: Fiber | null, parentId: number | null, depth: number) {
    if (!fiber) return;
    if (depth > MAX_DEPTH) {
      console.warn('[fiber-inspector] MAX_DEPTH 초과, 순회 중단', { depth, parentId });
      return;
    }

    const id = getFiberId(fiber);
    if (visited.has(id)) {
      // 순환 참조 가드: 이미 방문한 노드는 다시 내려가지 않는다.
      return;
    }
    visited.add(id);

    nodes.push({
      id,
      displayName: getDisplayName(fiber.type) ?? (typeof fiber.type === 'string' ? fiber.type : '(anonymous)'),
      kind: isHostFiber(fiber) ? 'host' : 'composite',
      parentId,
    });

    walk(fiber.child, id, depth + 1);
    walk(fiber.sibling, parentId, depth + 1);
  }

  walk(root, null, 0);
  return nodes;
}

export function startFiberInspector() {
  if (!import.meta.env.DEV) {
    // devtools-only 실행: 프로덕션 빌드에서는 훅에 개입하지 않는다.
    return;
  }

  instrument({
    name: 'react-render-board-exp1',
    onCommitFiberRoot(_rendererID: number, root: FiberRoot) {
      // 이 버전의 bippy(0.6.0)는 `secure()`를 export하지 않아 콜백을 직접 try/catch로 감싼다.
      // (docs/research/technical-options.md는 secure를 언급하지만 설치된 버전엔 없음 — 실험 중 발견, ADR에 기록)
      try {
        const tree = serializeTree(root.current);
        console.log('[fiber-inspector] commit', JSON.stringify(tree, null, 2));
      } catch (err) {
        console.error('[fiber-inspector] 트리 직렬화 중 에러', err);
      }
    },
  });

  console.log('[fiber-inspector] started (dev-only)');
}
