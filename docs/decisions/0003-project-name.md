# ADR-0003: 프로젝트 이름 `react-render-board`

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

이름이 (1) 예측 가능하고(React 도구임이 드러나고), (2) "렌더링"이라는 실시간 성격과 (3) "Figma식 다이어그램 구조"라는 형태를 모두 드러내면 좋겠다.

## 검토한 대안

- 추상 네이밍 (Fiberscope, Canopy, Contour 등) — 멋있지만 예측성 낮음. React 도구임이 이름에 안 드러남.
- `react-render-map` — "map" 철학(줌/클러스터링)을 반영. "어떻게 보이는가" 강조.
- `react-render-diagram` — 가장 중립적/설명적.
- `react-render-canvas` — ❌ npm에 `<canvas>` 그리기 도구들이 이미 점유("그림판"으로 오해).
- `react-render-tree`, `react-tree-viewer` — 무난하나 형태 특징이 약함.
- `react-render-board` — "board"는 Figma/FigJam/Miro가 작업 공간을 부르는 단어. Figma식 형태가 이름에 드러남.

### 피한 함정

- `react-tree-map` / `react-treemap` — "Treemap"은 이미 확립된 별도 차트 종류(면적 기반 사각형). 완전히 다른 걸 기대하게 만듦.

## 결정

**`react-render-board`**

## 근거

- `react-` 접두사 → React 도구임이 즉시 드러남 (생태계 관례: react-devtools, react-scan, react-flow).
- `render` → 정적 분석 도구와 구분되는 "실시간 렌더 트리" 정체성.
- `board` → Figma/FigJam이 스스로를 부르는 단어. 사용자가 이름만 보고 형태를 가장 빠르게 연상.

## 결과

- npm bare 이름은 배포 전 최종 확인 필요 (npmjs.com / GitHub org / 상표).
- README에서 "왜 board인가"를 UI 철학(map-like 시각화)과 연결해 설명할 수 있음.
