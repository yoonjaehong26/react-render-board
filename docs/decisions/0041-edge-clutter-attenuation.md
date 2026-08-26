# ADR-0041: 간선 클러터 감쇠 구현 — 시각적 감쇠 + 단계형 LOD

- 상태: 부분 대체됨(간선 LOD/집계선은 ADR-0090, 깊이 감쇠·hover 점등은 유지)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0029](0029-orthogonal-edge-routing-deferred.md)는 간선 직교/버스 **배선**을 보류하되, **간선 클러터 감쇠(스타일/LOD)를 배선보다 먼저인 독립 라운드 후보**로 두었다(결정 #4). 근거: 배선(경로 모양)은 "막힌 증거"가 없는 심미 지향이지만, "수백 노드 규모에서 간선이 거의 안 보이게 뺴곡해진다"는 클러터는 선행 도구를 죽인 실제 관찰된 단점이고, 배선기 없이 표현 레이어(스타일/LOD)만으로 저비용 해소가 가능하다. 조사 문서 [`../research/2026-07-18-orthogonal-edge-routing.md`](../research/2026-07-18-orthogonal-edge-routing.md) 7절이 처방 a~e를 두고 **"a(시각적 감쇠) → b(간선 LOD) 먼저"**를 권고했다. 이 ADR은 그 a·b를 구현한 기록이다.

진단(7절): ① 획 수 과다(fan-out N이면 곡선 N개), ② **잉크가 정보 가치와 반비례** — tidy-tree에서 그룹 내 부모→자식 간선은 정보가 이미 위치에 함축돼 있는데(자식은 부모 바로 아래 행, React DevTools는 간선을 아예 안 그린다), 그룹 간 간선만 위치로 예측 불가능해 정보 가치가 높다. 현행은 둘을 같은 무게로 그려 Tufte data-ink 관점의 배분이 역전돼 있었다.

시작 상태: 노드 레벨 간선은 그룹 간이면 `edge-cross-group`(주황 점선), 그룹 내면 클래스 없음(둘 다 같은 강도). 간선 semantic zoom은 **이진**이었다 — `.zoom-far`(지도 모드, `zoom < 0.55`)면 노드 간선 전부 숨김(집계 `edge-group-link`만 표시), `.zoom-near`면 전부 표시.

## 결정 (Decision)

원칙 한 줄: **잉크를 정보 가치에 비례시킨다** — 위치가 이미 말해주는 그룹 내 간선은 죽이고, 위치가 못 말해주는 그룹 간 간선은 살린다.

### a. 시각적 감쇠 (`toFlow.ts` + `flow.css`)

- 그룹 내 간선에 `edge-same-group`을 붙여 **hairline(stroke-width 1) + 옅은 회색**(다크 대응 포함)으로 죽인다. 그룹 간 간선(`edge-cross-group`)은 **현행 강도 유지**(감쇠 안 함).
- 그룹 내 **깊이**에 따라 더 옅게: `toFlow`가 `edge-depth-{1,2,3}` 클래스를 붙이고 CSS가 opacity 0.7/0.5/0.35로 낮춘다(3은 "3 이상" 포화 버킷). 깊을수록 트리 위치가 이미 관계를 말해주므로 잉크를 더 줄인다.
- **그룹 내 깊이** = 같은 그룹 조상을 몇 번 거슬러 올라가야 그룹 경계(다른 그룹 부모/루트)에 닿는가. 그룹 경계를 넘으면 0으로 리셋된다 — "이 그룹 서브트리 안에서 얼마나 깊은가"만 잰다. 노드 좌표의 순수 함수라 **라이브 안정성은 레이아웃에서 상속**된다(ADR-0008).
- props 흐름 장식(`edge-tracked`/`edge-hot`, ADR-0032)은 감쇠 예외 — 클러터가 아니라 신호이므로 깊이 opacity를 무시하고 또렷하게 유지한다.

### b. 단계형 LOD — 간선 semantic zoom (`SemanticZoomController.tsx` + `flow.css`)

현행 이진(지도=전부 숨김 ↔ 상세=전부 표시)을 **3단**으로 나눈다. 상세 모드(노드가 보이는 구간, `zoom ≥ 0.55`) 안에서도:

- **중간 줌**(`0.55 ≤ zoom < 0.9`, 새 `zoom-mid` 클래스): 구조 간선(그룹 횡단 + 그룹 내 얕은 깊이 ≤ `STRUCTURAL_GROUP_DEPTH`)만 두고 **깊은 간선(`edge-detail`)을 숨긴다.**
- **가까운 줌**(`zoom ≥ 0.9`): `edge-detail`이 위 depth opacity로 페이드인.
- **지도 모드**(`zoom < 0.55`, 기존 `zoom-far`): 노드 간선 전부 숨김(변경 없음).

"멀리선 고속도로만"이라는 지도 은유의 간선 확장. 구조 간선 = 연구문서 7절 b의 "그룹 횡단 + 깊이 1~2"를 형식화한 것이라 `STRUCTURAL_GROUP_DEPTH = 2`(깊이 3부터 detail).

## 근거 (Rationale)

- **배선기 없이, 표현 레이어만.** ADR-0029가 배선을 보류한 이유(막힌 증거 없음·라이브 안정성 위험)를 이 라운드는 건드리지 않는다 — 순수 CSS/클래스 분기라 노드 위치·데이터 스키마·레이아웃 불변식과 무관하고, 되돌리기 쉽다.
- **깊이를 그룹 경계에서 리셋**하는 게 핵심. "트리 전체 깊이"가 아니라 "그룹 내 깊이"라야 잉크-정보 정합이 맞는다: 그룹의 진입 노드(경계를 막 넘은 노드)는 깊이 0에서 다시 시작하므로, 큰 앱에서도 각 그룹의 얕은 골격은 늘 구조 간선으로 남는다.
- **라이브 안정성 공짜.** 깊이·클래스가 전부 노드 좌표/부모 관계의 순수 함수라, ADR-0029 3절이 경고한 "무관한 커밋에 전역 재배열"이 구조적으로 없다(배선기를 안 썼으므로).

## 결과 (Consequences)

- **신규 fixture `domains/deeptree/DeepTree.tsx`** — Level1~Level6을 한 파일(=한 그룹)에 정의·중첩해 그룹 내 깊이 1~5를 만든다. 기존 fixture는 `getSource`의 "사용 위치" 그룹핑 때문에 한 그룹 깊이가 최대 2뿐이라(예: DataFlow List→Row→Badge) 깊이 3+ detail 간선이 발생하지 않아, LOD 숨김/표시를 실측할 대상이 없었다. 실제 서드파티 앱(excalidraw 646노드 등)은 이보다 깊은 동일-파일 서브트리를 갖는다.
- **검증 `scripts/verify-edge-clutter.mjs`(`npm run verify:edge-clutter`)** — DeepTree 그룹을 검색으로 펼치고 줌 밴드를 오가며 실측: (a) 그룹 내 간선 opacity가 깊이에 단조 감소(d1 0.70 > d2 0.50 > d3 0.35), 그룹 간은 감쇠 없이 1.0, (b) 중간 줌에서 `zoom-mid` 적용 + detail 간선 opacity 0(숨김) + 구조 간선 유지, 지도 모드에서 노드 간선 전부 숨김(기존 회귀). 전부 통과.
- **유닛 테스트** — `toFlow.test.ts`에 깊이 버킷·detail 분류·그룹 경계 리셋 검증 추가. 기존 "그룹 내 간선은 클래스 없음" 기대는 "`edge-same-group edge-depth-1`"로 갱신.
- **튜닝 상수 노출** — `STRUCTURAL_GROUP_DEPTH`(=2), `EDGE_DEPTH_MAX`(=3), `EDGE_DETAIL_THRESHOLD`(=0.9)를 export해 조정 지점을 명확히 했다.
- **미구현으로 남기는 것**: 7절 c(hover 혈통 점등 — 검색 dimming 메커니즘 재사용, 다음 라운드), d(버스 획 병합 — 배선 라운드에 흡수), e(그룹 내 간선 완전 생략 — 급진안). 그리고 [ADR-0039](0039-lod-edge-prop-labels.md)의 간선 위 props 라벨은 "국소 클러터 판정"이 선행 조건인데, 이 라운드는 depth 기반 LOD까지만이고 국소 클러터(주변 간선 겹침) 판정은 배선 라운드로 남긴다.

## 관련 문서
- 선행 방향 결정(배선 보류 + 클러터 먼저): [ADR-0029](0029-orthogonal-edge-routing-deferred.md), [조사](../research/2026-07-18-orthogonal-edge-routing.md) 7절
- 라이브 안정성 원 고민(깊이가 순수 함수라 상속): [ADR-0008](0008-live-mvp-integration.md)
- 감쇠 예외인 props 흐름 장식: [ADR-0032](0032-props-flow-and-change-afterglow.md)
- 지도 모드 집계 엣지(이 라운드가 안 건드림): [ADR-0034](0034-group-level-waterfall-layout.md)
- 후속 간선 라벨(국소 클러터 판정 선행): [ADR-0039](0039-lod-edge-prop-labels.md)
