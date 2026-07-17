# ADR-0026: 보드 ↔ 실제 DOM 양방향 인터랙션 구현

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0024](0024-board-dom-bidirectional-interaction.md)가 정한 최소 스펙(정방향: 보드 노드 클릭 → 실제 DOM 하이라이트, 역방향: 실제 DOM 클릭 → 보드 이동+하이라이트)을 실제로 구현했다. 이 라운드는 ADR-0024의 방향성을 그대로 따르되, 구현 중 두 가지 실측 문제를 발견해 설계를 수정했다 — 하나는 셸 자체([ADR-0025](0025-docked-panel-shell-amendment.md)로 별도 기록), 하나는 이 ADR이 다루는 "역방향 트리거 범위" 문제다.

**발견 1 — 셸 충돌**: ADR-0024가 전제한 "전체화면 오버레이"에서는 보드가 열려 있는 동안 실제 앱과 상호작용할 수 없다는 게 드러나 [ADR-0025](0025-docked-panel-shell-amendment.md)로 도킹 패널로 바꿨다.

**발견 2 — 모든 클릭에 반응하는 역방향의 부작용**: 도킹 패널로 바꾼 뒤에도 `scripts/verify.mjs`가 계속 실패했다. 원인은 최초 구현이 계측 대상 앱 안의 **모든** 클릭에 반응해 역방향 인터랙션을 트리거했기 때문이었다 — "항목 추가" 버튼을 누르면 실제로 항목은 추가되지만 동시에 보드가 그 버튼 노드로 확대(200%)돼 버려, 뒤이은 검증 단계(그룹 전체 보기, 다른 그룹으로 줌 등)가 전부 어긋났다. 이건 실제 사용성 문제이기도 하다 — 이 도구를 붙인 채로 앱을 평소처럼 쓰면 클릭할 때마다 보드가 반응해 정상적인 개발이 불가능해진다.

## 검토한 대안 (Options)

### 역방향 트리거 범위

- **모든 클릭에 반응(최초 구현)** — 기각. 위에서 서술한 대로 정상적인 앱 사용을 막는다.
- **Alt(⌥)+클릭만 허용** — React DevTools 엘리먼트 피커와 유사한 모델. 부분 채택.
- **별도 "요소 선택" 토글 모드 버튼만 허용** — 매번 모드를 켜야 하는 번거로움이 있지만, 여러 요소를 연달아 살펴볼 때 편하다. 부분 채택.
- **최종: 둘 다 지원** — Alt+클릭은 항상 가능한 원샷 제스처, 토글 모드는 연속 탐색용. 사용자 지시로 확정.

### preventDefault로 앱 자신의 클릭을 막는 시점

- **버블 단계 리스너(최초 구현)** — 기각. React 17+는 root 컨테이너에 클릭을 버블 단계로 델리게이트하는데, `startDomClickBridge`가 리스너를 붙이는 시점(같은 `subjectContainer`, `createRoot().render()` 이후)이 React의 델리게이트 리스너보다 뒤라 같은 버블 단계에서 React의 핸들러가 먼저 실행된다 — 그 뒤에 `preventDefault()`를 불러도 이미 늦다.
- **캡처 단계 리스너** — 채택. React의 델리게이트보다 먼저 실행되므로, "이 클릭은 요소 선택으로 처리한다"고 판단한 경우 `preventDefault`+`stopPropagation`으로 앱 자신의 핸들러가 아예 실행되지 않게 막을 수 있다. 이 좁은 조건(Alt+클릭 또는 픽 모드) 밖의 평소 클릭은 이 판단 자체를 하지 않고 그대로 통과시킨다.

## 결정 (Decision)

### 1. 데이터 레이어: `fibersById` (id → Fiber 역조회, `src/data/serialize.ts`/`store.ts`)

`RenderNode`/`RenderSnapshot` 스키마(architecture.md가 "되돌리기 어려운 결정"으로 고정)는 건드리지 않는다. `serializeFiberTree`가 이미 매 커밋 모든 host/composite fiber를 순회하는 김에 `fibersById: Map<number, Fiber>`(compositeFibers와 달리 host도 포함)를 추가로 채워 반환하고, `RenderStore`가 최신 커밋 것만 들고 있다가 `getFiber(id): Fiber | undefined`로 노출한다 — 반응형 스냅샷 밖의 순수 imperative getter라 리렌더를 유발하지 않는다.

### 2. Fiber ↔ DOM 매핑 (`src/hooking/domInteraction.ts`, 신규)

bippy가 이미 필요한 원시 기능을 제공한다 — 직접 구현하지 않았다:
- `findFiberIdForElement(el)`: `getFiberFromHostInstance(el)` → `getFiberId(fiber)`.
- `resolveHostElements(fiber)`: `getNearestHostFibers(fiber)` → 각 `.stateNode`(host면 자기 자신, composite면 가장 가까운 host 자손들).

### 3. `interactionStore` — 데이터 스키마와 분리된 순수 인터랙션 상태 (`src/visualization/lib/interactionStore.ts`, 신규)

`data/store.ts`와 같은 `subscribe/getSnapshot` 패턴이지만 완전히 별도인 작은 store. `RenderSnapshot`과 섞지 않은 이유: 인터랙션 상태(보드 열림 여부, 하이라이트 대상, 픽 모드)는 ui-philosophy.md가 "되돌리기 쉬움"으로 분류하는 영역이라 데이터 스키마의 안정성 요구와 다르다.

```ts
interface InteractionSnapshot {
  boardOpen: boolean;
  highlightedElements: Element[];       // HIGHLIGHT_DURATION_MS(1600ms) 뒤 자동 소멸
  navigateToNodeId: number | null;      // 역방향이 남기는 raw id (resolveVisibleId 이전)
  navigateRequestId: number;            // requestNavigate 호출마다 증가하는 nonce
  pickModeActive: boolean;              // "요소 선택" 토글 모드
}
```

`navigateRequestId`는 처음엔 없었다 — Canvas의 `useEffect`가 `navigateToNodeId` 값 자체를 의존성으로 썼는데, 도킹 패널(ADR-0025)에서는 보드가 이미 열린 채로 **같은** DOM 요소를 다시 클릭하는 게 실제로 가능해서(전체화면이었다면 보드가 화면을 덮어 물리적으로 불가능했다), 그 경우 id 값이 이전과 같아 React가 effect를 다시 안 돌렸다. 호출마다 증가하는 nonce로 바꿔 해결했다.

### 4. 역방향 트리거 게이팅 (`src/hooking/domInteraction.ts`의 `startDomClickBridge`)

캡처 단계 리스너, Alt+클릭 또는 `pickModeActive`일 때만 개입:

```ts
function handleClick(event) {
  if (!(event instanceof MouseEvent)) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const pickModeActive = interactionStore.getSnapshot().pickModeActive;
  if (!event.altKey && !pickModeActive) return; // 평소 클릭 — 관여하지 않는다.
  event.preventDefault();
  event.stopPropagation();
  // ... findFiberIdForElement → requestNavigate + highlight ...
  if (pickModeActive) interactionStore.setPickMode(false); // 1회성, 브라우저 네이티브 "요소 검사"와 같은 관례
}
```

### 5. 정방향 (`Canvas.tsx`의 `onNodeClick`)

`node.type === 'component'`일 때만: `store.getFiber(id)` → `resolveHostElements` → `interactionStore.highlight(elements)`. 도킹 패널(ADR-0025)이라 **보드를 닫지 않는다** — 전체화면이었던 최초 구현은 실제 화면을 드러내려고 보드를 닫아야 했지만, 도킹 패널은 계측 대상 앱이 항상 보이므로 그럴 필요가 없다.

### 6. 역방향 착지 (`Canvas.tsx`, `resolveVisibleId` — `src/visualization/lib/normalize.ts` 신규 export)

bippy가 돌려주는 raw id는 host 노드일 수 있고 지금 보드에서 숨겨져 있을 수 있다(`includeHostNodes: false`). `normalize.ts`가 이미 이 문제를 `findVisibleAncestor`로 풀고 있어 같은 기법을 재사용한 `resolveVisibleId(nodes, visibleIds, rawId)`를 새로 export했다 — rawId 자신이 안 보이면 `parentId`를 타고 올라가며 처음 보이는 조상을 찾는다. 찾으면 `fitView({nodes:[{id}], duration:400})` + `ComponentNodeData.highlighted`(`toFlow.ts` 신규 필드, 순수 프레젠테이션 상태) 설정.

### 7. DOM 하이라이트 렌더링 (`src/visualization/components/DomHighlightOverlay.tsx`, 신규)

`interactionStore.highlightedElements`를 구독해 각 요소의 `getBoundingClientRect()`(하이라이트 요청 시점 1회 측정 — 실시간 스크롤 추적은 이번 스코프 밖, 지속시간이 1.6초로 짧아 오차가 미미하다고 판단)를 `document.body`에 포탈로 그린다. `pointer-events: none`으로 실제 페이지 인터랙션을 절대 막지 않는다. ADR-0024 결정 5(요소 단위로 제한, 그룹 경계는 안 그림)를 그대로 지킨다.

### 8. `BoardOverlay.tsx` — 도킹 패널 + 요소 선택 토글 (신규, [ADR-0025](0025-docked-panel-shell-amendment.md) 참고)

`interactionStore`를 생성/공유하고 플로팅 버튼 2개(보드 열기/닫기, 요소 선택 토글), 도킹 패널(`boardOpen`일 때만), `DomHighlightOverlay`를 함께 마운트하는 조립 컴포넌트. `Canvas`/`BoardOverlay` 둘 다 `interactionStore`를 선택적 prop으로 받고, 생략하면 내부에서 하나 만든다 — `experiments/real-app-validation/excalidraw/.../mount.tsx`(이번 스코프 밖, 아직 이 신규 API를 안 씀)처럼 구버전 통합이 깨지지 않게 하는 하위 호환 경로다.

### 9. `src/main.tsx` 셸 재구성

좌우 분할(계측 대상 앱 고정 340px + 보드) 대신, 계측 대상 앱이 전체 화면을 쓰고 `BoardOverlay`가 별도 root(`document.body` 직속)로 얹힌다. `?board=off`는 `BoardOverlay` 자체를 마운트하지 않아 기존 ADR-0009/0012/0013 방법론(보드 열림/닫힘 비교)을 보존한다.

## 근거 (Rationale)

- 데이터 스키마를 안 건드리고 보조 채널(`fibersById`)과 별도 store(`interactionStore`)로 기능을 얹은 것은 architecture.md/ui-philosophy.md가 이미 그어 둔 "되돌리기 쉬움/어려움" 경계를 그대로 따른 것이다.
- Alt+클릭/픽 모드 게이팅은 이론적 설계가 아니라 `scripts/verify.mjs`가 실측으로 잡아낸 회귀(평소 클릭이 역방향을 오작동시킴)에 대한 직접적 수정이다.
- `resolveVisibleId`/캡처 단계 리스너 모두 기존 코드(`normalize.ts`의 `findVisibleAncestor`, React 이벤트 델리게이션 모델)를 재사용하거나 그 구조를 명시적으로 고려한 결과다.

## 결과 (Consequences)

- **신규 파일**: `src/visualization/lib/interactionStore.ts`(+test), `src/hooking/domInteraction.ts`(+test), `src/visualization/components/DomHighlightOverlay.tsx`(+test), `src/visualization/BoardOverlay.tsx`.
- **수정 파일**: `src/data/serialize.ts`/`store.ts`(+test), `src/visualization/lib/normalize.ts`(+test)/`toFlow.ts`(+test), `src/visualization/components/ComponentNode.tsx`(+test), `src/visualization/Canvas.tsx`, `src/main.tsx`, `src/index.css`/`src/visualization/flow.css`, `src/index.ts`(공개 API 확장), `scripts/verify.mjs`·`verify-high-frequency.mjs`·`verify-lazy-suspense.mjs`·`verify-advanced-patterns.mjs`·`verify-stress-scale-live.mjs`(보드 열기 단계 추가, `scripts/lib/openBoard.mjs` 신설), `scripts/verify-dom-interaction.mjs`(신규).
- **테스트**: 신규/수정 유닛 테스트 66개 추가(기존 130 - 이전 라운드 91 = 이번 라운드 39개 신규 파일 테스트 + 기존 파일 확장분), 전체 130개 통과.
- **검증**: `npm run test`/`lint`/`build`/`build:lib` 전부 그린. `scripts/verify.mjs`·`verify-advanced-patterns.mjs`·`verify-lazy-suspense.mjs`·`verify-stress-scale-live.mjs`·`verify-high-frequency.mjs`·`verify-dom-interaction.mjs` 6개 전부 콘솔/페이지 에러 0건으로 통과(응답 배율은 기존 ADR-0017 평탄화 범위 안에서 유지, 0.78~1.38배). `experiments/real-app-validation/excalidraw/`를 갱신된 `src/`로 재동기화 후 `scripts/verify-real-app.mjs` 재실행 — 67개 그룹 전부 클린(ADR-0019 회귀 없음), 콘솔 에러 0건.
- **스코프 밖(명시적으로 안 함)**: 호버 트리거, 하이라이트 실시간 스크롤 추적, props/state 값 캡처, Zustand/Context 시각화(ADR-0024가 이미 스코프 밖으로 명시), CLI init/번들러 자동 주입(ADR-0021, 별개 로드맵 항목), 다이어그램 색상 표기법 전면 적용(`research/2026-07-17-diagram-notation-conventions.md`는 아직 draft).
- **되돌리기 쉬움**: 인터랙션 로직 전체가 데이터 스키마 밖의 별도 store/컴포넌트로 격리돼 있어, 이 기능 자체를 되돌리더라도 `RenderNode`/`RenderSnapshot`이나 기존 시각화 파이프라인(P0~P4, ADR-0016~0019)에는 영향이 없다.
