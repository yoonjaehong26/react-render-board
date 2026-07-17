# ADR-0009: 판단 지점 — 실제 제3자 오픈소스 앱(excalidraw) 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

roadmap.md의 판단 지점은 "우리가 만든 테스트 fixture가 아니라 실제 제3자 오픈소스 앱에서 QA해야 한다"는 통과 기준을 명시했다. 실험 1(ADR-0005) + 실험 2(ADR-0006) + 그룹핑 힌트 검증(ADR-0007) + 라이브 MVP 통합(ADR-0008)이 전부 우리가 직접 만든 fixture로만 검증됐기 때문이다. 이 fixture들은 "기술적으로 되는가"만 다시 증명했을 뿐, prior-art.md가 경고한 진짜 리스크 — 대형 앱에서 그룹핑이 라이브러리 파일로 수렴해 무의미해지는지, 캔버스가 실사용 규모에서 뭉개지는지, 실제 커밋 빈도에서 레이아웃 재계산이 버티는지, memo/forwardRef/lazy+Suspense/포털이 이상하게 나오는지 — 는 전혀 검증하지 못했다.

## 검토한 대안

앱 선택 기준: React 18/19, Vite/CRA 기반 dev 서버로 백엔드 없이 뜰 것, 컴포넌트 수백 개 이상, 실제 UI 라이브러리(memo/forwardRef/lazy 래퍼) 사용.

1. **excalidraw** (excalidraw/excalidraw) — 채택. 1순위 후보에서 바로 성공, 다른 후보(react-admin 데모, shadcn 대시보드 템플릿) 시도 불필요.
2. react-admin e-commerce 데모, shadcn/ui 기반 대시보드 템플릿 — 후보로만 검토, 시도하지 않음(1순위가 바로 성공해 시간을 더 쓸 이유가 없었다).

## 결정

### 1. 대상 앱: excalidraw (`experiments/real-app-validation/excalidraw/`, gitignore 처리)

- React 19.0.0, `excalidraw-app` 워크스페이스(yarn monorepo) + `packages/{excalidraw,common,element,math}` 합쳐 283개 `.tsx`/`.jsx` 파일.
- UI 라이브러리로 `radix-ui`(forwardRef/memo 컴포지션이 여러 겹으로 실제 존재)를 씀.
- 백엔드 없이 `excalidraw-app`을 Vite dev 서버로 바로 띄울 수 있음(협업/Firebase/AI 기능은 `.env.development`가 도달 불가능한 주소를 가리키지만, 화이트보드·툴바·사이드바·메뉴는 전부 정상 렌더).
- StrictMode 켜짐, 단일 React root, 라우팅 없음(단일 페이지), 정지 상태에서 폴링 없음(협업 세션 시작 시에만 `Collab.tsx`가 폴링) — "실사용 규모의 실제 UI 라이브러리 앱"이라는 기준에 정확히 부합하면서도 부가 변수(라우팅, 백그라운드 폴링)가 적어 검증 결과를 해석하기 깨끗하다.

### 2. 통합 방법: dev-only 오버레이, excalidraw 소스 변경은 2줄

`excalidraw-app/_react-render-board/`에 이 레포의 `src/{hooking,data,visualization}`를 그대로 복사(vendor)하고, workspace에 `bippy`+`@xyflow/react`를 추가했다. excalidraw 자체 코드는 `excalidraw-app/index.tsx`에 두 줄만 추가했다:

```ts
import { mountReactRenderBoard } from "./_react-render-board/mount";
// ...
mountReactRenderBoard(rootElement); // dev-only, ADR-0008의 subject/board 분리 그대로 재사용
```

`mount.tsx`(신규)는 ADR-0008의 `createRenderStore` + `startFiberInspector(store, subjectContainer)`를 그대로 불러다 쓰고, `Canvas`를 우측 하단 토글 버튼으로 열고 닫는 전체화면 오버레이(별도 DOM 노드 + 별도 React root, `document.body`에 append)로 감쌌다 — excalidraw의 레이아웃/상태를 전혀 건드리지 않는다. 이 통합 방식 자체가 "npm 패키지를 사용자 앱에 직접 설치"(architecture.md의 의도된 배포 모델)를 vendoring으로 흉내낸 것이라는 점을 기록해 둔다 — 실제 배포 시엔 패키지 설치 한 줄 + 마운트 호출 한 줄로 더 단순해질 것이다.

### 3. 검증 결과

`scripts/verify-real-app.mjs`(Playwright, 재현 가능하도록 저장소에 남김)로 확인했다. excalidraw에서 도형을 실제로 그리며(사각형 3개 + 원 5개) 유발된 실제 커밋을 대상으로 했다.

**① 그룹핑 힌트 품질 — 부분적으로 유효하다 (roadmap.md가 우려한 "대부분 라이브러리로 수렴"은 아니지만, 무시할 수 없는 소수 사례가 실재한다).**

초기 로드 시점 80개 그룹 중 68개(85%)는 `LayerUI.tsx`, `Toolbar.tsx`, `ColorPicker.tsx`, `actionProperties.tsx`, `Sidebar.tsx`처럼 실제 excalidraw 도메인 파일로 정확히 잡혔다 — exp1/ADR-0007이 작은 규모에서 확인한 "사용 위치 기준 그룹핑"이 283개 파일 규모에서도 그대로 성립한다. 그러나 12개(15%)는 `../../../../node_modules/@radix-ui/react-dropdown-menu/...`, `.../react-primitive/...`, `.../react-slot/...`, `.../react-context/...`, `.../react-popper/...`, `.../react-collection/...`, `.../react-presence/...`, `.../react-popover/...`, `jotai/esm/react.mjs`, `tunnel-rat/dist/index.js` 같은 **라이브러리 내부 구현 파일**로 잡혔다.

원인을 특정했다: 이 현상은 **UI 라이브러리 컴포넌트가 내부적으로 "또 다른 라이브러리 컴포넌트"를 합성해서 렌더할 때** 발생한다. 예를 들어 앱 코드의 `DropdownMenuTrigger.tsx`가 Radix의 `DropdownMenuTrigger`를 렌더하면 그 자체는 `DropdownMenuTrigger.tsx` 그룹으로 정확히 잡히지만, Radix의 `DropdownMenuTrigger` 내부가 다시 Radix 자신의 `Popper`/`Primitive`/`Slot`/`Presence`/`Collection` 컴포넌트를 렌더하면, 그 안쪽 composite fiber들의 `getSource`("사용 위치")는 앱 코드가 아니라 **Radix 패키지 자신의 소스 파일**을 가리킨다. `getSource`가 "이 컴포넌트가 어디서 쓰였는가"만 알려준다는 ADR-0007/0008의 알려진 한계가, 라이브러리가 자기 자신을 내부적으로 합성하는 패턴(Radix의 프리미티브 합성 스타일)을 만나면 그룹 목록 자체에 라이브러리 내부 파일이 섞여 들어가는 형태로 드러난다는 게 실제 앱에서 처음 확인한 사실이다. 합성 스타일 라이브러리를 쓰지 않는 우리 자체 fixture(ADR-0008)에서는 이 패턴이 아예 발생하지 않아 발견될 수 없었다.

영향은 치명적이지 않다 — 15%는 소수고, 그 그룹들도 각각 소수의 노드(1~수 개)만 담고 있어 화면을 지배하지 않는다. 하지만 "낯선 파일 경로가 섞여서 혼란을 준다"는 점에서 UX 흠결은 실재한다. **정식 재구현 단계의 백로그 항목으로 기록한다:** `node_modules`로 시작하는 groupHint는 별도 처리(예: 가장 가까운 "앱 소스" 조상 그룹으로 흡수하거나, 시각적으로 구분되는 "library internals" 메타 그룹으로 묶기)가 필요하다.

**② 캔버스 규모 — 실사용 규모에서 뭉개지지 않았다.**

초기 로드 + 도형 3개 상태에서 총 646개 fiber 노드(composite 232 + host 414, host는 기본 숨김이라 232만 표시), 80개 그룹. exp2의 합성 데이터(257개, 15개 도메인)보다 큰 실제 규모다. `fitView` 직후 21% 줌으로 자동 전환돼 semantic zoom이 정확히 지도 모드로 진입했고, 스크린샷상 80개 그룹 프레임이 격자로 깔끔하게 배치되어 뭉개지거나 겹치지 않았다. host 노드를 켜서 726개 전체를 표시해도(826ms에 반영) 크래시나 시각적 붕괴 없이 격자가 유지됐다 — 다만 이 모드는 프로젝트 설계상 기본값이 아닌 opt-in 이스케이프 해치이므로, 그 상태에서의 가독성(그룹 내부 디테일)까지는 검증 범위에 넣지 않았다.

**③ 레이아웃 재계산 성능 — 실제 커밋 빈도에서 측정 가능한 비용이 있다(치명적이진 않음).**

보드 오버레이를 닫은 상태(레이아웃 재계산 자체가 구독되지 않아 실행 안 됨)에서 도형 5개를 빠르게 그리는 데 433ms가 걸렸다. **같은 상호작용을 보드를 연 채로**(매 커밋마다 `normalizeForCanvas`+`toFlow`가 200개 이상의 노드에 대해 다시 실행됨) 반복하자 1196ms로 늘었다 — 약 2.76배. 콘솔 에러나 눈에 띄는 프리즈/크래시는 없었지만, 체감 가능한 지연이 실측됐다. ADR-0008의 "그룹 단위 메모이제이션" 전략이 완전 재배치보다는 낫지만, **보드가 열려 있는 동안 호스트 앱의 상호작용 응답성에 실측 가능한 부담을 준다**는 것을 실제 앱에서 처음 확인했다 — 자체 fixture(노드 수십 개)에서는 이 비용이 감지될 만큼 크지 않았다. **정식 재구현 단계 백로그:** 레이아웃 재계산을 `requestIdleCallback`/디바운스로 커밋 프레임과 분리하거나, 보드가 화면에 실제로 보이는 그룹만 계산하는 등의 최적화가 필요하다.

**④ memo/forwardRef/lazy/portal 처리 — 대체로 정확했다. lazy+Suspense는 실제 앱에서 검증하지 못했다.**

Radix의 forwardRef+memo 합성 컴포넌트들이 `(anonymous)`로 뭉개지지 않고 `DropdownMenuTrigger.tsx`, `DropdownMenuContent.tsx` 등 실제 이름으로 정확히 나왔다(ADR-0008의 tag 기반 필터링이 실사용 규모에서도 유효함을 재확인). 표시된 232개 composite 노드 중 진짜 익명 컴포넌트는 6개(2.6%)뿐이었다. Radix는 팝오버/툴팁/다이얼로그에 포털을 광범위하게 쓰는데, 포털로 렌더된 서브트리가 DOM 위치가 아니라 **논리적 React 부모** 아래 그대로 붙어서 나왔다 — architecture.md가 명시한 "DOM 트리 뷰어가 아니라 렌더 구조를 보여준다"는 설계 의도와 일치하고, 크래시나 중복 id 에러도 없었다. 다만 excalidraw는 이 UI 패널들에 `React.lazy`를 쓰지 않아서, lazy+Suspense 경계 처리는 이번 실제 앱 검증으로는 확인하지 못했다 — 이 항목은 여전히 자체 fixture(`src/fixtures/domains/notifications`, ADR-0008)로만 검증된 상태로 남는다.

**⑤ 부가 확인: 그룹 마운트/언마운트가 실제 앱 상호작용으로도 자연스럽게 재현됨.**

도형을 그리자 excalidraw의 웰컴 스크린(`WelcomeScreen.*` 관련 컴포넌트들)이 실제로 언마운트되면서 전체 노드 수가 646→546으로 줄었다. ADR-0008이 자체 fixture(알림 패널 토글 버튼)로만 확인했던 "그룹 전체 마운트/언마운트" 시나리오가 우리가 만들지 않은 실제 앱의 자연스러운 사용자 흐름에서도 동일하게 안정적으로 동작함을 확인했다.

**⑥ 안정성 — 세션 전체에서 콘솔/페이지 에러 0건.**

초기 로드, StrictMode 이중 렌더, 도형 8개 생성, host 토글 on/off, 오버레이 열기/닫기, 줌 조작을 포함한 전체 시나리오에서 콘솔 에러가 한 건도 없었다. bippy의 `instrument()` + `containerInfo` 필터링(ADR-0008)이 우리와 무관한 실제 React 19 앱을 불안정하게 만들지 않는다는 것을 확인했다 — React-Sight가 실패한 지점(계측이 대상 앱을 멈춤)이 재현되지 않았다.

## 근거

위 ①~⑥은 모두 `scripts/verify-real-app.mjs`의 콘솔 로그(수치)와 `verify-output/real-app/`의 스크린샷(육안 확인, gitignore 처리)으로 재현 가능하게 뒷받침된다.

## 예상 밖 발견 (기록해 둘 것)

- **"라이브러리 파일로 수렴하는 그룹핑"은 roadmap.md가 예상한 것과 다른 메커니즘으로 발생했다.** 원래 우려는 "그룹핑이 너무 거칠어서 전부 뭉뚱그려진다"는 쪽이었는데, 실제로 관찰된 건 정반대에 가깝다 — 그룹핑은 오히려 너무 세밀해서, 라이브러리가 **자기 자신의 내부 컴포넌트를 합성**하는 패턴(Radix류)을 만나면 그 내부 합성 단계마다 별도 그룹이 생겨버린다. "뭉개짐"이 아니라 "노이즈 그룹 증식"이 진짜 리스크였다.
- **성능 비용은 정적 데이터 규모가 아니라 "보드가 열려서 구독 중인가"에 좌우된다.** exp2(정적 257개 데이터)는애초에 이 축을 검증할 수 없었고, 라이브 MVP 자체 fixture(수십 개 노드)도 비용이 감지될 만큼 크지 않았다 — 오직 "실제 앱 규모 + 실제 인터랙션 빈도"의 조합에서만 2.76배라는 구체적 수치가 드러났다. 이것이 정확히 roadmap.md가 자체 fixture로는 검증 불가능하다고 지적했던 그 리스크다.
- **excalidraw는 lazy+Suspense를 쓰지 않는다.** "실제 앱이면 뭐든 다 검증된다"는 가정이 틀렸다는 걸 확인한 사례 — 앱 하나로는 4가지 검증 항목을 전부 커버하지 못할 수 있다. 다음 라운드에서 lazy+Suspense가 많은 다른 앱(예: 라우트 단위 code-splitting을 쓰는 대시보드형 앱)으로 이 항목만 추가 검증하는 것을 향후 과제로 남긴다.

## 결과

**최종 판단: 조건부 진행(GO) — 정식 재구현으로 넘어가되, 이번에 실제 앱에서 드러난 두 가지 구체적 결함을 1순위 백로그로 못박는다.**

- 기술 가능성·UI 철학·안정성은 실제 제3자 앱(283개 파일, 646개 fiber 노드 규모)에서도 깨지지 않았다 — 이번 판단 지점의 통과 기준(자체 fixture가 아닌 실제 앱 QA)을 충족했다.
- 다만 "전부 괜찮았다"는 아니다. ① 라이브러리 내부 합성 패턴에서 그룹핑 노이즈가 생기는 문제, ③ 보드가 열려 있을 때 실제 인터랙션 응답성에 측정 가능한 비용(2.76배)이 생기는 문제는 **정식 재구현 착수 전에 설계로 반영해야 할 구체적 결함**으로 확정한다. 둘 다 우회 가능한 디테일 수준의 문제이지 아키텍처 전체를 재검토해야 하는 근본 결함은 아니다(architecture.md의 "되돌리기 어려운 결정"인 데이터 스키마 자체는 이번 검증으로 흔들리지 않았다).
- lazy+Suspense 경계는 이번 검증 대상 앱에서 자연 발생하지 않아 미검증 상태로 남는다 — 정식 재구현 착수 전 별도 앱으로 추가 확인할 가치가 있다(선택 사항, 블로커 아님).
- `experiments/exp1-fiber-extraction/`, `experiments/exp2-flow-prototype/`은 이제부터 전적으로 회귀 스모크 테스트 용도로만 취급한다. `experiments/real-app-validation/excalidraw/`는 로컬 재현용으로 남기되(gitignore 처리, 레포 히스토리에는 없음), `scripts/verify-real-app.mjs`는 재현 가능한 검증 스크립트로 레포에 남긴다.
- vision.md의 성공 기준("완성 후에도 계속 붙잡을 동기가 있는가")에 대한 답은 이 ADR의 범위 밖이다 — 기술·UX 판단은 GO이지만, roadmap.md의 "생존 전략" 절이 요구하는 별도 결정(dogfooding할지 커뮤니티 채택을 목표할지)은 아직 열려 있다.
