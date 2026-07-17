# webpack 번들러 주입 스파이크 — 결론

## 검증 대상
`webpack-dev-server`가 서빙하는 HTML에 webpack 플러그인만으로(앱 컴포넌트 소스는 한 줄도
건드리지 않고) 계측용 `<script>`를 자동 주입할 수 있는가.

## 결론 (Verdict): 주입 성공

- webpack 플러그인(`RrbInjectPlugin`)이 `html-webpack-plugin`의 `beforeEmit` 훅을 통해
  `<head>` 태그 직후에 계측 스크립트를 정상적으로 주입했다.
- `webpack.config.js`의 `plugins` 배열에 `new RrbInjectPlugin()` 한 줄만 추가하면 되었고,
  플러그인 자체는 순수 CommonJS 파일(`rrb-inject-plugin.js`)로 webpack 코어 API
  (`compiler.hooks.compilation`)와 `html-webpack-plugin`이 공개하는 `getHooks(...).beforeEmit`
  훅만 사용한다.

## 앱 소스 무수정 달성 여부: 달성

`GIT_DIFF_PROOF.txt`에 저장한 `git status` / `git diff` 결과, 베이스라인 커밋 이후
변경된 파일은 정확히 다음 2개뿐이다.

- `webpack.config.js` (수정 — import 한 줄 + plugins 배열 한 줄 추가)
- `rrb-inject-plugin.js` (신규 파일)

`src/App.tsx`, `src/index.tsx`, `public/index.html` 등 앱 소스/템플릿 쪽에는 어떤 diff도
없음을 확인했다. (`git diff`에 `src/` 관련 항목이 전혀 나타나지 않았고, `git status`의
untracked 목록에는 `GIT_DIFF_PROOF.txt`와 `rrb-inject-plugin.js`만 있었다.)

## Fiber hook 접근 성공 여부: 성공 (실제 커밋 감지 포함)

`verify.mjs`로 헤드리스 크로미움을 띄워 실제로 확인한 결과:

- `window.__RRB_INJECTED__ === true` -> PASS
- `#rrb-floating-button`이 DOM에 렌더링됨(스크린샷 `verify-output/floating-button.png`) -> PASS
- `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 스텁이 (React보다 먼저 실행되어) 생성됨 -> PASS
  (`[rrb-spike] created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub (none existed)` 로그로 확인 —
  즉 이 hook 스텁 스크립트가 React/React-DOM 번들보다 먼저 head에서 실행되어, React가
  자신의 devtools 훅 존재 여부를 체크하는 시점에 이미 우리 스텁이 꽂혀 있었다는 뜻)
- React가 실제로 `renderers.set`으로 렌더러를 등록함 (`renderer injected, id= 1`)
- 카운터 버튼을 두 번 클릭해 state update commit을 강제 유발한 뒤,
  `onCommitFiberRoot fired! rendererID= 1 rootFiber= tag=3` 로그가 3회 캡처됨
  (초기 마운트 1회 + 클릭 2회 = 총 3회의 실제 커밋을 관찰). 단순히 hook 객체가 존재하는 것만이
  아니라, React가 실제로 그 훅을 호출한다는 것까지 증명됨.

종합 결과: `verify.mjs` 실행 시 4개 항목 모두 PASS, 최종 "종합: PASS".

## 소요 시간 / 체감 난이도

- 실제 작업 시간 체감 약 30~40분 (webpack 5 + TS + React 19 수동 스캐폴딩,
  ts-loader `transpileOnly` 설정, 초기 포트 충돌(EADDRINUSE — 이전 dev 서버 프로세스가
  안 죽어서) 디버깅 포함).
- 난이도: 낮음~중간. Vite와 달리 webpack에는 "플러그인이 HTML을 직접 변형하는" 공식
  1급 API가 없어서 `html-webpack-plugin`이라는 별도 패키지의 `getHooks(...).beforeEmit`
  훅을 경유해야 한다는 점이 유일한 특이점이다. 다만 이 패턴은 webpack 생태계에서 매우
  표준적이고 잘 문서화되어 있어서 체감 난이도는 낮았다.

## 특이사항

1. html-webpack-plugin에 대한 의존: webpack 코어 자체에는 "생성된 HTML을 가로채서
   수정하는" 훅이 없다. 이 스파이크의 플러그인은 html-webpack-plugin이 compilation
   객체에 노출하는 getHooks(compilation).beforeEmit을 사용한다. 즉 이 주입 방식은
   webpack 프로젝트가 html-webpack-plugin을 쓰고 있다는 전제에 의존한다(대부분의 webpack
   프로젝트가 이를 사용하므로 실무적으로는 무리 없는 전제).
2. 훅 스텁 실행 순서가 핵심: 스크립트를 <head> 여는 태그 직후에 삽입해야,
   <script defer src="bundle.js">(React/React-DOM 포함)보다 먼저 실행되어
   __REACT_DEVTOOLS_GLOBAL_HOOK__ 스텁을 React가 부트스트랩되기 전에 준비해둘 수 있다.
   html-webpack-plugin이 자동으로 넣는 <script defer> 태그는 </head> 바로 앞에
   삽입되므로, 우리 스크립트를 <head> 여는 태그 직후에 넣는 것만으로 순서가 보장됐다.
3. 포트 충돌 트러블슈팅: 스캐폴딩 검증 중 남아있던 이전 webpack serve 프로세스가
   포트 5302를 점유해 EADDRINUSE가 발생했다. lsof -i :5302로 PID를 찾아 kill 후
   재시도해서 해결 — 로직 문제가 아니라 프로세스 정리 문제였다.
4. 플러그인 파일은 그대로 재사용 가능: rrb-inject-plugin.js는 CommonJS이고
   webpack 전용 API를 쓰지 않으며(compiler.hooks.compilation은 webpack/Rspack 양쪽 다
   존재, html-webpack-plugin의 getHooks API도 Rspack 진영에서 흔히 그대로 쓰이거나
   호환 패키지로 커버된다) — 지침대로 원문 그대로 유지했으며 수정 없이 그대로 Rspack
   스파이크에 넘길 수 있다.

## 건드린 파일 목록 (스캐폴딩 이후, 플러그인 등록 시점 기준)

- 수정: webpack.config.js
- 신규: rrb-inject-plugin.js

(스캐폴딩 단계에서 생성된 package.json, tsconfig.json, src/index.tsx, src/App.tsx,
public/index.html, webpack.config.js(초기 버전)은 베이스라인 커밋에 포함되어 있고,
그 이후로는 무수정.)

## 최종 디렉터리 파일 목록

.gitignore
GIT_DIFF_PROOF.txt
package-lock.json
package.json
public/index.html
rrb-inject-plugin.js
src/App.tsx
src/index.tsx
tsconfig.json
verify-output/floating-button.png
verify.mjs
webpack.config.js
FINDINGS.md

(.git은 지침 8단계에 따라 검증 완료 후 삭제함. node_modules/, dist/, verify-output/
등은 .gitignore에 포함.)
