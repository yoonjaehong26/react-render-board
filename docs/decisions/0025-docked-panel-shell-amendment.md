# ADR-0025: 배포 셸 수정 — 전체화면 오버레이 → 도킹 패널

- 상태: 채택됨(ADR-0020의 "노출 위치" 결정을 수정)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0020](0020-distribution-entry-ux-direction.md)은 보드의 노출 위치를 "같은 페이지 오버레이(플로팅 버튼 → 클릭 시 전체화면으로 확장)"로 정했고, `experiments/real-app-validation/excalidraw/.../mount.tsx`가 인라인 스타일로 이를 프로토타입했다. [ADR-0024](0024-board-dom-bidirectional-interaction.md)의 실제 구현([ADR-0026](0026-bidirectional-interaction-implementation.md)) 과정에서 이 셸을 `src/main.tsx`에 정식으로 포팅해 `scripts/verify.mjs`로 재검증하다가, **전체화면 오버레이가 열려 있는 동안은 계측 대상 앱과의 상호작용이 물리적으로 불가능**하다는 게 실측으로 드러났다 — React Flow의 pane이 클릭을 가로채 `verify.mjs`의 "항목 추가" 버튼 클릭이 `Timeout 30000ms exceeded`로 실패했다.

이건 스크립트만의 문제가 아니다. 실제 사용자도 마찬가지로 보드가 열려 있는 동안은 원래 앱을 전혀 조작할 수 없다는 뜻이고, 이는 ADR-0024가 만들려는 "정방향/역방향 인터랙션"(보드↔실제 화면을 오가며 탐색)의 전제와 정면으로 충돌한다 — 특히 정방향(보드 노드 클릭 → 실제 요소 하이라이트)은 애초에 실제 화면이 동시에 보여야 의미가 있다.

## 검토한 대안 (Options)

- **전체화면 오버레이 유지, 정방향 클릭 시 보드를 닫아 화면을 드러내는 방식으로 우회** — 기각. 매번 열고 닫는 전환이 번거롭고, 역방향(DOM 클릭 → 보드 이동)이 일어난 뒤 다시 뭔가를 조작하려면 또 닫아야 하는 왕복이 반복된다. 근본적으로 "둘 다 동시에 필요한" 유스케이스를 "하나씩 번갈아 보기"로 억지로 맞추는 셈이다.
- **도킹 패널(TanStack Query Devtools 패턴)로 전환** — 채택. 화면 하단 고정 영역만 차지하고, 나머지 화면(계측 대상 앱)은 패널이 열려 있는 동안에도 항상 보이고 조작 가능하다.

## 결정 (Decision)

**보드의 노출 위치를 "전체화면 오버레이"에서 "화면 하단 도킹 패널"로 바꾼다.** ADR-0020의 나머지 결정(같은 페이지, 플로팅 버튼으로 열고 닫음, npm+CLI init 연결 방식)은 그대로 유지한다 — 이번 수정은 "노출 위치" 축 안에서의 세부 조정이다.

- `src/visualization/flow.css`의 `.board-panel`: `position: fixed; bottom: 0; left: 0; right: 0; height: 45vh;` — 화면 하단 45%만 차지.
- 패널이 열려 있는 동안 그 아래 실제 앱 콘텐츠의 마지막 부분이 패널에 가려 영영 클릭할 수 없는 문제를 막기 위해, `BoardOverlay.tsx`가 `document.body`에 `rrb-board-open` 클래스를 달고 `src/index.css`가 `.subject-root`에 그만큼 `padding-bottom`을 추가해 스크롤로 끌어올릴 수 있게 했다.

## 근거 (Rationale)

- 실측(`scripts/verify.mjs`)이 "전체화면이면 상호작용 자체가 안 된다"를 명확히 보여줬다 — 이론적 우려가 아니라 재현된 결함이다.
- 도킹 패널은 TanStack Query Devtools(이 프로젝트가 배포 UX 설계에서 참고해 온 선례, ADR-0020 참고)가 실제로 검증한 패턴이다.
- 패널 높이(45vh)는 "계측 대상 앱이 항상 대부분 보여야 한다"는 요구와 "보드 안에서 그룹/노드를 알아볼 공간이 필요하다"는 요구 사이의 절충값이다 — 향후 리사이즈 가능한 패널(사용자가 드래그로 높이 조절)은 이번 스코프 밖으로 남긴다.

## 결과 (Consequences)

- `experiments/real-app-validation/excalidraw/.../mount.tsx`(전체화면 오버레이를 인라인 스타일로 처음 프로토타입한 코드)는 이번 ADR의 스코프 밖 — 그대로 둔다. 검증용 스파이크였고, 정식 구현은 이제 `src/visualization/BoardOverlay.tsx`다.
- **되돌리기 쉬움**: `.board-panel`의 CSS(`position`/`height`) 몇 줄과 `rrb-board-open` 클래스 하나가 전부라, 다시 전체화면으로 되돌리거나 리사이즈 가능한 패널로 확장하는 것 모두 국소적인 변경이다 — 인터랙션 로직(`interactionStore`, `domInteraction.ts`, `Canvas.tsx`의 클릭 핸들러)은 이 셸 모양과 무관하게 그대로 동작한다(실제로 [ADR-0026](0026-bidirectional-interaction-implementation.md)의 구현이 이 전환 전후로 바뀌지 않았다).
- **관련 문서**: 배포 진입 UX 전체 방향은 [`0020-distribution-entry-ux-direction.md`](0020-distribution-entry-ux-direction.md), 이 패널 위에서 동작하는 양방향 인터랙션 구현은 [`0026-bidirectional-interaction-implementation.md`](0026-bidirectional-interaction-implementation.md) 참고.
