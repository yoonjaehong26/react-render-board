# React Flow(xyflow) UX 확장 가능 범위 조사

조사일: 2026-07-17
목적: 정식 재구현(P0~P4 백로그, [`project-status.md`](../project-status.md) 참고) 착수 전, 5가지 후보 UX가 React Flow(@xyflow/react v12.11.2) 위에서 어떻게 구현 가능한지 조사해 다음 라운드 우선순위를 정한다. **코드 변경 없음 — 순수 조사.**

방법론: 6개의 독립된 리서치 에이전트를 병렬로 띄워 공식 문서(reactflow.dev, xyflow.com, vite.dev, code.visualstudio.com 등)와 GitHub 이슈/디스커션을 교차 확인했다. 각 항목은 **(a) React Flow 내장 지원 / (b) React Flow API 위에서 직접 구현 가능 / (c) React Flow 밖의 별도 메커니즘 필요**로 분류한다.

## 조사 전 확인한 현재 구현 상태

- Canvas.tsx는 이미 `<MiniMap pannable zoomable nodeColor={...} />`, `<Controls />`, `<Background gap={24} />`, `minZoom={0.05}`(하드코딩), `onlyRenderVisibleElements`, `fitView`를 쓰고 있다. `colorMode`는 미사용.
- "지도 모드"는 React Flow의 MiniMap이 아니라 별도의 `SemanticZoomController`(`useStore((s) => s.transform[2])`로 줌 값을 구독 → 0.55 미만이면 CSS 클래스 토글 → 컴포넌트 노드/엣지 `opacity:0`)로 구현되어 있다.
- 그룹 박스는 React Flow 네이티브 parent/child(`type:'group'`, `extent:'parent'`) 기능으로 구현됨 — 커스텀 절대 위치 div가 아니다.
- 검색/필터 UI는 전혀 없다. 유일한 토글은 host 노드 표시 여부 체크박스(배열에서 필터링, `hidden` prop 미사용).
- 테마는 라이트 모드 고정 팔레트뿐, 다크모드·`colorMode`·CSS 변수 오버라이드 전무.
- **⚠️ 선행 조건 발견**: `getSource(fiber)`(bippy/source, ADR-0007)가 반환하는 `{fileName, lineNumber, columnNumber}` 중 프로덕션 데이터 파이프라인(`src/data/sourceHints.ts` → `RenderNode`)에는 **`fileName`만 `groupHint`로 저장되고 `lineNumber`/`columnNumber`는 버려진다.** 실험 코드(`experiments/exp1-fiber-extraction/src/source-spike.ts`)에만 두 값이 남아있다. 즉 "정확한 줄로 이동", "줄 주변 스니펫 미리보기" 같은 기능은 **React Flow 문제가 아니라 먼저 `RenderNode` 스키마에 `lineNumber`/`columnNumber`를 추가해야 하는 선행 작업**이다. 아래 3-A·4번 항목 난이도에는 이 선행 작업 비용이 포함되어 있다.

---

## 1. 지도(map) 모드 보강

**MiniMap 자체 커스터마이징 — (a) 상당 부분 내장.** 공식 API(`reactflow.dev/api-reference/components/minimap`)에 `pannable`, `zoomable`, `nodeColor`/`nodeStrokeColor`/`nodeClassName`(값 또는 함수), `nodeBorderRadius`, `nodeStrokeWidth`가 문서화되어 있고, 특히 **`nodeComponent` prop으로 미니맵 노드 렌더링 자체를 완전히 대체**할 수 있다(단 SVG 요소만 허용, 타입 `MiniMapNodeProps`). 다만 "그룹만 그리고 리프 컴포넌트는 숨긴다"는 필터링 전용 옵션은 없다 — 이건 `nodeComponent` 안에서 리프 노드일 때 빈 `<g/>`를 반환하는 식으로 **(b) 직접 구현** 필요. 난이도: 중간.

**대규모(수천 개)에서 미니맵이 실제로 유용한가 — (c)에 가까움.** 공식 Performance 가이드(`reactflow.dev/learn/advanced-use/performance`)는 노드 수 임계값이나 MiniMap 전용 성능 경고를 다루지 않는다. 반면 GitHub에서 1만 노드 랙 보고([issue #3044](https://github.com/xyflow/xyflow/issues/3044))와 "100+ 노드엔 캔버스 렌더러가 필요하다"는 요청([discussion #5446](https://github.com/xyflow/xyflow/discussions/5446))에 메인테이너가 "엣지용 캔버스 렌더러는 실험했지만 노드용은 아직 없다"고 직접 답변했다 — SVG/DOM 렌더링 모델의 한계를 xyflow 스스로 인정한 상태다. 이 프로젝트가 이미 실측한 P2 결함(1,500~2,000노드/그룹 100개+부터 `fitView`가 전체를 못 담음)과 정확히 같은 계열의 문제다.

**LOD(level-of-detail) 렌더링 — (b), 이미 올바른 패턴을 쓰고 있음.** 별도의 공식 "LOD 가이드"는 없지만, Interaction 카테고리의 공식 예제 [Contextual Zoom](https://reactflow.dev/examples/interaction/contextual-zoom)이 정확히 현재 `SemanticZoomController`와 같은 접근(`useStore`로 줌 값 구독 → 커스텀 노드가 줌 레벨별로 다른 콘텐츠 렌더링)을 시연한다. 즉 **현재 구현 방식 자체는 xyflow가 사실상 공식적으로 지지하는 패턴**이며, P2를 고치려면 이 패턴을 그룹 노드 쪽으로 확장(낮은 줌에서 그룹을 "요약 사각형"으로 표시)하면 된다. `useViewport`, `useOnViewportChange`, `getNodesBounds`+`getViewportForBounds`도 전부 공개 문서화된 훅/유틸이라 뷰포트 기반 로직을 짤 재료는 충분하다.

**minZoom 확장 — (a) 문서화됨, 단 주의.** `minZoom`/`maxZoom`은 `<ReactFlow>` prop으로 공식 지원되고 `fitView` 호출에도 그대로 적용된다. 단, prop 값과 `fitView` 옵션 값이 다르면 줌 조작 중 값이 튀는 부작용이 있다고 문서화되어 있다. 매우 작은 `minZoom`(0.01 이하)의 수치적 부작용은 공식 문서에 없음(미확인 영역).

**난이도 종합**: 미니맵 자체 커스터마이징은 간단~중간, "그룹 요약형 LOD로 P2 해소"는 큰 작업(그룹 노드 컴포넌트 확장 + 줌 구간별 표시 로직 + 레이아웃 재계산 연동).

Sources: [MiniMap 컴포넌트](https://reactflow.dev/api-reference/components/minimap) · [MiniMapNodeProps](https://reactflow.dev/api-reference/types/mini-map-node-props) · [Performance 가이드](https://reactflow.dev/learn/advanced-use/performance) · [Contextual Zoom 예제](https://reactflow.dev/examples/interaction/contextual-zoom) · [useViewport()](https://reactflow.dev/api-reference/hooks/use-viewport) · [useOnViewportChange()](https://reactflow.dev/api-reference/hooks/use-on-viewport-change) · [getNodesBounds()](https://reactflow.dev/api-reference/utils/get-nodes-bounds) · [Discussion #2849 (수천 노드 줌아웃)](https://github.com/xyflow/xyflow/discussions/2849) · [Issue #3044 (1만 노드 랙)](https://github.com/xyflow/xyflow/issues/3044) · [Discussion #5446 (캔버스 렌더러 요청)](https://github.com/xyflow/xyflow/discussions/5446)

---

## 2. 즉각적 필터링(instant filtering)

**노드 숨김 방식 — (a) `hidden` 필드 내장.** Node 타입에 공식 `hidden?: boolean` 필드가 있고("Whether or not the node should be visible on the canvas"), Performance 가이드는 "처음엔 숨기고 확장 시에만 렌더링"을 공식 최적화 기법으로 권장한다. 다만 `hidden=true` 유지 vs 배열에서 완전히 제거하는 것의 **정량적 성능 비교는 공식 문서에 없다** — 정성적 권고뿐이다. `onlyRenderVisibleElements`(이미 사용 중)와의 상호작용도 공식 가이드가 없다. 현재 프로젝트가 쓰는 "배열에서 제거" 방식(host 노드 토글)과 "검색 하이라이트"는 목적이 다르므로 구분해야 한다: **하이라이트/디밍은 배열에서 제거하지 말고 `data.matched` 필드 + opacity/className으로 처리**하는 게 커뮤니티 표준 패턴([issue #2418](https://github.com/xyflow/xyflow/issues/2418) 등에서 확인)이고, **그룹(도메인) 단위로 완전히 숨기는 건 `hidden` 필드**가 맞다.

**검색 매치 시 자동 팬/줌 — (a) 내장.** `useReactFlow()`가 반환하는 인스턴스에 `setCenter(x, y, {zoom?, duration?, ease?})`, `fitView({nodes: [{id}, ...], duration?, ...})`(부분 집합 fit 지원), `fitBounds`, `zoomTo`가 전부 공식 문서화되어 있다. 검색 매치 자동 이동은 `fitView({nodes: matchedIds.map(id => ({id}))})`로 정확히 커버된다.

**공식 검색/필터 예제 — 애매하게 (a).** 무료 예제 갤러리(Interaction/Layout/Misc)엔 검색 전용 예제가 없다. 다만 별도 배포 채널인 **React Flow UI**(`reactflow.dev/ui/components/node-search`, shadcn 스타일 설치형 컴포넌트)에 공식 `NodeSearch` 컴포넌트가 있어 label 매칭 + 선택 시 자동 `fitView`를 기본 제공한다 — "공식이지만 무료 example 갤러리와는 다른 배포 형태"라는 점에 유의.

**그룹 필터 + 개별 필터 동시 지원 — (b), 주의점 발견.** [issue #2179](https://github.com/wbkd/react-flow/issues/2179)에서 확인된 실동작: **부모(group) 노드에 `hidden:true`를 설정해도 자식 노드는 자동으로 숨겨지지 않는다.** 그룹 단위 필터를 구현하려면 부모 hidden 변경 시 그 자식들의 `hidden`도 직접 재귀 순회하며 세팅해야 한다 — 공식 명세가 아니라 이슈 트래커에서 확인된 동작이므로 구현 시 반드시 실측 검증 필요.

**난이도 종합**: 하이라이트+자동 이동은 간단(전부 공식 API 조합), 그룹/개별 동시 필터는 중간(재귀 hidden 전파 로직 직접 작성).

Sources: [Node 타입(hidden)](https://reactflow.dev/api-reference/types/node) · [ReactFlowInstance](https://reactflow.dev/api-reference/types/react-flow-instance) · [FitViewOptions](https://reactflow.dev/api-reference/types/fit-view-options) · [Hidden 예제](https://reactflow.dev/examples/nodes/hidden) · [Node Search UI 컴포넌트](https://reactflow.dev/ui/components/node-search) · [Issue #2418 (하이라이트 패턴)](https://github.com/xyflow/xyflow/issues/2418) · [Issue #2179 (hidden 부모-자식 비전파)](https://github.com/wbkd/react-flow/issues/2179) · [Sub Flows 가이드](https://reactflow.dev/learn/layouting/sub-flows)

---

## 3. 주석(annotation) 기능

### 3-A. 코드 주석(JSDoc) 표시 — 대부분 (c), 근본적 제약 발견

**파일 원문 접근**: Vite 공식 `/@fs/{절대경로}` 엔드포인트로 워크스페이스 밖 파일도 서빙 가능하고(`server.fs.strict`/`allow`/`deny`로 접근 제어, `vite.dev/config/server-options`), `?raw` import로 텍스트 임포트도 공식 지원된다. 단 `import.meta.glob`은 빌드타임 정적 분석이라 "런타임에 임의 groupHint 경로 하나만 fetch"하는 용도엔 `fetch('/@fs/...')` 조합이 더 맞다(단일 공식 문서로 이 조합을 명시하진 않아 프로토타입 검증 필요). dev 전용이라 프로덕션엔 노출되지 않지만, 과거 `/@fs/` 경로 자체의 임의 파일 읽기 취약점(CVE-2025-30208)이 있었으니 Vite 최신 버전 유지가 전제.

**브라우저에서 JSDoc 파싱**: `comment-parser`(의존성 없음, 브라우저/서버 겸용)가 가장 가볍지만 "주석이 어느 선언 위에 붙었는가"는 별도 로직 필요. `react-docgen`은 Babel 기반 Node 전용 도구라 브라우저 런타임에 부적합. TypeScript 컴파일러(`ts.createSourceFile`)는 가장 정밀하지만 무겁다.

**근본 제약 (재확인)**: ADR-0007이 이미 확정한 대로 `groupHint`는 "정의 위치"가 아니라 "**사용 위치**"다(공유 `Button.tsx`의 groupHint는 그걸 렌더하는 `CheckoutPanel.tsx`로 나옴). JSDoc은 컴포넌트 **정의부** 바로 위에 있는데, 현재 파이프라인은 정의 위치 자체를 추적하지 않는다. 즉 이 기능은 `lineNumber` 스키마 추가만으로 안 되고, **"정의 위치"라는 완전히 새로운 데이터 소스를 별도로 확보해야 하는 더 큰 문제**다 — 5가지 항목 중 유일하게 "스키마에 필드 하나 추가"로 안 끝나는 항목.

**분류: (c), 큰 작업.** React Flow와 무관한 문제일 뿐 아니라, 이 프로젝트의 그룹핑 힌트 설계(사용 위치 고정, ADR-0007)와 정면으로 충돌하는 선행 리서치가 먼저 필요하다.

### 3-B. 캔버스 주석(스티키노트) — (a)+(b), 간단~중간

**공식 예제**: 무료 예제 갤러리의 Feature Overview에 `AnnotationNode.jsx`가 실제로 존재한다 — 단 번호 라벨 + CSS 화살표로 "설명 라벨"용이지, 사용자가 직접 타이핑하는 자유 텍스트 스티키노트는 아니다(참고용 출발점 정도). "Notes"/"Sticky note" 명칭의 전용 공식 예제는 없다.

**퍼시스턴스**: [Save and Restore](https://reactflow.dev/examples/interaction/save-and-restore) 예제가 `toObject()` + `localStorage`로 노드/엣지 저장·복원을 공식 지원 — **로컬 저장은 (a)로 간단히 커버**. 실시간 협업/공유는 [Collaborative](https://reactflow.dev/examples/interaction/collaborative) 예제가 있으나 **Pro(유료)**이고 Yjs+y-websocket 기반이라 **(c)** — 별도 백엔드/CRDT 인프라 필요.

**구현 난이도**: 스티키노트는 본질적으로 "textarea를 담은 커스텀 노드 타입"이라 React Flow 표준 확장 범위 안(간단~중간)이다. 신경 쓸 지점 셋: ① textarea 내부 텍스트 선택이 캔버스 팬으로 새지 않게 공식 `nodrag`/`nopan`/`nozoom` CSS 클래스를 명시적으로 붙여야 함(자동 아님). ② 빈 캔버스 위 메모는 좌표만 있는 일반 노드로 취급하면 됨. ③ 그룹 박스와의 z-index는 `node.zIndex`/`elevateNodesOnSelect` 옵션으로 공식 커버되나 설정 필요.

**onboarding 목적과의 적합성**: vision.md/ui-philosophy.md가 말하는 "온보딩 중 낯선 구조에 메모 남기기" 용도엔 로컬 저장(localStorage)만으로도 1인 사용 시나리오는 충분히 성립한다 — 실시간 공유가 꼭 필요하지 않다면 3-B는 이번 조사에서 가장 싸게 얻을 수 있는 기능 중 하나다.

Sources: [Vite Server Options](https://vite.dev/config/server-options) · [CVE-2025-30208](https://4xura.com/web/vite-arbitrary-file-read-via-improper-query-sanitization-in-fs-route-cve-2025-30208/) · [comment-parser](https://github.com/syavorsky/comment-parser) · [react-docgen](https://github.com/reactjs/react-docgen) · [Examples Overview (AnnotationNode)](https://reactflow.dev/examples/overview) · [Save and Restore](https://reactflow.dev/examples/interaction/save-and-restore) · [Collaborative (Pro)](https://reactflow.dev/examples/interaction/collaborative) · [Liveblocks × React Flow](https://liveblocks.io/docs/get-started/nextjs-react-flow) · 프로젝트 내부: [`decisions/0007-grouping-hint-feasibility.md`](../decisions/0007-grouping-hint-feasibility.md)

---

## 4. 컴포넌트 코드 접근("여기 코드 보기")

**VSCode 딥링크(`vscode://file/{path}:{line}:{col}`) — (b), 신뢰성 제약 많음.** Microsoft 공식 문서(`code.visualstudio.com/docs/configure/command-line`, "Opening VS Code with URLs")가 이 형식을 명시하지만, 실사용 신뢰성엔 구멍이 많다: **절대 경로 필수**(groupHint가 상대경로면 프로젝트 루트를 앱이 알아야 함), OS에 `vscode://` 핸들러 등록 필요, 브라우저의 "Open VS Code?" 1차 확인창 + **VS Code 자체의 2차 확인창**("An external application wants to open X", v1.44+, 옵트아웃 불가, [issue #95670](https://github.com/microsoft/vscode/issues/95670)에서 옵트아웃 요청이 아직 미해결로 열려있음)까지 이중 프롬프트가 뜬다. 성공 여부를 JS가 확인할 방법도 없는 fire-and-forget이다. 대안으로 JetBrains(WebStorm 등)는 프로토콜 대신 **IDE 내장 로컬 HTTP 서버**(`http://localhost:63342/api/file/{path}:{line}:{col}`)를 공식 지원한다.

**Vite의 launch-editor 메커니즘 — (c), 더 신뢰할 수 있는 대안.** Vite 에러 오버레이의 "클릭해서 에디터 열기"는 vitejs 조직의 `launch-editor`/`launch-editor-middleware` 패키지가 구현하며, dev 서버에 `/__open-in-editor?file=path:line:col` 미들웨어를 붙인다. 이는 **vite.dev 공식 문서엔 명시되어 있지 않은 내부 구현**이지만, `launch-editor-middleware`는 독립 npm 패키지로 공식 README가 있어 커스텀 Vite 플러그인의 `configureServer` 훅으로 직접 재사용 가능하다. 에디터 판별은 실행 중 프로세스 탐지 → `EDITOR`/`VISUAL` 환경변수 순이며 VS Code 외 20종 이상 지원. **Node 프로세스(dev 서버)에서 직접 셸 명령을 실행**하므로 `vscode://`의 "브라우저가 프로토콜을 신뢰하는가" 문제 자체가 없다 — 이중 확인창 없이 한 번의 fetch로 에디터가 열린다는 점에서 실사용 신뢰성이 더 높다. 다만 dev 서버와 브라우저가 같은 머신이어야 한다는 전제가 붙고, 커스텀 Vite 플러그인 작성이 필요해 딥링크보다 초기 구현 비용이 크다.

**자체 "소스 보기" 구현 — (b), 간단~중간.** `/@fs/` + `?raw` 조합으로 파일 전체 텍스트를 dev 서버에서 fetch하는 건 기술적으로 현실적이고, dev-only라 프로덕션에 노출될 일이 없다(단 Vite 최신 버전 유지로 CVE 회피 필요).

**인라인 스니펫 미리보기 — (b), 중간.** 하이라이터는 Prism(코어 ~2KB, 가벼움)이나 Shiki(v1+ 부터 WASM 없이 `oniguruma-to-es` 기반 JS 정규식 엔진 + fine-grained 번들 지원으로 VS Code급 품질을 상대적으로 가볍게 얻을 수 있음)가 후보. 여러 노드가 같은 파일을 가리킬 수 있으므로 **파일 단위 캐시(파일 경로 → 텍스트)**가 사실상 필수 — 노드마다 개별 fetch는 낭비.

**난이도 종합**: 딥링크 URL만 생성(신뢰성 낮음)은 간단, launch-editor 미들웨어 방식(신뢰성 높음)은 중간, 인라인 스니펫 미리보기는 중간(단 `lineNumber` 스키마 선행 작업 포함 시 체감 난이도 상승).

Sources: [VS Code Command Line](https://code.visualstudio.com/docs/configure/command-line) · [Issue #95670 (이중 확인창 옵트아웃 미해결)](https://github.com/microsoft/vscode/issues/95670) · [vitejs/launch-editor](https://github.com/vitejs/launch-editor) · [launch-editor-middleware](https://www.npmjs.com/package/launch-editor-middleware) · [Vite Server Options](https://vite.dev/config/server-options.html) · [Shiki RegExp Engines](https://shiki.style/guide/regex-engines) · [Shiki Bundles](https://shiki.style/guide/bundles) · [JetBrains 내장 파일 API](https://antkorwin.com/idea/openfile.html)

---

## 5. 디자인 테마 변경

**`colorMode` prop — (a) 공식 내장, 단 범위가 제한적.** `<ReactFlow colorMode={'light'|'dark'|'system'}>`(기본값 `'light'`)이 공식 존재하며, `.react-flow` 루트 엘리먼트에 `dark`/`light` 클래스를 부여해 **React Flow 내장 요소(기본 노드/엣지 스타일, Controls, MiniMap, Background, 선택 아웃라인)만 자동으로 다시 칠한다.** 커스텀 노드(`ComponentNode`, `GroupNode`)는 자동 적용 대상이 아니다 — 직접 `.dark`/`.light` 클래스 셀렉터나 xyflow CSS 변수를 참조해 자체 스타일을 훅업해야 한다.

**CSS 커스텀 프로퍼티 — (a) 공식 Theming 가이드 존재.** `--xy-{요소}-{속성}-default` 네이밍으로 노드(`--xy-node-background-color`, `--xy-node-border` 등), 핸들, 엣지/커넥션라인, 배경/그리드, 선택, 컨트롤, 미니맵 카테고리별 변수가 문서화되어 있다. **주의**: 오버라이드는 반드시 `.react-flow { --xy-... }` 스코프 안에서 해야 하며(전역 `:root`에 정의하면 무시됨), 이는 공식 문서보다 [discussion #4587](https://github.com/xyflow/xyflow/discussions/4587)의 커뮤니티 보고에서 더 명확히 확인된다.

**도메인별 커스텀 컬러 팔레트 — (b) 표준 React 패턴, 전용 공식 예제는 없음.** "Custom Nodes" 가이드는 `data` prop을 그대로 받는다는 것만 보여줄 뿐, 카테고리 필드로 색상을 분기하는 명시적 예제는 없다. 하지만 이건 React Flow 고유 기능이 아니라 **순수 React 패턴**(커스텀 노드 컴포넌트 안에서 `data.color` 등을 읽어 inline style/className 적용)이라 난이도는 낮다 — `ComponentNode`/`GroupNode`에 `data.color` 필드 하나 추가하면 끝.

**`system` 모드 + SSR / 변수 병행 시 주의점 — 공식 문서 부재.** 이 프로젝트는 SSR이 없는 순수 클라이언트 dev 도구라 SSR mismatch는 해당 사항 없음. 우선순위 이슈는 "xyflow 스타일시트 import 이후에 커스텀 CSS 로드"라는 일반 원칙 외 공식 캐비어트는 없다.

**난이도 종합**: `colorMode` 켜기 자체는 간단(prop 하나). 커스텀 노드까지 다크모드 완전 적용 + 도메인별 팔레트는 중간(CSS 변수 매핑 + `data.color` 배선).

Sources: [Theming 가이드](https://reactflow.dev/learn/customization/theming) · [ColorMode 타입](https://reactflow.dev/api-reference/types/color-mode) · [Dark Mode 예제](https://reactflow.dev/examples/styling/dark-mode) · [Custom Nodes 가이드](https://reactflow.dev/learn/customization/custom-nodes) · [Discussion #4587 (CSS 변수 스코프)](https://github.com/xyflow/xyflow/discussions/4587)

---

## 6. 추가로 고려할 만한 UX (보너스 추천)

5개 항목과 겹치지 않는, 공식 예제/문서로 뒷받침되는 후보 6가지:

| 기능 | 분류 | 왜 이 도구에 맞는가 | 출처 |
|---|---|---|---|
| **그룹 접기/펼치기** | (b) 큰 작업 | ADR-0014가 실측한 "그룹 100개+에서 지도 모드 붕괴"(P2)를 사용자가 수동으로 완화할 수 있는 탈출구. 부모 `expanded` 상태에 따라 자식 `hidden` 재귀 토글로 구현 | [Expand & Collapse(Pro)](https://reactflow.dev/examples/layout/expand-collapse) · [Node 타입](https://reactflow.dev/api-reference/types/node) |
| **자동 레이아웃(Dagre/Elkjs)** | (b) 중간 | 라이브 Fiber 트리는 마운트/언마운트로 구조가 계속 바뀌므로, 온보딩 중인 개발자가 수동 재배치 없이 계층이 자동 정리되면 유리. 단, 정적 레이아웃용이라 실시간 갱신 트리거는 별도 구현 필요 | [Dagre 예제](https://reactflow.dev/examples/layout/dagre) · [Elkjs Tree 예제](https://reactflow.dev/examples/layout/elkjs-tree) |
| **NodeToolbar 빠른 액션 바** | (a) 간단 | 줌 배율과 무관하게 항상 같은 크기로 렌더되어, 지도 모드에서도 선택한 그룹 위에 "이 그룹 접기" 같은 버튼을 얹기 좋음 | [Node Toolbar 예제](https://reactflow.dev/examples/nodes/node-toolbar) |
| **우클릭 컨텍스트 메뉴** | (b) 간단 | `onNodeContextMenu`/`onPaneClick`으로 "이 그룹만 접기", "여기서부터 필터링" 등 탐색 흐름을 끊지 않는 컨텍스트 액션 제공 | [Context Menu 예제](https://reactflow.dev/examples/interaction/context-menu) |
| **리렌더 전파 애니메이션 엣지** | (b) 중간 | 이 도구의 핵심 차별점("정적 다이어그램이 아니라 실시간 리렌더 반영")을 엣지 레벨에서도 표현 — 부모→자식 엣지를 따라 펄스가 흐르는 애니메이션으로 리렌더 전파 시각화 | [Animating Edges 예제](https://reactflow.dev/examples/edges/animating-edges) |
| **키보드 내비게이션/접근성** | (a) 간단 | `Tab` 포커스 이동, 화살표 키 이동, ARIA 라이브 리전이 공식 지원됨 — 마우스 없이 순차 탐색하려는 신규 팀원(온보딩 시나리오)이나 스크린리더 사용자에게 유효 | [Accessibility 가이드](https://reactflow.dev/learn/advanced-use/accessibility) |

참고로 "Undo/Redo"(`useUndoRedo`)와 "Lasso Selection"(`SelectionMode`)도 공식 예제가 있으나, 전자는 Pro 전용이고 이 도구가 사용자 편집이 아닌 **실제 앱 상태를 그대로 반영하는 read-mostly 캔버스**라는 성격상 우선순위가 낮아 제외했다(단, 3-B 캔버스 주석을 도입하면 그 주석에 한해 undo/redo가 다시 유의미해질 수 있음).

Sources: [Examples 개요](https://reactflow.dev/examples) · [Sub Flows 가이드](https://reactflow.dev/learn/layouting/sub-flows) · [Devtools and Debugging 가이드](https://reactflow.dev/learn/advanced-use/devtools-and-debugging) · [Lasso Selection 예제](https://reactflow.dev/examples/whiteboard/lasso-selection) · [Undo and Redo(Pro)](https://reactflow.dev/examples/interaction/undo-and-redo)

---

## 종합: 난이도 vs 선행 조건 한눈에 보기

| 항목 | 분류 | 난이도 | 선행 조건 |
|---|---|---|---|
| 1. 미니맵 커스터마이징(그룹 요약) | (b) | 간단~중간 | 없음 |
| 1. 지도 모드 LOD로 P2 완전 해소 | (b) | 큰 작업 | 없음 (기존 SemanticZoomController 패턴 확장) |
| 2. 검색 하이라이트 + 자동 이동 | (a)+(b) | 간단 | 없음 |
| 2. 그룹+개별 동시 필터 | (b) | 중간 | `hidden` 재귀 전파 로직 |
| 3-A. JSDoc 툴팁 | (c) | 큰 작업 | **"정의 위치" 추적이라는 새 데이터 소스 필요** (그룹핑 힌트 설계와 충돌) |
| 3-B. 캔버스 스티키노트(로컬 저장) | (a)+(b) | 간단~중간 | 없음 |
| 3-B. 캔버스 주석 실시간 공유 | (c) | 큰 작업 | 백엔드/CRDT 인프라 (React Flow Pro 또는 Liveblocks) |
| 4. VSCode 딥링크(단순) | (b) | 간단 | `lineNumber` 스키마 추가, 신뢰성 낮음(이중 확인창) |
| 4. Vite launch-editor 방식 | (c) | 중간 | `lineNumber` 스키마 추가 + 커스텀 Vite 플러그인 |
| 4. 인라인 스니펫 미리보기 | (b) | 중간 | `lineNumber` 스키마 추가 + 파일 캐시 |
| 5. `colorMode` 다크모드 | (a) | 간단 | 없음 |
| 5. 도메인별 커스텀 팔레트 | (b) | 간단 | 없음 |
| 6. 그룹 접기/펼치기 | (b) | 큰 작업 | 없음 |
| 6. 자동 레이아웃 | (b) | 중간 | 없음 |
| 6. NodeToolbar / 컨텍스트 메뉴 | (a)/(b) | 간단 | 없음 |

**가장 싸게 얻을 수 있는 것(선행 조건 없음, 간단~중간)**: 검색 하이라이트+자동 이동(2), 다크모드+도메인 팔레트(5), 캔버스 스티키노트 로컬 저장(3-B), NodeToolbar/컨텍스트 메뉴(6).
**가장 프로젝트 철학과 직결되는 것**: 지도 모드 LOD(1)는 이미 실측된 P2 결함을 정면으로 해소하며, ui-philosophy.md의 "필요한 순간에만 복잡도를 보여주는 UI" 원칙과 가장 밀접하다.
**가장 크게 재검토가 필요한 것**: 3-A(JSDoc 툴팁)는 이번 조사에서 "단순 기능 추가"가 아니라 "그룹핑 힌트가 사용 위치로 고정된 현재 설계와 충돌하는 별도 리서치 과제"임이 드러났다 — 우선순위를 낮추거나, 착수 전 별도 ADR 필요.
