// 지도 모드(줌아웃)에서 개별 노드를 숨길지 판단하는 순수 함수 (ADR-0066 버그 수정).
//
// P2(ADR-0018)의 원래 동기는 "1,500~2,000노드 또는 그룹 100개+부터 fitView가 전체를 못 담아
// 지도 모드가 사실상 백지"였다 — 즉 진짜 크고 복잡한 트리에서만 의미가 있는 최적화다. 그런데
// 실제 구현(Canvas.tsx)은 노드 개수와 무관하게 순수 줌 배율(MAP_MODE_THRESHOLD)만으로 켜져서,
// 수십 개짜리 작은 앱도 초기 fitView가 우연히 그 배율 밑으로 떨어지면 화면이 통째로 빈 채로
// 보였다(2026-07-19, 실사용 프로젝트에서 43노드 앱이 이 증상으로 "고장 난 것처럼" 보임 —
// wideDetail 체크박스를 몰랐다면 못 찾았을 것). 노드 수가 이 임계값(SMALL_TREE_NODE_THRESHOLD)
// 이하면 지도 모드라도 항상 디테일을 보여준다 — 작은 트리는 저 배율에서도 성능·가독성 문제가
// 없다는 게 이미 검증돼 있다(project-status.md "소~중 규모(수백 개)는 통과").
export const SMALL_TREE_NODE_THRESHOLD = 300;

/**
 * 지도 모드에서 이 그룹(들)의 개별 컴포넌트 노드를 접어야(숨겨야) 하는지.
 * true를 돌려주면 Canvas가 자식 노드/엣지를 만들지 않는다(그룹 프레임만).
 *
 * @param isMapMode 현재 줌이 MAP_MODE_THRESHOLD 아래인지
 * @param wideDetail 사용자가 "지도에서도 상세" 토글을 켰는지(ADR-0049, 항상 최우선)
 * @param totalNodeCount 전체 렌더 트리 노드 수(snapshot.nodes.length)
 */
export function shouldSuppressMapModeDetail(
  isMapMode: boolean,
  wideDetail: boolean,
  totalNodeCount: number,
): boolean {
  if (!isMapMode || wideDetail) return false;
  return totalNodeCount > SMALL_TREE_NODE_THRESHOLD;
}
