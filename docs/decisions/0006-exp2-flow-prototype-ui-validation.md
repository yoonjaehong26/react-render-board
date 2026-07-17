# ADR-0006: 실험 2 — React Flow 클러스터링 + semantic zoom UI 철학 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

roadmap.md의 실험 2는 "영역 그룹핑 + semantic zoom"이라는 [`ui-philosophy.md`](../ui-philosophy.md)의 핵심 철학이 실제로 이해하기 좋은지 확인하는 것이었다. 기술 검증(실험 1)이 아니라 UX 검증이므로, 실시간 bippy 훅킹 없이 정적 가짜 데이터로 React Flow(xyflow) 프로토타입을 만들었다.

`experiments/exp2-flow-prototype/`에 Vite + React 19 + TypeScript + `@xyflow/react` 앱을 새로 만들었다. exp1이 실제로 뽑은 `FiberNodeJSON` 구조(`id`/`displayName`/`kind`/`parentId`)를 그대로 따르되, architecture.md의 데이터 레이어 초안에 있는 "그룹핑 힌트"(도메인/소스 파일)를 exp1은 아직 뽑지 않으므로 fixture 데이터에 `group` 필드를 직접 채워 넣어 흉내냈다.

두 가지 fixture를 만들었다:
- **small** (`sampleSmall.ts`, 16개 노드) — exp1의 실제 테스트 트리(App → ThemeContext.Provider(익명) → ThemedLabel/Counter/ItemList → ListItem×3)를 그대로 재현하되, ItemList/ListItem만 일부러 다른 그룹(`catalog`)으로 지정해 "같은 부모-자식 관계인데 그룹은 다른" 실제 상황(공유 레이아웃이 여러 도메인의 컴포넌트를 렌더하는 경우)을 재현.
- **large** (`generateLargeTree.ts`, 시드 고정 PRNG로 생성, 257개 노드) — 15개 도메인에 걸쳐 host/composite/익명 노드가 섞인 트리. roadmap.md의 "컴포넌트 수백 개 넘어가도 안 뭉개지는 UX" 가정을 검증하기 위한 규모.

## 검토한 대안

- **익명 Fiber 처리** — exp1(ADR-0005)에서 발견된 문제: Provider/Consumer 같은 React 내부 구현 Fiber가 `(anonymous)`로 나와 그대로 그리면 UX 검증이 왜곡됨. 두 가지 모드를 구현해 둘 다 실제로 캔버스에서 비교했다.
  - **filter(기본)** — 익명 노드를 트리에서 제거하고 자식을 가장 가까운 "보이는" 조상에 재연결. `lib/preprocess.ts`의 `findVisibleAncestor`가 부모 체인을 걸으며 처리.
  - **dim** — 익명 노드를 남기되 CSS로 흐리게(`opacity: 0.45`, 점선 테두리) 표시.
  - → **filter를 기본값으로 채택.** dim 모드로 실제 렌더링해 비교해보니, 사용자 컴포넌트 구조를 파악하는 목적에서 익명 Provider 노드는 정보량이 거의 없고 트리만 한 단계 깊어지게 만들었다. dim은 "내부 구현이 존재한다는 사실"은 알려주지만 exp2의 목표(컴포넌트 구조 이해)에는 노이즈에 가까웠다.
- **host Fiber(div/span 등) 처리** — exp1 데이터엔 host 노드가 다수 섞여 있다. 기본값을 "숨김"으로 하고 토글로 켤 수 있게 했다. 실제로 켜보니(`includeHostNodes: true`) 리프마다 host 노드가 붙어 화면이 금방 어수선해졌다 — DOM 트리가 아니라 "컴포넌트 보드"라는 프로젝트 목적에는 기본 숨김이 맞다는 게 확인됐다.
- **레이아웃 엔진** — dagre/elkjs 같은 전용 라이브러리 대신 `lib/layout.ts`에 간단한 타이디 트리 배치(리프 카운트 기반 x좌표, depth 기반 y�좌표)를 직접 짰다. ui-philosophy.md의 "되돌리기 쉬운 영역"(레이아웃 디테일)에 해당하므로 정교함보다 속도를 택함 — 라이브 MVP 단계에서 정식 레이아웃 라이브러리로 교체 가능.

## 결정

**"영역 그룹핑(뭉치지 않고 실제 노드를 보여주는 지도형 시각화) + semantic zoom" 철학이 통한다.** 구현 방식은 다음과 같이 확정한다:

1. **그룹핑** — React Flow의 `parentId` + `extent: 'parent'`로 실제 컴포넌트 노드를 그룹 프레임 "안에" 배치. 그룹은 회색 점선 박스로만 경계를 긋고, 노드는 뭉치지 않는다(ui-philosophy.md의 원칙 그대로).
2. **그룹 경계를 넘는 엣지** — 실제 부모-자식 관계가 그룹 경계를 넘을 때(예: App-shell의 컴포넌트가 catalog 도메인 컴포넌트를 직접 렌더) 주황색 점선으로 시각적으로 구분해서 그린다.
3. **semantic zoom** — `useStore`로 xyflow의 zoom 값만 구독(`SemanticZoomController.tsx`)해서, zoom < 0.55일 때 `.zoom-far` 클래스로 개별 노드/엣지를 `opacity: 0`+`pointer-events: none` 처리하고 그룹 라벨만 크게 보이게 한다. 이 구독을 노드 트리 리렌더와 분리해서(별도 소형 컴포넌트) 대규모 데이터에서도 성능 부담이 없게 했다.
4. **익명 Fiber 필터링을 데이터 레이어 전처리로 분리** — `preprocessFiberTree()`가 시각화 레이어보다 먼저 실행되는 순수 함수로, 라이브 MVP에서 실제 bippy 데이터를 넣을 때도 그대로 재사용 가능한 형태로 설계했다(단, 이 실험 자체는 스파이크이므로 재사용을 전제하진 않는다).

## 근거

Playwright로 실제 브라우저 렌더링을 캡처해 검증했다.

- **small(16개, exp1 재현)** — App/ThemedLabel/Counter가 `app-shell` 프레임 안에, ItemList/ListItem×3이 `catalog` 프레임 안에 깔끔하게 분리되어 보이고, App→ItemList의 그룹 횡단 엣지가 주황 점선으로 뚜렷이 구분됨. 익명 Provider 노드는 필터 모드에서 완전히 사라지고 App→ThemedLabel/Counter가 직접 연결된 것처럼 보여 "실제 컴포넌트만 보고 싶다"는 목적에 부합.
- **large(257개, 15개 도메인)** — `fitView`로 전체를 맞추면 자동으로 17% 줌이 되는데, 이때 semantic zoom이 정확히 "지도 모드"로 전환되어 15개 도메인 이름+개수만 보이는 깔끔한 화면이 됐다(개별 노드 173개가 전혀 안 뭉개짐). 줌 컨트롤로 특정 그룹(예: `notifications`, `onboarding`, `checkout`)까지 확대하면 타이디 트리 레이아웃으로 배치된 개별 컴포넌트 이름이 겹침 없이 또렷하게 드러남 — roadmap.md가 요구한 "수백 개 넘어가도 안 뭉개지는 UX"가 실제로 성립함을 확인.
- **dim 모드 + host 노드 표시** — 토글을 켜서 비교 렌더링한 결과, 익명 노드는 점선 테두리+낮은 불투명도로 "존재는 알 수 있되 주의를 끌지 않는" 상태로 잘 표현됐고, host 노드는 회색 대시 테두리로 컴포지트 노드와 시각적으로 명확히 구분됐다.

## 예상 밖 발견 (기록해 둘 것)

- **그룹은 트리 구조와 독립적이어야 실제 가치가 드러난다.** 처음엔 그룹을 서브트리 단위로만 나누려 했는데, exp1 ADR의 "익명 Fiber" 발견과 별개로 "부모와 자식이 다른 도메인일 수 있다"(예: 공유 레이아웃이 여러 기능 패널을 렌더)는 상황이 실제 앱에서 흔하다는 걸 fixture를 만들면서 깨달았다. 그룹 경계를 넘는 엣지를 시각적으로 구분하는 처리가 없었다면 "이 컴포넌트가 왜 이 그룹에 있지?"라는 혼란이 생겼을 것 — 라이브 MVP의 그룹핑 힌트(소스 파일 경로/도메인) 설계에 "부모-자식이 다른 그룹에 속할 수 있음"을 전제로 넣어야 한다.
- **semantic zoom의 구독 범위를 좁혀야 대규모에서 끊기지 않는다.** 처음엔 `useViewport()`를 최상위 컴포넌트에서 써서 zoom 값 하나 바뀔 때마다 앱 전체(수백 개 노드 배열 포함)가 리렌더되게 짰다가, `useStore`로 zoom 값만 구독하는 별도 소형 컴포넌트로 분리하고 나서야 확대/축소가 매끄러워졌다. 노드 수가 많아질수록 "무엇을 구독하는가"가 UX 체감 성능에 직결됨 — 라이브 MVP에서 실시간 업데이트까지 들어가면 이 분리가 필수가 될 것.
- **host 노드를 기본으로 숨긴 것이 그룹핑 철학의 설득력을 크게 높였다.** host 노드를 포함해서 보면 그룹 프레임 안이 DOM 리프로 가득 차 "영역"이라는 느낌보다 "덤불"에 가까워졌다. React DevTools와 달리 이 프로젝트는 "컴포넌트 구조를 이해하는 보드"이지 "DOM 트리 뷰어"가 아니라는 architecture.md의 전제가 이 실험을 통해 UI 레벨에서도 확인됐다.

## 결과

- roadmap.md 실험 2의 완료 조건(철학이 실제로 이해하기 좋은지 확인)을 충족했다. **철학은 유효하다** — 지도형(영역 프레임 + 실제 노드 유지) + semantic zoom 조합으로 수백 개 노드도 뭉개지지 않고 탐색 가능함을 확인.
- 다음 단계는 roadmap.md의 "라이브 MVP — 실험 1 + 2 통합"이다. 이때 반영할 것:
  - `preprocess.ts`의 익명 필터링 로직을 실제 bippy 데이터 파이프라인에 연결.
  - architecture.md 데이터 레이어의 "그룹핑 힌트"를 실제로 어떻게 뽑을지 결정(소스 파일 경로가 프로덕션 빌드에서도 안정적으로 나오는지 별도 확인 필요 — 아직 미검증).
  - `lib/layout.ts`의 단순 타이디 트리 배치는 스파이크 수준이므로, 실시간 업데이트(노드 추가/삭제)가 들어오면 레이아웃 재계산 전략을 다시 설계해야 함.
- 이 실험의 코드(`experiments/exp2-flow-prototype/`)는 스파이크 코드이며 라이브 MVP에 그대로 재사용할 필요는 없다 — 다만 위 발견들(그룹 경계 횡단 엣지, semantic zoom 구독 범위, host 노드 기본 숨김)은 다음 단계 설계에 반영한다.
