# ADR-0015: 판단 지점 — 라우팅 기반 대형 서브트리 전환 + 라우트 단위 코드 스플리팅 실제 앱 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

지금까지의 실제 앱 검증(ADR-0009, excalidraw)과 lazy+Suspense 검증(ADR-0011)은 각자 커버하지 못한 축이 하나씩 있었다.

- ADR-0009(excalidraw)는 "실제 제3자 앱" 기준은 충족했지만 **라우팅이 아예 없는 단일 페이지 앱**이었다. 그룹/노드 마운트-언마운트는 사용자 상호작용(도형 그리기, 웰컴 스크린 사라짐) 수준에서만 확인됐고, "라우트 전환이 유발하는 대형 서브트리 전체 교체"는 한 번도 관찰되지 않았다.
- ADR-0011(React.lazy+Suspense)은 `LazyComponentTag` 처리와 코드 스플리팅 경계를 검증했지만, **우리가 만든 합성 fixture**(`src/fixtures/domains/reports/`) 위에서만 했다 — 실제 앱의 라우트 단위 lazy 청크(진짜 네트워크 청크 분리, 진짜 dev 서버 모듈 그래프)에서는 검증되지 않았다.

이번 라운드는 이 둘을 합친 공백 — "실제 앱에서, 라우팅이 유발하는 대형 서브트리 마운트/언마운트와 라우트 단위 코드 스플리팅이 동시에 일어날 때" — 을 닫는다. ADR-0012가 이미 고정한 두 가지(그룹핑 노이즈 흡수, notify 디바운스+`onlyRenderVisibleElements`)는 이번 라운드의 전제 조건이자 회귀 기준선으로 그대로 가져간다.

## 검토한 대안

앱 선택 기준(ADR-0009와 동일): React 18/19, Vite/CRA dev 서버로 백엔드 없이 뜰 것, 컴포넌트 수백 개 이상, 실제 UI 라이브러리 사용 — 이번엔 추가로 **`react-router-dom`의 `createBrowserRouter` 기반 라우팅 + 라우트 단위 `React.lazy`**가 필수 조건이었다.

1. **`codedthemes/berry-free-react-admin-template`의 `vite/` 서브디렉터리** — 채택. 사전 조사(GitHub API)로 React 19.2.0, Vite 7.2.6, react-router-dom 7.9.6, 2177 stars, not archived를 확인한 상태로 시작했고, clone 후 실제로도 그대로 확인됐다. `MainRoutes.jsx`가 `MainLayout`(사이드바+헤더 유지) 아래 `dashboard/default`, `typography`, `color`, `shadow`, `sample-page` 5개 라우트를 전부 `Loadable(lazy(() => import(...)))`로 감쌌고, `AuthenticationRoutes.jsx`가 완전히 다른 레이아웃(`MinimalLayout`, 사이드바 없음)으로 `login`/`register`를 등록해 "분리된 대형 서브트리 교체" 시나리오까지 한 앱 안에서 커버했다. `remix/` 서브디렉터리(다른 프레임워크)는 사용하지 않았다.
2. **`codedthemes/mantis-free-react-admin-template`** — 후보로만 검토, 시도하지 않음. 1순위가 통합 과정에서 겪은 문제(아래 "예상 밖 발견" 참고)가 모두 해결 가능한 수준이라 폴백이 필요하지 않았다.

## 결정

### 1. 대상 앱: berry-free-react-admin-template (`experiments/real-app-validation/berry-admin/vite/`, gitignore 처리)

- React 19.2.0, Vite 7.2.6, react-router-dom 7.9.6, MUI 7.3.5, base path가 `.env`의 `VITE_APP_BASE_NAME=/free`로 고정.
- `MainRoutes`: `/dashboard/default`, `/typography`, `/color`, `/shadow`, `/sample-page` — 전부 `MainLayout`(Header/Sidebar/Footer 유지) 하위, 전부 라우트 단위 `React.lazy`.
- `AuthenticationRoutes`: `/pages/login`, `/pages/register` — `MinimalLayout`(사이드바 없음) 하위, 별도 서브트리.

### 2. 통합 방법: dev-only 오버레이, berry-admin 소스 변경은 실질적으로 2줄 + 의존성 버전 고정 1줄

`vite/src/_react-render-board/`에 이 레포의 `src/{hooking,data,visualization}`를 그대로 vendor하고(ADR-0012의 그룹핑 흡수 + notify 디바운스 + `onlyRenderVisibleElements`가 이미 포함된 현재 버전), `bippy`(`^0.6.0`)와 `@xyflow/react`(`^12.11.2`)를 `vite/package.json`에 추가했다. berry-admin 자체 코드는 `vite/src/index.jsx`에 ADR-0009와 동일하게 두 줄만 추가했다:

```jsx
import { mountReactRenderBoard } from './_react-render-board/mount';
// ...
root.render(<ConfigProvider><App /></ConfigProvider>);
mountReactRenderBoard(container); // dev-only, ADR-0009의 subject/board 분리 그대로 재사용
```

`mount.tsx`는 excalidraw 통합본을 그대로 재사용했다(우측 하단 토글 버튼 + 전체화면 오버레이 + 별도 DOM 노드/React root, `document.body`에 append).

여기에 더해 **의존성 버전 고정 한 줄**이 추가로 필요했다 — `package.json`에 `"overrides": { "motion-dom": "12.23.23" }`. 원인과 판단 근거는 "예상 밖 발견" 참고. 이건 berry-admin 자체 로직을 건드리는 변경이 아니라 이미 깨져 있는 lockfile 해상도를 우리가 검증을 진행할 수 있는 상태로 고정하는 것이라, ADR-0009가 정의한 "target-app 소스 변경 최소화" 원칙에서 벗어난다고 보지 않았다.

### 3. 포트: 5196

이전 세션들이 쓴 5190/5192/5193과 겹치지 않는 포트를 사용했다(`npx vite --port 5196`).

### 4. 검증 결과

`scripts/verify-routing.mjs`(Playwright, 재현 가능하도록 저장소에 남김)로 확인했다. 시나리오: 초기 로드 → 보드 오픈(dashboard) → typography → color(네트워크 지연으로 Suspense fallback 포착) → shadow → sample-page → Authentication 트리(login) → dashboard 복귀 → 6단계 연타 스트레스(dashboard 청크에 2000ms 지연을 건 채 120ms 간격으로 라우트 6번 전환) → 최종 안정화.

**① 클린 대형 서브트리 교체 — 데이터 레벨에서는 완전히 클린하다.**

라우트별 실제 데이터 규모(`toolbar__count`, "표시 중 / 전체" 기준)가 라우트마다 확연히 다르게 나왔다 — dashboard 1288/1716, typography 850/1159, color(resolve 후) 1875/2482, shadow 1244/1647, sample-page 671/922, login 226/288. dashboard→typography 전환에서 dashboard 전용 컴포넌트 이름 5개가 사라지고 typography 전용 이름 27개(`Typography`, `Chip2`, `ListItemIcon2` 등)가 새로 나타나는 것을 이름 집합 차집합으로 확인했다. Authentication 트리 진입 시 `Header`/`Sidebar`/`Footer`가 완전히 사라졌고(`mainLayoutGoneFromLogin: true`), dashboard로 복귀하자 다시 나타났다(`mainLayoutBackAfterReturn: true`) — 그리고 복귀 후 toolbar 수치가 최초 진입 시(1288/1716)와 **정확히 일치**했다. 연타 스트레스 이후 최종 수치도 1288/1716으로 다시 정확히 일치했고, 전체 시나리오에서 `data-id` 중복은 단 한 번도 없었다(매 스냅샷 "N/N 유일"). 고아 노드, 중복 id, 데이터 드리프트는 전혀 관찰되지 않았다.

**② Suspense fallback 구간 — 정상 포착, 캔버스 안 깨짐.**

Vite dev 서버의 `import()`는 로컬 모듈이라 거의 즉시 resolve되므로(ADR-0011과 동일한 문제), berry-admin 소스를 건드리지 않고 Playwright `page.route()`로 `color` 라우트 모듈 요청에만 네트워크 레벨 1200ms 지연을 걸었다(ADR-0011의 "소스에 400ms 인위 지연 삽입"을 네트워크 인터셉션으로 옮긴 버전 — 이번 라운드는 실제 앱이라 소스를 건드리지 않는 쪽을 택했다). 전환 클릭 500ms 후 `.MuiLinearProgress-root`(berry-admin의 `Loader`)가 화면에 잡혔고, 그 순간 보드는 크래시나 빈 화면 없이 정상 상태(259개 DOM 노드)를 유지했다. resolve 후에는 `Color.jsx` 그룹이 정확한 이름으로 나타났다. 총 전환 소요(클릭→안정화) 2062ms.

**③ groupHint/그룹 프레임 — 라우트에 따라 품질이 크게 갈렸다. ADR-0012 참고 시 두 가지 다른 이유로 "이미 알려진 문제의 재현"이 아니라 새로운 문제다. (아래 "예상 밖 발견" 참고)**

dashboard/typography/shadow/sample-page는 그룹이 1~3개로 극단적으로 뭉쳤다(`index.jsx`, emotion 내부 경로 한두 개가 전부). 반면 login은 44개의 풍부하고 대체로 정확한 그룹(`Login.jsx`, `AuthCardWrapper.jsx`, `MainCard.jsx`, `Logo.jsx`, `AnimateButton.jsx` 등 실제 앱 소스 + `../../@mui/...`, `../../@emotion/...`, `../../framer-motion/...` 같은 라이브러리 내부 경로가 섞여 나왔다). 두 현상 모두 ADR-0012가 "완전히 해소"했다고 선언한 문제와는 다른 메커니즘으로 발생한다 — 자세한 원인 분석은 "예상 밖 발견" 참고.

**④ 연타 스트레스 — 레이스 유발 성공, 손상 없음.**

dashboard 청크에 2000ms 인위 지연을 걸어둔 채 `typography → color → shadow → dashboard → sample-page → dashboard`를 120ms 간격으로 연속 전환했다(dashboard로 두 번 다시 돌아왔을 때도 지연된 첫 dashboard 청크는 아직 resolve되지 않은 상태였다 — 의도한 레이스). 지연이 끝난 뒤 최종 toolbar 수치(1288/1716)가 스트레스를 겪지 않은 최초 dashboard 진입과 정확히 일치했고, `data-id` 중복도 없었다(284/284 유일). React.lazy의 모듈 캐시(ADR-0011에서 확인한 "재열기 시 캐시 재사용")가 여기서도 그대로 작동해, 이미 로드된 청크로의 재전환은 빠르게 안정화됐다.

**⑤ 안정성 — 전체 시나리오에서 콘솔/페이지 에러 0건.**

초기 로드, StrictMode 이중 렌더, 5개 MainRoutes 전환, 지연 Suspense 전환, Authentication 트리 왕복, 연타 스트레스까지 포함한 전체 시나리오에서 `console.error`/`pageerror`가 한 건도 없었다. (검증 스크립트 자체가 만든 `page.route()` 인터셉터가 Vite의 중복 요청에 대해 "Route is already handled" 예외를 낼 수 있었는데, 이는 스크립트의 버그이지 앱/보드의 문제가 아니라 `route.continue().catch(() => {})`로 무시 처리했다 — 실제 최종 실행에서는 이 예외도 발생하지 않았다.)

## 근거

위 ①~⑤는 모두 `scripts/verify-routing.mjs`의 콘솔 로그(수치)와 `verify-output/routing/`의 스크린샷(육안 확인, gitignore 처리)으로 재현 가능하게 뒷받침된다. 특히 `08a-login-before-fitview.png`(거의 빈 화면)와 `08b-login-after-fitview.png`(수동으로 "화면에 맞추기" 버튼을 누른 뒤 44개 그룹이 드러난 상태)를 나란히 비교하면 아래 "카메라 정체" 발견이 실측 스크린샷으로 뒷받침된다.

## 예상 밖 발견 (기록해 둘 것)

- **framer-motion/motion-dom 버전 불일치 — berry-admin 자체 lockfile이 이미 깨져 있었다.** `npm install`(및 `yarn.lock`을 그대로 따르는 yarn install도 동일)이 `framer-motion@12.23.25`(의존성 요구: `motion-dom: ^12.23.23`)와 함께 `motion-dom@12.42.2`를 설치했는데, 이 조합은 dev 서버 부팅 자체가 안 될 정도로 깨져 있었다(`esbuild` 의존성 최적화 단계에서 `No matching export in "node_modules/motion-dom/dist/es/index.mjs" for import "activeAnimations"` 에러). 실제로 `motion-dom@12.42.2`에는 `activeAnimations` export가 없었다 — semver 범위(`^12.23.23`)상 "호환"이라고 선언된 상위 패치가 실제로는 하위 호환을 깼다. `yarn.lock`에도 동일하게 `12.42.2`가 고정돼 있어 yarn으로 전환해도 같은 문제가 재현됐을 것이다(직접 확인함). `package.json`에 `"overrides": { "motion-dom": "12.23.23" }`를 추가해 해결했다. ADR-0009/0011이 겪지 않았던 종류의 블로커다 — "실제 앱은 lockfile이 있으니 의존성 문제는 없을 것"이라는 암묵적 가정이 깨졌다.
- **Login/Register 사이드바 링크가 `target="_blank"`라, 보드를 연 채로 실제 클릭을 재현하면 보드 세션이 끊긴다.** react-router-dom의 `<Link target>` prop이 `true`면 `onClick` 핸들러가 클라이언트 사이드 내비게이션을 의도적으로 건너뛰고 네이티브 브라우저 동작(새 탭 오픈)에 맡긴다. 처음에는 DOM의 `target` 속성만 지우고 클릭하면 될 거라 가정했는데, 실측 결과 여전히 `page.on('load')`가 두 번째로 발생했다 — Link 컴포넌트의 onClick 핸들러가 검사하는 건 **React prop 클로저에 남아있는 `target` 값**이지 라이브 DOM 속성이 아니기 때문이다. 이 발견 덕분에 최종 스크립트는 라우트 전환을 sidebar 링크 클릭이 아니라 `window.history.pushState` + `dispatchEvent(new PopStateEvent('popstate'))`로 직접 유발하도록 바꿨다 — 실제 브라우저 뒤로/앞으로가기가 타는 것과 동일한 라우터 코드 경로를 그대로 타면서, 풀 리로드 없이(보드 세션 유지) 완전한 클라이언트 사이드 전환을 재현할 수 있었다(로그 이벤트 발생 횟수로 직접 검증함). 이건 berry-admin의 의도된 UX(데모 목적으로 로그인 페이지를 새 탭에 열기)일 뿐 결함은 아니라고 판단해 백로그에는 넣지 않았다.
- **"카메라 정체(stale viewport)" — React Flow의 `fitView`가 mount 시점 1회성이라, 라우트 전환처럼 레이아웃 전체가 크게 움직이는 경우 화면이 사실상 텅 비어 보인다. ADR-0012 범위 밖의 새로운 문제다.** login 라우트 진입 직후(fit-view 조작 전) DOM에 실제로 렌더된 노드가 47개뿐이었는데, 같은 순간 `toolbar__count`가 보고한 데이터 레벨 노드 수는 226개였다 — 데이터는 정확했지만 화면의 79%가 카메라 밖에 있었다. 수동으로 "화면에 맞추기" 컨트롤을 누르자 즉시 270개로 늘었다(스크린샷 `08a`/`08b` 비교). 원인을 코드에서 특정했다: `Canvas.tsx`의 `<ReactFlow fitView .../>`는 React Flow 문서상 컴포넌트 마운트 시 1회만 자동 적용되고, 이후 노드 집합이 아무리 달라져도 재호출되지 않는다. 게다가 `layout.ts`의 `createLayoutEngine()`이 유지하는 `groupOrder`/`groupOrderSet`은 그룹이 한 번 등장하면 세션이 끝날 때까지 순서를 계속 보존하며(그룹이 사라져도 `internalCache`만 정리되고 order 배열/셋은 절대 pruning되지 않는다), 새 그룹은 항상 누적된 커서 위치 뒤에 이어 붙는다 — 그 결과 여러 라우트를 거칠수록 새로 나타나는 그룹의 x좌표가 점점 더 멀어지고, 카메라(마지막 fitView 위치)와의 괴리도 커진다. 이 문제는 이번 라운드에서만 관찰 가능했다 — excalidraw(ADR-0009)는 단일 페이지라 서브트리 교체가 항상 "기존 레이아웃 안에서" 일어났고(웰컴 스크린 사라짐 등), 레이아웃의 "콘텐츠가 차지하는 전체 영역" 자체가 라우트 전환처럼 한 번에 요동친 적이 없었다. **ADR-0012와의 관계: 명확히 다른 문제다.** ADR-0012 ③은 "레이아웃 재계산 비용"(연산 시간)을 다뤘지 "계산된 레이아웃을 카메라가 계속 따라가는가"는 다루지 않았다 — 완전히 다른 실패 모드이고, 라우팅처럼 레이아웃 전체 영역이 급격히 바뀌는 시나리오에서만 드러난다.
- **ADR-0012의 `isLibraryInternalHint`가 이 앱에서는 상당 부분 우회당한다 — 흡수 메커니즘이 아니라 판별 조건의 커버리지 문제다. 역시 ADR-0012 범위 밖의 새로운 문제다.** `isLibraryInternalHint`는 `groupHint`가 리터럴 `node_modules` 경로 세그먼트를 포함하는지로 판단한다(ADR-0012, excalidraw의 Radix 내부 합성 패턴 기준으로 설계됨). 그런데 login 라우트에서 나온 44개 그룹 중 다수가 `../../@mui/material/esm/styles/ThemeProvider.js`, `../../@emotion/styled/base/dist/emotion-styled-base.browser.development.esm.js`, `../../framer-motion/dist/es/motion/index.mjs`, `../../react-router/dist/development/chunk-4WY6JWTD.mjs`처럼 **명백히 라이브러리 내부 파일이지만 "node_modules" 문자열을 전혀 포함하지 않는** 상대 경로였다. 원인으로 추정되는 것: Vite의 의존성 프리번들링(`node_modules/.vite/deps/`, esbuild)이 소스맵 `sources` 배열을 프리번들 캐시 디렉터리 기준 상대경로로 재작성하면서 `node_modules` 세그먼트가 통째로 사라진다. excalidraw(ADR-0009/0012)의 Radix 그룹 노이즈는 이 경로 재작성 패턴을 우연히 피해갔던 것으로 보인다(같은 yarn 모노레포 구조지만 의존성 프리번들 캐시 경로 형태가 달랐을 가능성). **ADR-0012와의 관계: "이미 고친 문제가 재발"한 게 아니라, 흡수 로직 자체(가장 가까운 앱 소스 조상에게 흡수시키는 것)는 여전히 정상 동작하지만, 그 흡수를 트리거하는 판별 조건(`node_modules` 리터럴 매칭)의 커버리지가 좁았다는 걸 이번에 처음 발견한 것** — 근본 메커니즘이 다르므로 명확히 새로운 결함이다.
- **같은 판별 조건(넓게 보면 groupHint 해석 자체)이 라우트 규모에 따라 정반대 증상을 보였다.** 노드 수가 많은 라우트(dashboard 1716개, typography 1159개)일수록 그룹이 1~3개로 극단적으로 뭉쳤고(과잉 흡수 — 대부분의 composite가 애초에 `groupHint`를 못 받아 조상 체인을 타고 올라가다 최초 진입점 근처의 단 하나의 resolve된 조상에 몰린 것으로 보임), 노드 수가 적은 라우트(login 288개)는 오히려 44개나 되는 세밀한(그리고 위에서 설명한 대로 일부는 노이즈인) 그룹이 나왔다. 정확한 원인(비동기 `getSource` 해석이 fiber 수가 많을 때 왜 더 많이 실패/누락하는지)까지는 이번 라운드에서 규명하지 않았다 — bippy의 소스맵 fetch·owner-stack 재실행 메커니즘이 동시성이 높을 때 어떻게 동작하는지에 대한 별도 조사가 필요해 보인다. 이번 라운드의 스코프(라우팅/코드 스플리팅 검증)를 벗어나므로 사실 관찰만 기록하고 원인 규명은 백로그로 남긴다.

## 결과

**최종 판단: 조건부 진행(GO) — 이번 라운드가 목표한 "라우팅 기반 대형 서브트리 마운트/언마운트 + 라우트 단위 코드 스플리팅"의 핵심(①②④⑤)은 실제 앱에서 완전히 깨끗하게 통과했다. 다만 ③에서 드러난 두 가지 시각화 레이어 결함(카메라 정체, groupHint 판별 커버리지 부족)을 다음 라운드의 1순위 백로그로 못박는다.**

- **핵심 가설은 검증됐다.** 라우팅이 유발하는 대형 서브트리 교체(같은 레이아웃 안의 라우트 전환은 물론, MainLayout↔MinimalLayout처럼 레이아웃 트리 자체가 바뀌는 "분리된" 전환까지)에서 데이터 레벨의 정합성(정확한 마운트/언마운트, id 유일성, 라우트 왕복 후 수치 완전 일치)이 흔들리지 않았다. React.lazy + 라우트 단위 코드 스플리팅(진짜 네트워크 청크, 진짜 dev 서버 모듈 그래프)도 ADR-0011이 합성 fixture로 확인한 결론(Suspense fallback 정상 포착, resolve 후 정확한 그룹핑, 모듈 캐시 재사용 시 정상 동작)을 실제 앱 규모에서 재확인했다. 연타로 레이스를 의도적으로 유발해도 크래시·고아 노드·중복 id·콘솔 에러가 전혀 없었다 — 훅킹/데이터 레이어(1·2레이어)는 이번 스트레스 시나리오에서 흔들리지 않았다.
- **다만 시각화 레이어(3레이어)는 "라우팅 규모의 급격한 변화"라는 이번에 처음 노출된 축에서 두 가지 구체적 결함을 드러냈다** — ① `fitView`가 마운트 1회성이라 큰 레이아웃 재배치를 카메라가 못 따라가는 문제(사용자 입장에서는 "보드가 갑자기 텅 빈 것처럼 보임"), ② `isLibraryInternalHint`의 `node_modules` 리터럴 매칭이 Vite 프리번들 소스맵 경로를 못 잡아 라이브러리 노이즈 그룹이 다시 새어나오는 문제. 둘 다 ADR-0012가 이미 고친 문제의 재발이 아니라, ADR-0012의 수정 범위가 애초에 다루지 않았던(혹은 excalidraw에서는 우연히 드러나지 않았던) 새로운 표면이다 — 데이터 스키마나 훅킹 방식을 재검토해야 하는 근본 결함이 아니라, 시각화 레이어의 두 가지 로컬한 개선으로 해결 가능한 문제로 판단한다.
- `experiments/real-app-validation/berry-admin/`은 로컬 재현용으로 남기되(gitignore 처리, 레포 히스토리에는 없음), `scripts/verify-routing.mjs`는 재현 가능한 검증 스크립트로 레포에 남긴다.

### 백로그 (다음 라운드 우선순위)

1. **카메라 정체(1순위).** 그룹 집합이 이전 커밋과 크게 달라졌을 때(예: 라우트 전환으로 서브트리 전체가 교체될 때) React Flow의 `fitView`를 다시 트리거하거나, 최소한 "새 콘텐츠가 현재 화면 밖에 있음" 안내(및 원클릭 재정렬 버튼 강조)를 제공해야 한다. 매 커밋마다 자동 refit하면 사용자가 수동으로 조정한 팬/줌을 계속 덮어써 버리는 트레이드오프가 있으므로("그룹 집합이 얼마나 달라져야 refit할지"의 임계값 설계가 필요), 무조건 자동화보다는 휴리스틱이 필요하다.
2. **`layout.ts`의 `groupOrder`/`groupOrderSet` 무한 누적.** 사라진 그룹의 내부 레이아웃 캐시(`internalCache`)는 정리되지만 순서 정보는 세션 내내 보존돼, 여러 라우트를 오래 돌아다닐수록 새 그룹이 점점 더 멀리 배치된다 — 위 카메라 정체 문제를 악화시키는 원인 중 하나다. 사라진 지 오래된 그룹의 순서를 정리하거나, "현재 존재하는 그룹만" 기준으로 재배치하는 옵션이 필요하다.
3. **`isLibraryInternalHint`의 `node_modules` 리터럴 매칭 커버리지 부족.** Vite류 빌드 도구의 의존성 프리번들 캐시가 만드는, "node_modules" 문자열이 없는 라이브러리 내부 소스맵 경로(`../../@scope/pkg/...` 형태)까지 잡아내는 더 견고한 판별 로직이 필요하다(예: 알려진 패키지 스코프/이름 패턴 매칭, 혹은 프로젝트 소스 루트 밖의 모든 경로를 라이브러리로 간주하는 화이트리스트 반전 방식).
4. **(원인 미규명, 조사 필요) 대형 라우트에서 `groupHint` 해석 자체가 급격히 나빠지는 현상.** dashboard(1716 fiber)는 typography(1159)보다도, login(288)보다는 훨씬 더 심하게 그룹이 뭉쳤다 — fiber 수/동시성과 `getSource`(sourcemap fetch + owner-stack 재실행) 해석 성공률의 상관관계를 별도로 조사할 가치가 있다.
5. **(참고, blocker 아님) 실제 오픈소스 템플릿의 lockfile도 깨져 있을 수 있다.** `framer-motion`/`motion-dom` 사례처럼, "lockfile이 있으니 의존성은 안전하다"는 가정이 항상 맞지는 않는다 — 다음 실제 앱 검증 라운드에서도 dev 서버가 안 뜨면 애플리케이션 로직이 아니라 의존성 버전 조합부터 의심해야 한다는 걸 기록해 둔다.
