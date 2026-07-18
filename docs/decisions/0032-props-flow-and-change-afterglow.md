# ADR-0032: props 흐름 추적 + 변경 잔상(afterglow) — 데이터 스코프 확장 1단계

- 상태: 채택됨 — **구현 완료(2026-07-18)**
- 날짜: 2026-07-18

## 맥락 (Context)

"렌더 트리를 넘어 데이터 흐름까지 보여주기"는 이 도구의 오랜 프론티어다(사용자가 맨 처음 보여준 Figma가 stores→컴포넌트 props 간선이었고, [ADR-0028](0028-shape-vocabulary-for-node-roles.md)/[ADR-0029](0029-orthogonal-edge-routing-deferred.md)가 독립적으로 "여기가 트리를 깨는 지점"이라 짚었다). 데이터 스코프 확장을 논의한 결과, 세 갈래의 난이도가 극과 극임이 드러났다:

| 스코프 | 간선 성격 | 트리를 깨나 | 데이터 | 난이도 |
|---|---|---|---|---|
| **props 흐름/이력** | 렌더 트리를 그대로 따라 내려감 | ❌ 안 깸 | `fiber.memoizedProps`(+`alternate`) | 쉬움 |
| Context(Provider→Consumer) | 트리 무관 새 간선 | ✅ 깸 | `fiber.dependencies`/bippy `traverseContexts` | 중간 |
| Zustand/외부 스토어 | 트리 밖 | ✅ 깸 | `useSyncExternalStore` 훅 휴리스틱(익명·불안정) | 어려움 |

**Context/Zustand는 "나중에 필요해지면"으로 명시 보류했다.** 근거: (1) 선행 도구 조사상 아무도 "전역상태를 공간적 지도로" 그리지 않았고(빈 니치이자 곧 실패 신호 — Atomos/XState만 예외인데 둘 다 상태가 *명시적으로 모델링된* 경우다), (2) 비구조적 상태(Zustand 익명 객체, Context 암묵 소비)는 그리기가 근본적으로 흐릿하며, (3) 트리를 깨는 many-to-many 간선은 prior-art를 죽인 "스파게티" 실패 모드를 소환해 배선(ADR-0029)·필터가 갖춰지기 전엔 오히려 도구를 망칠 수 있다.

**props는 렌더 트리라는 명시적 구조를 그대로 타고 흐르므로**, Atomos가 Recoil에서 누린 "구조가 있어 그릴 수 있다"는 이점을 그대로 가진다 — 데이터 스코프 확장의 안전한 첫 단계다.

## 검토한 대안 (Options)

### 변경 이력의 범위

- **(b1) "지난 렌더 대비 바뀜"** — `memoizedProps` vs `alternate.memoizedProps` 비교. 한 스텝 뒤만. 스키마·메모리 비용 0. **채택.**
- **(b2) "값 타임라인 전체"** — 과거 값 버퍼 필요(메모리 + 커밋마다 저장, Redux DevTools 타임트래블 무게). 기각(지금은 과함).

### 변경을 어떻게 "보이게" 할까 — React Scan의 결함 회피

- **번쩍임(flash, React Scan 방식)** — 기각. React Scan은 "변화의 순간"과 "볼 수 있는 시간"을 묶어(0.2초 뒤 소멸) 빠른 변화에서 스트로브만 남고 뭘 추적할지 못 읽는다(사용자 실사용 피드백 — 알려진 구조적 한계).
- **변경 잔상(afterglow, 채택)** — 두 시간을 분리한다: 잔상은 몇 초에 걸쳐 천천히 식고, 빠르게 반복 변하면 열(heat)이 누적돼 "바쁜 구역"이 지속 발광한다. + 일시정지(pause)로 마지막 상태를 느긋하게 검사.

### props 패널 레이아웃

- **태그 구름형 칩** — 기각. 컴포넌트당 prop이 1~20개까지 흔한데 20개를 흩뿌리면 지저분하다.
- **우선순위 정렬 스크롤 리스트(채택)** — 한 줄에 `키: 값미리보기`, 각 줄 클릭 가능. 두 공짜 신호로 디클러터: 추적 가능(객체/콜백)을 위로·변경된 것을 맨 위+지속 마커, primitive는 아래로 흐리게.

## 결정 (Decision)

**데이터 스코프 확장의 1단계로 "props 흐름 추적 + 변경 잔상"을 만든다.** `RenderNode` 스키마(architecture.md "되돌리기 어려운")를 건드리지 않고, [ADR-0026](0026-bidirectional-interaction-implementation.md)과 동일한 구조(`fibersById` 보조 채널 + `interactionStore`, 클릭 시점 imperative read)로 얹는다.

**3개 층:**

1. **노드 선택 → props 패널.** `fibersById.getFiber(id)`로 그 순간 `memoizedProps`를 읽어 우선순위 정렬 리스트로 표시(얕은 값 미리보기만 — 깊은 직렬화 안 함). 추적 가능(객체/콜백)·변경된 prop을 위로, primitive는 흐리게.

2. **변경 감지(b1).** `memoizedProps` vs `alternate.memoizedProps`로 이번 커밋에 바뀐 키를 표시. 값 이력 버퍼는 두지 않되, **변경 "사실"의 마커는 잔상으로 남긴다**(값 타임라인이 아니라 하이라이트의 지속).

3. **prop 클릭 → 참조 동일성 흐름 추적.** 객체/콜백 행 클릭 시 클릭한 노드의 자손(기존 `parentId` 트리)을 훑어 `memoizedProps`에 **같은 참조**를 가진 노드를 하이라이트. props는 트리를 따라 흐르므로 경로가 곧 기존 트리의 서브체인이다 — **새 간선도 배선도 필요 없다.** primitive는 추적 대상에서 제외("추적 불가"로 회색).

**변경 잔상(afterglow):**
- 바뀐 노드는 몇 초에 걸쳐 천천히 식는 발광(0.2초 아님).
- 빠르게 반복 변하면 열이 누적돼 지속 발광("바쁜 구역").
- 일시정지 토글로 보드 갱신을 멈추고 검사(기존 커밋 디바운스 ADR-0013 위에 얹힘).

## 근거 (Rationale)

- **트리 보존 = 안전.** props는 부모→자식으로 렌더 트리를 따라 흐르므로 추적은 새 간선이 아니라 기존 트리의 서브체인 하이라이트다 — 배선(ADR-0029)·스키마를 안 건드린다.
- **참조 추적이 올바른 스코프.** 객체/콜백은 참조가 같아 정확히 추적되고, primitive(`count={0}`)는 무관한 컴포넌트도 가질 수 있어 의미 없다 — prop 드릴링의 실제 고통은 객체/콜백이니 이 스코프가 맞다(버그 아님).
- **잔상은 우리가 React Scan을 이기는 지점.** "번쩍이는 실시간"이 아니라 "차분한 지도"라는 이 도구 정체성에 느린 잔상·누적 열이 어울린다 — 모방이 아니라 결에 맞는 개선.
- **prop이 많아도 문제 안 됨.** 이미 정한 두 결정(참조 추적 스코프 + b1 변경 감지)이 자동으로 신호를 정렬해준다 — 20개를 균등 표시하는 게 아니라 바뀐 것·추적되는 것을 위로 올리고 나머지를 접는다.
- **on-demand read = 저비용.** 읽기는 클릭당 O(1)(커밋마다가 아니라), 추적 walk는 클릭당 O(자손 수) 1회.

## 결과 (Consequences)

- **신규(예상)**: props 패널 컴포넌트, 참조 추적 유틸(자손 walk + 참조 비교), afterglow/heat 상태(커밋 기반, 느린 decay), 일시정지 토글. 전부 `interactionStore`/`fibersById` 위 — `RenderNode`/`RenderSnapshot` 불변.
- **성능 스코핑**: 전체 노드 always-on 히트맵은 커밋마다 O(변한 노드)라, **뷰포트 안 노드로 한정하거나 토글 모드**로 두어 [ADR-0017](0017-viewport-based-partial-recompute.md) 전략과 일관되게 한다.
- **통합점**: "이 prop 추적"·노드 액션은 이미 있는 우클릭 컨텍스트 메뉴([ADR-0031](0031-collapse-context-menu-sticky-notes.md))에 얹으면 자연스럽다.
- **한계(정직하게)**: 참조 추적은 객체/콜백만(primitive 불가). 값은 얕은 미리보기만. 변경은 한 스텝 뒤(b1)만 — 전체 타임라인(b2)은 별도 과제.
- **스코프 밖(명시 보류)**: Context(Provider→Consumer 새 간선), Zustand/외부 스토어(익명·불안정) — 트리를 깨고 배선을 소환하는 다음 단계. "나중에 필요해지면".
- **되돌리기 쉬움**: 전부 인터랙션 레이어(프레젠테이션/상태)라 데이터 스키마·레이아웃 불변식과 무관하다.
- **관련 문서**: 동일 구조의 선례 [ADR-0026](0026-bidirectional-interaction-implementation.md), 데이터 흐름이 소환하는 도형/배선 [ADR-0028](0028-shape-vocabulary-for-node-roles.md)/[ADR-0029](0029-orthogonal-edge-routing-deferred.md), 통합점 [ADR-0031](0031-collapse-context-menu-sticky-notes.md).

## 구현 기록 (2026-07-18)

방향성 그대로 구현했고, `RenderNode`/`RenderSnapshot` 스키마는 예고대로 한 줄도 안 건드렸다. 구현 중 두 가지 설계 판단을 추가했다:

### 신규 파일
- `src/visualization/lib/propsFlow.ts`(+test) — 순수 로직: `readFiberProps`(우선순위 정렬: 변경→추적가능→primitive), `describeValue`(얕은 미리보기+종류+추적 가능 판정), `fiberPropsChanged`(b1: memoizedProps vs alternate), `trackReferenceInDescendants`(자손 walk + `Object.is` 참조 비교). bippy 없이 `{ memoizedProps, alternate }` 목업으로 단위 테스트된다.
- `src/visualization/lib/afterglowStore.ts`(+test) — heat 맵 + 느린 decay(half-life 900ms) + 누적(bump, 상한 1) + 일시정지. `interactionStore`와 같은 subscribe/getSnapshot 패턴이되, 스냅샷을 통째로 넘기지 않고 `getHeat(id)`로 노드별 개별 조회하게 했다(아래 ①).
- `src/visualization/components/AfterglowContext.tsx` — `AfterglowContext`(heat)/`TrackedNodesContext`(추적 집합) + `useAfterglowHeat`/`useIsTracked` 훅.
- `src/visualization/components/PropsPanel.tsx`(+test) — 우선순위 정렬 스크롤 리스트(칩 구름 아님), 변경됨/추적 중 배지, primitive 흐림/비활성.
- `scripts/verify-props-flow.mjs` — Playwright 통합 검증(`npm run verify:props-flow`).

### 수정 파일
- `Canvas.tsx` — 노드 선택→패널 배선, 커밋당 O(1) props 읽기(선택 노드 1개), 추적 이펙트(추적 중일 때만 자손 walk), 잔상 감지 이펙트(뷰포트 안 컴포넌트 노드만 대상), 툴바 토글 2개, 일시정지 시 snapshot freeze. `ComponentNode.tsx` — heat 발광 레이어 + `--tracked` 클래스(둘 다 context에서 읽음). `flow.css` — "ADR-0032" 라벨 구획. `index.ts` — 공개 API 확장. 셋 다 동시 세션(ADR-0028/0030/0034)과 공유 중이라 추가는 라벨링된 구획/additive edit로만 했다.

### 설계 판단 두 가지
1. **heat/tracked를 toFlow data가 아니라 context로 내려보냈다.** ADR 본문은 `interactionStore` 위에 얹는다고만 했는데, heat를 `ComponentNodeData`에 넣으면 decay 틱마다 전체 `flowNodes` 배열을 다시 만들어야 해 [ADR-0017](0017-viewport-based-partial-recompute.md)의 "배열 크기 = React Flow 비용" 함정에 정면으로 걸린다. 그래서 별도 `afterglowStore` + context를 만들고 각 `ComponentNode`가 `useSyncExternalStore`로 **자기 heat만** 구독하게 했다 — heat 0인 대다수 노드는 반환값이 안 바뀌어 리렌더되지 않고, 발광 중인 소수(뷰포트 한정)만 리렌더된다. 참조 추적(`tracked`)도 같은 이유 + 공유 파일(`toFlow.ts`) 변경면을 줄이려고 같은 채널로 통일했다.
2. **일시정지 = Canvas 진입점에서 snapshot을 freeze.** "보드 갱신을 멈추고 검사"를 데이터 진입점(`Canvas`의 `useSyncExternalStore` 직후)에서 한 번 얼리는 것으로 구현해, `BoardContent`의 snapshot 사용처를 하나도 안 바꾸고 보드 전체(노드/패널/추적/잔상)를 동시에 정지시켰다. `afterglowStore.setPaused`도 bump/decay를 멈춰 이중으로 고정된다.

### 참조 추적을 "간선 경로"로 표시 (후속 개선)
초기 구현은 추적된 자손 노드에 외곽선만 입혔는데, 레퍼런스 검토 결과 "props 흐름"은 관례적으로 **간선**에 표시된다(React DevTools는 패널로 검사, 데이터플로우 다이어그램·사용자 최초 Figma는 값의 흐름을 간선으로). 마침 ADR 본문이 이미 "경로가 곧 기존 트리의 서브체인"이라 못박았으므로, 추적을 **간선 경로 강조**로 옮겼다:
- 추적된 노드들(`trackedIds`) + 출발점(`selectedNodeId`)을 "보유자"로 보고, **양끝이 모두 보유자인 기존 부모→자식 간선**을 강조한다 — 그 간선이 이 참조가 실제로 지나간 경로다. 새 간선·배선 없음(스키마·레이아웃 불변).
- 강조 간선은 청록 굵은 점선 + `animated`(흐르는 애니메이션) + **간선 라벨에 흐르는 prop 이름**을 얹어 "이 간선으로 이 prop이 흐른다"를 명시한다. 노드 외곽선은 흐름의 끝점 표식으로 남긴다.
- `toFlow.ts`(동시 세션 편집 중)를 안 건드리려고 Canvas에서 `flowEdges`를 후처리해 className/label만 얹었다.

### 데모 fixture 추가 (`src/fixtures/domains/dataflow/DataFlowPanel.tsx`)
기존 fixture는 대부분 정적 primitive만 넘겨(예: CheckoutItem은 `label` 하나) 이 기능이 데모에서 안 드러났다. 같은 `data` 객체를 `DataFlowList → DataFlowRow → DataFlowBadge`로 drilling하고 1.5s마다 새 객체로 교체하는 fixture를 더해, 노드 클릭 한 번에 (변경됨 배지 / 간선 경로 추적 / 잔상)이 전부 보이게 했다. `DemoApp`에 배선.

### UX 후속 — "클릭 수 줄이기" 두 가지 (사용자 피드백)
"흐름을 보려면 노드 클릭 + prop 행 클릭 2단계"와 "변동을 보려면 잔상을 켜야 함"이 번거롭다는 피드백에 두 가지를 더했다. 원칙(상시 전체 정밀 흐름 = 스파게티, [ADR-0039](0039-lod-edge-prop-labels.md) 참고)은 지키되 공통 케이스의 마찰만 줄인다:
1. **선택 시 자동 추적** — 노드를 선택하면 대표 prop(방금 바뀐 추적 가능한 것 우선 → 없으면 첫 추적 가능한 것)을 자동 추적해 흐름(간선)을 **선택 한 번에** 보여준다. 선택 순간 1회만 걸리는 플래그(`autoTrackPendingRef`)라 이후 사용자의 수동 토글을 덮어쓰지 않는다.
2. **잔상 간선 발광(edge-hot)** — 잔상이 켜져 있으면 "양끝 노드가 지금 둘 다 뜨거운(방금 바뀐)" 기존 간선을 주황 발광시킨다 = 클릭 없는 "흐름 활동 히트맵". 정밀 추적(청록+라벨)과 색·역할이 다르다(동시-변경 상관관계지 정밀 참조 동일성 아님). `afterglowStore.getVersion()`(notify마다 증가)을 `useSyncExternalStore`로 구독해 heat 변화 때만 간선을 재계산한다 — heat가 0인 노드/간선은 스킵되어 잔상 켰을 때만 비용이 든다(ADR-0017 일관).

### UX 후속 2 — origin 간선 + 잔상 시각 언어 (사용자 피드백)
1. **추적 간선을 "자식이 받았는가" 기준으로** — 초기엔 "양끝이 모두 보유자인 간선"만 강조해, 참조가 처음 들어오는 origin 간선(부모→선택 노드)이 빠졌다(예: `data`가 생성되는 `DataFlowPanel`→`DataFlowList`). props는 부모→자식으로 흐르므로 간선이 참조를 나른다 ⟺ **자식(target)이 그 참조를 받았다**로 판정을 바꿔, origin 간선까지 자연히 포함시켰다(검증에서 6→7개로 늘어남 확인).
2. **잔상 시각 언어를 "뭉툭한 글로우"→"heat 색 링"으로** — React DevTools "Highlight updates"의 "빈도=색" 관례를 따랐다: 글로우가 아니라 **또렷한 색 링**으로 위치를 정확히 짚고, heat를 색으로 인코딩한다(가끔=차가운 파랑 → 자주=뜨거운 빨강). 색 경로는 파랑→보라→마젠타→빨강으로 잡아 검색 매치(초록)·참조 추적(청록)과 안 겹치게 했다. decay가 진행되면 링 색이 천천히 식는다(React Scan의 0.2초 스트로브와 대비되는 우리 정체성). `color`를 인라인으로 주고 border/box-shadow가 `currentColor`를 따르며, `transition: color`로 식는 색이 부드럽게 이어진다.

### UX 후속 3 — "잔상(노드 발광)"에서 "흐름(간선 애니메이션)"으로 무게중심 이동 (사용자 피드백)
"이 도구의 동적 스토리는 props **흐름**인데, 노드가 켜지는 '잔상'은 React Scan의 '바뀐 걸 켠다' 어법을 빌려온 것 아니냐"는 지적을 받아들였다. 맞는 지적이라 주(主) 동적 표현을 노드→간선으로 옮겼다:
- **간선이 주인공**: `edge-hot` 조건을 "양끝이 뜨겁다"에서 **"자식(target)이 방금 바뀌었다"**로 바꾸고 `animated: true`를 줬다. props는 부모→자식으로 흐르므로 자식의 props가 바뀌었다는 건 "이 간선으로 방금 데이터가 흘러왔다"는 뜻이고(잔상은 prop 변경만 bump), React Flow의 움직이는 점선이 source→target 방향이라 **데이터가 트리를 타고 내려가는 게 그대로 보인다**. React Scan(노드 outline)·react-sight(정적 트리) 어느 쪽도 안 하는 우리 어법이다.
- **노드는 보조**: 예전의 두꺼운 heat 색 링을 얇은 표식(1.5px, glow 제거)으로 줄여 "여기가 방금 바뀌었다"만 은은히 알린다.
- **이름**: 툴바 라벨 `✨ 잔상` → `🌊 흐름`(내부 식별자 `afterglow*`는 유지 — 공유 파일 변경 최소화, 문서로 매핑).

### UX 후속 4 — 지도 모드 그룹 흐름 "활동 기상도" (사용자 피드백, Q2)
"흐름을 wide view(지도 모드)에서도 볼 수 있게" 하자는 제안을 구현했다. 지도 모드에선 개별 노드/간선이 semantic zoom으로 접혀 노드 단위 흐름이 안 보이는데, **그룹 단위로 집계**해 해결했다:
- **바쁜 도메인이 발광**: 흐름 감지 이펙트가 지도 모드에선 전체 visible 컴포넌트를 훑어 "멤버가 바뀐 그룹"을 집계(`afterglowStore.bumpGroups`)하고, `GroupNode`가 자기 그룹 heat를 구독해 프레임을 heat 색으로 발광시킨다.
- **도메인 간 흐름**: 이미 있는 그룹↔그룹 집계 간선([ADR-0034](0034-group-level-waterfall-layout.md))이 "자식 그룹이 방금 바뀜"일 때 부모→자식으로 흐른다(`edge-hot` + animated).
- **비용/스코핑**: 지도 모드 집계는 뷰포트 한정이 아니라 커밋마다 전체 노드를 훑는다 — 하지만 흐름 켰을 때만 드는 opt-in "토글 모드"라 ADR 본문 "성능 스코핑"이 허용한 두 안("뷰포트 한정 **또는** 토글 모드") 중 후자다. 대형 앱은 실측 후 필요하면 더 좁힌다.
- `afterglowStore`에 그룹 heat 채널(문자열 키, 노드 heat와 분리·같은 decay/일시정지 공유)을 추가. 노드 heat API(숫자 키)는 불변이라 기존 코드·테스트 그대로.

또한 사용자와 "React Scan 기능(페이지 위 스트로브·렌더 카운트·렌더 이유)을 얼마나 가져갈지" 스코프를 논의해, **페이지 위 스트로브는 정체성 충돌·스코프 크리프로 넣지 않고**, 이 도구는 "차분한 지도 + 양방향 + props 흐름"에 집중하기로 재확인했다(렌더 카운트 뱃지는 값싼 on-brand 옵션으로 남겨둠).

### UX 후속 5 — 흐름 간선에 "흐르는 prop 이름" + 버튼 라벨 + 데모 2종 (사용자 피드백)
- **흐름 간선 라벨**: 흐름 모드에서 각 간선에 "지금 흐르는 대표 prop 이름"을 얹는다(`representativeChangedProp` — 자식이 방금 받은 변경 prop 중 추적 가능한 것 우선). 스크린샷에서 간선마다 `data`/`snapshot` 라벨. 그룹 집계 간선(지도 모드)은 대표가 모호해 라벨 없음.
- **버튼 라벨**: `🌊 흐름` → `🌊 props 흐름 보기`(켜짐: `props 흐름 보는 중`) — 무엇을 보여주는지 명확히.
- **데모 fixture 2종**(`StateFlowDemo.tsx`): (1) **느린(5s) 상속** — DataFlowPanel(1.5s)은 식기 전 재점화돼 계속 뜨거운데, 이건 간격이 넉넉해 흐름이 "시작→빨강→파랑으로 식음→소멸" 한 사이클을 눈으로 볼 수 있다(잔상 half-life ~5s와 맞물림, 앞서 "색이 식을 시간이 없다" 피드백 해소). (2) **내부 상태 변화** — 자기 `useState`로 리렌더되는 컴포넌트는 흐름에 안 잡히지만(우리 스코프=prop 변경), 그 state에서 파생한 값을 받는 자식은 잡힌다 → "내부 상태는 자식으로의 props 흐름으로 드러난다"를 시연.

### 검증
- `npm run test`: 이 라운드 신규(propsFlow[+representativeChangedProp]·afterglowStore[+group]·PropsPanel) 포함 **전부 통과(291개)**. 내 파일 `tsc`/lint 클린.
- `npm run verify:props-flow`(콘솔 에러 0): 상세 모드 = 노드 표식 + 흐름 간선 7(부모→자식 애니메이션, origin 포함); **지도 모드 = 바쁜 도메인 프레임 발광 1 + 도메인 간 흐름 간선 1**(활동 기상도).
- `npm run verify:props-flow`(Playwright, DataFlow fixture, 콘솔 에러 0): (1) DataFlowList 선택→패널 `data { version, label, hue }`(위)+`onPick ƒ`, (2) 1.5s 갱신 후 `data`에 "변경됨" 배지, (3) **row 클릭 없이 선택만으로** 자동 추적 → 끝점 6 + 간선 6(.edge-tracked) + 라벨 "data", (4) 잔상 켜고 노드 발광 7 + **클릭 없이 간선 발광 6(.edge-hot)**, 일시정지 후 발광 7 유지(freeze 확인).

### UX 후속 6 — 인터랙션·크롬 정리 (사용자 피드백, 후반 라운드)
props 흐름과 짝을 이루는 인터랙션/크롬을 다듬었다(일부는 다른 세션 소유 ADR을 사용자 요청으로 조정):
- **Alt(⌥)-held 라이브 동시 햇칭** — Alt를 누른 동안 실제 화면에서 커서 아래 요소 + 대응 다이어그램 노드를 동시에 햇칭으로 밝힌다(픽 hover ADR-0038를 Alt 트리거로 확장 + `interactionStore.hoverNodeId`(요소→노드) 추가 → `PageHoveredNodeContext`로 ComponentNode에 전달). 전부 클라이언트 이벤트 리스너라 새 권한 0, rAF 스로틀 + Alt/픽 아닐 땐 리스너 0.
- **더블클릭 통합** — 예전엔 확대/스크롤/하이라이트가 더블클릭 횟수마다 따로 걸렸는데, 한 번의 더블클릭 = 보드 확대 + 실제 요소 스크롤 + 실제요소·노드 햇칭으로 합쳤다. 스크롤은 `behavior:'smooth'`(비동기라 하이라이트가 스크롤 전 위치에 측정됨) → **instant**로 바꿔 측정 위치를 정확히.
- **역방향 fitView 분리** — 역방향 착지 카메라 이동이 더블클릭과 `firedForRequestRef`(카운터 가드)를 공유해, 더블클릭 후 다음 역방향의 fitView가 막히는 취약점(하이라이트만 되고 카메라 안 움직임)을 발견 → **독립 `pendingFitRef`**(옮길 노드 id를 들고 있다 노드가 flowNodes에 나타나면 한 번 fitView·비움)로 바꿔 완전 분리.
- **하이라이트 채움 → 햇칭 통일**(`ROUGH_FILL_HIGHLIGHTED` solid→hachure): solid 채움이 노드 텍스트를 덮어 가독성을 해쳐, 검색=녹색 햇칭/픽·역방향=인디고 햇칭으로 기법 통일(ADR-0035 조정).
- **툴바 크롬 정리** — 좌/우 도킹 시 도킹 컨트롤(ADR-0040)이 host 체크박스를 가리던 것 패딩으로 해소, 좁은 패널은 `도구` 오버플로 드롭다운(검색+메뉴 한 줄)으로, 드롭다운 버튼 rough 크롬 제거(깔끔한 실선), 툴바 버튼 이모지 전부 제거 + 검색 placeholder `검색`(잘림 해소).
