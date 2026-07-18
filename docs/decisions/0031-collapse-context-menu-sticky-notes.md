# ADR-0031: UX 레이어 3라운드 — 그룹 접기/펼치기, 우클릭 컨텍스트 메뉴, 캔버스 스티키노트

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

ADR-0027이 검색+테마 라운드에서 명시적으로 다음 라운드로 미룬 두 항목(캔버스 스티키노트,
NodeToolbar/컨텍스트 메뉴)에, 최초 작업 지시에서 "선행 조건 없음, 큰 작업" 정도로만 분류돼
별도 라운드를 권장받았던 **그룹 접기/펼치기**를 더해 이번 라운드로 묶었다. 사용자가 "한 번에
QA할 예정"이라고 명시해, 매 하위 기능마다 별도로 멈추지 않고 세 가지를 한 라운드로 구현한 뒤
`scripts/verify-ux-round3.mjs` 하나로 통합 검증했다.

**코드로 점프**(스키마 확장 필요)와 **JSDoc 툴팁**(ADR-0007과 충돌)은 이번에도 명시적으로
제외했다 — 착수 전 사용자에게 다시 확인했고, 둘 다 "이번에도 제외(권장)"로 확정했다.

**세 항목을 하나로 묶은 설계상 이유**: NodeToolbar/컨텍스트 메뉴는 그 자체로는 액션이 빈약해
그룹 접기/펼치기가 있어야 의미 있는 액션("이 그룹 접기")이 생긴다는 게 ADR-0027 시점의 판단이었다.
실제로 이번 라운드에서 컨텍스트 메뉴의 그룹 액션 2개(접기/펼치기 토글, 이 그룹으로 확대)와
컴포넌트 액션 2개(실제 화면에서 보기, 이 이름으로 검색) 모두 기존 기능(그룹 접기, 정방향 DOM
하이라이트, 검색)을 다른 진입점으로 노출하는 형태로 자연스럽게 맞아떨어졌다.

## 검토한 대안 (Options)

### 그룹 접기/펼치기의 토글 트리거 UI

- **헤더 안의 평범한 버튼(1차 시도)** — 기각. 그룹 프레임은 `zIndex:-1`(항상 배경에 있도록,
  `toFlow.ts`)인데 엣지는 `zIndex: 1`(같은 그룹)/`10`(그룹 경계 횡단)이라, 프레임 안의 어떤
  자식도 CSS만으로는 엣지보다 위로 올라올 수 없다(부모가 만든 stacking context를 자식이
  벗어날 수 없다는 CSS 근본 제약). `scripts/verify-ux-round3.mjs`로 실제 클릭을 재현하다가
  `react-flow__edge-interaction`(엣지의 넓은 hit-test용 투명 stroke)가 클릭을 가로채는 게
  실측으로 드러났다.
- **그룹 전체의 zIndex를 올린다** — 기각. 프레임이 엣지/컴포넌트 노드 위로 올라오면 반투명
  배경 틴트와 점선 테두리가 그 위에 그려져, "프레임은 항상 배경"이라는 exp2(ADR-0006)부터의
  시각 원칙이 깨진다.
- **`<NodeToolbar>`(채택)** — xyflow가 포탈로 별도 렌더하고 `zIndex`를 직접 지정할 수 있어
  프레임의 stacking context 밖에서 그려진다. "줌 배율과 무관하게 항상 같은 크기"라는 원래
  research가 기대했던 장점도 함께 얻는다(직접 만든 counter-scale 없이 xyflow가 알아서 처리).

### 컨텍스트 메뉴 vs NodeToolbar를 액션 트리거로

- 그룹 접기 토글 자체는 위 NodeToolbar로 이미 상시 노출돼 있어, 컨텍스트 메뉴는 "그 외
  액션"(이 그룹으로 확대, 컴포넌트의 검색/하이라이트 연동)에 집중했다 — 같은 액션을 두
  메커니즘으로 중복 노출하지 않으면서도 두 후보 모두를 의미 있게 구현했다.

## 결정 (Decision)

### 1. 그룹 접기/펼치기 (`toFlow.ts`, `Canvas.tsx`, `GroupNode.tsx`)

`manuallyCollapsedGroups: Set<string>`을 `Canvas.tsx`의 `BoardContent` 로컬 state로 두고
(세션 안에서만 유지 — 다크모드처럼 "장기 선호"가 아니라 "지금 화면을 정리해 보는" 용도라
localStorage에 영속화하지 않는다), 기존 `shouldExpandGroup`에 **검색 매치/역방향 착지
다음으로** 우선순위를 부여했다:

```ts
if (group === highlightedGroup || matchedGroups.has(group)) return true; // 검색/역방향이 항상 이긴다
if (manuallyCollapsedGroups.has(group)) return false; // 수동 접기
if (isMapMode) return false;
...
```

"검색은 언제나 이긴다"는 ADR-0027의 원칙을 그룹 접기에도 그대로 적용한다 — 수동으로 접은
그룹 안의 컴포넌트를 검색하면 강제로 펼쳐진다(`scripts/verify-ux-round3.mjs`로 확인).

`toFlow.ts`의 `GroupNodeData`에 `manuallyCollapsed`(표시용, `collapsed`와 별개 — `collapsed`는
"지금 화면에 자식이 없는가"라는 결과값이고 `manuallyCollapsed`는 "사용자가 그렇게 선택했는가"라는
원인이다)와 `onToggleCollapse` 콜백을 추가했다. `GroupNode.tsx`는 이 토글 버튼을
`<NodeToolbar nodeId={id} isVisible position={Position.Top} align="start" style={{zIndex:1000}}>`
안에 렌더한다.

### 2. 우클릭 컨텍스트 메뉴 (`ContextMenu.tsx`, 신규)

`onNodeContextMenu`로 그룹/컴포넌트 노드 종류에 따라 다른 액션 목록을 구성해 로컬
`contextMenu` state에 담고, `DomHighlightOverlay.tsx`와 같은 이유로 `document.body`에 포탈로
그린다(팬/줌이 걸린 조상 밑에 있으면 `position:fixed`가 뷰포트가 아니라 그 조상 기준으로
계산되는 CSS 함정을 피한다).

- 그룹: "그룹 접기/펼치기"(NodeToolbar 토글과 동일 콜백 재사용), "이 그룹으로 확대"(`fitView`).
- 컴포넌트: "실제 화면에서 보기"(기존 정방향 클릭 핸들러와 같은 로직을 `highlightComponentNode`로
  추출해 공유), "이 이름으로 검색"(검색창에 `displayName`을 채워 넣어 검색 기능과 연동).

`onPaneClick`/`onMoveStart`에서 메뉴를 닫는다.

### 3. 캔버스 스티키노트 (`stickyNotes.ts`, `StickyNoteNode.tsx`, 신규)

`RenderNode`/`RenderSnapshot`과 무관한 순수 UI 주석이라 데이터 레이어를 거치지 않고
`localStorage`에 직접 영속화한다(`loadStickyNotes`/`saveStickyNotes`, ADR-0027의
`colorModePreference.ts`와 같은 얇은 get/set 패턴). `Canvas.tsx`가 `stickyNotes` state를
`flowNodes`와 별도로 `stickyFlowNodes`로 변환해 `nodes={[...flowNodes, ...stickyFlowNodes]}`로
합친다 — group/component 노드는 `draggable:false`(`toFlow.ts`)라 `onNodesChange`로 오는
`position` 변경은 전부 스티키노트 것이라고 신뢰할 수 있다.

`StickyNoteNode.tsx`의 `<textarea>`에는 `nodrag nopan nowheel` 클래스를 명시적으로 붙였다 —
xyflow가 이걸 자동으로 처리해주지 않는다는 게 연구 문서(3-B)가 이미 확인한 공식 관례다.

## 근거 (Rationale)

- `NodeToolbar`로의 전환은 이론적 우려가 아니라 `scripts/verify-ux-round3.mjs`가 실측으로 잡아낸
  회귀(셰브런 클릭이 30초 타임아웃)에 대한 직접 대응이다 — 이 프로젝트의 "README 대신 실제
  런타임/`.d.ts` 확인" 원칙대로 `@xyflow/react`의 `NodeToolbar` 구현체를 직접 읽고
  `zIndex = node.internals.z + 1`이 기본값일 뿐 `style` prop으로 override 가능하다는 걸
  확인한 뒤 적용했다.
- 그룹 접기가 검색/역방향보다 낮은 우선순위를 갖는 것은 ADR-0027이 이미 확립한 "검색은 언제나
  이긴다"는 원칙의 직접적 연장이다 — 새 규칙을 만들지 않고 기존 원칙을 새 상황에 적용했다.
- 정방향 하이라이트 로직을 `highlightComponentNode`로 추출해 클릭 핸들러와 컨텍스트 메뉴가
  공유하게 한 것은, 같은 동작을 두 진입점(클릭/우클릭)에서 각각 구현해 두 코드가 갈라지는
  걸 막기 위함이다.

## 결과 (Consequences)

- **신규 파일**: `src/visualization/lib/stickyNotes.ts`(+test),
  `src/visualization/components/{StickyNoteNode,ContextMenu}.tsx`(+test),
  `scripts/verify-ux-round3.mjs`.
- **수정 파일**: `src/visualization/lib/toFlow.ts`(+test) — `manuallyCollapsed`/`onToggleCollapse`
  필드, `src/visualization/components/GroupNode.tsx`(+test 일부 조정, 아래 참고) — NodeToolbar
  기반 토글, `src/visualization/Canvas.tsx` — 그룹 수동 접기 state/우선순위, 스티키노트
  CRUD+`onNodesChange`, 컨텍스트 메뉴 state/핸들러, 툴바에 "메모 추가" 버튼,
  `src/visualization/flow.css` — 셰브런/스티키노트/컨텍스트 메뉴 스타일(다크모드 포함).
- **테스트 커버리지의 알려진 한계**: `GroupNode.tsx`의 셰브런은 `<NodeToolbar>`가 실제로
  `store.nodeLookup`에 등록된 노드에만 렌더하므로(그렇지 않으면 조용히 `null`), 순수
  `ReactFlowProvider`만 두고 `<ReactFlow>` 트리 없이 렌더하는 기존 단위 테스트 방식으로는
  셰브런 자체가 안 뜬다. 가짜 노드를 store에 직접 주입해보려 시도했으나(내부 `InternalNode`
  shape 재현) 성공하지 못했다 — `Canvas.tsx`가 애초에 단위 테스트가 없는 것과 같은 이유(실제
  React Flow 런타임 배선에 의존)로, 셰브런의 렌더링/클릭 동작 검증은
  `scripts/verify-ux-round3.mjs`(Playwright)로 옮겼다. `GroupNode.test.tsx`는 라벨/개수/클래스
  등 렌더 트리 없이도 검증 가능한 부분만 계속 커버한다.
- **검증**: `npm run test`(179개 통과) / `lint` / `build` / `build:lib` 전부 그린. 도킹 패널
  관련 6개 스크립트 + `verify-search-and-theme.mjs` + 신규 `verify-ux-round3.mjs` 전부 콘솔
  에러 0건, 응답 배율 기존 평탄화 범위 안(0.99~1.24배) 유지로 통과.
- **스코프 밖(명시적으로 안 함)**: 코드로 점프(스키마 확장 필요), JSDoc 툴팁(ADR-0007과 충돌,
  별도 리서치 필요) — 착수 전 사용자에게 재확인 후 이번에도 제외를 확정했다. 스티키노트의
  실시간 공유(Pro/CRDT 인프라 필요, 연구 문서가 이미 스코프 밖으로 명시)도 그대로 제외.
- **되돌리기 쉬움**: 셋 다 `RenderNode`/`RenderSnapshot` 스키마 밖의 로컬 state·CSS·`toFlow.ts`의
  프레젠테이션 필드로만 구현돼, 데이터 스키마나 기존 파이프라인에는 영향이 없다.

## 개정 (2026-07-18) — 스티키노트 QA 버그 3건 수정: 휠 줌 막힘 / 한글 조합 깨짐 / 타이핑 끊김

사용자 QA에서 스티키노트 위에서 (1) 휠 스크롤로 캔버스 줌이 안 되고, (2) 한글 입력이 자음/모음
단위로 쪼개져 찍히고, (3) 타이핑이 자주 끊기는 느낌이라는 세 증상을 함께 보고했다. 원인은 하나로
얽혀 있었다:

- **근본 원인**: `stickyFlowNodes`가 `useMemo` 없이 `BoardContent` 렌더마다 새로 만들어졌다.
  이 컴포넌트는 고빈도 앱(라이브피드 10~240Hz, store notify 스로틀 후에도 최대 ~30Hz)의 커밋마다
  재렌더되므로, 스티키노트와 무관한 재렌더에도 매번 새 `data` 객체(+새 `onTextChange`/`onDelete`
  클로저)가 만들어져 React Flow가 `StickyNoteNode`를 다시 그렸다. `<textarea value={data.text}>`가
  controlled라 이 재렌더마다 DOM value가 강제로 재적용됐는데, 이 시점이 한글 조합 도중이면 브라우저의
  IME 조합 버퍼가 깨져 자음/모음이 따로 커밋됐다 — "끊기는 느낌"도 같은 원인(초당 최대 30회 재적용).
- **휠 줌 막힘의 원인은 별개**: `nowheel` 클래스가 textarea 위 모든 wheel 이벤트를 무조건
  캔버스로 못 가게 막았다(긴 메모 안에서 스크롤할 때 캔버스가 줌 안 되게 하려던 의도, ADR-0031
  본문). 짧은 메모는 애초에 스크롤할 내용이 없는데도 휠이 전부 막혀, 커서가 스티키노트 위에
  있으면 화면 축소/확대 자체가 안 됐다.

**수정**:
1. `Canvas.tsx`: `stickyFlowNodes`를 `useMemo(() => ..., [stickyNotes])`로 감싸 `stickyNotes`
   자체가 바뀔 때만(추가/삭제/텍스트/위치) 재계산되게 했다 — 무관한 재렌더에 더는 안 흔들린다.
2. `StickyNoteNode.tsx`: textarea를 `data.text` 직접 controlled에서 **로컬 버퍼 + 디바운스
   동기화**로 바꿨다. 타이핑은 로컬 state로 즉시 반영해 controlled value가 항상 "방금 친 값"과
   일치하고(재렌더가 와도 로컬 state는 안 건드리므로 조합이 안 깨진다), 부모(`onTextChange`,
   localStorage까지 이어짐)로는 300ms 디바운스 후 또는 blur 시 반영한다.
3. `StickyNoteNode.tsx`: `nowheel` 전체 차단을 걷어내고, textarea 자체의 `onWheel`에서 **스크롤
   체이닝**을 직접 구현했다 — 그 방향으로 더 스크롤할 여지가 있을 때만(`scrollTop`/`scrollHeight`
   경계 확인) `stopPropagation()`으로 캔버스 줌을 막고, 그렇지 않으면(짧은 메모, 또는 이미 끝까지
   스크롤한 긴 메모) 휠이 그대로 캔버스로 올라가 줌이 된다.

- **검증**: `tsc` 클린, `StickyNoteNode.test.tsx`(디바운스 동작/blur flush/nowheel 클래스 제거
  확인으로 갱신) + `stickyNotes.test.ts` 통과, 전체 유닛 테스트 325개 통과, lint 무관 경고만.
- **되돌리기 쉬움**: 이 컴포넌트 국소 변경 — 스키마·다른 노드 타입 영향 없음.
