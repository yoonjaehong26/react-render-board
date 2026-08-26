# ADR-0091: 적응형 패널 배치와 분리 보드

- 상태: 채택됨
- 날짜: 2026-08-26

## 맥락

보드는 실제 React 앱과 대조하며 읽는 2D 캔버스라 상당한 화면 면적이 필요하다. 기존 패널은
overlay 전용이어서 선택한 실제 요소, 특히 전폭 섹션이나 좌/우 UI를 가릴 수 있었다. 반대로
임의의 주입 대상 앱 레이아웃을 자동으로 바꾸면 breakpoint·fixed/portal UI를 바꿔 관찰을 왜곡한다.

React Flow 12의 `MiniMap`은 `style.width/height`가 아니라 노드의 top-level `width/height` 또는
`measured`를 읽는데, 보드 노드는 전자만 제공하고 있어 미니맵이 비어 있었다.

## 결정

1. 고정 레이아웃 노드(폴더·그룹·컴포넌트·메모)는 CSS `style`과 top-level `width/height`를
   함께 제공한다.
2. 기본값은 대상 앱을 바꾸지 않는 `overlay`다. `reserve-space`는 `BoardOverlay`에 명시된
   `layoutTarget`에만 여백을 주며, 대상 경계를 모르는 주입 모드는 overlay만 쓴다.
3. 도킹은 상/하/좌/우 네 방향이며 크기·모드를 저장한다. 이전 저장값은 안전한 overlay로
   마이그레이션한다.
4. Alt+클릭으로 보드가 새로 열릴 때만, 선택 요소와 네 후보 패널의 교차 면적을 비교해 가장
   덜 가리는 쪽에 연다. 이미 열린 패널은 움직이지 않는다. 어느 방향도 충분하지 않은 대형
   요소는 52px 포커스 레일로 접는다.
5. Chromium Document Picture-in-Picture가 있으면 같은 Canvas 인스턴스를 별도 항상-위 문서로
   portal 렌더한다. CSS를 복제하고 닫히면 도킹 패널로 폴백한다.

## 결과

일반 통합은 기존처럼 대상 앱 레이아웃을 보존한다. 제어 가능한 통합은 선언적으로 공간을
확보할 수 있고, 선택 흐름에는 반대편 도킹·레일·PiP라는 단계적 탈출구가 생긴다.
`reserve-space`는 모든 fixed/portal UI까지 DevTools처럼 재배치한다고 보장하지 않는다.

`panelPlacement.test.ts`는 후보 선택/레일 판정을, `panelLayoutPreference.test.ts`는 저장값
호환성을, `toFlow.test.ts`는 MiniMap 기하 계약을 검증한다. 브라우저 실측에서 미니맵 노드 42개,
상단 도킹 및 공간 확보를 확인했다.
