# ADR-0044: hover 혈통 점등 — 간선 클러터 감쇠 c (on-demand)

- 상태: 채택됨(구현)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0041](0041-edge-clutter-attenuation.md)이 간선 클러터 감쇠의 **상시** 처방 a(시각적 감쇠)·b(단계형 LOD)를 구현했다. 연구문서 [`../research/2026-07-18-orthogonal-edge-routing.md`](../research/2026-07-18-orthogonal-edge-routing.md) 7절은 그 다음으로 **c. on-demand 혈통 점등**을 권고했다(순서 `a → b → c → d`): "기본은 그룹 내 간선 옅게/생략, hover/선택 시 그 노드의 **조상 체인 + 직계 자손 간선만** 선명하게." 상시 감쇠로도 못 없앤 마지막 클러터를 인터랙션으로 해소하는 단계다. 연구문서는 이를 NetGrok식 인터랙티브 하이라이트 + 검색 dimming(ADR-0027)과 "동일 철학·메커니즘 재사용"으로 명시했다.

## 결정 (Decision)

컴포넌트 노드에 **hover**하면 그 노드의 **조상 체인 + 자손 서브트리에 속한 간선만** 남기고 나머지를 거의 지운다.

- **간선만 대상.** 프리스크립션이 "조상 체인 + 직계 자손 **간선**"이라, 노드는 건드리지 않는다 → `flowNodes`를 재생성하지 않고(ADR-0017 성능 원칙: 일시적 상태로 flowNodes를 다시 만들지 않는다) 기존 **간선 장식 파이프라인**(`Canvas.tsx`의 `flowEdgesDecorated`)에 `edge-lineage` 클래스만 얹는다. `edge-tracked`/`edge-hot`(ADR-0032)이 얹히는 바로 그 자리다.
- **혈통 계산**은 `flowEdges`의 부모(source)→자식(target) 방향으로 인접 리스트를 만들어, hover 노드에서 위(조상: 부모 간선 타고 올라가기)·아래(자손: 자식 간선 BFS)로 탐색한다. `flowEdges`/hover가 바뀔 때만 재계산(순수 함수, O(간선 수)).
- **강한 점등 + dimming은 CSS가 담당.** hover 중 `canvas`에 `lineage-active` 클래스를 붙이고(`search-active`와 같은 방식), `.lineage-active .react-flow__edge:not(.edge-lineage)…`가 혈통 아닌 간선을 opacity 0.04로 거의 지운다. 점등 간선은 깊이 감쇠(`edge-depth-N`)·중간 줌 LOD(`.zoom-mid .edge-detail`)를 **무시하고** **굵게(width 3) + 은은한 글로우**로 되살아난다("검색은 언제나 이긴다"의 연장 — LOD 규칙 셀렉터에 `:not(.edge-lineage)` 추가).
- **점등 색 = 각 간선의 부모(source) 노드 도메인 색**(연구문서 규칙 7 "선 정체성"). `toFlow`/`flowEdgesDecorated`가 부모의 팔레트 인덱스로 `edge-parent-palette-{0..7}` 클래스를 얹고, CSS가 그 색으로 stroke를 덮어쓴다(그룹 간 간선의 주황 `!important`보다 셀렉터 특이도가 높아 이긴다). 조상 체인이 그룹 경계를 넘으면 색이 도메인 따라 바뀌어, 혈통이 "어느 도메인을 거쳐 내려왔는지"가 색으로 읽힌다.
- **부모 색은 hover에서만.** 모든 간선을 상시 부모 색으로 칠하면 방금 a·b로 죽인 그룹 내 간선 잉크가 그대로 되살아나 클러터가 복원된다. 그래서 색 입힘은 `lineage-active` 스코프 CSS로만 — 간선 수가 적고 주목도가 높은 hover 순간에만 색이 의미(도메인 정체성)를 더하고 평상시 화면은 감쇠 상태를 유지한다.
- **역할 분리.** hover = **구조 혈통**(조상+자손, 이 ADR). 클릭/선택 = **데이터 흐름 추적**(ADR-0032, 특정 참조가 어디로). 둘은 다른 제스처·다른 정보라 공존한다. 추적/활동 간선은 혈통 dim의 예외(신호)이고, 혈통이면서 추적이면 둘 다 얹힌다.

## 근거 (Rationale)

- **같은 원칙의 연장.** ADR-0041의 "잉크를 정보 가치에 비례"를 상시 규칙에서 on-demand로 확장한 것이다 — "지금 관심 있는 혈통만 잉크". 상시 감쇠가 남긴 잔여 클러터(그룹 간 간선이 여러 개 겹치는 지점 등)를 hover 한 번으로 걷어낸다.
- **메커니즘 재사용, 저비용.** 새 배선·새 스키마·새 store 0. 검색 dimming의 CSS scope + 간선 장식 파이프라인 + 트리 인접 탐색만 조합했다. hover마다 재계산되는 건 가벼운 간선 배열(뷰포트 제한 수십~수백)이고 flowNodes는 불변이라 ADR-0017 성능 불변식을 지킨다.
- **읽기 흐름에 맞음.** hover는 발견·탐색의 기본 제스처(react-scan/DevTools 엘리먼트 피커, NetGrok). 클릭(선택·추적)보다 가볍게 "이 노드가 트리에서 어디에 걸려 있나"를 즉답한다.

## 결과 (Consequences)

- **신규 클래스/상태**: `edge-lineage`·`edge-parent-palette-{0..7}`(간선), `lineage-active`(canvas), `hoveredNodeId`·`colorIndexById`(Canvas 로컬), `onNodeMouseEnter/Leave` 핸들러. 전부 프레젠테이션 — `RenderNode` 스키마·레이아웃 불변.
- **검증 `scripts/verify-edge-lineage.mjs`(`npm run verify:edge-lineage`)** — DeepTree(ADR-0041 fixture)에서 Level3에 hover: `lineage-active` 적용, 조상 방향(부모→Level3)·자손 방향(Level3→자식) 간선이 **둘 다** 점등(간선의 source/target을 노드 이름으로 풀어 양방향 탐색을 증명), 점등 간선 opacity≈1·strokeWidth≈3·부모 팔레트 클래스 부여, 혈통 아닌 간선 opacity 0.04, 마우스를 떼면 복구. 전부 통과. (크로스-그룹 혈통은 AppShell 계열 hover로 별도 확인 — 조상 간선 blue·자손 간선 cyan으로 도메인마다 색이 갈렸다.)
- **선형 체인 한계**: DeepTree가 일자 사슬이라 "조상 vs 자손"을 개수로는 못 가려, source/target 이름 대조로 방향을 검증했다. 분기 트리(fan-out)에서의 자손 서브트리 다중 분기는 실제 앱/데모의 일반 그룹에서 자연히 발생한다.
- **노드 쪽 짝 추가(2026-07-18 후속)**: 처음엔 간선만 대상이었으나, "hover했으면 혈통을 매우 명확하게"라는 요청으로 **혈통 노드까지 강조**하도록 확장했다 — hover 중 혈통 밖 컴포넌트 노드는 `component-node--lineage-off`로 흐리게(opacity 0.18), 혈통 노드는 `component-node--lineage-on`으로 살짝 띄운다. 예고한 대로 `TrackedNodesContext`와 같은 방식(`LineageNodesContext` + `useLineageState`)으로 얹어 flowNodes 재생성 없이 구현했다(hover 노드의 조상+자손 **노드 id** 집합을 context로 전달). `verify:edge-lineage`가 노드 dimming까지 검증한다.
- **스코프 밖(다음)**: 7절 d(버스 획 병합 — 배선 라운드), e(그룹 내 간선 완전 생략 — 급진안). [ADR-0039](0039-lod-edge-prop-labels.md)의 간선 라벨은 여전히 "국소 클러터 판정"이 선행 조건이라 배선 라운드로 남는다.

## 관련 문서
- 상시 감쇠(이 ADR의 선행): [ADR-0041](0041-edge-clutter-attenuation.md), [조사](../research/2026-07-18-orthogonal-edge-routing.md) 7절 c
- 재사용한 dimming 메커니즘: 검색+자동 이동 [ADR-0027](0027-search-and-theme-ux-round.md)
- 상보 관계(클릭=데이터 흐름 추적): [ADR-0032](0032-props-flow-and-change-afterglow.md)
- flowNodes 재생성 회피 성능 불변식: [ADR-0017](0017-viewport-based-partial-recompute.md)
