// exp2의 preprocessFiberTree()가 하던 일 중 "화면에 그릴 노드 결정 + 숨겨진 조상 재연결"만
// 남긴 버전. 익명 Fiber 필터링은 이미 데이터 레이어(serialize.ts)가 tag 기반으로 끝냈으므로
// (ADR-0008) 여기서 다시 걸러내지 않는다 — 여기서 남은 "보일지 말지" 결정은 오직
// host 노드 기본 숨김(사용자 토글) 뿐이다.
import type { RenderNode } from '../../data/types';
import { PENDING_GROUP, resolveEffectiveGroups } from './groups';

export interface VisibleNode {
  id: number;
  displayName: string;
  kind: 'host' | 'composite';
  /** 숨겨진 host 조상을 건너뛰고 재연결된 parentId (exp2의 findVisibleAncestor와 동일한 기법). */
  parentId: number | null;
  group: string;
  isAnonymous: boolean;
}

export interface NormalizeOptions {
  includeHostNodes: boolean;
}

export { PENDING_GROUP };

export function normalizeForCanvas(nodes: RenderNode[], options: NormalizeOptions): VisibleNode[] {
  const { includeHostNodes } = options;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const effectiveGroup = resolveEffectiveGroups(nodes);

  function isVisible(n: RenderNode): boolean {
    return includeHostNodes || n.kind !== 'host';
  }

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

  const result: VisibleNode[] = [];
  for (const n of nodes) {
    if (!isVisible(n)) continue;
    result.push({
      id: n.id,
      displayName: n.displayName,
      kind: n.kind,
      parentId: findVisibleAncestor(n.parentId),
      group: effectiveGroup.get(n.id) ?? PENDING_GROUP,
      isAnonymous: n.displayName === '(anonymous)',
    });
  }
  return result;
}
