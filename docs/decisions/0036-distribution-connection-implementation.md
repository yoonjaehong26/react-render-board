# ADR-0036: 배포/설치 "연결 방식" 구현 — CLI init + 번들러 주입

- 상태: 채택됨(구현)
- 날짜: 2026-07-18

## 맥락 (Context)

[ADR-0020](0020-distribution-entry-ux-direction.md)이 배포/진입 UX의 **방향**("npm CLI 자동 초기화 + 같은 페이지 플로팅 버튼")을 정하고, [ADR-0021](0021-bundler-injection-feasibility.md)이 그 **기술 가능성**(Vite/webpack/Rspack/Turbopack 4개 번들러 전부 앱 소스 무수정 자동 주입 가능 — 조건부 GO)을 스파이크로 검증했다. 두 ADR 모두 "구현 자체는 0%, 방향만 정해졌다"고 명시했다. 이 ADR은 그 **연결 방식 축을 실제 프로덕션 코드로 옮긴 구현 기록**이다.

노출 위치 축(플로팅 버튼 + 도킹 패널)은 이미 [ADR-0025](0025-docked-panel-shell-amendment.md)/[0026](0026-bidirectional-interaction-implementation.md)에서 구현됐다(`BoardOverlay.tsx`). 즉 "보드를 어디에 그리는가"는 있었고, 남은 건 "대상 앱에 앱 소스 수정 없이 그 보드를 어떻게 자동으로 얹는가"였다.

스코프는 ADR-0020/0021이 정한 대로다: **Vite를 1순위로 탄탄하게, 나머지는 조건부.** 과한 투자를 피한다(CLAUDE.md 원칙).

## 결정 (Decision)

세 조각을 추가했다. 어느 것도 `src/data`·`src/hooking`·`src/visualization`(동시 세션이 편집 중인 엔진/시각화 레이어)을 수정하지 않는다 — 전부 신규 파일이다.

### 1. 자기부팅 브라우저 런타임 — `src/inject.tsx` (`react-render-board/inject`)

`src/main.tsx`가 데모 앱에 대해 수동으로 하는 배선(store 생성 → 훅 설치 → `BoardOverlay` 마운트)을, "대상 앱을 미리 모르는" 주입 상황에 맞게 일반화했다. 핵심 차이 하나: `startFiberInspector`(fiberInspector.ts)는 `subjectContainer`를 미리 알아서 "그 컨테이너 커밋만 포함(include-only)"으로 거는데, 주입 모드는 대상 앱 root가 어디 마운트될지 모른다 — 그래서 필터를 뒤집어, **보드 전용 호스트(`#rrb-overlay-root`)를 먼저 만들고 "그 안이 아닌 모든 root"만 관찰(exclude-the-board)**한다. 부수효과 진입점이라 import 즉시 `bootRenderBoard()`가 실행된다.

### 2. Vite 플러그인 — `cli/vite.mjs` (`react-render-board/vite`, 1순위)

ADR-0021이 채택한 `transformIndexHtml`(`order:'pre'`, `injectTo:'head-prepend'`)로, dev 서버가 서빙하는 HTML `<head>`에 `<script type="module">import 'react-render-board/inject'</script>`를 주입한다. 스파이크의 "자기 완결형 스텁"과 달리, 인라인 module의 bare/루트-상대 import를 Vite dev가 그 자리에서 해석하므로 실제 라이브러리 진입점을 로드한다. `entry` 옵션으로 로컬 개발/검증 시 소스 경로로 바꿔 끼울 수 있다.

### 3. CLI `init` — `cli/bin.mjs` (`npx react-render-board init`)

번들러를 감지해:
- **Vite** → `vite.config` 자동 패치(import 추가 + `plugins` 배열에 `rrbInjectPlugin()` 삽입). 멱등(재실행 시 "변경 없음").
- **webpack/Rspack** → config 헬퍼 `withRenderBoard(config)`([cli/webpack.cjs](../../cli/webpack.cjs), `react-render-board/webpack`)로 감싸면 **실제 캔버스까지 뜬다(실측 완료)**. Turbopack에서 얻은 교훈대로 2단 구조다: (1) 런타임을 dev 빌드의 **추가 entry**로 얹고, (2) `html-webpack-plugin`의 `beforeEmit` 훅으로 `<head>`에 조기 스크립트(훅+버퍼링+`__RRB_DEV__`, [cli/early-hook-script.cjs](../../cli/early-hook-script.cjs) — Next와 공유)를 넣는다. entry만으론 번들이 defer로 늦게 실행돼 초기 커밋을 놓치거나 훅 타이밍을 못 잡으므로 조기 스크립트가 필수다. 문자열·배열·객체·함수형 entry를 모두 보존하고 멱등하며, `mode==='production'`이면 no-op(dev 전용).
- **Next.js/Turbopack** → **루트 `layout.tsx` 자동 패치**([cli/next.mjs](../../cli/next.mjs)의 `patchNextLayout`) + (선택) 번들된 클라이언트 컴포넌트로 **실제 캔버스까지 렌더**. Turbopack엔 플러그인 API가 없고(ADR-0021), 클라이언트 `useEffect` import는 Next Fast-Refresh 훅 선점에 타이밍이 밀린다 — ADR-0021이 실측한 **유일한 승리 경로는 루트 layout `<head>`의 동기 `<script>`**다. 그 스크립트를 layout에 자동 삽입한다(`<head>` 없으면 `<head>`째, 멱등). 이 조기 스크립트는 (a) React보다 먼저 devtools 훅을 심어 초기 커밋을 잡고 rendererID별 최신 root를 **버퍼링**하며 (b) `window.__RRB_DEV__` dev 신호를 세우고 (c) 폴백 플로팅 버튼을 띄운다. 그런 다음 `init`이 함께 생성·배선한 클라이언트 컴포넌트(`RenderBoardClient.tsx`)가 하이드레이션 후 보드 런타임(`react-render-board/inject`)과 스타일을 dev에서만 동적 import 하면, 런타임이 버퍼된 초기 커밋을 재생(drain)하고 BoardOverlay를 마운트한다 — Next의 실제 컴포넌트 트리가 캔버스에 그려진다(실측: 노드 20개). page/컴포넌트 소스는 무수정. **즉 Vite와 동일하게 `init` 한 번으로 캔버스까지 자동 배선된다.**

### dev 전용 가드 (요구사항 3 — React-Sight가 죽은 지점)

프로덕션 주입 금지를 **다중**으로 건다: (a) Vite 플러그인 `apply:'serve'`(프로덕션 빌드엔 주입 자체가 안 들어감), (b) webpack 헬퍼는 `mode==='production'`이면 no-op, (c) Next는 삽입 `<script>`·클라이언트 컴포넌트를 `process.env.NODE_ENV !== 'production'` JSX로 감싸 프로덕션 빌드에서 정적 제외, (d) 런타임 `src/inject.tsx`는 `isDevEnvironment()`가 false면 즉시 return.

**dev 신호는 주입 레이어가 소유한다(`window.__RRB_DEV__`).** 처음엔 런타임이 `import.meta.env.DEV`로 스스로 판별했으나, 이는 Vite 전용이라 (i) 미리 빌드된 lib에선 `false`로 굳고 (ii) Next 브라우저엔 `import.meta.env`도 `globalThis.process`도 없어 **런타임이 dev를 못 알아내 보드가 안 뜨는** 실측 결함이 있었다. 해결: 주입 레이어는 어차피 dev에서만 실행되므로(위 a/c), 그 레이어가 `window.__RRB_DEV__ = true`를 세우고 런타임은 그걸 신뢰한다 — 플래그가 서 있다는 것 자체가 dev 신호다. `import.meta.env.DEV`/`process`는 폴백으로만 본다. `verify-init.mjs`(Vite)·`verify-init-next.mjs`(Turbopack)가 (a)/(c)를 실측한다(프로덕션에 주입 없음).

## 근거 (Rationale)

- **레이어 분리(ADR-0020의 핵심)를 코드로 지켰다.** 브라우저 런타임(`src/inject.tsx`, 라이브러리)과 빌드타임 도구(`cli/`, Node)를 분리했다 — CLI/플러그인은 각 번들러 어댑터, 런타임은 번들러 무관.
- **엔진/시각화 파일을 건드리지 않았다.** 동시 세션(ADR-0032 afterglow, ADR-0034 waterfall, ADR-0035 도형/손그림)이 `src/visualization`을 활발히 편집 중이라, 주입 전용 필터(exclude-the-board)를 공유 `fiberInspector.ts`에 넣는 대신 `inject.tsx`에 인라인해 충돌면을 0으로 유지했다.
- **Vite 1순위 원칙.** Vite만 완전 자동(config 패치), 나머지는 안내로 조건부 지원 — "MVP는 Vite 경로만 탄탄하면 충분".

## 예상 밖 발견 — Turbopack 캔버스와 "번들된 산출물의 재번들 불가"

실제 React Flow 캔버스를 Turbopack에 띄우려 빌드된 `dist-lib/inject.js`를 Next 클라이언트 컴포넌트로 동적 import 하자 **`dynamic usage of require is not supported`(Turbopack requireStub)**로 죽었다. 원인: **rolldown(Vite 8의 번들러)이 CJS 의존을 번들할 때 `typeof require !== 'u' ? require : new Proxy(...)` 형태의 CJS interop 셰임을 심는데, 그 산출물을 Turbopack이 다시 번들하면 이 셰임의 `require[t]` 접근에서 던진다.** 즉 "한 번들러의 출력을 다른 번들러가 재번들"하는 게 근본 문제였다. 처음엔 `scheduler`만 external로 뺐지만 `bippy`가 같은 셰임을 또 만들어 여전히 실패했다.

**해결(정석 패키징): 선언된 의존(`bippy`·`@xyflow/react`·`roughjs`)과 `scheduler`·`react-dom/client`를 전부 external로 뺐다**([vite.lib.config.ts](../../vite.lib.config.ts)). 라이브러리는 자기 deps를 번들하지 않고 소비자 번들러가 해석하게 맡기는 게 정석이며, 이렇게 하니 셰임이 0이 되고 Turbopack이 산출물을 문제없이 번들했다. 소비자는 `npm install react-render-board`로 이 deps를 함께 받는다(실험에선 스파이크에 직접 설치해 재현). **교훈: "모든 걸 번들한 drop-in 아티팩트"는 같은 번들러(Vite↔Vite)엔 편하지만 크로스-번들러 소비를 막는다 — deps external이 배포 라이브러리의 올바른 기본값이다.**

또한 Next는 클라이언트 컴포넌트가 하이드레이션 후에야 런타임을 로드하므로 **초기 마운트 커밋을 놓친다.** 그래서 조기 `<head>` 스크립트가 rendererID별 최신 root를 버퍼링해 두고, 런타임 부팅 시 `drainBufferedRoots()`가 이를 재생해 초기 트리를 복원한다.

**webpack 실측에서 걸린 두 함정**(같은 조기 스크립트를 `html-webpack-plugin`으로 이식하며): (1) 플러그인이 `require('html-webpack-plugin')`을 직접 부르면 **라이브러리 위치(Vite 레포, html-webpack-plugin 없음)에서 해석돼** 조용히 건너뛴다 — 소비자가 이미 등록한 `HtmlWebpackPlugin` 인스턴스의 `.constructor`를 `compiler.options.plugins`에서 찾아 쓰는 것으로 고쳤다(버전·인스턴스 일치 보장). (2) 조기 스크립트의 폴백 버튼이 `DOMContentLoaded`에서 뜨는데, 런타임이 그 전에 스텁을 지워도 늦게 온 `DOMContentLoaded`가 **스텁을 되살려** 버튼이 둘이 됐다 — `mountBtn`이 `window.__RRB_BOOTED__`면 바로 빠지도록 가드해 해결.

## 결과 (Consequences)

- **검증(Vite)**: `scripts/verify-init.mjs`(`npm run verify:init`)가 정식 플러그인이 정식 런타임을 실제 스캐폴드(`scripts/init-fixture/`, 앱 소스가 보드를 전혀 참조하지 않음)에 주입하는 걸 Playwright로 확인한다 — (1) 앱 무수정인데 플로팅 버튼 렌더, (2) 주입된 훅이 실제 Fiber 커밋 관찰(보드에 노드 3개), (3) 콘솔 에러 0, (4) 프로덕션 빌드엔 주입 없음.
- **검증(Turbopack)**: `scripts/verify-init-next.mjs`(`npm run verify:init-next`)가 실제 Next 16 + Turbopack 스캐폴드(`experiments/bundler-injection-spike/turbopack-nextjs`)에서 `patchNextLayout`을 돌려 `next dev`로 실측한다 — (1) `layout.tsx`만 패치(page 무수정), (2) 조기 훅이 **초기 커밋 관찰(실측 onCommitFiberRoot 12회 — ADR-0021의 Next Fast-Refresh 선점을 `<head>` 동기 스크립트가 이김을 재확인)**, (3) 플로팅 버튼 렌더, (4) dev 전용 가드 구조 확인, (5) 콘솔 에러 0. 스파이크 원본 layout은 finally에서 복원.
- **검증(Turbopack 캔버스, 원커맨드 end-to-end)**: `scripts/verify-init-next-canvas.mjs`(`npm run verify:init-next-canvas`)가 **실제 소비자 플로우 그대로** 실측한다 — `npm pack`으로 패키징 → 스파이크에 `npm install`(deps bippy·@xyflow/react·roughjs 동반) → **실제 `react-render-board init` 실행**(layout 자동 패치 + `RenderBoardClient.tsx` 생성) → `next dev`. 결과: **실제 보드 런타임 부팅 + React Flow 캔버스에 Next 앱 트리 노드 20개 + page.tsx 무수정 + 치명적 콘솔 에러 0.** 스파이크의 layout/package.json/lock/추가 파일은 finally에서 전부 복원.
- **게이트**: `lint`·`build:lib`·`verify:init`·`verify:init-next`·`verify:init-next-canvas` 그린. (`npm run test`/`tsc -b`는 동시 세션의 진행 중 hover 기능 편집으로 `domInteraction.test.ts`가 일시 red — 이 ADR 변경과 무관.)
- **패키지 표면 확장**: `package.json`에 `bin`(react-render-board), `exports`의 `./inject`·`./vite`·`./webpack` 추가, `files`에 `cli` 추가. `vite.lib.config.ts`는 `inject`를 두 번째 lib 엔트리로 추가(CSS 파일명 계약은 `cssFileName:'index'`로 고정)하고, deps를 external로 뺐다(위 "예상 밖 발견").
- **검증(webpack 캔버스, 원커맨드)**: `scripts/verify-init-webpack.mjs`(`npm run verify:init-webpack`)가 pack→install→**깨끗한 config에 실제 `init` 실행(자동 래핑)**→`webpack serve`로 실측 — **`init`이 config를 `withRenderBoard`로 자동 래핑 + 실제 보드 런타임 부팅 + 조기 훅 초기 커밋 관찰 + React Flow 캔버스에 앱 트리 노드 렌더 + `src/index.tsx` 무수정 + 치명적 콘솔 에러 0.** (스파이크엔 css-loader가 없어 보드는 스타일 없이 뜨지만 `.react-flow__node` DOM은 정상 — 캔버스 동작 확인엔 충분.)
- **원커맨드 UX(세 경로 전부)**: **Vite·Next·webpack 모두 `npm install react-render-board` → `npx react-render-board init` → `npm run dev`로 캔버스까지 뜬다.** Vite는 config `plugins` 배열, Next는 layout+클라이언트 컴포넌트, webpack은 config를 `withRenderBoard`로 자동 래핑(`patchWebpackConfig`)한다. webpack 자동 패치는 브레이스 매칭 없이 파일 끝에 `module.exports = withRenderBoard(module.exports)`를 덧붙이는 방식이라 객체 리터럴·변수·함수 호출 결과 등 흔한 CJS 형태를 안전하게 감싼다. 함수형/배열형/ESM config만 안전 자동화가 어려워 안내로 폴백한다. 세 경로 모두 캔버스까지 Playwright로 실측됨.
- **한계 / 남은 것**: 실제 npm publish는 여전히 스코프 밖(ADR-0023). webpack 자동 패치는 함수형/배열형/ESM config는 수동 한 줄 안내로 폴백한다. Rspack은 스파이크로 재실측하진 않았다(webpack과 동일 헬퍼·html-webpack-plugin 경로라 같게 동작 예상 — 단 내장 HtmlRspackPlugin이면 조기 스크립트 훅이 안 걸릴 수 있어 html-webpack-plugin 사용 권장, ADR-0021). Next `<head>` 조기 스크립트의 dev 전용 보장은 `process.env.NODE_ENV` 정적 제거에 의존한다.
- **되돌리기 쉬움**: 전부 신규 파일 + `package.json`/`vite.lib.config.ts`의 가산적 변경이라, 엔진/시각화 레이어에 영향이 없다.

## 관련
- 방향: [ADR-0020](0020-distribution-entry-ux-direction.md) · 기술 검증: [ADR-0021](0021-bundler-injection-feasibility.md)
- 노출 위치(이미 구현): [ADR-0025](0025-docked-panel-shell-amendment.md)/[ADR-0026](0026-bidirectional-interaction-implementation.md)
- 스파이크: `experiments/bundler-injection-spike/{vite,webpack,rspack,turbopack-nextjs}/`
