# bundler-injection-spike

"번들러 무관하게 앱 소스 코드를 전혀 건드리지 않고 dev 서버가 자동으로 계측 스크립트를
주입할 수 있는가"를 검증한 스파이크. 결론과 근거는
[`docs/decisions/0021-bundler-injection-feasibility.md`](../../docs/decisions/0021-bundler-injection-feasibility.md)
참고 (이 스파이크는 [ADR-0020](../../docs/decisions/0020-distribution-entry-ux-direction.md)이
남긴 미결 의존성을 검증한 것이다).

`experiments/exp1-fiber-extraction/`, `experiments/exp2-flow-prototype/`과 같은 성격의
**스파이크 코드**다 — 라이브 MVP에 재사용할 목적이 아니라 "되는지 안 되는지"만 확인하는
목적으로 작성됐고, 실제 `npx react-render-board init` 도구를 만들 때 번들러별 어댑터의
출발점 정도로 참고할 수 있다.

## 디렉터리

| 디렉터리 | 번들러 | 결론 요약 |
|---|---|---|
| [`vite/`](vite/) | Vite | `transformIndexHtml` 1급 API로 완전 성공, 워크어라운드 없음 |
| [`webpack/`](webpack/) | webpack 5 | `HtmlWebpackPlugin.getHooks().beforeEmit`으로 성공 |
| [`rspack/`](rspack/) | Rspack | 플러그인 코드는 무수정, 설정에서 `HtmlRspackPlugin`→`html-webpack-plugin` 교체 필요 |
| [`turbopack-nextjs/`](turbopack-nextjs/) | Turbopack (Next.js 16) | Turbopack 자체엔 API 없음(확인됨) — Next.js `layout.tsx` 레벨로 우회 |

각 디렉터리 안의 `FINDINGS.md`(한국어, 상세 결론)와 `GIT_DIFF_PROOF.txt`(앱 소스 무수정
증빙), `verify.mjs`(Playwright 실행 검증) + `verify-output/floating-button.png`(실제 렌더
스크린샷)이 개별 검증 근거다. 각 스파이크는 독립된 `package.json`을 갖고 있고
(`node_modules/`는 gitignore 처리), 검증 후 내부에 임시로 만들었던 `.git`은 제거했다.
