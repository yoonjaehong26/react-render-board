# ADR-0043: 보드 노드 더블클릭 → 실제 화면으로 스크롤 이동 + 하이라이트

- 상태: 채택됨(ADR-0024/0026 정방향 인터랙션 확장)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0024](0024-board-dom-bidirectional-interaction.md)/[ADR-0026](0026-bidirectional-interaction-implementation.md)의 정방향 인터랙션은 보드 노드를 **단일 클릭**하면 대응하는 실제 DOM 요소에 1.6초 하이라이트를 띄운다. 하지만 그 요소가 스크롤로 밀려나 있거나 오버레이 패널(ADR-0040)에 가려 안 보이면, 하이라이트가 화면 밖에서 떠 사용자가 못 본다. 사용자가 "노드를 더블클릭하면 실제 화면에서 그 요소로 데려가 달라(가능하면 라우터 이동, 스크롤)"고 요청했다.

## 검토한 대안 (Options)

### 무엇까지 할까

- **라우터 이동** — 기각(불필요/불가). **보드에 노드로 보인다 = 지금 마운트돼 있다 = 이미 현재 라우트에 있다.** 다른 라우트의 컴포넌트는 렌더 트리에 없어 노드로도 안 나온다. 그래서 이동할 라우트가 없고, 애초에 앱의 라우터를 우리가 제어하지도 못한다. 스크롤이면 충분하다.
- **스크롤 이동 + 하이라이트** — 채택. `element.scrollIntoView({behavior:'smooth', block/inline:'center'})`로 실제 요소를 화면 중앙으로 가져온 뒤 기존 하이라이트를 띄운다. 단일 클릭(하이라이트만)과 구분되는 강한 "여기로 데려가줘".

### 더블클릭을 어떻게 감지할까

- **React Flow `onNodeDoubleClick`** — 기각. 첫 클릭이 props 패널(ADR-0032)을 열며 노드 배열을 리렌더해 **DOM 노드가 교체**되면, 네이티브 dblclick(같은 요소를 두 번 눌러야 성립)이 안 잡힌다 — 실측으로 스크롤이 전혀 안 일어남을 확인했다.
- **클릭 타이밍으로 직접 감지** — 채택. React Flow의 `onNodeClick`은 노드 id 기준이라 DOM이 바뀌어도 두 클릭 다 발화한다. 같은 id를 400ms 안에 두 번 누르면 더블클릭으로 취급해 스크롤 이동을 실행한다.

## 결정 (Decision)

**보드 컴포넌트 노드 더블클릭 = 대응 실제 요소로 스크롤 이동 + 하이라이트.** 단일 클릭(하이라이트 + props 패널)은 그대로 두고, `onNodeClick` 안에서 400ms 이내 같은 id 재클릭을 더블클릭으로 감지해 `revealComponentNode`(scrollIntoView + highlight)를 부른다. 발견성을 위해 컴포넌트 우클릭 컨텍스트 메뉴에도 "실제 화면으로 이동(스크롤)"을 추가한다.

## 근거 (Rationale)

- **오버레이 패널(ADR-0040)과 특히 잘 맞는다.** 패널이 앱을 안 밀고 덮기만 하므로 가려진 요소가 생기는데, 더블클릭 한 번으로 그 요소를 드러낸다.
- **라우터를 안 건드리는 게 옳다.** 노드로 보인다는 것 자체가 "현재 라우트에 마운트됨"이라 라우팅이 불필요하고, 앱 라우터에 개입하지 않는다는 도구 철학과도 맞다.
- **타이밍 감지가 리렌더에 강건하다.** props 패널 오픈으로 노드 DOM이 교체돼도 id 기준 `onNodeClick`은 두 번 발화하므로 더블클릭이 안정적으로 잡힌다(네이티브 dblclick은 이 상황에서 깨진다 — 실측).

## 결과 (Consequences)

- **바뀐 것**: `Canvas.tsx`에 `revealComponentNode`(scrollIntoView+highlight) + `handleNodeClick`의 400ms 더블클릭 감지 + 컨텍스트 메뉴 항목 하나. 데이터/인터랙션 스토어·스키마 불변.
- **검증**: `tsc` 클린, 유닛 테스트 278개 통과. Playwright 실측 — 컨텍스트 메뉴 reveal로 스크롤 로직 확인(앱 `.subject-root` scrollTop 0→1453), 실제 마우스 클릭 2회(160ms)로 더블클릭 감지+스크롤 확인(0→1453). 최상위 컴포넌트(호스트 요소가 이미 앱 상단을 차지)는 스크롤이 안 움직이는 게 정상이라, 하단 리프(DataFlowBadge)로 검증했다. 콘솔 에러 0.
- **한계**: `scrollIntoView`는 요소의 스크롤 가능한 조상을 스크롤한다 — 소비자 앱이 별난 스크롤 구조(가상 스크롤, transform 기반 등)를 쓰면 못 데려갈 수 있다(데모에선 정상). 요소가 `display:none`(숨은 탭 등)이면 스크롤 대상이 없다.
- **되돌리기 쉬움**: 인터랙션 레이어의 국소 추가라 떼어내기 쉽다.
- **관련 문서**: 정방향 인터랙션 [ADR-0024](0024-board-dom-bidirectional-interaction.md)/[0026](0026-bidirectional-interaction-implementation.md), 오버레이 패널 [ADR-0040](0040-resizable-dockable-panel.md), props 패널 [ADR-0032](0032-props-flow-and-change-afterglow.md).
