# ADR-0034: 그룹 간 배치 — 단일 행-패킹 → 부모 깊이 기반 waterfall(층 배치)

- 상태: 채택됨(ADR-0008의 "그룹 간 배치" 결정을 수정 — 그룹 내부 배치·순서 안정성 전략은 유지). **배치 방식은 이후 대체/개정됨**: x 좌표는 [ADR-0056](0056-downfall-parent-anchored-placement.md)(부모 앵커)→[ADR-0058](0058-tidy-tree-centered-group-layout.md)(tidy-tree 중앙 정렬)로 대체됐고(이 ADR의 "단일 행-패킹" 및 `MAX_ROW_WIDTH` 줄바꿈은 이제 폴더 중첩([ADR-0053](0053-folder-nested-grouping.md)) 경로에만 잔존, `computeGroupDepths`는 y-밴드 전용으로 역할 축소), 공유(다중부모) 그룹 처리는 아래 결정의 "옵션 (A)=최장 층에 1회"가 [ADR-0061](0061-shared-ui-lane.md)의 별도 "공유 레인"(원문에서 기각했던 옵션 B 계열)으로 개정됐다. 아래 본문은 당시 결정 기록으로 남긴다.
- 날짜: 2026-07-18

## 맥락 (Context)

UI 레이아웃 QA 중, 지도 모드(전체)에서 최상위 그룹들(`DemoApp.tsx`/`AppShell.tsx`/`CheckoutPanel.tsx`/`AdvancedPatterns.tsx`…)이 **서로 아무 관계 없이 그냥 나열**돼 보인다는 지적이 나왔다. 하지만 React 앱은 언제나 단일 트리이고 루트가 하나다 — 이 "최상위 그룹"들은 형제가 아니라 **실제로 부모→자식 포함관계**를 갖는다(`DemoApp`이 `AppShell`을 렌더하고, `AppShell`이 `CheckoutPanel`을 렌더하는 식). 그 관계는 이미 데이터에 있다: [`toFlow.ts`](../../src/visualization/lib/toFlow.ts)가 `parent.group !== n.group`일 때 cross-group 엣지로 그리고 있다.

문제는 [ADR-0008](0008-live-mvp-integration.md)의 레이아웃 전략이 그룹 **프레임 위치**를 이 관계가 아니라 "처음 등장한 순서로 행-패킹"([`layout.ts`](../../src/visualization/lib/layout.ts)의 `MAX_ROW_WIDTH`)으로 정한다는 것이다. 그룹 **안**은 이미 top-down 타이디 트리(waterfall)인데, 그룹 **사이**만 계층을 버리고 있어 "React 트리답게 위에서 아래로 흐르는" 직관이 지도 레벨에서 죽어 있었다.

ADR-0008이 행-패킹을 택한 유일한 이유는 성능/안정성이었다: 매 커밋마다 호출되는 라이브 배치에서 "새 그룹 하나 떴다고 전체가 재정렬되면 안 된다". 이 ADR은 그 안정성 요구를 깨지 않으면서 계층을 복원할 수 있는지를 결정한다.

## 검토한 대안 (Options)

그룹 그래프는 대개 트리지만, 공유 컴포넌트(여러 도메인에서 쓰이는 `Button` 등)가 있으면 **다중 부모(DAG)** 가 되고, 상호 렌더(A가 B를, B가 A의 공유 컴포넌트를)로 **사이클**도 생길 수 있다. 이 공유/다중부모 그룹을 어떻게 놓느냐가 유일한 실질 갈림길이었다:

- **(A) 가장 깊은 층에 한 번만 배치(최장 경로)** — 모든 사용처보다 아래층에 놓아 엣지가 항상 아래로 흐르게. 구현이 가장 단순하고 waterfall 불변식("부모는 위, 자식은 아래")을 지킨다. 멀리 있는 부모와 선이 길어질 수 있음. **채택.**
- **(B) 공유/유틸 그룹을 별도 사이드 레인으로** — 트리 흐름을 안 망가뜨리게 옆으로 뺌. 하지만 "어떤 그룹이 유틸인가" 판별 기준이 새로 필요하고, waterfall의 단순함이 사라진다. 기각.
- **(C) 사용처마다 복제 배치(고스트)** — 각 부모 밑에 같은 그룹을 여러 번. 직관적이나 "같은 그룹이 화면에 여러 개"라 혼란스럽고, 노드↔프레임 대응이 1:N으로 깨진다. 기각.

## 결정 (Decision)

**그룹 간 배치를 "단일 행-패킹"에서 "부모 깊이 기반 층(band) 배치"로 바꾼다.** cross-group 부모 관계에서 그룹 그래프를 만들고, 각 그룹의 깊이 = 루트 그룹으로부터의 **최장 경로**로 정해, 같은 깊이의 그룹을 한 가로 층에 놓고 층을 세로로 쌓는다. 공유 컴포넌트로 생기는 DAG/사이클은 **옵션 (A)** 로 처리한다 — DFS로 back-edge를 끊어 DAG로 만든 뒤 최장 경로를 재고, 공유 그룹은 가장 깊은 층에 **한 번만** 놓는다.

구현([`layout.ts`](../../src/visualization/lib/layout.ts)):
- `computeGroupDepths(nodes, groupList)` — cross-group 엣지 → 그룹 그래프 → DFS 사이클 절단 → 최장 경로 깊이. PENDING 그룹은 그래프에서 제외.
- `computeLayout`을 3단계로 분리: (1) 그룹 내부 배치(기존 캐시 그대로) + 노드 상대좌표 + 프레임 크기, (2) 그룹을 깊이별 층으로 버킷(PENDING은 항상 맨 아래 층), (3) 층을 위→아래로 쌓으며 배치(층이 `MAX_ROW_WIDTH`보다 넓으면 그 층 안에서만 줄바꿈).
- 노드 위치는 그룹 프레임 **상대좌표**라(toFlow가 `parentId`+`extent:'parent'`로 렌더) 층 배치와 무관 — 프레임의 x/y만 바뀐다.

**그룹↔그룹 집계 엣지 (지도 모드에서 계층을 선으로).** 층 배치만으로는 세로 위치가 계층을 *암시*할 뿐, "band 0의 어느 그룹이 band 1의 어느 그룹을 렌더하는지"를 위치만으로 구분할 수 없다. 그런데 노드 레벨 cross-group 엣지는 [`toFlow.ts`](../../src/visualization/lib/toFlow.ts)가 "양쪽 노드가 둘 다 펼쳐졌을 때만" 그리므로, 그룹이 전부 접히는 **지도 모드에선 선이 하나도 없다.** 그래서 "부모 그룹 → 자식 그룹"을 그룹당 1개로 집계한 엣지(`edge-group-link`)를 따로 만들어 그룹 프레임끼리 잇는다:
- `toFlow`가 cross-group 부모 쌍을 dedup해 `group:부모 → group:자식` 엣지를 push. PENDING·필터로 프레임이 안 만들어진 그룹은 제외.
- `GroupNode`에 top(target)/bottom(source) `<Handle>` 추가(엣지 앵커, `isConnectable={false}`, CSS로 숨김) — bottom→top이라 waterfall 방향과 일치.
- [`flow.css`](../../src/visualization/flow.css): 이 엣지는 상세 모드에선 숨기고(노드 레벨 엣지가 대신 보임) `.zoom-far`(지도 모드)에서만 되살린다 — 기존 "지도 모드에선 모든 엣지 opacity:0" 규칙을 이 클래스만 역전.

## 근거 (Rationale)

- **관계 데이터가 이미 있다.** cross-group 부모관계는 `toFlow`가 엣지를 그리려고 이미 계산하던 것이다. 추가 순회 없이 같은 관계를 프레임 배치에도 쓴다.
- **ADR-0008의 순서 안정성이 깨지지 않는다 — 오히려 더 잘 지켜진다.** 새 그룹의 세로 위치(층)는 부모 그룹이 정하므로 뜨자마자 올바른 층에 꽂히고, 한 층 안 좌우 순서는 여전히 `groupOrder`(= 처음 등장한 순서)를 tiebreaker로 쓴다. 유일하게 흔들리는 경우는 그룹의 깊이 자체가 바뀔 때(라우트 전환으로 재부모화)인데, 그건 트리가 실제로 바뀐 것이라 움직이는 게 옳다.
- **성능 영향 없음.** 그룹은 도메인 파일이라 개수가 노드보다 훨씬 적고(대형 앱도 수십~74개) 그래프 깊이도 한 자릿수다. 층 배치 계산은 무시할 비용이며, [ADR-0017](0017-viewport-based-partial-recompute.md)이 다룬 O(n) 제약(React Flow에 넘기는 노드 배열 크기)과 무관하다.
- **cross-group 엣지가 없으면 기존과 동일.** 모든 그룹이 depth 0 → 단일 층 → 기존 행-패킹과 같은 배치로 자연스럽게 폴백한다(기존 테스트 9개가 그대로 통과하는 이유).
- **옵션 (A)를 택한 이유:** DAG를 억지로 트리로 왜곡하지 않고, "엣지는 항상 아래로 흐른다"는 waterfall 불변식을 가장 단순하게 지킨다. 선이 지저분해지면 그때 [ADR-0029](0029-orthogonal-edge-routing-deferred.md)의 직교 배선을 얹으면 되고, 층 배치는 배선기와 궁합이 좋다.

## 결과 (Consequences)

- **지도 모드가 세로로 길어진다.** 기존엔 넓은 그리드였고 이제 층이 쌓여 세로로 흐른다. `fitView`가 이를 담으며(ADR-0018 `minZoom=0.001`이 극단값을 이미 처리), Canvas의 auto-refit은 그룹 이름 Set(순서 무관)만 쓰므로 이 변경과 무관하다.
- **라벨 declutter는 여전히 미해결(선행 과제).** 극단 줌아웃(4% 등)에서 층 라벨이 겹치는 건 ADR-0018이 후속 과제로 남긴 declutter 문제 그대로다 — 이 변경이 새로 만든 결함이 아니다. 층 배치는 오히려 같은 깊이 그룹을 세로로 분리해 겹침을 일부 완화한다.
- **`groups` 반환 배열 순서가 orderedGroups 순서 → 층 순서로 바뀐다.** toFlow는 좌표로 렌더하므로 순서 비의존이고, Canvas의 refit도 Set 기반이라 영향 없음을 확인했다.
- **검증:** 유닛 테스트 추가 — `layout.test.ts` 5개(waterfall 층·형제 동일 층·공유 그룹 1회 배치·사이클 무한루프 방지), `toFlow.test.ts` 4개(집계 엣지 생성·dedup·필터 제외·PENDING 제외). 전체 244개 통과, `tsc` 클린. `npm run verify`(Playwright) 콘솔 에러 0. 지도 모드(51%) 스크린샷으로 그룹 프레임끼리 `DemoApp → AppShell → {CheckoutPanel, AdvancedPatterns, ReportsPanel} → LiveFeed → {ClassCounter, …}` 계층이 선으로 이어지는 것을 확인(집계 엣지 9개, 10개 그룹 트리의 N-1).
- **되돌리기 쉬움:** 데이터 스키마·그룹 내부 배치·노드 상대좌표는 전부 불변이다. 층 배치는 `layout.ts` 한 곳, 집계 엣지는 `toFlow.ts`/`GroupNode.tsx`/`flow.css`의 국소 추가라 각각 독립적으로 되돌릴 수 있다.
- **관련 문서:** 원래 레이아웃 전략 [ADR-0008](0008-live-mvp-integration.md), 성능 제약 [ADR-0017](0017-viewport-based-partial-recompute.md), 지도 모드 LOD/카메라 [ADR-0018](0018-map-mode-lod-and-camera-refit.md), 향후 직교 배선 [ADR-0029](0029-orthogonal-edge-routing-deferred.md).
