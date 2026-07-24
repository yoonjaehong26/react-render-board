# Architecture — 코드 맵

> 이 문서는 **기여자(그리고 미래의 유지보수자)가 코드베이스에 처음 들어올 때 읽는 지도**다. 코드가 "어떻게" 동작하는지의 상세는 여기 쓰지 않는다 — 그건 코드와 테스트가 진실을 들고 있고, 문서로 옮기면 썩는다. 여기엔 **변하지 않는 것**만 쓴다: 레이어 경계, 불변 규칙, 어디에 뭐가 있는지, 어떻게 검증하는지. (개별 결정의 "왜"는 [`decisions/`](decisions/) ADR에 있다 — 맨 아래 내비게이션 참고.)
>
> 갱신 규칙: 레이어 경계나 아래 "불변 규칙"이 바뀌는 결정을 내리면 이 문서도 같은 커밋에서 고친다. 그 외(기능 추가, 버그 수정)엔 손대지 않아도 된다.

## 동작 원리 (5줄)

1. React는 dev 모드에서 `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` 전역 훅을 심는다 — React DevTools용 공식 통로다.
2. 이 훅의 `onCommitFiberRoot`를 가로채면(원본 보존 monkey-patch, ADR-0070) 커밋마다 실행 중인 Fiber 트리를 읽을 수 있다. **소스 코드는 파싱하지 않는다.**
3. Fiber 트리를 정규화된 `RenderNode` 스키마로 직렬화하고, 구독 가능한 store에 스냅샷으로 쌓는다.
4. React Flow 캔버스가 store를 구독해 박스+선 다이어그램(도메인 그룹 프레임 + semantic zoom)으로 그린다.
5. 전 과정이 **dev 전용**이다 — production에서는 훅도, 그룹핑 힌트(`getSource`)도 신뢰할 수 없고, 애초에 주입 자체를 하지 않는다.

## 3-레이어 구조와 디렉터리 지도

레이어 경계가 이 프로젝트의 뼈대다. 데이터는 한 방향으로만 흐른다: **훅킹 → 데이터 → 시각화**. 역방향 참조(시각화가 Fiber를 직접 만지는 것)는 `fibersById` 보조 조회(ADR-0026)라는 명시적 통로 하나로만 허용된다.

| 위치 | 레이어 | 하는 일 | 이 버그면 여기부터 |
|---|---|---|---|
| [`src/hooking/`](../src/hooking/) | 1. 훅킹 | 훅 가로채기는 **bippy에 위임**(직접 구현 안 함 — ADR-0002/0022). `fiberInspector.ts`가 커밋 구독, `domInteraction.ts`가 DOM↔Fiber 양방향 매핑, `devEnvironment.ts`가 dev 판별(`__RRB_DEV__`) | "보드가 아예 안 뜸 / 0 노드 / 대상 앱이 죽음 / 다른 도구(react-scan, DevTools 확장)와 충돌" |
| [`src/data/`](../src/data/) | 2. 데이터 | `serialize.ts`(Fiber→`RenderNode` 트리), `sourceHints.ts`(그룹핑 힌트 비동기 해석), `store.ts`(스냅샷 store + `fibersById`), `types.ts`(**스키마 — 헌법**) | "노드가 사라짐/중복됨, 그룹이 이상하게 묶임, '그룹 확인 중…'에서 멈춤" |
| [`src/visualization/`](../src/visualization/) | 3. 시각화 | React Flow 기반. `Canvas.tsx`(진입점), `BoardOverlay.tsx`(도킹 패널 셸), `lib/`(레이아웃·배선·검색 등 순수 로직 — 파일당 테스트 1개), `components/`(커스텀 노드·엣지·패널) | "그려지는 게 이상함: 배치, 선, 색, 줌, 검색, 패널" |
| [`cli/`](../cli/) | 배포/주입 | `postinstall.mjs`→`init-core.mjs`가 번들러를 감지해 사용자 설정을 자동 패치(Vite 플러그인 / webpack 래퍼 / Next layout 스크립트). `early-hook-script.cjs`는 런타임 로드 전 커밋을 버퍼링하는 조기 `<head>` 스크립트 | "특정 번들러/프레임워크에서만 설치·주입이 깨짐" — **사용자 머신의 파일을 수정하는 유일한 코드이므로 가장 보수적으로 다룬다** |
| [`src/index.ts`](../src/index.ts) | 공개 API | 각 레이어의 진입점만 재수출. **이 파일이 사용자에게 한 약속의 전부다** | — |
| [`src/fixtures/`](../src/fixtures/), [`src/main.tsx`](../src/main.tsx) | 데모 | `npm run dev`의 계측 대상 데모 앱. 제품이 아니라 이 도구를 테스트하기 위한 재현 장치 | 재현 fixture를 추가할 때 |
| [`scripts/verify-*.mjs`](../scripts/) | 실측 | Playwright 통합 검증. "고쳤다"의 판정 기준 | 수정 후 회귀 확인 |

## 불변 규칙 (Invariants)

이 프로젝트에서 깨면 안 되는 것들. PR이 이 중 하나를 건드린다면 반드시 해당 ADR을 먼저 읽고, 바꿔야 한다면 새 ADR로 근거를 남긴다.

1. **대상 앱을 절대 죽이지 않는다.** 훅킹 콜백은 전부 try/catch로 감싸고, 재귀 순회에는 깊이 가드를 둔다. 선행 프로젝트 React-Sight가 죽은 지점이 정확히 여기다([prior-art](research/prior-art.md)). 다른 도구(React DevTools 확장, react-scan)가 훅을 먼저 잡고 있어도 원본을 보존·체이닝한다(ADR-0070). 실제 사고 사례: 훅 공존을 욕심내다 무한 재귀로 사용자 페이지를 멈춘 적이 있다(ADR-0065).
2. **dev 전용 가드는 다층이고, `import.meta.env.DEV`를 라이브러리 소스에서 직접 쓰지 않는다.** 반드시 `isDevEnvironment()`(`src/hooking/devEnvironment.ts`)를 거친다 — `build:lib`이 `import.meta.env.DEV`를 정적 `false`로 굳혀 **함수 본체가 통째로 트리셰이킹된 중대 사고**가 있었다(ADR-0067).
3. **`RenderNode` 스키마(`src/data/types.ts`)는 되돌리기 어려운 결정이다.** 시각화 전체가 의존한다. 지금까지의 모든 기능 확장(양방향 인터랙션, props 흐름, 역할 표식)은 스키마를 바꾸지 않고 사이드채널(`fibersById`, 별도 store)로 얹었다 — 그 패턴을 먼저 검토한다.
4. **그룹핑 힌트의 의미는 "정의 위치"가 아니라 "사용(렌더) 위치"다**(ADR-0007). dev 전용이며 비동기다(커밋 시점엔 비어 있다가 나중에 채워짐). 이 의미를 바꾸는 건 그룹핑 철학 전체를 바꾸는 일이다.
5. **시각화 성능의 열쇠는 "React Flow에 넘기는 배열 크기"다**(ADR-0017). 화면 밖 노드는 예쁘게 그리는 게 아니라 **아예 만들지 않는다**. flowNodes 참조 안정성을 깨는 변경(틱마다 배열 재생성 등)은 수천 노드에서 반드시 티가 난다 — 자주 바뀌는 상태는 data가 아니라 context로 내린다.
6. **레이아웃은 순수 함수로, 라이브 안정성은 입력 안정성에서 상속받는다.** `layout.ts`·`edgeRouting.ts`는 같은 입력이면 같은 출력이고, 렌더 순서·그룹 순서가 안정적이라 결과도 요동치지 않는다. 시간·난수에 의존하는 레이아웃 코드는 넣지 않는다.
7. **"고쳤다"는 주장은 실측으로 증명한다.** 버그 수정에는 그 버그를 재현하는 fixture나 `verify:*` 스크립트가 따라온다. 지금까지의 중대 결함(ADR-0065~0071)은 전부 유닛 테스트가 아니라 실사용/Playwright 실측으로 잡혔다.
8. **관찰 도구는 관찰 대상을 바꾸지 않는다.** 오버레이는 대상 앱의 레이아웃/CSS/라우터를 건드리지 않고 위에 뜨기만 한다(ADR-0040). 평상시 클릭 같은 정상 조작을 가로채지 않는다(ADR-0026의 회귀 교훈).

## 검증 방법 (기여 전 체크리스트)

```bash
npm run typecheck   # tsc -b — vitest는 타입을 못 잡으므로 반드시 별도 실행 (ADR-0063)
npm run test        # vitest 유닛 ~346개 — lib/ 순수 로직은 파일당 테스트 동봉이 관례
npm run verify      # Playwright 기본 회귀 (수정 영역에 따라 verify:* 개별 스크립트 추가 실행)
npm run verify:matrix  # 번들러 매트릭스(Vite/webpack/Rspack/Next) — cli/ 를 건드렸다면 필수 (ADR-0072)
```

## "왜?"가 궁금하면 — ADR 내비게이션

모든 의미 있는 결정은 [`decisions/`](decisions/)에 ADR로 남아 있고(현재 74개), [`project-status.md`](project-status.md)가 전체 현황을 요약한다. 처음이라면 이 5개가 프로젝트의 성격을 가장 잘 보여준다:

1. [ADR-0002](decisions/0002-hooking-layer.md) — 훅킹을 직접 짜지 않고 위임한 이유 (선행 프로젝트들의 사인)
2. [ADR-0007](decisions/0007-grouping-hint-feasibility.md) — 그룹핑 힌트의 의미와 한계 (불변 규칙 4의 근거)
3. [ADR-0017](decisions/0017-viewport-based-partial-recompute.md) — 수천 노드 성능의 진짜 병목과 해법 (불변 규칙 5의 근거)
4. [ADR-0067](decisions/0067-import-meta-env-dead-code-elimination-bug.md) — "배포된 모든 버전에서 한 번도 동작한 적 없던 기능" 사고 (불변 규칙 2의 근거)
5. [ADR-0072](decisions/0072-distribution-matrix-verification.md) — 번들러 매트릭스만 진짜 검증 축인 이유

UI가 왜 이렇게 생겼는지는 [`ui-philosophy.md`](ui-philosophy.md), 프로젝트가 왜 존재하는지는 [`vision.md`](vision.md) 참고.
