import type { RenderNode } from '../../data/types';

/** 선택한 composite 안에서만 보여 줄 host 태그의 축약 항목. */
export interface HostDetail {
  tag: string;
  count: number;
}

/** raw host를 캔버스 노드로 넣지 않고, 가장 가까운 composite 소유자에게만 tag ×N 상세를 준다. */
export function deriveHostDetails(nodes: RenderNode[]): ReadonlyMap<number, HostDetail[]> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const details = new Map<number, Map<string, HostDetail>>();

  const nearestComposite = (parentId: number | null): number | null => {
    let current = parentId;
    while (current !== null) {
      const parent = byId.get(current);
      if (!parent) return null;
      if (parent.kind === 'composite') return parent.id;
      current = parent.parentId;
    }
    return null;
  };

  for (const node of nodes) {
    if (node.kind !== 'host') continue;
    const owner = nearestComposite(node.parentId);
    if (owner === null) continue;
    let byTag = details.get(owner);
    if (!byTag) details.set(owner, (byTag = new Map()));
    const existing = byTag.get(node.displayName);
    if (existing) existing.count += 1;
    else byTag.set(node.displayName, { tag: node.displayName, count: 1 });
  }

  return new Map([...details].map(([owner, byTag]) => [owner, [...byTag.values()]]));
}
