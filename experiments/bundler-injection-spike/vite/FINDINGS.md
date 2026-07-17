# Vite dev 서버 자동 주입 스파이크 — FINDINGS

## 검증 목표
`vite.config.ts`(+ 플러그인 파일)만 건드려서, 스캐폴딩된 앱의 컴포넌트/페이지 소스는
단 한 줄도 수정하지 않고 dev 서버가 서빙하는 HTML에 계측용 `<script>`를 자동 주입할 수
있는가 — 그리고 그 스크립트가 실제로 React의 `__REACT_DEVTOOLS_GLOBAL_HOOK__` 경로를
통해 진짜 커밋을 관찰할 수 있는가.

## 결론 (verdict)
**주입 성공 (완전 성공, PASS).** Vite의 공식 `transformIndexHtml` 훅
(`order: 'pre'`, `injectTo: 'head-prepend'`)만으로 앱 소스 무수정 + 계측 스크립트
자동 주입 + 실제 Fiber 커밋 관찰까지 전부 달성했다. 워크어라운드나 편법 없이 Vite의
1급 공개 API로 깨끗하게 해결됐다.

## 앱 소스 무수정 달성 여부
**달성.** `GIT_DIFF_PROOF.txt`(baseline 커밋 대비 diff)에 따르면:
- 수정된 파일: `vite.config.ts` 단 1개 (`plugins` 배열에 `rrbInjectPlugin()` 한 줄 추가)
- 추가된 파일: `rrb-inject-plugin.ts`(신규 플러그인), `GIT_DIFF_PROOF.txt`(증빙 자체)
- `src/App.tsx`, `src/main.tsx`, `src/App.css`, `src/index.css` 등 스캐폴딩된 컴포넌트/
  페이지 소스는 **diff에 전혀 나타나지 않음** — 즉 정말로 한 줄도 안 건드림.
- `index.html`조차 건드리지 않았다. `transformIndexHtml`은 디스크의 `index.html`
  파일을 고치는 게 아니라, dev 서버가 응답을 내려줄 때 그 자리에서(on-the-fly, 요청마다)
  HTML을 변형하는 런타임 훅이라서 소스 트리에는 아무 흔적도 안 남는다.

## Fiber hook 접근 성공 여부
**성공 (실제 커밋 감지까지 확인).** `verify.mjs` 콘솔 캡처 로그:
```
[rrb-spike] created __REACT_DEVTOOLS_GLOBAL_HOOK__ stub (none existed)
[rrb-spike] renderer injected, id= 1
[rrb-spike] onCommitFiberRoot fired! rendererID= 1 rootFiber= tag=3
```
`onCommitFiberRoot fired!` 로그가 실제로 찍혔다는 것은, React가 (우리가 head에 미리
심어둔) 훅 스텁을 진짜로 찾아서 `inject()` 호출 → 렌더러 등록 → 커밋 시 콜백 호출까지
전체 파이프라인을 태웠다는 뜻이다. 단순히 훅 객체를 만들어두기만 한 게 아니라, React가
그걸 실제로 사용했다는 걸 증명한다. `#rrb-floating-button`도 화면에 정상 렌더링됨
(`verify-output/floating-button.png` 스크린샷 확인).

스크립트 실행 순서도 가정이 아니라 실측으로 확인했다: 서버가 내려준 HTML을 `curl`로
직접 떠보니, 우리 스크립트는 `<head>` 안, `<script type="module" src="/src/main.tsx">`
(body 끝)보다 문서상 앞쪽에 위치했고 — classic(non-module) 스크립트라 동기 실행되므로
React 앱 모듈이 로드되기 전에 `__REACT_DEVTOOLS_GLOBAL_HOOK__`가 이미 준비돼 있었다.
실제로 `renderer injected`, `onCommitFiberRoot fired!` 로그가 정상적으로 찍힌 것 자체가
이 순서가 올바르게 지켜졌다는 실증이다(만약 순서가 뒤바뀌었다면 React가 훅을 못 찾아
아무 로그도 안 찍혔을 것).

한 가지 흥미로운 점: 우리 스크립트가 `head-prepend`로 "맨 앞"을 요청했지만, 실제 서빙된
HTML에서는 Vite core가 넣는 `@react-refresh` preamble과 `@vite/client` 모듈 스크립트
2개보다 뒤에, 그리고 `<head>`의 나머지 메타 태그들보다는 앞에 위치했다(즉 여러 "pre"
훅들 사이의 상대 순서는 플러그인 등록/내부 처리 순서에 좌우됨). 하지만 이 두 스크립트도
`type="module"`이라 마찬가지로 defer 실행되므로, classic 스크립트인 우리 것보다
실행이 항상 늦다 — 그래서 최종 목표(main.tsx보다 먼저 실행)에는 영향 없음.

## 소요 시간 / 체감 난이도
체감 난이도: **낮음.** 전체 스파이크(스캐폴딩 → 플러그인 작성 → 검증 스크립트 →
실행 확인)까지 대략 20~30분 정도 소요. Vite의 `transformIndexHtml`은 문서화가 잘 돼
있고 정확히 이 유스케이스(HTML에 스크립트 주입)를 위해 설계된 1급 API라, 별도의 트릭이나
소스 변환/AST 조작 없이 바로 원하는 결과가 나왔다. 막힌 지점이 전혀 없었다.

## 특이사항 / 예상 밖 발견
- `injectTo: 'head-prepend'`가 "완전히 맨 앞"을 보장하진 않는다(Vite 자체 client
  스크립트, react-refresh preamble이 더 앞에 옴) — 하지만 module vs classic 스크립트의
  실행 순서 규칙 덕분에 실질적인 목표(React 앱 코드보다 먼저 실행)는 그대로 달성된다.
  다른 번들러 스파이크와 비교할 때 "정확히 몇 번째 태그인가"보다 "module이냐 classic이냐"가
  핵심 변수라는 점을 기록해둘 가치가 있다.
- `npm create vite@latest . -- --template react-ts`를 빈 디렉터리 안에서 그대로
  실행해도 문제없이 비대화형으로 스캐폴딩됐다(별도 서브폴더 우회 불필요).
- Playwright `^1.61.1` 설치 시 별도 브라우저 다운로드 없이 기존
  `~/Library/Caches/ms-playwright`의 chromium-1228 캐시를 그대로 재사용함(설치 1초 컷).
- dev 서버를 `verify.mjs`에서 자식 프로세스로 직접 fork해 `detached: true` +
  프로세스 그룹 kill(`process.kill(-pid, 'SIGTERM')`)로 관리했는데, 문제없이
  정상 종료됐다(포트 재확인으로 검증).

## 정확히 건드린 파일 목록
- 수정: `vite.config.ts` (플러그인 등록 한 줄 추가)
- 수정: `package.json` (devDependencies에 `playwright` 추가)
- 신규: `rrb-inject-plugin.ts` (주입 플러그인 본체)
- 신규: `verify.mjs` (Playwright 검증 스크립트)
- 신규: `GIT_DIFF_PROOF.txt` (baseline 대비 diff 증빙, 이 파일 자체)
- 신규: `FINDINGS.md` (본 문서)
- 자동 생성(직접 편집 안 함): `package-lock.json`(npm install 반영), `verify-output/floating-button.png`
- **건드리지 않음**: `src/` 아래 모든 파일(`App.tsx`, `main.tsx`, `App.css`, `index.css`,
  assets 등), `index.html`, `tsconfig*.json`, `public/` 아래 파일들
