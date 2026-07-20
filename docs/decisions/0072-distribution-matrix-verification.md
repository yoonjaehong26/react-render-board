# ADR-0072: 배포 매트릭스 검증 — 축 분해 + publish-time 오케스트레이터

- 상태: 채택됨(구현 — 번들러 축 4개 완료, PM 엣지케이스 유예)
- 날짜: 2026-07-20

## 맥락

`react-render-board`는 소비자 측 번들러/프레임워크의 `<head>`나 config에 직접 훅을 주입하는 배포 방식(ADR-0020/0021/0036)이라, 지금까지 실사용 리포트로 발견된 중대 결함(ADR-0067~0071)이 전부 **특정 번들러/스택 조합에서만** 재현됐다 — Turbopack 이름 압축, Next DevTools root 오염, webpack CSS 미적용, 브라우저 확장 훅 선점 등. 사용자가 직접 다른 레포를 돌며 겪고 고친 사례(Turbopack 충돌)가 이번 논의의 계기였다.

문제는 "여러 스택을 한 레포에서 자동 검증하자"는 방향이 잘못 잡히면 (번들러×패키지매니저×React버전) 전체 곱으로 매트릭스가 폭발한다는 점이다. 이건 이 프로젝트가 조사한 죽은 선행 프로젝트들이 동기를 잃은 것과 같은 종류의 곁가지(CLAUDE.md 원칙)가 될 위험이 있었다.

## 결정

### 1. 축을 곱하지 않고 분해한다

- **번들러/프레임워크만 진짜 축이다** — 주입 지점(Vite 플러그인 / webpack·Rspack config 패치 / Next `<head>` 조기 스크립트)이 실제로 다른 코드 경로를 타기 때문. Vite·webpack·Rspack·Next(Turbopack) 4개를 매트릭스에 넣는다.
- **패키지매니저는 축이 아니라 엣지케이스다** — Vite 플러그인 자체는 npm/pnpm/yarn 어디서 실행되든 동일하다. 실제로 다른 건 install-time resolution 구조뿐이고, 거기서 깨질 수 있는 건 pnpm strict symlink와 yarn Berry PnP(node_modules 자체가 없음) 둘뿐이다 — 이건 4개 번들러 전부에 곱하지 않고 Vite 스택 하나 위에서 1회씩만 확인하면 된다(아직 미구현, 후속).
- **React 18/19는 축이 아니다** — `peerDependencies`로 이미 범위 선언돼 있고, API 분기가 있다는 증거가 없다. 증거 생기면 추가.
- 결과: "2×2×4=16번" 이 아니라 **번들러 축 4개(깊은 검증) + PM 엣지케이스 2개(얕은 검증)**로 스코프가 준다.

### 2. 기능은 스택 불변이라 매트릭스에서 반복하지 않는다

검색/줌/그룹접기/props흐름/스티키노트 등은 `RenderNode`가 데이터 레이어에 들어온 뒤로는 어떤 번들러든 동일한 React Flow 캔버스 코드를 탄다. 이미 `src/fixtures/` 데모 + 유닛 테스트 335개 + 기존 verify 스크립트들로 덮여 있다. 매트릭스가 검증하는 건 **스택 경계**(마운트+훅 걸림, 그룹핑/소스 추출이 그 번들러 변환 이후에도 살아있는지, DOM↔Fiber 매핑, 콘솔 에러, 그 스택 고유 위험)뿐이다.

### 3. 실기능까지 자동 검증하되, 눈으로 보는 QA는 없애지 않고 빈도만 낮춘다

자동 어서션은 "이미 아는 실패 패턴"만 잡는다(예: `.board-fab` computed style로 CSS 적용 확인, `__RRB_BOOTED__`/커밋 수로 훅 동작 확인 — 기존 verify-init*.mjs 패턴). 처음 보는 종류의 결함(Turbopack 이름 압축, DevTools root 오염 등)은 실사용 중 눈으로 발견된 뒤에야 어서션으로 codify됐다. 그래서:

- 매트릭스는 pass/fail만 보고 넘어가는 기본 게이트(vitest처럼)로 삼는다.
- 각 스택 실행 시 스크린샷 1장(`verify-output/matrix/<stack>.png`)만 남긴다 — diff 비교(visual regression) 도구는 투자하지 않는다(그게 필요했다는 증거가 없음). "뭔가 이상하다" 싶을 때 훑어보는 용도.
- 새 스택 추가 시 / 이상 감지 시에만 그 스택을 직접 `npm run dev`로 띄워 눈으로 본다. 매번 전 스택을 눈으로 보지 않는다.

### 4. 실행 주기: publish 직전 1회, 스케줄러 없음

주 1회 크론(OCI 서버 등)으로 도는 방안을 검토했으나 기각했다 — 지금까지 실사용 결함은 전부 "우리가 코드를 바꿨을 때" 드러난 것이지, 가만히 있는데 저절로 깨진 사례가 없다. 서버 비용을 들여 "아무도 안 건드렸는데 매주 확인"하는 것보다 publish 직전 1회가 같은 위험을 더 저비용으로 덮는다. "업스트림(Next/Vite 등)이 업데이트되면서 우리가 안 건드렸는데 깨졌다"는 사례가 실제로 한 번이라도 생기면, 그때는 서버가 아니라 GitHub Actions 무료 스케줄 워크플로우로 충분하다(관리 비용 0) — 지금은 그 증거가 없어 안 만든다.

### 5. 오케스트레이터는 기존 검증 스크립트를 재사용한다

`scripts/verify-matrix.mjs`는 새 어서션을 만들지 않는다. 이미 각자 완결된 e2e인 `verify-init.mjs`(Vite)·`verify-init-webpack.mjs`·`verify-init-rspack.mjs`(Rspack, 이번에 신규)·`verify-init-next-canvas.mjs`(Next/Turbopack)를 순차 실행(같은 repoRoot에서 `npm pack`/`build:lib`을 공유하므로 병렬 실행 시 서로의 tgz를 덮어씀 — 순차 필수)하고 pass/fail/skip 표로 요약한다. 스크린샷 저장 경로를 `verify-output/matrix/<stack>.png`로 통일하기 위해 기존 스크립트에 캡처 라인만 추가했다(어서션 변경 없음).

Rspack만 verify 스크립트가 없어서 신규 작성했다(`verify-init-rspack.mjs`, webpack 스크립트와 같은 pack→install→`init` 자동 패치→dev→Playwright 실측→원상복구 패턴). 스파이크의 원래 config는 ESM/TS(`rspack.config.ts`)라 `init`이 수동 안내로 폴백하므로, 자동 패치 경로를 실측하기 위해 .ts를 잠시 옆으로 치우고 깨끗한 CJS `rspack.config.js`를 두는 방식을 썼다. 검증 포인트는 **html-webpack-plugin beforeEmit 경유 조기 `<head>` 스크립트가 Rspack의 webpack 호환 레이어에서 실제 런타임으로 동작하는가**였다 — ADR-0021 스파이크는 자체 스텁 플러그인이었고, 정식 `withRenderBoard`+실제 런타임으로는 이번이 첫 실측이다. 결과: 조기 훅 커밋 버퍼링(onCommitFiberRoot 3회)·CSS 자기주입·캔버스까지 전부 동작.

## 검증

`npm run verify:matrix` 실행 — Vite(4.9s)·webpack(127.1s)·Rspack(132.5s)·Next/Turbopack(125.6s) **4개 전부 PASS**, `verify-output/matrix/{vite,webpack,rspack,next-turbopack}.{log,png}` 정상 생성. 각 스크립트 실행 후 스캐폴드 원상복구(git status 클린) 확인.

## 결과

- `npm run verify:matrix` 스크립트 추가(번들러 축 4개 전부 편입). publish 전 수동 실행 게이트.
- `npm run verify:init-rspack` 단독 실행도 가능(다른 스택과 동일 패턴).
- pnpm strict/yarn Berry 엣지케이스는 **의도적으로 미구현** — 실사용 리포트로 문제가 생기면 그때 추가(다른 스택들과 같은 패턴 — 이번 ADR 5개 결함 모두 실사용 리포트가 먼저였다). pnpm의 lifecycle 차단은 이미 ADR-0062가 다뤘다(`pnpm approve-builds --all` 안내).
- 이 분해 원칙(번들러만 축, PM/React버전은 엣지케이스, 기능은 스택불변, publish-time만)을 기록해두는 이유: 안 남기면 나중 세션이 "스택마다 진짜 앱 다시 만들자"로 되돌아가 곁가지에 시간을 쓸 위험이 있다.

## 관련
- [ADR-0020](0020-distribution-entry-ux-direction.md)·[0021](0021-bundler-injection-feasibility.md)·[0036](0036-distribution-connection-implementation.md)(연결 방식 자체)
- [ADR-0067](0067-import-meta-env-dead-code-elimination-bug.md)~[0071](0071-group-hint-batch-hang-timeout.md)(실사용 리포트로 발견된 스택별 결함들 — 이 매트릭스가 예방하려는 대상)
