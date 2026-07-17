# ADR-0021: 번들러 무관 자동 계측 스크립트 주입 기술 가능성 검증

- 상태: 채택됨
- 날짜: 2026-07-17

## 맥락

[ADR-0020](0020-distribution-entry-ux-direction.md)이 배포/설치 UX 방향("npm 자동 설정 CLI + 같은 페이지 플로팅 버튼")을 정하면서, "Vite/webpack/Rspack/Turbopack 각각에서 앱 소스 코드를 전혀 안 건드리고 자동 스크립트 주입이 실제로 되는지는 아직 스파이크로 검증되지 않았다"는 미결 의존성을 남기고 그 결과를 이 ADR(0021)로 기록하도록 지정해 뒀다. 이 ADR이 그 검증이다.

검증할 가설은 ADR-0020이 세운 것과 같다: "개발자가 `npx react-render-board init` 한 번만 실행하면 이후 `npm run dev`만으로 자동으로 계측 스크립트가 주입된다"는 흐름이 4개 번들러 전부에서 실제로 가능한가. React 자체는 Fiber를 쓰는 한 번들러와 무관하게 동작하지만, "자동 주입" 부분은 각 번들러의 dev 서버 플러그인 시스템에 올라타야 해서 번들러마다 별도 검증이 필요했다.

가설: 모든 번들러 dev 서버는 HMR을 위해 이미 "서빙되는 HTML/페이지에 스크립트를 주입하는" 능력을 갖고 있으므로, 그 능력에 올라타면 앱의 실제 소스 코드(컴포넌트 파일)는 전혀 안 건드리고 config 파일 하나(또는 CLI 명령)만으로 스크립트 주입이 가능할 것이다.

Vite/webpack/Rspack/Turbopack(Next.js) 4개 번들러 각각에 최소 스파이크 프로젝트를 만들어 실제로 검증했다(`experiments/bundler-injection-spike/{vite,webpack,rspack,turbopack-nextjs}/`, 각 디렉터리의 `FINDINGS.md` 참고). 모든 스파이크에서 동일한 계측 스크립트(`window.__RRB_INJECTED__` 설정, 우하단 플로팅 버튼 DOM 직접 생성, `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 스텁 설치 + `onCommitFiberRoot` 로깅)를 사용했고, Playwright로 실제 브라우저에서 (a) git diff로 앱 소스 무수정 여부, (b) 플로팅 버튼 실제 렌더 여부(스크린샷), (c) 콘솔에 실제 Fiber 커밋 감지 로그가 찍히는지를 확인했다.

이 스파이크는 `project-status.md` 7-2절 및 `roadmap.md`(「생존 전략을 처음부터 정한다」)가 명시한 "배포/설치 UX는 완성 후 재논의"라는 방침을 바꾸지 않는다 — 실제 `init` 도구 착수 여부를 지금 결정하는 게 아니라, ADR-0020이 남긴 미결 의존성 하나만 좁게 확인한 것이다.

## 검토한 대안

번들러마다 "서빙 HTML에 개입하는" 방법 자체가 여러 층위로 갈라졌다.

- **Vite** — `transformIndexHtml` 훅(채택) vs. `configureServer` 미들웨어로 raw HTML 응답을 직접 가로채기(더 저수준이라 불필요, 기각). `transformIndexHtml`이 정확히 이 유스케이스를 위한 1급 공개 API라 대안을 고려할 이유가 없었다.
- **webpack** — `HtmlWebpackPlugin.getHooks(compilation).beforeEmit`(채택) vs. webpack 코어의 `compilation.hooks.processAssets`로 HTML 자산을 직접 조작(가능하지만 `html-webpack-plugin`이 이미 표준적으로 이 문제를 풀어놓은 관례를 무시하는 것이라 기각).
- **Rspack** — 스캐폴드 기본값인 내장 `rspack.HtmlRspackPlugin` 유지(기각 — webpack용으로 작성된 `rrb-inject-plugin.js`가 `require('html-webpack-plugin')`을 호출하는데 이 패키지가 아예 없어서 실패) vs. `html-webpack-plugin`을 명시적으로 설치해 `HtmlRspackPlugin`을 교체(채택).
- **Turbopack(Next.js)** — Turbopack 자체 플러그인 API(공식 문서로 부재 확인, 기각) → `instrumentation-client.ts`(1차 시도, Next.js 자체 Fast Refresh 런타임과의 타이밍 경쟁에서 패배해 기각) → 루트 `layout.tsx`의 `<head>` 동기 `<script>` 삽입(채택).

## 결정

**4개 번들러 모두에서, 앱의 실제 컴포넌트/페이지 소스 코드를 단 한 줄도 건드리지 않고 config 파일 하나(+ 플러그인 파일 또는 지정된 진입점 파일 하나)만으로 계측 스크립트 자동 주입이 기술적으로 가능함을 확인했다.** 다만 "번들러 무관"이라는 말 뒤에 숨은 실제 구현 난이도와 우회 정도는 번들러마다 상당히 다르다.

| 번들러 | 주입 성공 여부 | 앱 소스 무수정 | Fiber hook 접근 성공 | 체감 난이도 / 소요 시간 | 특이사항 |
|---|---|---|---|---|---|
| **Vite** | ✅ 성공 (1급 API, 워크어라운드 0) | ✅ 완전 달성 (`vite.config.ts` 1줄 추가) | ✅ 성공 (`onCommitFiberRoot` 마운트+클릭 총 3회 이상 관찰) | 낮음, ~20–30분 | `transformIndexHtml`이 정확히 이 유스케이스용으로 설계된 공식 API |
| **webpack** | ✅ 성공 | ✅ 완전 달성 (`webpack.config.js` 2줄 + 플러그인 파일) | ✅ 성공 (커밋 3회: 마운트 1 + 클릭 2) | 낮음~중간, ~30–40분 | webpack 코어엔 HTML 훅이 없어 `html-webpack-plugin`의 `beforeEmit` 경유 필요(생태계 사실상 표준이라 실무상 무리 없음) |
| **Rspack** | 🟡 부분 성공 (플러그인 코드는 무수정, but 설정 2곳을 바꿔야 함) | ✅ 완전 달성 (`src/`·`index.html` 무수정) | ✅ 성공 | 낮음~중간, 대략 webpack과 비슷 | ①스캐폴드 기본값 `"type": "module"`이 CJS 플러그인과 충돌(Rspack과 무관한 Node.js 이슈) ②기본 `HtmlRspackPlugin`→`html-webpack-plugin` 교체 필요. 단, `require('html-webpack-plugin')` 자체가 없어서 난 에러였지 `compiler.hooks.compilation.tap`이 거부된 적은 없었다 — Tapable 훅 레벨 호환성은 실제로 확인됨 |
| **Turbopack (Next.js 16)** | 🟡 Turbopack 자체는 불가능(공식 문서로 확인) / Next.js 프레임워크 레벨 우회로 성공 | ✅ 달성 (`page.tsx` 등 무수정, `layout.tsx` 1곳만) | ✅ 성공 (단, `instrumentation-client.ts` 1차 시도는 실패) | 중간, ~65분 | **Turbopack을 완전히 우회했다.** 가장 유망해 보였던 공식 API(`instrumentation-client.ts`)가 실패하고, 오히려 더 오래된 방식(`layout.tsx` `<head>` 동기 스크립트)이 성공한 역설적 결과 |

## 근거

각 스파이크는 `verify.mjs`(Playwright, headless Chromium)로 실제 dev 서버를 띄워 다음을 확인했다:

- **앱 소스 무수정**: 스캐폴드 직후 `git init`으로 베이스라인 커밋을 만들고, 계측 코드 추가 후 `git diff`/`git status`를 `GIT_DIFF_PROOF.txt`에 저장 — 4개 스파이크 전부에서 컴포넌트/페이지 소스 파일(`src/App.tsx`, `src/main.tsx`, `app/page.tsx` 등)에는 어떤 diff도 없음을 확인했다. 변경은 예외 없이 config 파일(`vite.config.ts`/`webpack.config.js`/`rspack.config.ts`) 또는 지정된 진입점 파일(`layout.tsx`) + 신규 플러그인 파일에만 있었다.
- **플로팅 버튼 실제 렌더**: `#rrb-floating-button`이 4개 스파이크 전부에서 화면 우하단에 시각적으로 렌더됨을 스크린샷(`verify-output/floating-button.png`)으로 확인했다.
- **Fiber hook 실제 접근**: 단순히 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 객체가 존재하는지가 아니라, React가 실제로 그 훅의 `inject()`를 호출하고(`renderer injected, id=`) 커밋마다 `onCommitFiberRoot`를 호출하는지(`onCommitFiberRoot fired!`)까지 콘솔 로그로 확인했다 — webpack/Rspack 스파이크는 카운터 버튼을 클릭해 state 업데이트 커밋까지 유발한 뒤 훅이 반복 발화하는 것도 확인했다.

## 예상 밖 발견 (기록해 둘 것)

- **Rspack의 "webpack 플러그인 호환" 주장은 훅 시스템 레벨에서는 사실이었지만, 실무에서 걸리는 벽은 다른 층위였다.** `rrb-inject-plugin.js`는 webpack/Rspack 양쪽에서 단 한 바이트도 안 바꿨는데도 Rspack에서 두 번 깨졌다 — 하나는 Rspack과 무관한 Node ESM/CJS 충돌(`create-rspack` 기본 템플릿이 `"type": "module"`을 넣음), 다른 하나는 스캐폴드가 `html-webpack-plugin`이 아니라 자체 내장 `HtmlRspackPlugin`을 쓴다는 설정 차이였다. 두 번째 에러가 "모듈을 못 찾음"이었지 "그런 훅 없음"이 아니었다는 게 핵심 증거 — `compiler.hooks.compilation.tap`은 문제없이 등록·발화됐다. 즉 **"플러그인 API 호환"과 "기본 프로젝트 설정 호환"은 서로 다른 질문**이라는 게 실측으로 드러났다. (덧붙여 `html-webpack-plugin`이 이미 `@rspack/core`를 optional peer로 얹어두고 있어 생태계가 서로를 인지하고 있다는 신호도 확인했다 — 다만 메이저 버전 롤아웃 속도차 때문에 `npm install`에 `--legacy-peer-deps`가 필요했다.)
- **Turbopack/Next.js에서 가장 "정석"으로 보이는 공식 API가 오히려 실패했다.** `instrumentation-client.ts`는 Next.js 공식 문서가 "hydration 전에 실행된다"고 명시한 전용 파일 컨벤션인데도, 실제로는 Next.js 자신의 Fast Refresh(HMR) 클라이언트 런타임이 자기 부트스트랩 과정에서 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 전역 슬롯을 먼저 선점해버린다(`node_modules/next/dist/compiled/react-refresh/.../react-refresh-runtime.development.js`의 `injectIntoGlobalHook()`을 직접 읽어 확인 — 단 2.5ms 차이로 늦었다). 그 결과 React의 실제 `inject()`/`onCommitFiberRoot` 호출은 Next.js가 먼저 심어둔 훅으로 가버리고 우리 스텁은 아무 것도 관찰하지 못했다. 오히려 가장 오래된 방식(루트 `layout.tsx` `<head>`에 동기 `<script>`를 직접 삽입)이 문서 파싱 순서상 더 일찍 실행돼 타이밍 경쟁에서 이겼다. **"프레임워크가 제공하는 전용 API"가 항상 가장 이른 실행 지점을 보장하지는 않는다**는 걸 실증한 사례다.
- **Vite의 `injectTo: 'head-prepend'`도 문자 그대로 "가장 앞"을 보장하지 않았다** — Vite 자체 client/react-refresh preamble이 더 앞에 삽입됐다. 다만 그 두 스크립트가 `type="module"`이라 defer 실행되는 반면 우리 스크립트는 classic(non-module)이라 동기 실행되므로, 실제 목표(React 앱 코드보다 먼저 실행)에는 영향이 없었다. 4개 스파이크를 통틀어 "정확히 몇 번째 태그로 삽입되는가"보다 **"module이냐 classic 스크립트냐"가 실행 순서를 좌우하는 진짜 변수**라는 공통 인사이트를 얻었다.

## 결과

- ADR-0020이 남긴 미결 의존성이 해소됐다: "`npx react-render-board init` 이후 `npm run dev`만으로 자동 계측"이라는 설치 UX 가설은 4개 번들러 전부에서 기술적으로 성립한다 — **조건부 GO**. 단, 실제 `init` 도구를 만든다면 번들러별 어댑터 계층(번들러 감지 → 각기 다른 plugin 등록 또는 진입점 파일 패치 로직)이 필요하다는 게 이번 스파이크로 구체화됐다. 특히 Turbopack/Next.js는 "플러그인 주입"이 아니라 "파일 패치"(`layout.tsx`류 진입점에 스크립트 태그 삽입)에 가까운, 질적으로 다른 조작이 필요하다.
- 이 결론은 `project-status.md` 7-2절 및 `roadmap.md`(「생존 전략을 처음부터 정한다」)가 명시한 "배포/설치 UX는 완성 후 재논의" 방침을 바꾸지 않는다. 이번 스파이크는 순수 기술 가능성 확인이고, 실제 `init` 도구 착수 여부는 별도로 결정해야 한다.
- `experiments/bundler-injection-spike/`의 스파이크 코드는 exp1/exp2와 같은 성격(재사용 목적이 아닌 스파이크)으로 레포에 남긴다 — 각 하위 디렉터리의 `FINDINGS.md`/`GIT_DIFF_PROOF.txt`/`verify.mjs`가 회귀 재현 및 향후 `init` 도구의 번들러별 어댑터 출발점으로 쓰일 수 있다.
- 되돌리기 쉬움: 이 ADR은 순수 조사 결과이며 프로덕션 코드(`src/`)에 아무 영향이 없다.
