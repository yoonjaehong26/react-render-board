import type { FiberKind, RawFiberNode } from '../data/types';

// exp1의 예상 밖 발견(0005 ADR): Provider/Consumer 같은 React 내부 구현 Fiber가
// displayName 없이 "(anonymous)"로 나온다. 그대로 캔버스에 그리면 사용자 컴포넌트 구조를
// 이해하는 데 방해가 되므로, 두 가지 처리 모드를 둔다.
//   - filter (기본): 익명 노드를 트리에서 제거하고, 그 자식들을 가장 가까운 "보이는" 조상에 재연결한다.
//   - dim: 익명 노드를 남기되 흐리게 표시해(캔버스에서 CSS로 처리) 존재는 알 수 있게 한다.
export type AnonymousMode = 'filter' | 'dim';

export interface NormalizedNode {
  id: string;
  displayName: string;
  kind: FiberKind;
  parentId: string | null;
  group: string;
  isAnonymous: boolean;
}

export interface PreprocessOptions {
  includeHostNodes: boolean;
  anonymousMode: AnonymousMode;
}

export function preprocessFiberTree(raw: RawFiberNode[], options: PreprocessOptions): NormalizedNode[] {
  const { includeHostNodes, anonymousMode } = options;
  const byId = new Map<number, RawFiberNode>(raw.map((n) => [n.id, n]));

  function isAnonymous(n: RawFiberNode): boolean {
    return n.displayName === '(anonymous)';
  }

  function isVisible(n: RawFiberNode): boolean {
    if (!includeHostNodes && n.kind === 'host') return false;
    if (anonymousMode === 'filter' && isAnonymous(n)) return false;
    return true;
  }

  // 보이지 않는 조상을 건너뛰고, 캔버스에 실제로 그려질 가장 가까운 조상의 id를 찾는다.
  function findVisibleAncestor(parentId: number | null): number | null {
    let current = parentId;
    while (current !== null) {
      const node = byId.get(current);
      if (!node) return null;
      if (isVisible(node)) return node.id;
      current = node.parentId;
    }
    return null;
  }

  const result: NormalizedNode[] = [];
  for (const n of raw) {
    if (!isVisible(n)) continue;
    const effectiveParentId = findVisibleAncestor(n.parentId);
    result.push({
      id: String(n.id),
      displayName: n.displayName,
      kind: n.kind,
      parentId: effectiveParentId === null ? null : String(effectiveParentId),
      group: n.group,
      isAnonymous: isAnonymous(n),
    });
  }
  return result;
}
