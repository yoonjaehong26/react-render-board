# ADR-0057: `/shop` 라우트 fixture — 실제 클라이언트 라우팅에 반응하는 독립 쇼핑몰 페이지

- 상태: 채택됨
- 날짜: 2026-07-18

## 맥락 (Context)

직전 QA 라운드에서 `Storefront`(domains/shop)를 추가했지만, 이 fixture는 `DemoApp`에 다른 패널들과 함께 **항상 마운트**돼 있어 "실제 웹사이트처럼 페이지를 이동하는" 느낌은 안 났다. 사용자가 쿠팡 같은 실제 서비스에 더 가깝게 만들고 싶다고 요청했고, 뒤이어 "다른 라우터에서" 별도로 만들자는 방향과 함께 "진짜 클라이언트 라우팅(URL이 바뀌며 페이지 전환)"을 원하는지 확인했더니 그렇다고 확정했다.

이 참에 이 레포 안에서 **진짜 라우트 전환**(마운트 트리 전체 교체)을 보드가 어떻게 관찰하는지도 보여줄 수 있다 — 지금까지 라우트 전환 검증(ADR-0015)은 berry-admin 같은 외부 앱으로만 했고, 이 레포의 fixture 자체엔 없었다.

## 검토한 대안 (Options)

- **react-router 같은 라우팅 라이브러리 도입** — 기각. 이 데모에 필요한 건 경로 두 개(`/`, `/shop`)를 History API로 오가는 것뿐이라, CLAUDE.md의 "근거 없이 도구를 늘리지 않는다" 원칙에 어긋난다.
- **해시 라우팅(`#/shop`)** — 기각. 사용자가 "진짜 클라이언트 라우팅"을 명시적으로 선택했고, Vite dev 서버 기본값(`appType: 'spa'`)이 알 수 없는 pathname도 `index.html`로 서빙해줘 실제 pathname 기반 라우팅(새로고침/딥링크 포함)이 추가 설정 없이 가능하다.
- **실제 오픈소스 이커머스 앱을 통째로 얹기** — 기각(사용자에게도 트레이드오프 설명 후 거절 확인). excalidraw/berry-admin/shadcn-admin 같은 실제 앱은 지금까지 검증용으로 **레포 밖에서** 클론해서만 썼다(ADR-0009/0014/0015) — 배포되는 fixture로 넣으면 각자의 라우터/스타일 프레임워크/빌드 설정과 충돌하고 라이선스도 확인해야 한다.
- **기존 `Storefront`를 `/shop`으로 옮기기** — 기각. 사용자가 "지금의 구조는 남겨두고"라고 명시했다. `Storefront`는 리스트 접기(ADR-0046) 등을 항상 마운트된 상태로 보여주는 제 역할이 있어 그대로 둔다.

## 결정 (Decision)

**`src/fixtures/router.ts`에 최소 History API 라우터(`useRoute`)를 손으로 만들고, `/shop`에서만 마운트되는 독립 페이지를 추가한다.**

- `useRoute()` — `window.location.pathname` state + `popstate` 리스너 + `navigate(to)`(pushState). 새 의존성 없음.
- `DemoApp.tsx`가 `path.startsWith('/shop')`이면 기존 패널 트리 전체 대신 `<ShopPage />`만 렌더한다 — 진짜 라우트 전환(마운트/언마운트)이다. 기존 데모에는 "실제 쇼핑몰 사이트 보기 (/shop) →" 버튼 하나만 추가했다.
- `src/fixtures/domains/routes/app/shop/page.tsx` — `dashboard/page.tsx`(ADR-0028)와 같은 "Next.js App Router 관례" 패턴. `getSource`가 "사용 위치" 기준으로 이 파일을 그룹으로 잡아, 진입 노드(`ShopSitePage`)가 라우트 6각형으로 표시된다.
- 내용물(`SiteHeader`/`PromoBanner`/`CategoryNav`/`ProductSection`/`ShopProductCard`/`SiteFooter`)은 `Storefront`의 상품 데이터(`domains/shop/data.ts`)와 장바구니 UI(`CartDrawer`)를 재사용하되, 배지(로켓배송/무료배송)·평점·할인율 같은 "쿠팡스러운" 표시용 필드는 이 라우트 전용 `enrich.ts`가 index 기반 결정적 공식으로 덧붙인다(`Math.random()` 안 씀 — 리렌더마다 값이 흔들리면 "이 커밋에서 뭐가 바뀌었나"를 보는 도구 취지와 안 맞는다).

## 근거 (Rationale)

- **진짜 라우팅이라는 요청을 그대로 만족한다.** URL이 실제로 `/shop`으로 바뀌고, 새로고침/딥링크에도 살아남고, 뒤로가기도 된다(Playwright로 셋 다 실측).
- **부수 효과로 라우트 전환 관찰이 이 레포 안에서도 가능해졌다.** 지금까지 ADR-0015는 외부 앱으로만 검증했다 — 이제 `npm run dev`만으로 "라우트 바뀌면 트리 전체가 교체되고 보드가 따라가는지"를 바로 볼 수 있다.
- **의존성 0개.** 라이브러리 없이 History API 20줄로 끝난다.
- **기존 구조 불변.** `Storefront`/캡슐형 fixture 전부 그대로고, `DemoApp`에는 조건분기 하나 + 버튼 하나만 늘었다.

## 결과 (Consequences)

- **바뀐 파일**: `src/fixtures/router.ts`(신규), `src/fixtures/domains/routes/app/shop/*`(신규 8개 파일: `page.tsx`/`ShopSitePage.tsx`/`SiteHeader.tsx`/`PromoBanner.tsx`/`CategoryNav.tsx`/`ProductSection.tsx`/`ShopProductCard.tsx`/`SiteFooter.tsx`/`enrich.ts`), `src/fixtures/DemoApp.tsx`(라우팅 분기 + 진입 버튼), `src/index.css`(`/shop` 전용 스타일, `.demo-app` 스코프 밖이라 기존 스타일과 안 겹침).
- **검증**: `tsc` 클린, lint 무관 경고만, 유닛 테스트 330개 통과. Playwright로 직접 확인 — `/shop` 진입 시 URL 변경, 새로고침 생존(SPA 폴백), 뒤로가기로 `/`(전체 데모)로 복귀, 콘솔 에러 0건. 보드 쪽도 확인 — `/shop` 진입 시 노드 수가 즉시 바뀌고(전체 데모 299개 → 라우트만 237개) `ShopSitePage`가 6각형 라우트 진입 노드로 표시됨.
- **되돌리기 쉬움**: 데이터 스키마·기존 파이프라인 영향 없음. fixture 코드 + CSS만 추가된, 로컬로 완결된 변경이다.
- **관련 문서**: 라우트 6각형 [ADR-0028](0028-shape-vocabulary-for-node-roles.md)/[0035](0035-shape-and-hand-drawn-implementation.md), 라우트 전환 실측(외부 앱) [ADR-0015](0015-routing-transition-validation.md).
