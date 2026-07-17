# Turbopack + Next.js 16 계측 스크립트 자동 주입 스파이크 — 결론

## 한 줄 결론

**Turbopack 자체에는 HTML 주입 플러그인 API가 없다.** 대신 Next.js 프레임워크 레벨의
`instrumentation-client.ts`를 먼저 시도했으나 Next.js 자체의 Fast Refresh 런타임이
`__REACT_DEVTOOLS_GLOBAL_HOOK__` 슬롯을 먼저 선점해버려 실패했고, 그 다음 순번인 root
`layout.tsx`의 `<head>` 동기 `<script>` 삽입 방식으로 전환하여 **성공**했다. 이 과정에서
`app/page.tsx` 등 실제 페이지/컴포넌트 파일은 단 한 줄도 건드리지 않았고, 실제 React 커밋을
Fiber devtools hook을 통해 관찰하는 데 성공했다.

---

## 1. Turbopack 자체 플러그인 API 조사 결과

**없음 — 명확히 없음.** 설치된 실제 버전(Next.js 16.2.10, `npx create-next-app@latest
--version`으로 확인)의 공식 문서 두 페이지(`/docs/app/api-reference/turbopack`,
`/docs/app/api-reference/config/next-config-js/turbopack`, 둘 다 WebFetch로 전체 조회,
lastUpdated 2026-02/05월)를 확인한 결과, `next.config.js`의 `turbopack` 키가 노출하는
옵션은 `root`, `rules`(webpack 로더 매핑, JS를 반환하는 로더만 지원), `resolveAlias`,
`resolveExtensions`, `debugIds`, `ignoreIssue`와 약 15개의 `experimental.turbopack*`
저수준 빌드 플래그(minify, sourcemap, tree-shaking, module-id 전략 등)가 전부다. 전부
**모듈 해석**이나 **개별 파일→JS 변환** 범위에 한정되며, Vite의 `transformIndexHtml`이나
webpack의 `HtmlWebpackPlugin`처럼 최종 서빙 HTML 문자열에 개입하는 훅은 존재하지 않는다.

공식 문서에 명시된 문구(verbatim):
> "Turbopack does not support webpack plugins. ... If you depend on webpack plugins, you'll
> need to find Turbopack-compatible alternatives or continue using webpack until equivalent
> functionality is available."

이는 "아직 미성숙해서"가 아니라 애초에 이 레이어(HTML 산출물 자체)를 다루도록 설계되지
않았기 때문으로 보인다 — Next.js에서 HTML은 React 서버 렌더링이 만들고, Turbopack은 거기
들어갈 JS 청크만 만드는 역할이라 "Turbopack이 HTML을 변형한다"는 전제 자체가 성립하지
않는다. 버전 히스토리(16.0.0~16.2.0)에 추가된 것도 전부 모듈/로더 단위 세분화이지 HTML/응답
레벨로 범위가 확장된 이력은 없다. 자세한 근거는 `TURBOPACK_API_RESEARCH.md` 참고.

---

## 2. 어떤 Next.js 프레임워크 레벨 우회 방법을 썼는가

**명확히 우회(bypass)임을 밝힌다: 아래는 Turbopack의 플러그인 API가 아니라 Next.js
프레임워크 자체가 제공하는 파일 컨벤션을 사용한 것이다.**

### 2-1. 1차 시도: `src/instrumentation-client.ts` — 실패

Next.js 15.3+에 추가된 파일 컨벤션으로, 공식 문서(및 `node_modules/next/dist/docs/...`에
번들된 동일 문서)는 "HTML 문서가 로드된 후, React hydration이 시작되기 전에 실행된다"고
명시한다. 이 타이밍 주장을 그대로 믿지 않고 실증적으로 확인했다:

- `diagnose.mjs`로 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`에 setter를 걸어 언제/무엇이
  값을 쓰는지 추적한 결과, `readyState=interactive`, `t≈1810ms` 시점에 **이미 hook 객체가
  설치되어 있었고**, `instrumentation-client.ts`의 최상위 코드는 그로부터 불과 **2.5ms
  뒤(t≈1813ms)**에 실행되었다.
- `node_modules/next/dist/compiled/react-refresh/cjs/react-refresh-runtime.development.js`
  의 `injectIntoGlobalHook()` 함수(약 399~430번째 줄)를 직접 열어 확인한 결과, Next.js의
  Fast Refresh(HMR) 클라이언트 런타임이 **자기 부트스트랩 과정에서 hook이 없으면 스스로
  설치**하도록 되어 있다 (주석: "if there is no DevTools extension, we'll need to set up
  the global hook ourselves. ... it's important that renderer code runs *after* this method
  call.").
- 즉 `instrumentation-client.ts`의 "React hydration보다 먼저"라는 타이밍 보장은 **React
  자체보다는 먼저지만, Next.js의 Fast Refresh 클라이언트 부트스트랩보다는 늦다.** 우리
  코드는 `!window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 체크에서 이미 Next.js가 만든 hook을
  발견하고 (의도된 대로) 아무것도 덮어쓰지 않은 채 "already existed"만 로그를 남겼다.
  결과적으로 실제 React가 호출하는 `inject()`/`onCommitFiberRoot`는 Next.js의
  Fast-Refresh용 hook(내부 no-op 구현)이지 우리 스텁이 아니었고, `[rrb-spike] renderer
  injected` / `onCommitFiberRoot fired!` 로그는 **한 번도 찍히지 않았다.**
- (참고로 `react-dom-client.development.js`도 직접 grep해 확인 — react-dom 자체는 hook이
  없으면 그냥 `return false`할 뿐 스스로 설치하지 않는다. hook을 선점하는 주체는 어디까지나
  Next.js의 react-refresh 런타임이다.)

**이것이 "타이밍 이슈가 있었는가"에 대한 정확한 답이다: 있었다.** 단순히 "늦게 실행돼서
실패"가 아니라, Next.js 자신의 dev-mode HMR 인프라가 devtools hook 슬롯을 선제적으로
점유하는 구조적 경쟁 관계 때문에 실패했다.

### 2-2. 2차 시도: root `layout.tsx`의 `<head>` 동기 `<script>` — 성공

과제 지시대로 (a)가 "hook 설치가 너무 늦어서 React가 inject()를 호출하지 않는" 경우에 해당
하므로 (b)로 전환했다. `src/app/layout.tsx`의 `<head>` 안에
`<script dangerouslySetInnerHTML={{__html: ...}}/>` 형태로 동일 로직(플로팅 버튼 생성 +
devtools hook 스텁 설치)을 심었다.

동기 `<script>` 태그는 HTML 문서 파싱 순서대로 즉시 실행되고, `<head>`의 첫 자식으로 배치
했기 때문에 Next.js/React가 나중에 로드하는 번들 스크립트(및 그 안의 Fast Refresh 런타임)
보다 먼저 실행된다. 실제로 `verify.mjs` 실행 결과:

```
[rrb-spike] layout <head> script evaluated at 1701.2ms readyState= loading   <- 문서가 아직 파싱 중일 때 실행됨
[rrb-spike] created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub (none existed)
[rrb-spike] renderer injected, id= 1
[rrb-spike] renderer injected, id= 2
[rrb-spike] onCommitFiberRoot fired! rendererID= 2 rootFiber= tag=3
... (총 12회 이상 반복 발화)
```

`readyState=loading` 시점(1차 시도 때보다 100ms 이상 이르고, 문서가 아직 완전히 파싱되기도
전)에 이미 실행되어, 이번에는 우리 스텁이 hook 슬롯을 선점했고 React(및 Next.js 자체 코드
모두 포함해 rendererID 1, 2 두 개의 렌더러)가 실제로 `inject()`를 호출했으며,
`onCommitFiberRoot`가 실제 커밋마다 반복 발화했다.

---

## 3. 앱 소스(페이지/컴포넌트) 무수정 달성 여부

**달성함.** `GIT_DIFF_PROOF.txt`(이 스파이크 디렉터리 안에서만 임시로 만들었던 git
저장소의 diff를 저장한 것, 이후 `.git`은 삭제함)로 증명:

- 수정된 파일: `src/app/layout.tsx` (지정된 진입점 1곳), `package.json` /
  `package-lock.json` (playwright devDependency 추가 — 검증 도구이지 앱 소스 아님)
- 새로 추가된 파일: `verify.mjs`, `diagnose.mjs`, `verify-output/` (전부 스파이크 검증용
  스크립트/산출물)
- `git diff -- src/app/page.tsx`, `src/app/globals.css`, `src/app/page.module.css` 전부
  **빈 출력** — 실제 페이지/컴포넌트/스타일 파일은 전혀 건드리지 않았음을 확인.

## 4. Fiber hook 접근 성공 여부

**성공.** `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 스텁이 실제 React 커밋 사이클에 연결되어
`onCommitFiberRoot`가 반복적으로(초기 마운트만으로도 12회 이상 — React 19 dev 모드의 이중
렌더링/Next.js 자체 렌더 트리까지 포함되어 보임, rendererID 1과 2 두 렌더러가 모두 관측됨)
발화했다. 단, **타이밍 이슈가 실제로 있었다** — 위 2-1에서 상세히 기술한 대로
`instrumentation-client.ts`는 Next.js의 Fast Refresh 런타임에 hook 슬롯을 선점당해 완전히
실패했고, `layout.tsx` `<head>` 동기 스크립트로 전환한 뒤에야 성공했다.

## 5. 소요 시간 / 난이도

- Turbopack API 조사(1단계): 약 12분 (공식 문서 2페이지 WebFetch + 버전 확인).
- 스캐폴딩 + 1차 시도(`instrumentation-client.ts`) 구현 및 실패 확인: 약 15분.
- 실패 원인 진단(`diagnose.mjs` 작성, react-refresh-runtime 소스 직접 추적): 약 10분 —
  이 부분이 가장 흥미롭고 시간이 든 부분이었다. 단순히 "안 됐다"에서 멈추지 않고
  `node_modules` 안의 실제 컴파일된 react-refresh 런타임 소스를 grep/read해서 정확한
  원인(injectIntoGlobalHook)을 특정했다.
- 2차 시도(`layout.tsx`) 구현 + 검증 스크립트 작성 + PASS 확인: 약 15분.
- 전체 난이도: **중간.** Next.js/Turbopack 자체는 별도 설정 없이 잘 동작했고,
  `create-next-app`도 큰 마찰 없이 스캐폴딩됐다. 난이도의 핵심은 번들러가 아니라
  "Next.js가 dev 모드에서 자기 자신의 HMR 인프라를 위해 동일한 전역 훅 슬롯을 쓴다"는
  프레임워크 차원의 경쟁 조건을 발견하고 진단하는 데 있었다.

## 6. 특이사항

- `create-next-app@latest --help`에는 더 이상 Turbopack 관련 플래그가 없다 — Next.js
  16부터 Turbopack이 **기본값**이라 별도 플래그가 필요 없어졌기 때문. `--no-tailwind`도
  help 텍스트엔 없었지만 commander의 boolean 옵션 자동 negation 관례대로 정상 동작함
  (`--tailwind`가 기본 true인 옵션이라 `--no-tailwind`로 끌 수 있었음).
- 스캐폴딩된 프로젝트에 `AGENTS.md`가 자동 생성되어 있었는데, 그 내용이 "이 버전은 학습
  데이터와 다를 수 있으니 `node_modules/next/dist/docs/`의 실제 문서를 먼저 읽으라"는
  경고였다 — 실제로 이 경고를 따라 `instrumentation-client.md` 문서를 웹 검색 결과가 아닌
  로컬 번들 문서에서 직접 읽었고, 웹 검색 결과와 내용이 일치함을 확인했다.
- dev 서버 시작 시 "여러 lockfile이 감지되어 workspace root를 추정한다"는 경고가 떴다 —
  이 스파이크 디렉터리가 monorepo(pnpm-lock.yaml 있는 상위 저장소) 안에 있기 때문. 실제
  운영에서는 `turbopack.root`를 명시하는 게 좋겠지만, 이번 스파이크 목적과는 무관해
  수정하지 않았다.
- `onCommitFiberRoot`가 페이지 로드 한 번에 12회 이상 발화했다 — React 19 개발 모드의
  Strict-Mode 이중 렌더링, Next.js의 자체 렌더 트리(App Router 클라이언트 런타임), Fast
  Refresh의 자체 재실행 등이 겹쳐서로 추정된다. `rendererID`가 1과 2 두 개로 나뉘어
  관측된 것도 이와 관련 — 아마 하나는 Next.js/React 자체의 내부 렌더러, 다른 하나는
  페이지 트리의 렌더러로 추정되나 정확한 구분은 이번 스파이크 범위 밖이다.

## 7. 건드린 파일 목록

| 파일 | 종류 | 비고 |
|---|---|---|
| `src/app/layout.tsx` | **수정 (지정된 진입점)** | `<head>`에 계측 스크립트 삽입 — 최종적으로 작동한 방법 |
| `package.json` | 수정 | `playwright` devDependency 추가 |
| `package-lock.json` | 수정 | 위에 따른 lockfile 갱신 |
| `verify.mjs` | 신규 | Playwright 기반 검증 스크립트 |
| `diagnose.mjs` | 신규 | hook 선점 시점을 추적한 진단 스크립트 (버그 원인 특정용) |
| `verify-output/floating-button.png` | 신규 | 검증 스크린샷 |
| `TURBOPACK_API_RESEARCH.md` | 신규 | 1단계 조사 결과 |
| `GIT_DIFF_PROOF.txt` | 신규 | 무수정 증명 |
| `FINDINGS.md` | 신규 | 본 문서 |

**건드리지 않은 것 (명시적 확인됨):** `src/app/page.tsx`, `src/app/globals.css`,
`src/app/page.module.css`, `src/app/favicon.ico`, `public/*` — 즉 실제 애플리케이션
페이지/컴포넌트/에셋은 전혀 수정하지 않았다.

(참고: 1차 시도에서 만들었던 `src/instrumentation-client.ts`는 타이밍 경쟁에서 패배해
최종 결과물에는 포함하지 않고 삭제했다 — 실패 원인과 로그는 위 2-1절에 그대로 기록해 두었다.)
