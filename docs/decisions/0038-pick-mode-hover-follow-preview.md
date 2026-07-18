# ADR-0038: 픽 모드 hover-follow 프리뷰 — 마우스를 따라 컴포넌트 영역 실시간 강조(손그림)

- 상태: 채택됨(ADR-0024/0026의 픽 모드에 hover 프리뷰를 추가, ADR-0030 손그림 강조 재사용)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0024](0024-board-dom-bidirectional-interaction.md)/[ADR-0026](0026-bidirectional-interaction-implementation.md)의 "요소 선택(픽) 모드"는 **클릭 시점에만** 동작했다 — 픽 모드에서 계측 대상 앱의 요소를 클릭하면 그 요소를 fiber로 역조회해 보드 노드로 이동+강조한다. 하지만 클릭 전에는 "지금 뭘 고르게 되는지"가 전혀 안 보였다.

UI QA에서 사용자가 원한 건 react-scan / React DevTools 엘리먼트 피커의 그 동작이다: **픽 모드를 켠 채 마우스를 움직이면, 커서 아래의 컴포넌트 영역이 실시간으로 강조**되어 "클릭하면 이게 선택된다"를 미리 보여주는 것. 가능하면 이 프로젝트의 시각 정체성(Excalidraw풍 손그림, [ADR-0030](0030-excalidraw-hand-drawn-visual-identity.md))에 맞는 느낌으로.

## 검토한 대안 (Options)

### hover 강조를 무엇으로 그릴까 (표현 + 비용)

먼저 짚을 것: **이 프리뷰는 애초에 비싸지 않다.** 커서 아래 요소는 매 프레임 딱 하나라 노드 수 비례 비용이 없다. 그래서 "정적 이미지를 반드시 재사용해야 한다"는 제약은 불필요했고, 오히려 아래처럼 버그를 불렀다.

- **`HIGHLIGHT_RING`(노드용 정적 rough 이미지) 재사용** — 처음 채택했다가 **철회**. `HIGHLIGHT_RING`은 노드 크기(160×48)로 그린 rough 테두리라, `background-size:100% 100%`로 화면 절반만 한 큰 DOM 요소에 늘리면 **선 두께(strokeWidth 3)까지 12배로 뻥튀기**돼 테두리가 아니라 통짜 파란 덩어리가 됐다(실측 스크린샷으로 발견). 고정 크기 노드엔 맞던 이미지를 임의 크기 요소에 쓴 게 원인.
- **매 mousemove마다 rough.js로 요소 크기에 맞춰 계산** — 기각(불필요). 요소가 하나뿐이라 감당은 되지만, 굳이 rough를 다시 그릴 필요가 없다.
- **CSS 깔끔한 테두리 + 옅은 대각선 헷칭** — 채택. `repeating-linear-gradient` 헷칭은 **요소 크기와 무관하게 완벽히 늘어나고 JS 계산이 0**이다(paint만). 스트레치 왜곡 문제 자체가 사라지고, 헷칭 질감이 "프리뷰"라는 느낌도 준다(클릭 하이라이트의 실선 박스와 구분).

### hover 상태를 어디에 둘까

- **기존 클릭 하이라이트(`highlightedElements`) 재사용** — 기각. 클릭 하이라이트는 `HIGHLIGHT_DURATION_MS`(1.6초) 타이머로 자동 소멸하는데, hover는 마우스를 따라 즉시 교체되고 타이머가 없어야 한다. 둘을 섞으면 타이머 로직이 충돌한다.
- **별도 `hoverElements` 상태 + 시각적으로도 구분** — 채택. 라이브(타이머 없음) 프리뷰라 클릭 강조(테두리 박스)와 다른 표현(손그림 테두리)으로 그려 "프리뷰 vs 확정"을 눈으로도 구분한다.

## 결정 (Decision)

**픽 모드가 켜져 있는 동안 마우스를 따라 커서 아래 요소를 실시간 강조하는 hover-follow 프리뷰를 추가한다.**

- `interactionStore`에 `hoverElements` 상태와 `setHoverElements()` 추가 — 클릭 하이라이트와 분리된 라이브 상태(타이머 없음). 같은 요소면 알림을 보내지 않아(mousemove 스팸 방지) 요소가 실제로 바뀔 때만 재렌더한다. **픽 모드를 끄면 즉시 비운다.**
- `domInteraction.ts`의 클릭 브리지에 mousemove 브리지 추가 — **픽 모드가 켜진 동안만** subjectContainer에 `mousemove`/`mouseleave` 리스너를 붙이고(꺼지면 뗀다 → 평소 mousemove 비용 0), `requestAnimationFrame`으로 프레임당 1회만 `setHoverElements([커서 아래 요소])`를 반영한다.
- `DomHighlightOverlay`가 `hoverElements`를 **CSS 깔끔한 테두리 + 옅은 대각선 헷칭**(`.dom-highlight-overlay__hover`, `repeating-linear-gradient`)으로 실시간 렌더한다 — 클릭 하이라이트(`.dom-highlight-overlay__box`, 실선 박스+틴트)와 별도 클래스로 구분. 요소가 바뀔 때 위치/크기를 90ms로 전환해 "손으로 짚어가는" 미끄러지는 느낌을 준다. 헷칭은 크기 무관하게 늘어나므로 어떤 요소에도 왜곡 없이 깔끔하다.

## 근거 (Rationale)

- **"클릭하면 이게 선택된다"를 미리 보여준다.** 브라우저 네이티브 요소 검사·react-scan·React DevTools가 다 쓰는 검증된 프리뷰 모델이라 사용자에게 이미 익숙하다.
- **성능이 공짜다.** hover 강조는 CSS 그라디언트 paint뿐이라 mousemove마다 계산이 없고, 리스너는 픽 모드일 때만 붙으며, rAF로 프레임당 1회만 반영하고, 스토어의 동일-요소 가드로 같은 요소 위 이동은 재렌더조차 안 한다. 커서 아래 요소는 하나뿐이라 노드 수 비례 비용도 없다.
- **크기 무관 표현.** 헷칭 그라디언트는 요소가 버튼이든 화면 절반짜리 섹션이든 똑같이 깔끔하게 늘어난다 — 노드 고정 크기에 의존하던 rough 이미지의 스트레치 왜곡을 피한다.
- **클릭 모델을 안 건드린다.** 클릭 시점의 역방향 인터랙션(navigate+highlight)과 자동 픽-오프는 그대로다 — hover는 그 위에 얹은 프리뷰 레이어일 뿐이라, ADR-0026의 "평소 클릭엔 개입하지 않는다" 원칙과 실측 회귀 방지가 유지된다.

## 결과 (Consequences)

- **바뀐 것**: `interactionStore.ts`(hover 상태/메서드), `domInteraction.ts`(mousemove 브리지), `DomHighlightOverlay.tsx`(hover 렌더), `flow.css`(`.dom-highlight-overlay__hover`). 데이터 스키마(`RenderNode`)와 클릭 인터랙션 로직은 불변.
- **검증**: `tsc` 클린, 유닛 테스트 252개 통과(`interactionStore`에 hover 4개 추가 — 갱신/동일요소 무시/무타이머/픽오프 클리어). `npm run verify:dom-interaction` — 기존 클릭 브리지(정방향·역방향·평소클릭·지도모드) 전부 통과 + 신규 "픽 모드에서 hover 프리뷰 표시" / "픽 오프 후 프리뷰 소멸" 통과, 콘솔 에러 0. 스크린샷으로 작은 버튼·화면 절반짜리 넓은 요소 양쪽에서 테두리+헷칭이 왜곡 없이 깔끔함을 확인(초기 `HIGHLIGHT_RING` 스트레치 방식은 큰 요소에서 통짜로 칠해지는 버그가 있어 실측 스크린샷으로 발견·교체).
- **되돌리기 쉬움**: 전부 인터랙션/프레젠테이션 레이어(ui-philosophy.md "되돌리기 쉬움"). hover 상태 하나와 리스너 하나라 떼어내기 국소적이다.
- **알려진 한계**: hover 박스는 요소가 바뀔 때 측정하므로, 한 요소 위에 머문 채 페이지가 스크롤되면 잠깐 어긋날 수 있다(클릭 하이라이트와 같은 기존 한계, ADR-0025). 실시간 스크롤 추적은 과투자로 판단해 넣지 않았다.
- **후속 여지**: 지금은 커서 아래 host 요소를 그대로 강조한다. 향후 "그 요소를 그린 컴포넌트의 전체 영역"(fiber→nearest host들)으로 넓히거나, hover 중 컴포넌트 이름 툴팁을 띄우는 것도 이 구조 위에 얹을 수 있다.
- **관련 문서**: 픽 모드 [ADR-0024](0024-board-dom-bidirectional-interaction.md)/[0026](0026-bidirectional-interaction-implementation.md), 손그림 강조 링 [ADR-0030](0030-excalidraw-hand-drawn-visual-identity.md)/[0035](0035-shape-and-hand-drawn-implementation.md), 플로팅 버튼(픽 위성) [ADR-0037](0037-circular-floating-button-with-pick-satellite.md).

## 개정 (2026-07-18) — 정방향 hover 프리뷰: 보드 노드 hover → 실제 DOM 요소 엣칭

- 상태: 채택됨(위 hover-follow 메커니즘을 반대 방향으로 재사용)

원래 이 hover 프리뷰는 **역방향**(실제 요소 hover → 보드 노드 강조)만 있었다. UX QA에서 사용자가 요청한 대칭 동작은 **정방향**이다: **다이어그램 노드에 마우스를 올리면 대응하는 실제 개발 웹 요소에 그 엣칭(테두리 + 대각선 헷칭)이 뜨는 것.** 클릭이 아니라 hover만으로 "이 노드가 화면 어디인가"를 미리 보여준다(클릭 하이라이트 1.6초 타이머 전에).

- **구현**: `Canvas.tsx`의 `previewComponentNode(id)` — 노드 id로 `store.getFiber` → `resolveHostElements`(정방향 클릭 하이라이트와 같은 경로) → `interactionStore.setHoverElements()`. React Flow `onNodeMouseEnter`(component 노드일 때)에서 호출하고 `onNodeMouseLeave`에서 `setHoverElements([])`로 비운다. 이미 hover 혈통 점등(ADR-0044)이 걸어둔 같은 두 핸들러에 한 줄씩 얹었다.
- **왜 새 상태/스키마가 필요 없나**: 표현·렌더 경로(`hoverElements` → `DomHighlightOverlay.__hover`)와 fiber→host 조회(`resolveHostElements`)가 이미 다 있어, 정방향은 그 둘을 잇기만 하면 됐다. 픽 모드와 무관하게 동작한다(`DomHighlightOverlay`는 `hoverElements`를 픽 모드와 상관없이 그린다). 타이머 없이 leave에서 비우는 라이브 특성도 그대로 상속.
- **검증**: `tsc` 클린, `interactionStore`/`DomHighlightOverlay` 유닛 테스트 19개 통과. 데이터 스키마·클릭 인터랙션 로직 불변.
