# Rspack 스파이크 결과: "Rspack은 webpack 플러그인과 호환된다"는 주장 검증

## 결론 (Verdict)

**부분적으로 동작함 (Partially — as-is 실행은 실패, 최소한의 설정 변경 후에는 완전히 동작).**

`rrb-inject-plugin.js` 파일 자체는 단 한 바이트도 수정하지 않았고, 최종적으로
- 주입된 `<script>`가 HTML에 그대로 삽입됨
- 브라우저에서 `#rrb-floating-button`이 실제로 마운트됨
- React 19가 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 스텁을 감지하고 `inject()`를 호출함
- 컴포넌트 상태 변경(카운터 클릭) 시 `onCommitFiberRoot`가 실제로 발화됨

까지 전부 확인했다. 다만 여기 도달하기까지 **두 단계의 장벽**이 있었고, 그중 하나는 Rspack의 컴파일러 호환성과 무관한 문제, 다른 하나는 정확히 과제에서 예상한 "Rspack 자체 HTML 플러그인 vs html-webpack-plugin" 문제였다.

## 핵심 질문: 웹팩 플러그인이 수정 없이 그대로 동작했는가?

**아니오, 있는 그대로(as-is)는 동작하지 않았다.** 정확히 두 번 깨졌다:

### 1차 실패 — Rspack과 무관한 Node.js ESM/CJS 충돌
`create-rspack@2.1.4`의 `react-ts` 템플릿은 기본적으로 `package.json`에 `"type": "module"`을 넣는다. `rrb-inject-plugin.js`는 CommonJS 문법(`require`, `module.exports`)으로 작성돼 있는데, Node.js는 확장자(`.js`)와 가장 가까운 `package.json`의 `type` 필드만 보고 모듈 형식을 판단하므로, 이 파일을 ESM으로 잘못 해석해 다음 에러로 즉시 크래시했다(`first-attempt-error.log` 참고):

```
ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension
and '.../package.json' contains "type": "module".
```

→ 이건 Rspack 컴파일러가 시작도 하기 전에 Node.js 모듈 로더 단계에서 죽은 것이라 "Rspack의 웹팩 호환성"과는 별개의 문제다. 다만 실전에서는 이게 **실제로 처음 마주치는 벽**이라는 점에서 기록할 가치가 있다 — CRA/webpack 생태계의 관례(`type: module` 안 씀)와 최신 스캐폴딩 도구의 기본값이 다르면, "그대로 갖다 붙이기"가 씹힌다.

최소 수정: `package.json`에서 `"type": "module"` 한 줄 제거 (require 가능한 CommonJS로 되돌림).

### 2차 실패 — 진짜 핵심 질문: Rspack 고유 HTML 플러그인 vs html-webpack-plugin
`create-rspack`이 만든 `rspack.config.ts`는 HTML 생성에 `html-webpack-plugin`이 아니라 **Rspack 자체 내장 플러그인인 `rspack.HtmlRspackPlugin`**을 사용한다. `rrb-inject-plugin.js`는 내부에서 `require('html-webpack-plugin')`을 호출하는데, 이 패키지가 프로젝트에 아예 설치돼 있지 않으므로 다음 에러가 났다(`second-attempt-error.log` 참고):

```
[rspack-dev-middleware] Error: Cannot find module 'html-webpack-plugin'
Require stack:
- .../rrb-inject-plugin.js
- .../rspack.config.ts
```

**중요한 관찰:** 이 에러는 "모듈을 못 찾음"이지 "훅이 없음"이 아니다. 즉 `compiler.hooks.compilation.tap('RrbInjectPlugin', ...)` 자체는 문제없이 등록되고 발화됐다 — Rspack의 Tapable 기반 훅 시스템이 webpack 플러그인이 기대하는 API 형태(`compiler.hooks.compilation.tap`)를 그대로 받아들인다는 뜻이다. 실패 지점은 순수하게 "html-webpack-plugin 패키지가 node_modules에 없다"는 의존성 문제였다.

최소 수정:
1. `npm install --save-dev html-webpack-plugin` (peer dependency 경고 발생 — 아래 특이사항 참고)
2. `rspack.config.ts`에서 `new rspack.HtmlRspackPlugin(...)` → `new HtmlWebpackPlugin(...)`으로 교체 (Rspack 내장 플러그인을 실제 npm의 html-webpack-plugin으로 스왑)

이 변경 후 재시작하니 컴파일 성공, HTML 응답에 주입 스크립트가 정확히 그대로(byte-for-byte) 삽입된 것을 확인했다. `RrbInjectPlugin` 클래스 코드는 이 과정에서 **단 한 글자도 건드리지 않았다.**

## 앱 소스 무수정 여부

**완전히 무수정.** `GIT_DIFF_PROOF.txt`로 증명: `git status`/`git diff` 결과 `src/` 디렉터리(컴포넌트/페이지 소스)와 `index.html`(앱 HTML 템플릿)에는 어떤 diff도, 어떤 untracked 파일도 없다. 수정된 파일은 오직:
- `package.json` (devDependency 추가, `type: module` 제거)
- `package-lock.json` (위에 따른 lockfile 갱신)
- `rspack.config.ts` (플러그인 등록용 설정 파일)
- `rrb-inject-plugin.js` (신규 파일, 내용은 과제에서 지정된 것 그대로 무수정)

## Fiber Hook 접근 성공 여부

**성공.** `verify.mjs`로 실제 headless Chromium에서 확인:
- `[rrb-spike] created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub (none existed)` 로그 발생
- `[rrb-spike] renderer injected, id= 1` — React 19가 가짜 devtools 훅을 실제로 찾아서 `inject()` 호출
- `[rrb-spike] onCommitFiberRoot fired! rendererID= 1 rootFiber= tag=3` — 초기 마운트 커밋 및 카운터 버튼 클릭에 의한 추가 커밋에서 각각 발화
- `#rrb-floating-button`이 화면에 시각적으로도 마운트됨 (`verify-output/floating-button.png` 스크린샷 확인)

## 소요 시간 / 난이도

- 스캐폴딩(`create-rspack`) + 베이스라인 확인: 매우 빠름, 문제없음 (비대화형 플래그가 잘 갖춰져 있음: `--dir`, `--template`, `--override`)
- 1차 실패(ESM/CJS) 진단 및 수정: 몇 분 — 에러 메시지가 원인을 명확히 알려줘서 어렵지 않았음
- 2차 실패(html-webpack-plugin 부재) 진단 및 수정: 몇 분 — 마찬가지로 에러 메시지가 정확함. peer dependency 충돌만 `--legacy-peer-deps`로 우회 필요
- 전체적으로 "난이도"는 낮음~중간. 웹팩 생태계 경험이 있다면 두 실패 모두 원인을 즉시 알아볼 수 있는 수준.

## 특이사항

1. **`html-webpack-plugin`이 이미 Rspack을 공식 지원하려는 흔적이 있음**: `npm view html-webpack-plugin peerDependencies`를 보면 `"@rspack/core": "0.x || 1.x"`가 **optional peer**로 명시돼 있다. 즉 html-webpack-plugin 메인테이너가 이미 Rspack용 optional peer를 추가해뒀다 — 다만 이 스파이크 시점 기준 설치된 `@rspack/core@2.1.4`(최신 메이저)는 아직 그 범위 밖이라 `npm install`이 기본 설정으로는 ERESOLVE 충돌을 냈다(`--legacy-peer-deps`로 우회). 이건 "생태계가 서로를 인지하고 있다"는 강한 신호이면서 동시에 "메이저 버전 롤아웃 속도 차이로 npm이 엄격 모드에서 튕겨낼 수 있다"는 실무적 함정이기도 하다.
2. `create-rspack`이 기본으로 `package.json`에 `"type": "module"`을 넣는 것은 CRA/webpack 생태계의 관행과 다르다 — CommonJS로 작성된 서드파티 플러그인/스크립트를 그대로 갖다 쓰려는 시나리오에서 첫 번째로 걸리는 벽이 될 수 있다.
3. Rspack의 훅 시스템(`compiler.hooks.compilation.tap`, tapable 기반)은 webpack 플러그인이 기대하는 모양을 그대로 받아들였다 — "모듈을 못 찾음"은 있었지만 "그런 훅 없음/호환 안 됨" 에러는 한 번도 없었다. 즉 **Rspack의 webpack-플러그인-호환성 주장은, 적어도 `compiler.hooks.compilation` + `HtmlWebpackPlugin.getHooks().beforeEmit` 패턴에 대해서는 사실로 확인됐다** — 단, 이는 Rspack 자체 HTML 플러그인이 아니라 진짜 `html-webpack-plugin` 패키지가 함께 설치·등록되어 있어야 한다는 전제하에서다.
4. dev 서버가 시작할 때마다 `rspack.config.ts`(ESM 문법 사용)에 대해 Node가 "MODULE_TYPELESS_PACKAGE_JSON" 경고를 출력한다 (`"type": "module"`을 지웠기 때문). 기능에는 영향 없음, 단순 경고.

## 건드린 파일 목록

- `package.json` — `"type": "module"` 제거, `html-webpack-plugin` + `playwright`를 devDependencies에 추가
- `package-lock.json` — 위 변경에 따른 자동 갱신
- `rspack.config.ts` — `rspack.HtmlRspackPlugin` → `html-webpack-plugin`(실제 npm 패키지)로 교체, `RrbInjectPlugin`을 `plugins` 배열에 등록, `devServer.port: 5303` 추가
- `rrb-inject-plugin.js` — 신규 파일, 과제에서 지정된 내용 그대로 **무수정** 그대로 사용
- `verify.mjs` — 신규 파일, Playwright 기반 자동 검증 스크립트
- `GIT_DIFF_PROOF.txt` — 신규 파일, `src/`·`index.html` 무수정임을 증명하는 git diff 캡처
- (건드리지 않음) `src/App.tsx`, `src/main.tsx`, `index.html` 등 앱 자체 소스 — 전혀 수정 없음
