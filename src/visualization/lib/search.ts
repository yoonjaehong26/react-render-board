// 검색 하이라이트 + 자동 이동(ui-philosophy.md "검색으로 탈출구 마련"). displayName뿐 아니라
// 이미 해석된(그룹 노이즈 흡수까지 끝난, ADR-0012/0019) VisibleNode.group도 매칭 대상으로 삼아,
// 도메인 이름을 쳐도 그 도메인 전체가 걸리게 한다. PENDING_GROUP은 아직 그룹이 안 정해진
// 임시 상태의 내부 sentinel 문자열일 뿐이라 그룹 텍스트 매칭에서 제외한다.
import type { VisibleNode } from './normalize';
import { PENDING_GROUP } from './normalize';

export function computeSearchMatches(nodes: VisibleNode[], query: string): Set<number> {
  const q = query.trim().toLowerCase();
  const matches = new Set<number>();
  if (!q) return matches;

  for (const n of nodes) {
    const nameMatches = n.displayName.toLowerCase().includes(q);
    const groupMatches = n.group !== PENDING_GROUP && n.group.toLowerCase().includes(q);
    if (nameMatches || groupMatches) matches.add(n.id);
  }
  return matches;
}
