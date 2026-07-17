# ADR-0027: UX 레이어 2라운드 — 검색 하이라이트+자동 이동, 다크모드+도메인 팔레트

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

`docs/research/2026-07-17-react-flow-ux-capabilities.md`가 UX 레이어 미구현 5개 후보(검색,
다크모드/팔레트, 캔버스 스티키노트, 코드로 점프, 그룹 접기/펼치기, JSDoc 툴팁) 중 "선행 조건
없음, 간단~중간"으로 분류한 4개(검색, 다크모드/팔레트, 스티키노트, NodeToolbar/컨텍스트 메뉴)를
이번 UX 라운드의 후보로 확인했다. 전부를 한 라운드에 넣지 않고, 이번 라운드는 그중 **검색
하이라이트+자동 이동**과 **다크모드+도메인별 커스텀 팔레트** 두 가지로 스코프를 좁혔다.

캔버스 스티키노트(자유 배치+텍스트 편집+localStorage 영속화)와 NodeToolbar/컨텍스트 메뉴(가장
자연스러운 액션이 "이 그룹 접기"인데, 그룹 접기/펼치기 자체는 "큰 작업"으로 분류돼 별도
라운드로 미뤄둔 상태라 지금 넣으면 액션이 빈약함)는 다음 라운드로 미룬다. 검색은
`ui-philosophy.md`가 명시한 3대 축("검색으로 탈출구 마련") 중 하나라 철학적 우선순위가
가장 높았고, 둘 다 새 노드 타입이나 새 인터랙션 패턴(자유 배치 편집, 우클릭 메뉴)을 만들지
않아 기존 하이라이트/픽 모드/도킹 패널과 부딪힐 표면적이 작다는 점도 함께 고려했다.

**작업 중 다른 세션과의 병행 편집 발견**: 구현 도중 `git status`로 다른 세션이 같은
저장소에서 병행으로 `ComponentNode.tsx`/`flow.css`/`package.json`/`main.tsx`를 수정해 Excalidraw풍
"손그림" 스케치 테두리(`roughjs`, `src/visualization/lib/roughStyle.ts` 신규)로 컴포넌트 노드
테두리를 바꾸는 작업을 진행 중임을 발견했다(커밋 안 됨). 컴포넌트 노드가 `border: none` +
`background-image`(고정 스케치)로 바뀌어 있어, 원래 계획했던 `border-color` 기반 검색 강조/
팔레트 색이 그대로는 안 먹혔다. 사용자에게 확인 후 "컴포넌트 노드 강조는 border 대신 다른
시각 신호로 재설계"하는 방향으로 진행했다 — 아래 결정 참고. 그룹 프레임(`GroupNode.tsx`)은
그 세션이 의도적으로 손대지 않은 영역이라("그룹 프레임은 지도 모드에서도 항상 보이는 유일한
공유 요소라 깔끔한 선 그대로 둔다") 원래 계획(`border-color`)을 그대로 적용했다.

## 검토한 대안 (Options)

### 검색 매치의 시각적 강조

- **`border-color` 변경(원안)** — 기각. rough-border 도입으로 컴포넌트 노드가 `border: none`이라
  효과가 없다.
- **`outline`(채택)** — `border`/`box-shadow`/`background-image` 어느 것과도 CSS 속성이 겹치지
  않아 rough-border, `--cross-group`(box-shadow), `--highlighted`(animated box-shadow) 어느
  것과 동시에 있어도 서로 침범하지 않는다.

### 도메인 팔레트의 색 표현 방식

- **인라인 CSS 커스텀 프로퍼티 주입(원안)** — 재검토 후 기각. 8색 고정 팔레트는 진짜
  "임의값"이 아니라 열거 가능한 집합이라, 인라인 style이라는 새 예외(`GroupNode`의
  counter-scale이 지금까지 유일한 예외였다)를 추가할 필요가 없다.
- **정적 `--palette-N` 클래스(채택)** — 그룹 프레임은 `border-color`, 컴포넌트 노드는(rough-border와
  안 겹치는) `background-color` 옅은 틴트로 표현한다. 다크모드 변형도 CSS만으로 선언적으로
  끝난다.

### 역방향 인터랙션과 검색의 "접힌 그룹" 처리

- **뷰포트/지도 모드 조건을 그대로 둔다(원안 검토 중 기각)** — 검색 매치나 역방향 착지
  노드가 지금 뷰포트 밖이거나 지도 모드로 접힌 그룹 안에 있으면, `shouldExpandGroup`이 그
  그룹을 안 펼쳐 `flowNodes` 배열에 그 노드 자체가 없다(ADR-0016/0017의 뷰포트 컬링 특성상
  "숨겨짐"이 아니라 "아예 안 만들어짐"이다). 이 상태에서 `fitView({nodes:[{id}]})`를 불러도
  존재하지 않는 id를 대상으로 조용히 실패한다 — **역방향 인터랙션(ADR-0024/0026)에 이미
  있던 gap이었다**(구현 시 "접힌 그룹 안 노드를 역방향으로 가리킬 수 있는가"라는 질문을
  던져보고 실측으로 확인했다).
- **매치/착지 그룹을 강제로 펼친다(채택)** — `shouldExpandGroup`이 뷰포트/지도 모드 조건보다
  먼저 "이 그룹에 검색 매치가 있는가 / 역방향 착지 노드가 있는가"를 확인해 강제로 `true`를
  반환한다. 검색은 매치 계산과 `flowNodes` 생성이 같은 렌더 패스(`useMemo`) 안에서 끝나
  즉시 반영되지만, 역방향은 `setHighlightedNodeId`가 이펙트 안에서 호출돼 다음 렌더에서야
  반영되므로, 그 노드가 실제로 `flowNodes`에 나타난 뒤에만 `fitView`하는 별도 이펙트로
  나눴다(`firedForRequestRef`로 요청 하나당 정확히 한 번만 발동하도록 가드).

## 결정 (Decision)

### 1. 검색 하이라이트 + 자동 이동 (`src/visualization/lib/search.ts`, 신규)

`computeSearchMatches(nodes, query)`가 `displayName`과 이미 해석된 `VisibleNode.group`(그룹
노이즈 흡수까지 끝난 값) 양쪽을 대소문자 무시 substring으로 매칭해 `Set<number>`를 돌려준다.
도메인 이름을 쳐도 그 도메인 전체가 걸린다. `PENDING_GROUP` 문자열 자체는 그룹 텍스트 매칭에서
제외한다.

`Canvas.tsx`의 `BoardContent`가 로컬 `searchQuery` state를 갖고(`interactionStore`에 넣지
않음 — 경계 너머 소비자가 없고 영속화도 불필요), 기존 `flowNodes` 계산 `useMemo`
안에서 `matchedIds`/`matchedGroups`를 계산해 `shouldExpandGroup`을 확장하고 `toFlow`에 새
옵션 `matchedIds`로 전달한다. `toFlow.ts`의 `ComponentNodeData`에 `matched: boolean` 필드가
추가됐다(`highlighted`와 별개 필드 — 검색 매치와 DOM 클릭 착지는 의미가 다르다).

검색어가 바뀐 뒤 300ms 잠잠해지면 매치된 노드(들)로 `fitView`한다(`searchQuery` 문자열에만
의존 — 매 렌더 새로 생기는 `matchedIds` Set 참조에 의존하면 라이브 앱의 고빈도 커밋 때문에
디바운스 타이머가 계속 리셋될 수 있어서다, ADR-0013). 매치가 넓게 흩어진 여러 그룹에 걸쳐
있으면 지도 모드를 완전히 벗어나지 못할 수 있는데, 이는 "다 보여준다"는 의도된 트레이드오프로
남긴다(특별 처리 안 함).

### 2. 다크모드 + 도메인별 커스텀 팔레트 (`src/visualization/lib/groupColor.ts`,
`colorModePreference.ts`, 신규)

`<ReactFlow colorMode={colorMode}>` prop으로 xyflow 자체 크롬(Controls/MiniMap/Background/기본
노드)은 공짜로 다크 대응되지만, 커스텀 노드(`ComponentNode`/`GroupNode`)와 `.toolbar`/`.board-panel`처럼
`.react-flow` 밖에 있는 요소는 자동 적용 대상이 아니다. 후자는 `BoardOverlay.tsx`가 이미 쓰는
`document.body` 클래스 토글 패턴(`rrb-board-open`/`rrb-pick-mode`)을 그대로 재사용해
`rrb-dark-mode`로 스코프했다. `colorMode`는 `'light'|'dark'` 이진 토글만 지원한다
(`'system'`까지 넣으면 xyflow prop과 우리 body 클래스 두 트리거를 항상 같은 리터럴로
동기화하기 번거로워진다). 선택은 `localStorage`(`colorModePreference.ts`)로 새로고침 후에도
유지된다.

도메인별 색은 `colorIndexForGroup(group): number`가 그룹 **이름 문자열의 해시**로 8색 고정
팔레트의 인덱스를 정한다 — 그룹 등장 순서에 기대지 않는다(`layout.ts`가 이미 밝히듯 그룹
순서는 커밋마다 바뀔 수 있어, 순서 기반 배정은 커밋마다 색이 재배정/깜빡이는 문제를 낳는다).
`toFlow.ts`가 매 그룹/컴포넌트 노드에 `colorIndex`를 계산해 붙이고(`PENDING_GROUP`은
중립 유지를 위해 `undefined`), `GroupNode`/`ComponentNode`는 `group-node--palette-N` /
`component-node--palette-N` 클래스만 붙인다(인라인 style 없음). `flow.css`가 8개 인덱스 각각의
라이트/다크 hex를 정적으로 정의한다. 그룹 프레임은 `border-color`로, 컴포넌트 노드는
rough-border(배경 위 스케치 이미지)와 겹치지 않도록 `background-color` 옅은 틴트로 표현한다.
MiniMap의 `nodeColor`도 같은 `colorIndex`를 읽어 그룹/컴포넌트 점 색을 도메인별로 분기한다.

### 3. 역방향 인터랙션의 "접힌 그룹" gap 수정 (`Canvas.tsx`)

위 "검토한 대안" 절의 결정대로, `shouldExpandGroup`이 검색 매치 그룹뿐 아니라
`highlightedNodeId`(역방향 착지 노드)가 속한 그룹도 뷰포트/지도 모드 조건보다 먼저 강제로
펼친다. `fitView` 호출은 별도 이펙트로 분리해, 그 노드가 실제로 `flowNodes`에 존재하는지
확인한 뒤(강제 확장이 반영된 렌더 이후)에만, `navigateRequestId`당 정확히 한 번 발동하도록
`firedForRequestRef`로 가드한다.

## 근거 (Rationale)

- `outline`/정적 팔레트 클래스 모두 "기존 코드가 이미 쓰고 있는 확장 지점(toFlow의 data 필드
  추가, className 조합)"을 그대로 따른 것이라 새 인프라를 만들지 않았다.
- 병행 세션의 rough-border 변경을 발견했을 때 곧바로 사용자에게 확인한 뒤 방향을 정했다 —
  CLAUDE.md의 "예상 밖의 파일 변경을 발견하면 임의로 덮어쓰지 말고 사용자에게 확인한다"
  원칙을 그대로 따랐다.
- 역방향 인터랙션의 gap은 이론적 우려가 아니라 `scripts/verify-dom-interaction.mjs`에 추가한
  회귀 시나리오(지도 모드로 줌아웃 후 Alt+클릭)로 실측 확인했다(수정 전에는 재현되지 않았을
  것이나, 수정된 코드로 검증했을 때 카메라가 실제로 이동함을 확인).

## 결과 (Consequences)

- **신규 파일**: `src/visualization/lib/{search,groupColor,colorModePreference}.ts`(+test),
  `scripts/verify-search-and-theme.mjs`.
- **수정 파일**: `src/visualization/lib/toFlow.ts`(+test) — `matched`/`colorIndex` 필드 추가,
  `src/visualization/components/{ComponentNode,GroupNode}.tsx`(+test) — 새 클래스 반영,
  `src/visualization/Canvas.tsx` — 검색 state/매칭/강제확장/디바운스 fitView, 다크모드
  state/영속화/body 클래스, 역방향 fitView 2단계 이펙트 분리, 툴바 UI, `src/visualization/flow.css`
  — 검색 dimming/matched, 8색 팔레트(라이트+다크), 다크모드 body 스코프 규칙,
  `scripts/verify-dom-interaction.mjs` — 접힌 그룹 역방향 회귀 시나리오 추가.
- **검증**: `npm run test`(159개 통과) / `lint` / `build` / `build:lib` 전부 그린. 도킹 패널
  관련 6개 스크립트(`verify.mjs`, `verify-dom-interaction.mjs`, `verify-advanced-patterns.mjs`,
  `verify-lazy-suspense.mjs`, `verify-stress-scale-live.mjs`, `verify-high-frequency.mjs`) +
  신규 `verify-search-and-theme.mjs` 전부 콘솔/페이지 에러 0건, 응답 배율 기존 ADR-0017 평탄화
  범위 안(0.97~1.29배) 유지로 통과. `experiments/real-app-validation/excalidraw/`를 갱신된
  `src/`로 재동기화(+ 병행 세션이 추가한 `roughjs` 의존성도 함께 반영) 후
  `scripts/verify-real-app.mjs` 재실행 — 67개 그룹, 콘솔 에러 0건, 응답 배율 1.03배로 회귀 없음.
- **스코프 밖(명시적으로 안 함)**: `verify-routing.mjs`(berry-admin)·`verify-real-app-shadcn-admin.mjs`(shadcn-admin)·`verify-stress-scale.mjs`(별도 exp2-flow-prototype 앱, 이번 변경과 코드 경로가
  겹치지 않음)는 이번 라운드 재실행 대상에서 뺐다 — 지시받은 "도킹 패널 6개 + excalidraw
  최소 1회"는 전부 충족했고, 나머지는 이번 변경(검색/팔레트)이 건드리는 코드 경로와 무관하거나
  third-party 클론의 수동 재설정 비용 대비 회귀 발견 가능성이 낮다고 판단했다.
- **다음 라운드로 이월**: 캔버스 스티키노트(로컬 저장), NodeToolbar/컨텍스트 메뉴, 그룹
  접기/펼치기(큰 작업), 코드로 점프(스키마 확장 선행 필요), JSDoc 툴팁(별도 리서치 필요).
- **되돌리기 쉬움**: 검색/다크모드/팔레트 전부 `RenderNode`/`RenderSnapshot` 스키마 밖의
  로컬 state·CSS·`toFlow.ts`의 프레젠테이션 필드로만 구현돼, 데이터 스키마나 기존 P0~P4
  파이프라인에는 영향이 없다.
