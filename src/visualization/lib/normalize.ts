// exp2의 preprocessFiberTree()가 하던 일 중 "화면에 그릴 노드 결정 + 숨겨진 조상 재연결"만
// 남긴 버전. 익명 Fiber 필터링은 이미 데이터 레이어(serialize.ts)가 tag 기반으로 끝냈으므로
// (ADR-0008) 여기서 다시 걸러내지 않는다 — 여기서 남은 "보일지 말지" 결정은 오직
// host 노드 기본 숨김(사용자 토글) 뿐이다.
import type { RenderNode } from '../../data/types';
import { PENDING_GROUP, isLibraryInternalHint, resolveEffectiveGroups } from './groups';

export interface VisibleNode {
  id: number;
  displayName: string;
  kind: 'host' | 'composite';
  /** 숨겨진 host 조상을 건너뛰고 재연결된 parentId (exp2의 findVisibleAncestor와 동일한 기법). */
  parentId: number | null;
  group: string;
  /** 이 노드가 속한 그룹(=사용 위치 파일)의 전체 경로(폴더 포함) — 폴더 단위 그룹핑(ADR-0053).
   * 한 그룹의 모든 노드는 같은 사용 파일이라 같은 경로를 공유한다. 못 얻으면 undefined(폴더 폴백). */
  groupPath?: string;
  isAnonymous: boolean;
  /** 리스트 접기(ADR-0046): 같은 부모 밑 같은 종류 형제 N개를 이 대표 노드 하나로 접었을 때 그 N.
   * undefined면 접지 않은 평범한 노드다. 대표 노드는 자기 서브트리를 그대로 유지하고, 나머지
   * 형제와 그 서브트리는 VisibleNode 목록에서 빠진다. */
  coalescedCount?: number;
}

export interface NormalizeOptions {
  includeHostNodes: boolean;
}

export { PENDING_GROUP };

export function normalizeForCanvas(nodes: RenderNode[], options: NormalizeOptions): VisibleNode[] {
  const { includeHostNodes } = options;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const effectiveGroup = resolveEffectiveGroups(nodes);

  // 그룹(파일 basename) -> 전체 경로. "그룹을 정의한 노드"(자기 groupHint가 곧 그 그룹인 app-source
  // composite)에서만 경로를 취한다 — 그 노드의 groupPath basename이 그룹명과 일치한다(사용 위치).
  // 한 그룹의 모든 노드는 같은 사용 파일이므로 이 맵으로 전 노드에 같은 경로를 내려준다.
  const groupToPath = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind !== 'composite' || !n.groupHint || isLibraryInternalHint(n.groupHint)) continue;
    if (effectiveGroup.get(n.id) !== n.groupHint) continue; // 자기 힌트가 곧 자기 그룹인 정의 노드만
    if (n.groupPath && !groupToPath.has(n.groupHint)) groupToPath.set(n.groupHint, n.groupPath);
  }

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
    const group = effectiveGroup.get(n.id) ?? PENDING_GROUP;
    result.push({
      id: n.id,
      displayName: n.displayName,
      kind: n.kind,
      parentId: findVisibleAncestor(n.parentId),
      group,
      groupPath: groupToPath.get(group),
      isAnonymous: n.displayName === '(anonymous)',
    });
  }
  return result;
}

/**
 * 보드↔DOM 양방향 인터랙션(ADR-0024/0025)의 역방향(DOM 클릭)이 쓴다. bippy로 실제 DOM
 * 요소에서 얻은 raw id는 host 노드일 수 있는데, 지금 보드가 host 노드를 숨기고 있으면
 * (includeHostNodes: false) 그 id는 현재 화면(VisibleNode[])에 없다 — `findVisibleAncestor`
 * 위의 것과 같은 기법으로, rawId 자신부터 시작해 parentId 체인을 타고 올라가며 처음으로
 * 화면에 실제로 있는(visibleIds에 속한) id를 찾는다. 끝까지 못 찾으면(트리에서 사라진 id 등) null.
 */
export function resolveVisibleId(
  nodes: RenderNode[],
  visibleIds: ReadonlySet<number>,
  rawId: number,
): number | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current: number | null = rawId;
  while (current !== null) {
    if (visibleIds.has(current)) return current;
    const node = byId.get(current);
    if (!node) return null;
    current = node.parentId;
  }
  return null;
}
