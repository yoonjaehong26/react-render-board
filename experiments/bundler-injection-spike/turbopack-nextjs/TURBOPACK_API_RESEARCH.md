# Turbopack 자체 플러그인/HTML 삽입 API 조사

조사 시각: 2026-07-17. 소요 시간: 약 12분.

## 확인한 실제 설치 버전

```
$ npx create-next-app@latest --version
16.2.10
```

`create-next-app --help` 출력에는 `--turbopack` 플래그가 더 이상 존재하지 않는다 (과거 버전에는
있었음). 이는 Turbopack이 Next.js 16부터 **기본 번들러**가 되어 별도 플래그가 불필요해졌기
때문 — 아래 공식 문서에서도 확인됨.

## 확인한 소스

1. https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack
   (`next.config.js`의 `turbopack` 키 레퍼런스, lastUpdated: 2026-02-13, version: 16.2.10)
2. https://nextjs.org/docs/app/api-reference/turbopack
   (Turbopack API 레퍼런스 전체 페이지, lastUpdated: 2026-05-31, version: 16.2.10)

두 페이지 모두 WebFetch로 전체 내용을 가져와 옵션 표, "Known gaps with webpack" 섹션, 버전
히스토리 테이블까지 확인했다.

## 결론: 없다 (명확히 없음)

`turbopack` 키(및 그 밑의 `experimental.turbopack*` 플래그들)가 노출하는 전체 옵션은 다음이
전부다:

| 옵션 | 용도 |
|---|---|
| `root` | 프로젝트 루트 경로 지정 (모듈 해석 범위) |
| `rules` | 파일 확장자별 webpack 로더 매핑 (단, **JS 코드를 반환하는 로더만** 지원 — 스타일시트/이미지 변환 로더는 불가) |
| `resolveAlias` | import 별칭 매핑 (webpack `resolve.alias`와 유사) |
| `resolveExtensions` | 모듈 해석 시 확장자 우선순위 |
| `debugIds` | 번들/소스맵에 디버그 ID 삽입 |
| `ignoreIssue` | 특정 에러/경고 억제 |
| `experimental.turbopack*` (약 15개) | minify, sourcemap, tree-shaking, module-id 전략, 캐시 등 저수준 빌드 튜닝 플래그 — 전부 모듈 그래프/번들링 내부 동작이며 산출물(HTML 등) 후처리와 무관 |

이 중 어느 것도 "서빙되는 HTML 문서 자체를 변형/후처리"하는 훅이 아니다. 전부 **모듈
해석(resolve)**이나 **개별 파일→JS 변환(loader)** 범위에 한정되며, Vite의
`transformIndexHtml`처럼 최종 HTML 문자열을 받아 조작하는 API는 존재하지 않는다. Next.js
자체가 HTML을 React 서버 렌더링으로 생성하므로(Turbopack은 그 앞단의 JS/모듈 번들러일 뿐),
애초에 "Turbopack이 HTML을 만든다"는 전제 자체가 성립하지 않는다 — HTML 생성은 Next.js
서버 런타임의 몫이고 Turbopack은 거기에 들어갈 JS 청크만 만든다.

또한 공식 문서에 다음과 같이 명시되어 있다 (verbatim, `/docs/app/api-reference/turbopack`
"Known gaps with webpack" > "Webpack plugins" 섹션):

> "Turbopack does not support webpack plugins. This affects third-party tools that rely on
> webpack's plugin system for integration. We do support webpack loaders... If you depend on
> webpack plugins, you'll need to find Turbopack-compatible alternatives or continue using
> webpack until equivalent functionality is available."

즉 webpack 진영에서 `HtmlWebpackPlugin` 같은 걸 만들 때 쓰던 **compiler hook 시스템 자체가
Turbopack에는 없다**. 로더(loader)는 "파일 하나를 다른 파일로 변환"하는 좁은 범위의 훅이고,
그마저도 "JS 코드를 반환하는 것만" 지원한다 — 즉 로더를 억지로 써서 최종 HTML 응답에 개입하는
것도 불가능하다 (로더는 particular import된 모듈 단위로 동작하지, dev 서버가 응답하는 HTML
document 전체에는 접근할 수 없다).

버전 히스토리 테이블(16.0.0 ~ 16.2.0)을 보면 최근 추가된 것도 `debugIds`,
`rules.*.condition`, `rules.*.type`, `turbopackLoader` import attribute 등 전부 "모듈 단위
변환/해석"의 세분화이지, HTML이나 dev-server 응답 레벨로 범위가 확장된 이력은 없다. 즉
"아직 미성숙해서 없다"가 아니라 "설계상 이 레이어를 다루도록 만들어지지 않았다"에 가깝다 —
Turbopack은 의도적으로 module bundler 역할에 스코프를 좁히고, HTML/응답 조작은 프레임워크
(Next.js) 레벨의 책임으로 분리해둔 구조로 보인다.

## Rspack/webpack과의 대비 (참고용, 본 조사의 핵심은 아님)

webpack의 `compiler.hooks.*` (예: `HtmlWebpackPlugin`이 쓰는 `compilation.hooks.processAssets`
등 tapable 훅 시스템) 같은 "플러그인이 컴파일러 라이프사이클에 개입해 임의의 자산을 만들거나
수정하는" 메커니즘이 Turbopack에는 대응물이 없다. Turbopack은 Rust로 작성되어 있고 JS 플러그인
객체를 받아 실행하는 구조 자체가 없다(로더도 순수 Rust `loader-runner` 구현체 위에서 제한된
API 서브셋만 노출).

## part 1 결론

**Turbopack 자체에는 Vite의 `transformIndexHtml`이나 webpack의 `HtmlWebpackPlugin`에
대응하는 "서빙 HTML에 스크립트를 주입하는" 플러그인 API가 없다.** `next.config.js`의
`turbopack` 키를 통틀어도 모듈 해석/로더 설정뿐이며, 이는 "아직 안정화되지 않아서"가 아니라
애초에 이 레이어(HTML 산출)를 다루지 않도록 설계되어 있기 때문이다. 따라서 `npx
react-render-board init`이 Turbopack 플러그인 훅을 통해 스크립트를 주입하는 방법은 **존재하지
않는다** — 이 결론에 따라 part 2(Next.js 프레임워크 레벨 우회)로 진행한다.
