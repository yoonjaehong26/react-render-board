# ADR-0066: 지도 모드 소규모 트리 예외 — 노드 수 기반 디테일 억제

- 상태: 채택됨(구현)
- 날짜: 2026-07-19

## 맥락

실사용 프로젝트(그리디 홈페이지, 43노드)에서 보드를 열면 캔버스가 빈 회색 박스로만 보이는 문제가 보고됐다("지도 모드(영역만) · 30~42%" 배지와 함께). 코드를 확인한 결과 두 가지가 겹쳐 있었다 — [ADR-0065](0065-hook-this-binding-bug-fix.md)의 크래시가 하나였고, 그걸 고친 뒤에도 여전히 "지도 모드"가 개별 노드를 숨기는 게 이 ADR의 대상이다.

`Canvas.tsx`의 `isMapMode = viewport.zoom < MAP_MODE_THRESHOLD`(0.55)와 `wideDetail`(사용자가 "지도에서도 상세" 체크박스로 켜는 예외, `useState(false)` 기본값 꺼짐)만으로 "지도 모드에서 개별 노드를 숨길지"를 정하고 있었다 — **노드 개수를 전혀 고려하지 않는다.**

이 최적화(P2, [ADR-0018](0018-map-mode-lod-and-camera-refit.md))의 원래 동기는 "1,500~2,000노드 또는 그룹 100개+부터 `fitView`가 전체를 못 담아 지도 모드가 사실상 백지"였다 — 즉 대규모 트리에서만 의미가 있다. 그런데 43노드짜리 앱도 초기 `fitView`가 우연히 55% 밑으로 줌아웃되면 똑같이 다 숨겨졌다. 사용자가 "지도에서도 상세" 체크박스의 존재를 몰랐다면 이 도구가 그냥 고장난 것으로 보였을 것이다.

## 결정

`src/visualization/lib/mapModeDetail.ts`에 순수 함수 `shouldSuppressMapModeDetail(isMapMode, wideDetail, totalNodeCount)`를 추가했다:

```ts
export const SMALL_TREE_NODE_THRESHOLD = 300;

export function shouldSuppressMapModeDetail(isMapMode, wideDetail, totalNodeCount) {
  if (!isMapMode || wideDetail) return false;
  return totalNodeCount > SMALL_TREE_NODE_THRESHOLD;
}
```

`Canvas.tsx`의 `shouldExpandGroup` 안 `if (isMapMode && !wideDetail) return false;`를 이 함수 호출로 교체했다 — **노드 수가 임계값(300) 이하면 지도 모드에서도 항상 디테일을 보여준다.**

300이라는 값은 project-status.md가 이미 검증해둔 "소~중 규모(수백 개)는 통과"([ADR-0009](0009-real-app-validation.md)) 범위를 그대로 채택했고, [ADR-0018](0018-map-mode-lod-and-camera-refit.md)이 실제로 문제 삼은 "1,500~2,000노드 또는 그룹 100개+" 붕괴 지점보다 충분히 낮게 잡아 안전 마진을 뒀다.

## 검증

- 신규 유닛 테스트(`mapModeDetail.test.ts`, 4개) — 맵 모드 아님/wideDetail 켜짐/임계값 이하(43노드 실사용 케이스 명시적으로 재현)/임계값 초과 4가지 조합.
- 실사용 프로젝트에 반영 후 Playwright로 확인: "지도에서도 상세" 체크박스를 **건드리지 않고도** 노드 1개(프레임만) → 21개(실제 트리)로 렌더됨.

## 결과

- 소규모 앱을 처음 여는 사용자 경험이 "빈 화면"에서 "바로 보이는 트리"로 바뀐다 — 이 도구의 첫인상에 직접 영향.
- 대규모 트리(1,500노드+)에서는 기존 P2 최적화가 그대로 유지된다(회귀 없음, 테스트로 확인).
- `wideDetail` 토글 자체는 그대로 남는다 — 300노드를 넘는 큰 트리에서 "그래도 지도 모드에서 디테일을 보고 싶다"는 수동 선택지로 여전히 유효하다.

## 관련
- [ADR-0017](0017-viewport-based-partial-recompute.md)(뷰포트 기반 부분 재계산) · [ADR-0018](0018-map-mode-lod-and-camera-refit.md)(원래 P2 최적화) · [ADR-0049](0049-wide-view-detail-toggle.md)(wideDetail 토글 원 구현)
