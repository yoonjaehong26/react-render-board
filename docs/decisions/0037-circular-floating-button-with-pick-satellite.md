# ADR-0037: 플로팅 버튼 형태 — 알약 2개 → 원형 FAB + 픽 위성

- 상태: 채택됨(ADR-0020/0025의 "플로팅 버튼" 노출 위치를 형태만 구체화, ADR-0035 손그림 크롬 유지·확장)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0020](0020-distribution-entry-ux-direction.md)이 "같은 페이지 + 플로팅 버튼(TanStack Query Devtools 패턴)"을, [ADR-0025](0025-docked-panel-shell-amendment.md)가 "하단 도킹 패널"을 정했다. 그동안 실제 UI는 화면 우하단에 **직사각형 알약 버튼 2개**였다 — "🎯 요소 선택"(픽 모드 토글)과 "render-board 열기/닫기". [ADR-0035](0035-shape-and-hand-drawn-implementation.md)가 이 버튼들에 볼펜 세기 rough 사각 테두리(`CHROME_BORDER`)와 "render-board" 워드마크 손글씨를 입혔다.

UI QA에서 사용자가 원한 형태는 달랐다: **TanStack Query처럼 원형 메인 플로팅 버튼 하나 + 바로 옆에 붙은 작은 원형 위성**(요소 선택 모드 토글, react-scan의 "요소 선택"에 해당). 알약 2개는 화면을 더 많이 차지하고, "메인 액션(보드 열기) vs 보조 토글(픽 모드)"의 위계가 드러나지 않는다.

## 검토한 대안 (Options)

- **알약 2개 유지** — 기각. 사용자가 명시적으로 원형 FAB를 원했고, 위계가 안 보인다.
- **원형 FAB + 위성, rough 크롬은 제거하고 깔끔한 원으로** — 기각. ADR-0035가 방금 이 버튼에 입힌 손그림 정체성을 되돌리는 셈이고, 병행 세션의 작업을 임의로 덮는 것이다(CLAUDE.md 원칙).
- **원형 FAB + 위성, rough 크롬을 원형으로 확장** — 채택. 사각 `CHROME_BORDER`를 `border-radius:50%`로 자르면 모서리 스케치가 잘려 어색하므로, 같은 볼펜 세기(roughness 0.3)로 **rough 원**(`CHROME_CIRCLE`)을 새로 그려 손그림 언어를 원형에 그대로 이었다. ADR-0035를 되돌리지 않고 확장한다.

## 결정 (Decision)

**우하단 플로팅 버튼을 "원형 메인 FAB + 작은 픽 위성"으로 바꾼다.**

- **메인 FAB**(∅52px): 보드 열고 닫기. 평소엔 **렌더 트리 글리프**(상단 노드→자식 둘로 뻗는 작은 트리, 이 도구가 보여주는 waterfall 렌더 트리의 축소형)의 원. **hover/포커스 시 옆으로 "render-board" 워드마크가 펼쳐지며 알약이 된다**(TanStack Query Devtools식 hover-expand — 평소는 깔끔한 아이콘, 브랜드는 hover에). 열려 있는 동안은 채움(인디고)으로 눌린 상태 표시.
- **픽 위성**(∅36px, 메인 왼쪽에 붙음): 요소 선택 모드 토글. 마우스 포인터 아이콘(인라인 SVG). 활성 시 채움(인디고)으로 표시.
- 손그림 크롬(ADR-0035)을 유지·확장한다: 위성과 접힌 메인 FAB는 `CHROME_CIRCLE`(rough 원, `roughStyle.ts`에 추가), 펼쳐진 메인 FAB는 기존 `CHROME_BORDER`(rough 사각/알약). 메인 FAB는 두 이미지를 CSS 변수(`--fab-circle`/`--fab-pill`)로 받아 hover 시 `background-image`를 갈아끼운다. 호스트-앱 크롬이라 보드 내부 다크모드와 무관하게 항상 라이트 변형.
- 워드마크는 접힘 상태에서 `max-width:0`+`opacity:0`으로 숨겼다가 hover 시 펼쳐, 폭·투명도를 transition으로 부드럽게 애니메이션한다.
- **접근성 이름(`aria-label`)은 "render-board 열기/닫기"를 그대로 유지**한다 — verify 스크립트(`scripts/lib/openBoard.mjs` 등)가 이 이름으로 버튼을 찾으므로, 표시가 모노그램으로 바뀌어도 이름은 안 바꾼다. `aria-pressed`로 토글 상태를 노출한다.

## 근거 (Rationale)

- **위계가 형태로 드러난다.** 큰 원 = 메인 액션(보드), 작은 위성 = 보조 토글(픽). react-scan/TanStack이 검증한 "메인 FAB + 위성 컨트롤" 패턴이고, 알약 2개보다 화면을 덜 차지한다.
- **ADR-0035를 되돌리지 않고 확장.** rough 크롬을 원형으로 잇는 `CHROME_CIRCLE`은 기존 `CHROME_BORDER` 옆에 추가한 것이라 병행 세션의 손그림 작업과 충돌하지 않는다. 손글씨 워드마크도 "rb" 모노그램으로 이어진다.
- **성능 무관.** 플로팅 버튼은 노드 수와 무관한 O(1) 크롬 레이어(ADR-0030 성능 분석). `CHROME_CIRCLE`도 모듈 로드 시 2회(라이트/다크)만 계산하는 정적 이미지라 노드 수 비례 비용 0.
- **verify 회귀 방지.** 접근성 이름을 유지해 기존 Playwright 검증(보드 열기, 라우팅·shadcn 실앱 시나리오)이 그대로 통과한다 — 실제로 `npm run verify` 콘솔 에러 0으로 확인.

## 결과 (Consequences)

- **바뀐 것**: `BoardOverlay.tsx`(버튼 마크업), `flow.css`(`.board-fab*` 규칙이 `.board-toggle*`를 대체), `roughStyle.ts`(`CHROME_CIRCLE` 추가). 전부 프레젠테이션 레이어 — 데이터/인터랙션 로직(`interactionStore`의 `setBoardOpen`/`setPickMode`)은 그대로다.
- **검증**: `tsc` 클린, 유닛 테스트 248개 통과, `npm run verify` 콘솔 에러 0(버튼을 aria-label로 정상 탐색). 스크린샷으로 접힘(트리 글리프 원 + 커서 위성)·hover 펼침(알약 "render-board" 워드마크, 폭 190px)·픽 활성(위성 채움)·열림(메인 채움, aria-label "닫기") 상태 확인.
- **되돌리기 쉬움**: 전부 프레젠테이션이라 ui-philosophy.md 기준 되돌리기 쉬운 영역. 접힘/펼침 이미지를 CSS 변수로 분리해 아이콘·워드마크·알약 표현을 각각 독립적으로 바꿀 수 있다.
- **후속 여지**: 위성을 여러 개로 늘려(검색/테마 등) FAB 메뉴화하거나, 열림 상태에 hover-expand 워드마크를 "닫기"로 바꾸는 것도 이 구조 위에 얹을 수 있다.
- **관련 문서**: 플로팅 버튼 방향 [ADR-0020](0020-distribution-entry-ux-direction.md)/[0025](0025-docked-panel-shell-amendment.md), 손그림 크롬 [ADR-0030](0030-excalidraw-hand-drawn-visual-identity.md)/[0035](0035-shape-and-hand-drawn-implementation.md), 픽 모드 인터랙션 [ADR-0024](0024-board-dom-bidirectional-interaction.md)/[0026](0026-bidirectional-interaction-implementation.md).
